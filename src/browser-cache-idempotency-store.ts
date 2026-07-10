import { IdempotencyStore } from "@schorts/shared-kernel";

interface StoredEntry {
  result: unknown;
  expiresAt: number;
}

export class BrowserCacheIdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly cacheName: string,
  ) {}

  private async getCache(): Promise<Cache> {
    return await caches.open(this.cacheName);
  }

  private getRequest(key: string): Request {
    const safeKey = encodeURIComponent(key);

    return new Request(`/idempotency/${safeKey}`);
  }

  private async getEntry(key: string): Promise<StoredEntry | null> {
    try {
      const cache = await this.getCache();
      const request = this.getRequest(key);
      const response = await cache.match(request);

      if (!response) return null;

      const text = await response.text();
      const entry: StoredEntry = JSON.parse(text);

      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        await this.clear(key);

        return null;
      }

      return entry;
    } catch (error) {
      console.warn('Idempotency cache read error:', error);

      return null;
    }
  }

  async isProcessed(key: string): Promise<boolean> {
    const entry = await this.getEntry(key);

    return entry !== null;
  }

  async getResult(key: string): Promise<unknown | undefined> {
    const entry = await this.getEntry(key);

    return entry?.result;
  }

  async markProcessed(
    key: string,
    result: unknown,
    ttl?: number
  ): Promise<void> {
    try {
      const cache = await this.getCache();
      const request = this.getRequest(key);

      const entry: StoredEntry = {
        result,
        expiresAt: ttl ? Date.now() + ttl : Date.now() + 24 * 60 * 60 * 1000,
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

  async clear(key: string): Promise<boolean> {
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
    try {
      await caches.delete(this.cacheName);
    } catch (error) {
      console.warn('Idempotency cache clearStore error:', error);
    }
  }
}
