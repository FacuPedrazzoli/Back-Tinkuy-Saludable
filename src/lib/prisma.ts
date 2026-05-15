import { PrismaClient } from "@prisma/client";
import { getTenantId } from "./tenant-context";

const TENANT_MODELS = [
  // Note: "Tenant" is intentionally excluded — it has no tenantId field
  "Branch",
  "AdminUser",
  "Customer",
  "CustomerAddress",
  "Product",
  "ProductVariant",
  "ProductAttribute",
  "ProductImage",
  "Tag",
  "ProductTag",
  "Supplier",
  "ProductSupplier",
  "StockMovement",
  "Order",
  "OrderItem",
];

function isTenantModel(model: string): boolean {
  return TENANT_MODELS.includes(model);
}

/**
 * Recursively inject tenantId into WHERE clauses for tenant-scoped models.
 */
function injectTenantFilter(args: any, tenantId: string): any {
  if (!args || typeof args !== "object") return args;

  if (Array.isArray(args)) {
    return args.map((item) => injectTenantFilter(item, tenantId));
  }

  const result: any = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === "where" && value && typeof value === "object") {
      result[key] = { ...injectTenantFilter(value, tenantId), tenantId };
    } else if (typeof value === "object" && value !== null) {
      result[key] = injectTenantFilter(value, tenantId);
    } else {
      result[key] = value;
    }
  }
  return result;
}

const databaseUrl = process.env.DATABASE_URL ?? "";
const prismaOptions: ConstructorParameters<typeof PrismaClient>[0] = {
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
};

if (databaseUrl && !databaseUrl.includes("connection_limit")) {
  const separator = databaseUrl.includes("?") ? "&" : "?";
  prismaOptions.datasources = {
    db: {
      url: `${databaseUrl}${separator}connection_limit=10&pool_timeout=20`,
    },
  };
}

export const prisma = new PrismaClient(prismaOptions);

prisma.$use(async (params, next) => {
  if (!isTenantModel(params.model ?? "")) {
    return next(params);
  }

  const tenantId = getTenantId();
  if (!tenantId) {
    // Allow unfiltered queries for super-admin or internal operations
    return next(params);
  }

  const args = injectTenantFilter(params.args, tenantId);
  return next({ ...params, args });
});

export type Prisma = typeof prisma;
