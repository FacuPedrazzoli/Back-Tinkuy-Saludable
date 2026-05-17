import { PrismaClient } from "@prisma/client";
import { getTenantId } from "./tenant-context";

// Only models that actually have a `tenantId` scalar column belong here.
// Child/relation models (ProductImage, ProductVariant, OrderItem, the join
// tables, CustomerAddress, ...) are scoped transitively through their parent
// and have NO tenantId column — injecting a tenantId filter on them throws
// a Prisma "Unknown argument `tenantId`" validation error.
const TENANT_MODELS = [
  // Note: "Tenant" is intentionally excluded — it has no tenantId field
  "Branch",
  "AdminUser",
  "Customer",
  "Product",
  "Tag",
  "Supplier",
  "StockMovement",
  "Order",
];

function isTenantModel(model: string): boolean {
  return TENANT_MODELS.includes(model);
}

// Actions whose top-level `where` selects the rows the operation acts on.
// `create`/`createMany` have no `where`; their resolvers set tenantId in
// `data` explicitly, so the middleware must NOT touch them.
const WHERE_SCOPED_ACTIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

// Inject the tenant filter ONLY into the top-level `where` of the root model.
// Nested relation filters inside `include`/`select` must be left untouched:
// they target different models (often without a tenantId column) and are
// already constrained transitively through the parent relation.
function injectTenantFilter(
  args: unknown,
  tenantId: string,
): Record<string, unknown> {
  const base =
    args && typeof args === "object" && !Array.isArray(args)
      ? (args as Record<string, unknown>)
      : {};
  const where =
    base.where && typeof base.where === "object" && !Array.isArray(base.where)
      ? (base.where as Record<string, unknown>)
      : {};
  return { ...base, where: { ...where, tenantId } };
}

const databaseUrl = process.env.DATABASE_URL;
const prismaOptions: ConstructorParameters<typeof PrismaClient>[0] = {
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "error", "warn"]
      : ["error"],
};

const DB_CONNECTION_LIMIT = parseInt(process.env.DB_CONNECTION_LIMIT ?? "50", 10);
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

  // create / createMany have no `where`; their resolvers set tenantId in
  // `data`. Only scope actions that filter rows via a top-level `where`.
  if (!WHERE_SCOPED_ACTIONS.has(params.action)) {
    return next(params);
  }

  const args = injectTenantFilter(params.args, tenantId);
  return next({ ...params, args });
});

export type Prisma = typeof prisma;
