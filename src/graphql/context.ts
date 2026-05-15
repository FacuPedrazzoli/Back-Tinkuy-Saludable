import type { Request } from "express";
import { verifyToken, type TokenPayload } from "@lib/jwt";
import { getTenantId } from "@lib/tenant-context";

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
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
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
    } catch {
      user = null;
    }
  }

  const headerTenantId = req.headers["x-tenant-id"] as string | undefined;
  let tenantId: string | null = null;

  if (user) {
    tenantId = user.tenantId;
  } else {
    tenantId = headerTenantId ?? getTenantId() ?? null;
  }

  return { req, user, tenantId };
}
