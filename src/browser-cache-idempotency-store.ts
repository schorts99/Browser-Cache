import {
  type IdempotencyStore,
  type IdempotencyExecution,
  type UnknownCommitReconciliation,
  CommitOutcomeUnknownError,
} from "@schorts/shared-kernel";

interface StoredEntry {
  result: unknown;
  expiresAt?: number | undefined;
}

interface PendingState {
  result?: unknown;
  completion?: { run: () => Promise<void>; ttl?: number | undefined } | undefined;
  unknownCommit?: CommitOutcomeUnknownError | undefined;
  stagedExecution?: IdempotencyExecution<unknown> | undefined;
  ttl?: number | undefined;
}

export class BrowserCacheIdempotencyStore implements IdempotencyStore {
  private readonly inProgress = new Map<string, Promise<unknown>>();
  private readonly pending = new Map<string, PendingState>();

  constructor(
    private readonly cacheName: string = "idempotency-cache",
  ) {}

  private async getCache(): Promise<Cache> {
    return await caches.open(this.cacheName);
  }

  private getRequest(key: string): Request {
    const safeKey = encodeURIComponent(key);

    try {
      return new Request(`/idempotency/${safeKey}`);
    } catch {
      return new Request(`https://idempotency.local/${safeKey}`);
    }
  }

  private async getEntry(key: string): Promise<StoredEntry | null> {
    try {
      const cache = await this.getCache();
      const request = this.getRequest(key);
      const response = await cache.match(request);

      if (!response) return null;

      const text = await response.text();
      const entry: StoredEntry = JSON.parse(text);

      if (entry.expiresAt && Date.now() >= entry.expiresAt) {
        await cache.delete(request);

        return null;
      }

      return entry;
    } catch (error) {
      console.warn('Idempotency cache read error:', error);

      return null;
    }
  }

  async execute<T>(key: string, operation: () => Promise<T>, ttl?: number): Promise<T> {
    return this.executeWithCompletion(key, async () => ({ result: await operation() }), ttl);
  }

  async executeWithCompletion<T>(
    key: string,
    operation: () => Promise<IdempotencyExecution<T>>,
    ttl?: number,
    reconcile?: (error: CommitOutcomeUnknownError) => Promise<UnknownCommitReconciliation<T>>
  ): Promise<T> {
    if (ttl !== undefined && (!Number.isFinite(ttl) || ttl < 0)) {
      throw new RangeError("TTL must be a finite, non-negative number of milliseconds");
    }

    const ongoing = this.inProgress.get(key);
    if (ongoing) {
      return (await ongoing) as T;
    }

    const storedPending = this.pending.get(key);
    if (storedPending?.unknownCommit && !reconcile) {
      throw storedPending.unknownCommit;
    }

    if (storedPending && !storedPending.completion && !storedPending.unknownCommit) {
      return storedPending.result as T;
    }

    const execution = (async () => {
      let activeStored = storedPending;

      if (!activeStored) {
        const persisted = await this.getEntry(key);
        if (persisted !== null) {
          return persisted.result as T;
        }
      }

      if (activeStored?.unknownCommit) {
        if (!reconcile) {
          throw activeStored.unknownCommit;
        }

        let resolution: UnknownCommitReconciliation<T>;
        try {
          resolution = await reconcile(activeStored.unknownCommit);
        } catch (reconcileError) {
          const combined = new CommitOutcomeUnknownError(
            new AggregateError([
              activeStored.unknownCommit.cause ?? activeStored.unknownCommit,
              reconcileError,
            ]),
            key,
            activeStored.stagedExecution
          );
          this.pending.set(key, {
            ...activeStored,
            unknownCommit: combined,
          });
          throw combined;
        }

        if (resolution.status === "unknown") {
          throw activeStored.unknownCommit;
        }

        if (resolution.status === "not-committed") {
          this.pending.delete(key);
          await this.clear(key);
          activeStored = undefined;
        } else {
          const recoveredExecution =
            resolution.execution ??
            activeStored.stagedExecution ??
            ({ result: activeStored.result } as IdempotencyExecution<unknown>);
          const effectiveTtl = activeStored.ttl ?? ttl;
          activeStored = {
            result: recoveredExecution.result,
            ...(recoveredExecution.complete
              ? { completion: { run: recoveredExecution.complete, ttl: effectiveTtl } }
              : {}),
          };
          this.pending.set(key, activeStored);
        }
      }

      const outcome = activeStored ? undefined : await operation();
      const rawResult = activeStored ? activeStored.result : outcome!.result;
      const completion = activeStored?.completion ?? (outcome?.complete ? { run: outcome.complete, ttl } : undefined);

      if (completion) {
        this.pending.set(key, { result: rawResult, completion });
        await completion.run();
      }

      this.pending.delete(key);
      await this.storeResult(key, rawResult, completion ? completion.ttl : ttl);
      return rawResult as T;
    })();

    this.inProgress.set(key, execution);

    try {
      return (await execution) as T;
    } catch (error) {
      if (error instanceof CommitOutcomeUnknownError) {
        const existing = this.pending.get(key);
        const staged = error.stagedExecution ?? existing?.stagedExecution;
        this.pending.set(key, {
          result: staged?.result,
          unknownCommit: error,
          ...(staged ? { stagedExecution: staged } : {}),
          ...(ttl !== undefined ? { ttl } : (existing?.ttl !== undefined ? { ttl: existing.ttl } : {})),
        });
      }
      throw error;
    } finally {
      this.inProgress.delete(key);
    }
  }

