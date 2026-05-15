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

type PrismaArgs = Record<string, unknown>;

function injectTenantFilter(args: PrismaArgs | null, tenantId: string): PrismaArgs | null {
  if (!args || typeof args !== "object") return args;

  if (Array.isArray(args)) {
    return args.map((item) => injectTenantFilter(item as PrismaArgs, tenantId)) as PrismaArgs;
  }

  const result: Record<string, unknown> = {};
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

const databaseUrl = process.env.DATABASE_URL;
const prismaOptions: ConstructorParameters<typeof PrismaClient>[0] = {
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
};

const DB_CONNECTION_LIMIT = parseInt(process.env.DB_CONNECTION_LIMIT ?? "10", 10);
const DB_POOL_TIMEOUT = parseInt(process.env.DB_POOL_TIMEOUT ?? "20", 10);

if (databaseUrl && !databaseUrl.includes("connection_limit")) {
  const separator = databaseUrl.includes("?") ? "&" : "?";
  prismaOptions.datasources = {
    db: {
      url: `${databaseUrl}${separator}connection_limit=${DB_CONNECTION_LIMIT}&pool_timeout=${DB_POOL_TIMEOUT}`,
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
