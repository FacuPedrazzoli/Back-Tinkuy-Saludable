import type { Request } from "express";
import DataLoader from "dataloader";
import { verifyToken, type TokenPayload } from "@lib/jwt";
import { getTenantId } from "@lib/tenant-context";
import { logger } from "@lib/logger";
import { getBatchStockCached, type BatchStockKey } from "@lib/cache";

export interface UserContext {
  id: string;
  role: "admin" | "manager" | "customer";
  tenantId: string;
  branchId?: string;
}

export interface Context {
  req: Request;
  user: UserContext | null;
  tenantId: string | null;
  stockLoader: DataLoader<BatchStockKey, number | null, string>;
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) return null;
  return parts[1];
}

function buildUserContext(payload: TokenPayload): UserContext {
  if (payload.role === "customer") {
    return {
      id: payload.sub,
      role: "customer",
      tenantId: payload.tenantId,
    };
  }
  return {
    id: payload.sub,
    role: payload.role,
    tenantId: payload.tenantId,
    branchId: payload.branchId,
  };
}

export async function createContext({ req }: { req: Request }): Promise<Context> {
  const token = extractToken(req);
  let user: UserContext | null = null;

  if (token) {
    try {
      const payload = await verifyToken(token);
      user = buildUserContext(payload);
    } catch (err) {
      user = null;
      logger.debug({ component: "auth" }, "Token verification failed");
    }
  }

  const headerTenantId = req.headers["x-tenant-id"] as string | undefined;
  let tenantId: string | null = null;

  if (user) {
    tenantId = user.tenantId;
  } else {
    tenantId = headerTenantId ?? getTenantId() ?? null;
  }

  const stockLoader = new DataLoader<BatchStockKey, number | null, string>(
    async (keys: readonly BatchStockKey[]) => {
      const results = await getBatchStockCached([...keys]);
      return results;
    },
    { maxBatchSize: 100, cacheKeyFn: (k: BatchStockKey) => `${k.tenantId}:${k.productId}:${k.branchId}:${k.variantId ?? "base"}` }
  );

  return { req, user, tenantId, stockLoader };
}
