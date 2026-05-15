import { redis } from "./redis";
import { RateLimitError } from "./errors";
import { config } from "./config";

type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

const DEFAULT_GENERAL: RateLimitConfig = config.rateLimit.general;

const DEFAULT_AUTH: RateLimitConfig = config.rateLimit.auth;

const DEFAULT_REGISTER: RateLimitConfig = config.rateLimit.register;

const DEFAULT_CHECKOUT: RateLimitConfig = config.rateLimit.checkout;

const FALLBACK_MEMORY_LIMIT = config.rateLimit.fallbackMemoryLimit;
const MAX_MEMORY_FALLBACK_ENTRIES = 1000;
const memoryFallback = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  memoryFallbackCleanup();
}, 60000);

export async function checkRedis(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

export async function rateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_GENERAL
): Promise<void> {
  const isRedisAvailableNow = await checkRedis();

  if (!isRedisAvailableNow) {
    memoryFallbackCleanup();
    const entry = memoryFallback.get(key);
    const now = Date.now();

    if (entry && entry.resetAt > now) {
      if (entry.count >= FALLBACK_MEMORY_LIMIT) {
        throw new RateLimitError();
      }
      entry.count++;
    } else {
      memoryFallback.set(key, { count: 1, resetAt: now + config.windowMs });
    }
    return;
  }

  const windowKey = `rl:${key}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(windowKey, 0, windowStart);
  pipeline.zcard(windowKey);
  pipeline.zadd(windowKey, now, `${now}-${Math.random()}`);
  pipeline.pexpire(windowKey, config.windowMs);
  const results = await pipeline.exec() ?? [];
  const countResult = results[1];
  const count = (countResult?.[1] as number) ?? 0;

  if (count >= config.maxRequests) {
    throw new RateLimitError();
  }
}

function memoryFallbackCleanup(): void {
  const now = Date.now();
  const keysToDelete: string[] = [];
  for (const [key, entry] of memoryFallback.entries()) {
    if (entry.resetAt <= now) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    memoryFallback.delete(key);
  }
  if (memoryFallback.size > MAX_MEMORY_FALLBACK_ENTRIES) {
    const sortedEntries = [...memoryFallback.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    const toRemove = sortedEntries.slice(0, sortedEntries.length - MAX_MEMORY_FALLBACK_ENTRIES);
    for (const [key] of toRemove) {
      memoryFallback.delete(key);
    }
  }
}

export async function rateLimitAuth(identifier: string): Promise<void> {
  return rateLimit(`auth:${identifier}`, DEFAULT_AUTH);
}

export async function rateLimitRegister(identifier: string): Promise<void> {
  return rateLimit(`register:${identifier}`, DEFAULT_REGISTER);
}

export async function rateLimitCheckout(identifier: string): Promise<void> {
  return rateLimit(`checkout:${identifier}`, DEFAULT_CHECKOUT);
}

export async function rateLimitGeneral(identifier: string): Promise<void> {
  return rateLimit(`general:${identifier}`, DEFAULT_GENERAL);
}
