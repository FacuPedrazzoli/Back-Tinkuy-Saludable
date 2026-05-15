import { redis, isRedisAvailable } from "./redis";
import { LRUCache } from "lru-cache";

const DEFAULT_TTL_SECONDS = 60;

interface CacheOptions {
  ttlSeconds?: number;
  maxSize?: number;
}

interface QueryCacheEntry<T> {
  data: T;
  expiresAt: number;
}

class QueryCache {
  private memoryCache = new LRUCache<string, QueryCacheEntry<unknown>>({
    max: 1000,
    ttl: DEFAULT_TTL_SECONDS * 1000,
    sizeCalculation: (entry) => JSON.stringify(entry.data).length,
    maxSize: 10 * 1024 * 1024,
  });

  constructor() {
    setInterval(() => this.cleanupExpired(), 60000);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const key of this.memoryCache.keys()) {
      const entry = this.memoryCache.get(key);
      if (entry && entry.expiresAt <= now) {
        this.memoryCache.delete(key);
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (await isRedisAvailable()) {
      try {
        const cached = await redis.get(`qc:${key}`);
        if (cached) {
          return JSON.parse(cached) as T;
        }
      } catch {
        // Redis error, fall through to memory cache
      }
    }

    const memCached = this.memoryCache.get(key) as QueryCacheEntry<T> | undefined;
    if (memCached && memCached.expiresAt > Date.now()) {
      return memCached.data;
    }

    return null;
  }

  async set<T>(key: string, data: T, options?: CacheOptions): Promise<void> {
    const ttl = (options?.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;

    if (await isRedisAvailable()) {
      try {
        await redis.setex(`qc:${key}`, options?.ttlSeconds ?? DEFAULT_TTL_SECONDS, JSON.stringify(data));
      } catch {
        // Redis error, store in memory only
        this.memoryCache.set(key, { data, expiresAt: Date.now() + ttl });
      }
    } else {
      this.memoryCache.set(key, { data, expiresAt: Date.now() + ttl });
    }
  }

  async invalidate(key: string): Promise<void> {
    if (await isRedisAvailable()) {
      try {
        await redis.del(`qc:${key}`);
      } catch {
        // Ignore Redis errors
      }
    }
    this.memoryCache.delete(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    if (await isRedisAvailable()) {
      try {
        let cursor = "0";
        do {
          const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `qc:${pattern}`, "COUNT", 100);
          cursor = nextCursor;
          if (keys.length > 0) {
            await redis.del(...keys);
          }
        } while (cursor !== "0");
      } catch {
        // Ignore Redis errors
      }
    }

    for (const key of this.memoryCache.keys()) {
      if (key.includes(pattern.split("*")[0])) {
        this.memoryCache.delete(key);
      }
    }
  }
}

export const queryCache = new QueryCache();

export const PRODUCT_CACHE_TTL = 300;
export const ORDER_CACHE_TTL = 60;
export const CUSTOMER_CACHE_TTL = 120;
export const TENANT_CACHE_TTL = 300;
