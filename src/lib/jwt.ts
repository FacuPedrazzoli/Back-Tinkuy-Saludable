import jwt from "jsonwebtoken";
import { redis, isRedisAvailable } from "./redis";
import { AuthenticationError } from "./errors";
import { AppError } from "./errors";
import { logger } from "./logger";

const TOKEN_BLACKLIST_PREFIX = "jwt:blacklist:";
const TOKEN_BLACKLIST_TTL = 86400;

export function validateSecrets(): void {
  const errors: string[] = [];
  if (!process.env.JWT_ADMIN_SECRET) errors.push("JWT_ADMIN_SECRET is required");
  if (!process.env.JWT_CUSTOMER_SECRET) errors.push("JWT_CUSTOMER_SECRET is required");
  if (errors.length > 0) {
    throw new AppError("BOOTSTRAP_ERROR", errors.join("; "), 500);
  }
}

function getJwtSecret(name: string, value: string | undefined): string {
  if (!value) {
    throw new AppError("CONFIG_ERROR", `Missing required environment variable: ${name}`, 500);
  }
  return value;
}

export const validatedAdminSecret = getJwtSecret("JWT_ADMIN_SECRET", process.env.JWT_ADMIN_SECRET);
export const validatedCustomerSecret = getJwtSecret("JWT_CUSTOMER_SECRET", process.env.JWT_CUSTOMER_SECRET);

export interface AdminTokenPayload {
  sub: string; // adminUserId
  role: "admin" | "manager";
  tenantId: string;
  branchId?: string;
}

export interface CustomerTokenPayload {
  sub: string; // customerId
  role: "customer";
  tenantId: string;
}

export type TokenPayload = AdminTokenPayload | CustomerTokenPayload;

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, validatedAdminSecret, { expiresIn: "24h" });
}

export function signCustomerToken(payload: CustomerTokenPayload): string {
  return jwt.sign(payload, validatedCustomerSecret, { expiresIn: "7d" });
}

export async function revokeToken(token: string): Promise<void> {
  const available = await isRedisAvailable();
  if (!available) {
    logger.warn({ component: "auth" }, "Redis unavailable, token revocation skipped");
    return;
  }
  const key = TOKEN_BLACKLIST_PREFIX + token;
  await redis.setex(key, TOKEN_BLACKLIST_TTL, "1");
}

async function isTokenBlacklisted(token: string): Promise<boolean> {
  const available = await isRedisAvailable();
  if (!available) return false;
  const key = TOKEN_BLACKLIST_PREFIX + token;
  const result = await redis.get(key);
  return result === "1";
}

export async function verifyToken(token: string): Promise<TokenPayload> {
  const blacklisted = await isTokenBlacklisted(token);
  if (blacklisted) {
    throw new AuthenticationError("Token has been revoked");
  }

  const secrets = [
    { secret: validatedAdminSecret, roles: ["admin", "manager"] as const },
    { secret: validatedCustomerSecret, roles: ["customer"] as const },
  ];

  const errors: string[] = [];
  for (const { secret, roles } of secrets) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as TokenPayload;
      if ((roles as readonly string[]).includes(payload.role)) {
        return payload;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new AuthenticationError("Invalid or expired token");
}