  async resolveUnknownCommit(
    key: string,
    outcome: {
      status: "not-committed";
    } | {
      status: "committed";
      execution?: IdempotencyExecution<unknown> | undefined;
    }
  ): Promise<void> {
    if (this.inProgress.has(key)) {
      throw new Error("Cannot reconcile an in-progress key");
    }

    const entry = this.pending.get(key);
    if (!entry?.unknownCommit) {
      throw new Error("Key has no unknown commit outcome");
    }

    if (outcome.status === "not-committed") {
      this.pending.delete(key);
      await this.clear(key);
    } else {
      const effectiveExecution = outcome.execution ?? entry.stagedExecution;
      if (!effectiveExecution) {
        throw new Error("Committed reconciliation requires an execution record when none was staged");
      }
      const completeFn = effectiveExecution.complete ?? entry.stagedExecution?.complete;
      if (completeFn) {
        this.pending.set(key, {
          result: effectiveExecution.result,
          completion: { run: completeFn, ttl: entry.ttl },
        });
      } else {
        this.pending.delete(key);
        await this.storeResult(key, effectiveExecution.result, entry.ttl);
      }
    }
  }

  async isProcessed(key: string): Promise<boolean> {
    if (this.inProgress.has(key)) {
      return false;
    }

    const pending = this.pending.get(key);
    if (pending?.completion || pending?.unknownCommit) {
      return false;
    }

    const entry = await this.getEntry(key);

    return entry !== null;
  }

  async getResult(key: string): Promise<unknown | undefined> {
    if (this.inProgress.has(key)) {
      return undefined;
    }

    const pending = this.pending.get(key);
    if (pending?.completion || pending?.unknownCommit) {
      return undefined;
    }

    const entry = await this.getEntry(key);

    return entry?.result;
  }

  private async storeResult(
    key: string,
    result: unknown,
    ttl?: number
  ): Promise<void> {
    if (ttl !== undefined && (!Number.isFinite(ttl) || ttl < 0)) {
      throw new RangeError("TTL must be a finite, non-negative number of milliseconds");
    }

    if (ttl === 0) {
      await this.clear(key);
      return;
    }

    try {
      const cache = await this.getCache();
      const request = this.getRequest(key);

      const entry: StoredEntry = {
        result,
        ...(ttl !== undefined ? { expiresAt: Date.now() + ttl } : {}),
      };

      const response = new Response(JSON.stringify(entry), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': ttl ? `max-age=${Math.floor(ttl / 1000)}` : 'max-age=86400',
        },
      });

      await cache.put(request, response);
    } catch (error) {
      console.warn('Idempotency cache write error:', error);
    }
  }

  async markProcessed(
    key: string,
    result: unknown,
    ttl?: number
  ): Promise<void> {
    if (this.inProgress.has(key) || this.pending.get(key)?.completion || this.pending.get(key)?.unknownCommit) {
      throw new Error("Cannot replace an in-progress or pending-completion idempotency key");
    }

    await this.storeResult(key, result, ttl);
  }

  async clear(key: string): Promise<boolean> {
    if (this.inProgress.has(key) || this.pending.get(key)?.completion || this.pending.get(key)?.unknownCommit) {
      throw new Error("Cannot clear an in-progress or pending-completion idempotency key");
    }

    try {
      const cache = await this.getCache();
      const request = this.getRequest(key);

      return await cache.delete(request);
    } catch (error) {
      console.warn('Idempotency cache delete error:', error);

      return false;
    }
  }

  async clearStore(): Promise<void> {
    if (this.inProgress.size > 0) {
      throw new Error("Cannot clear idempotency store while operations are in progress");
    }

    if (Array.from(this.pending.values()).some(entry => entry.completion || entry.unknownCommit)) {
      throw new Error("Cannot clear idempotency store while committed completion is pending");
    }

    this.pending.clear();

    try {
      await caches.delete(this.cacheName);
    } catch (error) {
      console.warn('Idempotency cache clearStore error:', error);
    }
  }

  async prune(): Promise<number> {
    try {
      const cache = await this.getCache();
      const requests = await cache.keys();
      let removed = 0;

      for (const request of requests) {
        const response = await cache.match(request);

        if (!response) continue;

        try {
          const text = await response.text();
          const entry: StoredEntry = JSON.parse(text);

          if (entry.expiresAt && Date.now() >= entry.expiresAt) {
            if (await cache.delete(request)) {
              removed++;
            }
          }
        } catch {
          continue;
        }
      }

      return removed;
    } catch (error) {
      console.warn('Idempotency cache prune error:', error);

      return 0;
    }
  }
}
