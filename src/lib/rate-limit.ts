import { redis } from "./redis";
import { RateLimitError } from "./errors";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

const DEFAULT_GENERAL: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
};

const DEFAULT_AUTH: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,
};

const DEFAULT_CHECKOUT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10,
};

const FALLBACK_MEMORY_LIMIT = 10;
const memoryFallback = new Map<string, { count: number; resetAt: number }>();

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
  for (const [key, entry] of memoryFallback.entries()) {
    if (entry.resetAt <= now) {
      memoryFallback.delete(key);
    }
  }
}

export async function rateLimitAuth(identifier: string): Promise<void> {
  return rateLimit(`auth:${identifier}`, DEFAULT_AUTH);
}

export async function rateLimitCheckout(identifier: string): Promise<void> {
  return rateLimit(`checkout:${identifier}`, DEFAULT_CHECKOUT);
}

export async function rateLimitGeneral(identifier: string): Promise<void> {
  return rateLimit(`general:${identifier}`, DEFAULT_GENERAL);
}
