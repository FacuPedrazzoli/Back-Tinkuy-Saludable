import { z } from 'zod'

const rateLimitConfigSchema = z.object({
  windowMs: z.coerce.number().default(900000),
  maxRequests: z.coerce.number().default(100),
})

const configSchema = z.object({
  // Node
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('4000'),
  TRUST_PROXY: z.string().optional(),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_ADMIN_SECRET: z.string().min(32),
  JWT_CUSTOMER_SECRET: z.string().min(32),

  // MercadoPago
  MP_ACCESS_TOKEN: z.string().optional(),
  MP_PUBLIC_KEY: z.string().optional(),
  MP_WEBHOOK_SECRET: z.string().optional(),

  // Frontend
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default('noreply@tinkuy.com'),

  // Sentry
  SENTRY_DSN: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Rate limiting
  RATE_LIMIT_GENERAL_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_GENERAL_MAX_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_AUTH_MAX_REQUESTS: z.coerce.number().default(5),
  RATE_LIMIT_REGISTER_WINDOW_MS: z.coerce.number().default(3600000),
  RATE_LIMIT_REGISTER_MAX_REQUESTS: z.coerce.number().default(3),
  RATE_LIMIT_CHECKOUT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_CHECKOUT_MAX_REQUESTS: z.coerce.number().default(10),
  RATE_LIMIT_FALLBACK_MEMORY_LIMIT: z.coerce.number().default(1000),
})

// Helper para construir el objeto rateLimit que espera rate-limit.ts
function buildRateLimitConfig(): {
  general: { windowMs: number; maxRequests: number }
  auth: { windowMs: number; maxRequests: number }
  register: { windowMs: number; maxRequests: number }
  checkout: { windowMs: number; maxRequests: number }
  fallbackMemoryLimit: number
} {
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
      `❌ Invalid environment configuration:\n${errors.join('\n')}\n\n` +
      `Please fix your .env file and restart the server.`
    )
  }
}

const baseConfig = configSchema.parse(process.env)

export const config = {
  ...baseConfig,
  rateLimit: buildRateLimitConfig(),
}

export type Config = z.infer<typeof configSchema>
