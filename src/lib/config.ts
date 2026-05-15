import { AppError } from "./errors";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface CartConfig {
  ttlSeconds: number;
  lockTtlSeconds: number;
  lockRetryCount: number;
  lockRetryDelayMs: number;
}

interface MercadoPagoConfig {
  accessToken: string;
  webhookSecret: string;
  mode: "test" | "production";
}

interface RedisConfig {
  url: string;
}

interface CacheConfig {
  stockTtlSeconds: number;
}

interface WebhookConfig {
  timeoutMs: number;
}

interface SentryConfig {
  dsn: string;
}

interface AppConfig {
  env: string;
  version: string;
}

interface Config {
  rateLimit: {
    general: RateLimitConfig;
    auth: RateLimitConfig;
    register: RateLimitConfig;
    checkout: RateLimitConfig;
    fallbackMemoryLimit: number;
  };
  cart: CartConfig;
  mercadoPago: MercadoPagoConfig;
  redis: RedisConfig;
  cache: CacheConfig;
  webhook: WebhookConfig;
  sentry: SentryConfig;
  app: AppConfig;
}

function parseIntOrDefault(value: string | undefined, defaultValue: number, required = false): number {
  if (value === undefined) {
    if (required) {
      throw new AppError("CONFIG_ERROR", `Missing required environment variable`, 500);
    }
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    if (required) {
      throw new AppError("CONFIG_ERROR", `Invalid integer value for environment variable`, 500);
    }
    return defaultValue;
  }
  return parsed;
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new AppError("CONFIG_ERROR", `Missing required environment variable: ${key}`, 500);
  }
  return value ?? defaultValue!;
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    throw new AppError("CONFIG_ERROR", `Missing required environment variable: ${key}`, 500);
  }
  return value;
}

export const config: Config = {
  rateLimit: {
    general: {
      windowMs: parseIntOrDefault(process.env.RATE_LIMIT_GENERAL_WINDOW_MS, 60 * 1000),
      maxRequests: parseIntOrDefault(process.env.RATE_LIMIT_GENERAL_MAX_REQUESTS, 100),
    },
    auth: {
      windowMs: parseIntOrDefault(process.env.RATE_LIMIT_AUTH_WINDOW_MS, 15 * 60 * 1000),
      maxRequests: parseIntOrDefault(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS, 5),
    },
    register: {
      windowMs: parseIntOrDefault(process.env.RATE_LIMIT_REGISTER_WINDOW_MS, 60 * 60 * 1000),
      maxRequests: parseIntOrDefault(process.env.RATE_LIMIT_REGISTER_MAX_REQUESTS, 3),
    },
    checkout: {
      windowMs: parseIntOrDefault(process.env.RATE_LIMIT_CHECKOUT_WINDOW_MS, 60 * 1000),
      maxRequests: parseIntOrDefault(process.env.RATE_LIMIT_CHECKOUT_MAX_REQUESTS, 10),
    },
    fallbackMemoryLimit: parseIntOrDefault(process.env.RATE_LIMIT_FALLBACK_MEMORY_LIMIT, 500),
  },
  cart: {
    ttlSeconds: parseIntOrDefault(process.env.CART_TTL_SECONDS, 24 * 60 * 60),
    lockTtlSeconds: parseIntOrDefault(process.env.CART_LOCK_TTL_SECONDS, 5),
    lockRetryCount: parseIntOrDefault(process.env.CART_LOCK_RETRY_COUNT, 3),
    lockRetryDelayMs: parseIntOrDefault(process.env.CART_LOCK_RETRY_DELAY_MS, 100),
  },
  mercadoPago: {
    accessToken: getEnv("MP_ACCESS_TOKEN", ""),
    webhookSecret: getRequiredEnv("MP_WEBHOOK_SECRET"),
    mode: (process.env.MP_MODE as "test" | "production") ?? "test",
  },
  redis: {
    url: getRequiredEnv("REDIS_URL"),
  },
  cache: {
    stockTtlSeconds: parseIntOrDefault(process.env.STOCK_TTL_SECONDS, 300),
  },
  webhook: {
    timeoutMs: parseIntOrDefault(process.env.WEBHOOK_TIMEOUT_MS, 30000),
  },
  sentry: {
    dsn: getEnv("SENTRY_DSN", ""),
  },
  app: {
    env: process.env.NODE_ENV ?? "development",
    version: process.env.APP_VERSION ?? "1.0.0",
  },
};

export function validateConfig(): void {
  const errors: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is required");
  }

  if (!config.mercadoPago.accessToken) {
    errors.push("MP_ACCESS_TOKEN is required");
  }

  if (process.env.NODE_ENV === "production") {
    if (!process.env.FRONTEND_URL) {
      errors.push("FRONTEND_URL is required in production");
    }
    if (config.redis.url === "redis://localhost:6379") {
      errors.push("REDIS_URL must be a production Redis instance, not localhost");
    }
  }

  if (errors.length > 0) {
    throw new AppError("BOOTSTRAP_ERROR", errors.join("; "), 500);
  }
}

export type { Config, RateLimitConfig, CartConfig, MercadoPagoConfig, RedisConfig, CacheConfig, WebhookConfig, SentryConfig, AppConfig };
