import jwt from "jsonwebtoken";
import { redis, isRedisAvailable } from "./redis";
import { AuthenticationError } from "./errors";
import { AppError } from "./errors";

const ADMIN_SECRET = process.env.JWT_ADMIN_SECRET ?? "";
const CUSTOMER_SECRET = process.env.JWT_CUSTOMER_SECRET ?? "";

const TOKEN_BLACKLIST_PREFIX = "jwt:blacklist:";
const TOKEN_BLACKLIST_TTL = 86400;

export function validateSecrets(): void {
  const errors: string[] = [];
  if (!ADMIN_SECRET) errors.push("JWT_ADMIN_SECRET is required");
  if (!CUSTOMER_SECRET) errors.push("JWT_CUSTOMER_SECRET is required");
  if (errors.length > 0) {
    throw new AppError("BOOTSTRAP_ERROR", errors.join("; "), 500);
  }
}

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
  if (!ADMIN_SECRET) throw new Error("JWT_ADMIN_SECRET not configured");
  return jwt.sign(payload, ADMIN_SECRET, { expiresIn: "24h" });
}

export function signCustomerToken(payload: CustomerTokenPayload): string {
  if (!CUSTOMER_SECRET) throw new Error("JWT_CUSTOMER_SECRET not configured");
  return jwt.sign(payload, CUSTOMER_SECRET, { expiresIn: "7d" });
}

export async function revokeToken(token: string): Promise<void> {
  const available = await isRedisAvailable();
  if (!available) {
    console.warn("Redis unavailable, token revocation skipped");
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
    { secret: ADMIN_SECRET, roles: ["admin", "manager"] as const },
    { secret: CUSTOMER_SECRET, roles: ["customer"] as const },
  ].filter((s) => s.secret);

  if (secrets.length === 0) {
    throw new AuthenticationError("No JWT secrets configured");
  }

  const errors: string[] = [];
  for (const { secret, roles } of secrets) {
    try {
      const payload = jwt.verify(token, secret) as TokenPayload;
      if ((roles as readonly string[]).includes(payload.role)) {
        return payload;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new AuthenticationError("Invalid or expired token");
}
