import { z } from 'zod'

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000'),
  TRUST_PROXY: z.string().optional(),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),

  JWT_ADMIN_SECRET: z.string().min(32),
  JWT_CUSTOMER_SECRET: z.string().min(32),

  MP_ACCESS_TOKEN: z.string().optional(),
  MP_PUBLIC_KEY: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),
  MP_MODE: z.enum(['test', 'production']).default('test'),

  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default('noreply@tinkuy.com'),

  SENTRY_DSN: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  RATE_LIMIT_GENERAL_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_GENERAL_MAX_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.coerce.number().default(5),
  RATE_LIMIT_REGISTER_WINDOW_MS: z.coerce.number().default(3600000),
  RATE_LIMIT_REGISTER_MAX_REQUESTS: z.coerce.number().default(3),
  RATE_LIMIT_CHECKOUT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_CHECKOUT_MAX_REQUESTS: z.coerce.number().default(10),
  RATE_LIMIT_FALLBACK_MEMORY_LIMIT: z.coerce.number().default(1000),

  STOCK_TTL_SECONDS: z.coerce.number().default(300),
  CART_TTL_SECONDS: z.coerce.number().default(86400),
  CART_LOCK_TTL_SECONDS: z.coerce.number().default(5),
  CART_LOCK_RETRY_COUNT: z.coerce.number().default(3),
  CART_LOCK_RETRY_DELAY_MS: z.coerce.number().default(100),
})

function buildRateLimitConfig() {
  return {
    general: {
      windowMs: Number(process.env.RATE_LIMIT_GENERAL_WINDOW_MS || 900000),
      maxRequests: Number(process.env.RATE_LIMIT_GENERAL_MAX_REQUESTS || 100),
    },
    auth: {
      windowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS || 900000),
      maxRequests: Number(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS || 5),
    },
    register: {
      windowMs: Number(process.env.RATE_LIMIT_REGISTER_WINDOW_MS || 3600000),
      maxRequests: Number(process.env.RATE_LIMIT_REGISTER_MAX_REQUESTS || 3),
    },
    checkout: {
      windowMs: Number(process.env.RATE_LIMIT_CHECKOUT_WINDOW_MS || 60000),
      maxRequests: Number(process.env.RATE_LIMIT_CHECKOUT_MAX_REQUESTS || 10),
    },
    fallbackMemoryLimit: Number(process.env.RATE_LIMIT_FALLBACK_MEMORY_LIMIT || 1000),
  }
}

export function validateConfig(): void {
  const result = configSchema.safeParse(process.env)

  if (!result.success) {
    const errors = result.error.errors.map(
      (e) => `  - ${e.path.join('.')}: ${e.message}`
    )
    throw new Error(
      `Invalid environment configuration:\n${errors.join('\n')}\n\n` +
      `Please fix your .env file and restart the server.`
    )
  }
}

const baseConfig = configSchema.parse(process.env)

export const config = {
  ...baseConfig,
  rateLimit: buildRateLimitConfig(),
  redis: {
    url: baseConfig.REDIS_URL,
    password: baseConfig.REDIS_PASSWORD,
  },
  sentry: {
    dsn: baseConfig.SENTRY_DSN,
    authToken: baseConfig.SENTRY_AUTH_TOKEN,
  },
  mercadoPago: {
    accessToken: baseConfig.MP_ACCESS_TOKEN,
    publicKey: baseConfig.MP_PUBLIC_KEY,
    webhookSecret: baseConfig.MP_WEBHOOK_SECRET,
    mode: baseConfig.MP_MODE,
  },
  app: {
    env: baseConfig.NODE_ENV,
    version: '1.0.0',
  },
  cache: {
    stockTtlSeconds: baseConfig.STOCK_TTL_SECONDS,
  },
  cart: {
    ttlSeconds: baseConfig.CART_TTL_SECONDS,
    lockTtlSeconds: baseConfig.CART_LOCK_TTL_SECONDS,
    lockRetryCount: baseConfig.CART_LOCK_RETRY_COUNT,
    lockRetryDelayMs: baseConfig.CART_LOCK_RETRY_DELAY_MS,
  },
}

export type Config = z.infer<typeof configSchema>