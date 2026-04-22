# Browser Cache

A lightweight implementation of the Cache<T> interface from [`@schorts/shared-kernel`](https://www.npmjs.com/package/@schorts/shared-kernel) using the Browser Cache API. This package provides persistent caching in the browser with support for TTL (time-to-live) expiration and tag-based deletion.

## Features

- ✔ Implements the Cache<T> interface from [`@schorts/shared-kernel`](https://www.npmjs.com/package/@schorts/shared-kernel).
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

```ts
import { BrowserCache } from '@schorts/browser-cache';

// Create a cache instance
const cache = new BrowserCache<string>('my-app-cache');

// Store a value with TTL and tags
await cache.set('welcome', 'Hola Jorge!', 3000, ['greeting']);

// Retrieve value
const value = await cache.get('welcome');
console.log(value); // "Hola Jorge!" if not expired

// Check existence
const exists = await cache.has('welcome');

// Delete by key
await cache.delete('welcome');

// Delete by tag
await cache.deleteByTag('greeting');

// Clear all entries
await cache.clear();

// Proactively purge expired entries
await cache.purgeExpired();
```

## API

### `get(key: string): Promise<T | undefined>`

Retrieve a cached value. If expired, the entry is removed and `undefined` is returned.

### `set(key: string, value: T, ttl?: number, tags?: string[]): Promise<void>`

Store a value with optional TTL (milliseconds) and tags.

### `delete(key: string): Promise<boolean>`

Delete a specific entry.

### `deleteByTag(tag: string): Promise<void>`

Delete all entries with the given tag.

### `deleteByTags(tags: string[]): Promise<void>`

Delete all entries matching any of the given tags.

### `clear(): Promise<void>`

Clear the entire cache.

### `has(key: string): Promise<boolean>`

Check if a key exists and is not expired.

### `purgeExpired(): Promise<void>`

Iterate through all entries and remove expired ones.

## Notes

- Cache entries persist across browser reloads.
- Expired entries are removed automatically when accessed via `get()` or `has()`.
- Tags are stored in the payload and can be used for selective deletion.

## License

LGPL-3.0-or-later
