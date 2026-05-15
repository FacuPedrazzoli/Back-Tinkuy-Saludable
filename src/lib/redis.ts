import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
  retryStrategy(times) {
    const baseDelay = Math.min(100 * Math.pow(2, times), 30000);
    const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
    return Math.floor(baseDelay + jitter);
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
  connectTimeout: 5000,
  commandTimeout: 3000,
});

redis.on("error", (err) => {
  // Only log once to avoid spam
  if (err.message?.includes("ECONNREFUSED")) return;
  console.error("Redis connection error:", err.message);
});

redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("reconnecting", () => {
  console.log("🔄 Redis reconnecting...");
});

export async function pingRedis(): Promise<boolean> {
  try {
    const result = await redis.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

let redisAvailableCache: boolean | null = null;
let redisCacheTime = 0;

export async function isRedisAvailable(): Promise<boolean> {
  const now = Date.now();
  if (redisAvailableCache !== null && now - redisCacheTime < 5000) {
    return redisAvailableCache;
  }
  try {
    const result = await redis.ping();
    redisAvailableCache = result === "PONG";
  } catch {
    redisAvailableCache = false;
  }
  redisCacheTime = now;
  return redisAvailableCache;
}
