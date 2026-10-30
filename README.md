# Browser Cache

A lightweight implementation of the `Cache<T>` interface from [`@schorts/shared-kernel`](https://www.npmjs.com/package/@schorts/shared-kernel) using the Browser Cache API. This package also provides an **IdempotencyStore** implementation for safe retry handling in browser environments.

## Features

- ✔ Implements the `Cache<T>` interface from [`@schorts/shared-kernel`](https://www.npmjs.com/package/@schorts/shared-kernel).
- ✔ **IdempotencyStore** implementation for request deduplication and safe retries.
- ✔ Persistent storage across browser reloads (using Cache API).
- ✔ TTL support: entries expire automatically when accessed.
- ✔ Tagging support: delete entries by tag(s).
- ✔ Simple API for `get`, `set`, `delete`, `clear`, `has`.
- ✔ Optional `purgeExpired()` helper to proactively clean expired entries.

## Installation

```bash
npm install @schorts/browser-cache
```

## Usage

### General Cache

```ts
import { BrowserCache } from '@schorts/browser-cache';

// Create a cache instance
const cache = new BrowserCache<string>('my-app-cache');

// Store a value with TTL and tags
await cache.set('welcome', 'Hola Jorge!', 3000, ['greeting']);

// Retrieve value
const value = await cache.get('welcome');
console.log(value); // "Hola Jorge!" if not expired
```

### Idempotency Store

```ts
import { BrowserCacheIdempotencyStore } from '@schorts/browser-cache';

const store = new BrowserCacheIdempotencyStore();

// Check if already processed
if (await store.isProcessed('payment-uuid-123')) {
  const result = await store.getResult('payment-uuid-123');
  console.log('Already processed with result:', result);
  return;
}

// Perform the operation...
const result = await processPayment(...);

// Mark as processed (with optional TTL in milliseconds)
await store.markProcessed('payment-uuid-123', result, 1000 * 60 * 60); // 1 hour

// Later cleanup if needed
await store.clear('payment-uuid-123');
```

## API

### Cache<T>

```
get(key: string): Promise<T | undefined>
```

Retrieve a cached value. If expired, the entry is removed and `undefined` is returned.

```
set(key: string, value: T, ttl?: number, tags?: string[]): Promise<void>
```

Store a value with optional TTL (milliseconds) and tags.

```
delete(key: string): Promise<boolean>
```

Delete a specific entry.

```
deleteByTag(tag: string): Promise<void>
deleteByTags(tags: string[]): Promise<void>
```

Delete entries by tag(s).

```
clear(): Promise<void>
```

Clear the entire cache.

```
has(key: string): Promise<boolean>
```

Check if a key exists and is not expired.

```
prune(): Promise<number>
```

Proactively remove expired entries from the cache and return the count of removed items.

```
purgeExpired(): Promise<void>
```

Alias that invokes `prune()` for backwards compatibility.

### IdempotencyStore

```
execute<T>(key: string, operation: () => Promise<T>, ttl?: number): Promise<T>
```

Execute an operation idempotently, coalescing concurrent calls for the same key and caching successful results.

```
executeWithCompletion<T>(key: string, operation: () => Promise<IdempotencyExecution<T>>, ttl?: number, reconcile?: ...): Promise<T>
```

Execute with a post-commit `complete` phase and reconciliation support for `CommitOutcomeUnknownError`.

```
isProcessed(key: string): Promise<boolean>
```

Check whether a key has been marked as processed (and not expired).

```
getResult(key: string): Promise<unknown | undefined>
```

Retrieve the stored result for a key (if it exists and is not expired).

```
markProcessed(key: string, result: unknown, ttl?: number): Promise<void>
```

Mark a key as processed and store its result.

```
resolveUnknownCommit(key: string, outcome: { status: "committed" | "not-committed", execution?: ... }): Promise<void>
```

Reconcile an unconfirmed commit outcome after a failure.

```
clear(key: string): Promise<boolean>
```

Remove a processed entry.

```
clearStore(): Promise<void>
```

Clear all entries from the idempotency store.

```
prune(): Promise<number>
```

Proactively remove expired entries from the store and return the count of removed items.

## Notes

- Both `BrowserCache` and `BrowserCacheIdempotencyStore` use the same underlying Cache API storage.
- Cache entries persist across browser reloads and tabs (same origin).
- Expired entries are lazily removed on access (`get`/`has`/`isProcessed`).
- The idempotency store is ideal for API calls, form submissions, or any operation that should run at most once for a given key.

## License

LGPL-3.0-or-later
