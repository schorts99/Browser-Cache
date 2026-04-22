import { type Cache as SharedCache } from "@schorts/shared-kernel";

export class BrowserCache<T = unknown> implements SharedCache<T> {
  constructor(
    private readonly cacheName: string,
  ) {}

  private async getCache(): Promise<globalThis.Cache> {
    return (await caches.open(this.cacheName)) as globalThis.Cache;
  }

  async get(key: string): Promise<T | undefined> {
    const cache = await this.getCache();
    const response = await cache.match(key);

    if (!response) return undefined;

    try {
      const data = await response.json();

      if (data.expiresAt && Date.now() > data.expiresAt) {
        await cache.delete(key);

        return undefined;
      }

      return data.value as T;
    } catch {
      return undefined;
    }
  }

  async set(key: string, value: T, ttl?: number, tags?: string[]): Promise<void> {
    const cache = await this.getCache();
    const payload = {
      value,
      expiresAt: ttl ? Date.now() + ttl : null,
      tags: tags ?? [],
    };
    const response = new Response(JSON.stringify(payload));

    await cache.put(key, response);
  }

  async delete(key: string): Promise<boolean> {
    const cache = await this.getCache();

    return await cache.delete(key);
  }

  async deleteByTag(tag: string): Promise<void> {
    const cache = await this.getCache();
    const requests = await cache.keys();

    for (const request of requests) {
      const response = await cache.match(request);

      if (!response) continue;

      const data = await response.json();

      if (data.tags?.includes(tag)) {
        await cache.delete(request);
      }
    }
  }

  async deleteByTags(tags: string[]): Promise<void> {
    for (const tag of tags) {
      await this.deleteByTag(tag);
    }
  }

  async clear(): Promise<void> {
    await caches.delete(this.cacheName);
  }

  async has(key: string): Promise<boolean> {
    const cache = await this.getCache();
    const response = await cache.match(key);

    if (!response) return false;

    const data = await response.json();

    if (data.expiresAt && Date.now() > data.expiresAt) {
      await cache.delete(key);

      return false;
    }

    return true;
  }

  async purgeExpired(): Promise<void> {
    const cache = await this.getCache();
    const requests = await cache.keys();

    for (const request of requests) {
      const response = await cache.match(request);

      if (!response) continue;

      const data = await response.json();

      if (data.expiresAt && Date.now() > data.expiresAt) {
        await cache.delete(request);
      }
    }
  }
}
