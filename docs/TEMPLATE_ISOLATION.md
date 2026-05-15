# Tenant Isolation Architecture

This document describes the tenant isolation architecture implemented in the backend to ensure strict data separation between tenants.

## What is Tenant Isolation?

Tenant isolation ensures that each tenant (business/organization) can only access their own data. In this system:

- **Data isolation**: All database queries are scoped to a specific `tenantId`
- **Cache isolation**: All cache keys include `tenantId` to prevent data leakage
- **Authorization**: Every API request must be authenticated with a tenant-aware JWT token

## How tenantId is Extracted from JWT

The `tenantId` is embedded in the JWT payload during token creation and extracted at request time.

### Token Payload Structure

```typescript
// Admin/Manager token
interface AdminTokenPayload {
  sub: string;        // adminUserId
  role: "admin" | "manager";
  tenantId: string;
  branchId?: string;
}

// Customer token
interface CustomerTokenPayload {
  sub: string;        // customerId
  role: "customer";
  tenantId: string;
}
```

### Extraction Flow (src/graphql/context.ts)

```typescript
export async function createContext({ req }: { req: Request }): Promise<Context> {
  const token = extractToken(req); // Extracts Bearer token from Authorization header

  let user: UserContext | null = null;

  if (token) {
    try {
      const payload = await verifyToken(token); // Validates and decodes JWT
      user = buildUserContext(payload);        // { id, role, tenantId, branchId }
    } catch (err) {
      user = null;
    }
  }

  // tenantId comes from the authenticated user
  // Falls back to header or async local storage for internal calls
  let tenantId: string | null = null;
  if (user) {
    tenantId = user.tenantId;
  } else {
    tenantId = headerTenantId ?? getTenantId() ?? null;
  }

  return { req, user, tenantId, stockLoader };
}
```

## How tenantId is Used in Cache Keys

All cache keys follow the format: `type:tenantId:id`

### Cart Cache (src/modules/cart/service.ts)

```typescript
// Guest cart key
function cartKey(cartId: string, tenantId: string): string {
  return `cart:${tenantId}:${cartId}`;
}

// User cart key
function userCartKey(userId: string, tenantId: string): string {
  return `cart:${tenantId}:user:${userId}`;
}

// Checkout snapshot key
const snapshotKey = `checkout:${tenantId}:snapshot:${preferenceId}`;
```

### Stock Cache (src/lib/cache.ts)

```typescript
function stockCacheKey(
  productId: string,
  branchId: string,
  variantId?: string | null,
  tenantId?: string
): string {
  const base = tenantId ? `stock:${tenantId}` : 'stock';
  return variantId
    ? `${base}:${branchId}:${productId}:${variantId}`
    : `${base}:${branchId}:${productId}:base`;
}
```

### Query Cache (src/modules/customers/service.ts)

```typescript
// Customer profile cache key
const cacheKey = `customer:${tenantId}:${id}`;

// Product cache key
const cacheKey = `product:${id}:${tenantId}:${activeOnly}`;

// Order cache key
const cacheKey = `order:${id}:${tenantId}`;
```

## How tenantId Filters Database Queries

Every database query includes `tenantId` in the `where` clause.

### Customers (src/modules/customers/service.ts)

```typescript
// Find customer by id, scoped to tenant
const customer = await prisma.customer.findFirst({
  where: { id, tenantId },
  include: { addresses: { take: 20, orderBy: { createdAt: "desc" } } },
});

// Get address - verifies tenant ownership through customer relation
const address = await prisma.customerAddress.findFirst({
  where: { id, customer: { tenantId } },
});
```

### Inventory (src/modules/inventory/service.ts)

```typescript
// Create stock movement - validates branch belongs to tenant
const branch = await prisma.branch.findUnique({
  where: { id: input.branchId },
  select: { tenantId: true },
});
if (branch.tenantId !== input.tenantId) throw new ForbiddenError("Branch does not belong to this tenant");

// List stock movements filtered by tenant
const where: Prisma.StockMovementWhereInput = { tenantId: args.tenantId };
```

### Catalog (src/modules/catalog/service.ts)

```typescript
// Get product - tenantId in unique where clause
const where: Prisma.ProductWhereUniqueInput = { id, tenantId };

// List products - tenantId in query filter
const where: Prisma.ProductWhereInput = { tenantId: args.tenantId };

// Validate tags belong to tenant
const tags = await prisma.tag.findMany({
  where: { id: { in: input.tagIds }, tenantId: input.tenantId },
});
```

### Orders (src/modules/orders/service.ts)

```typescript
// Create order - validates products belong to tenant
const products = await tx.product.findMany({
  where: { id: { in: productIds }, tenantId: input.tenantId },
});

// Get order - tenantId in unique where clause
const order = await prisma.order.findUnique({
  where: { id, tenantId },
});

// List orders - tenantId filter
const where: Prisma.OrderWhereInput = { tenantId: args.tenantId };
```

## Services Implementing Tenant Isolation

| Service | Module | Key Operations |
|---------|--------|----------------|
| Customers | `modules/customers/` | Profile CRUD, addresses |
| Cart | `modules/cart/` | Cart operations, merge, checkout snapshots |
| Catalog | `modules/catalog/` | Products, variants, tags, suppliers, attributes |
| Inventory | `modules/inventory/` | Stock movements, stock queries |
| Orders | `modules/orders/` | Order creation, status updates |
| Checkout | `modules/checkout/` | Payment processing, webhooks |

## Why Tenant Isolation is Critical for Security

### 1. **Prevents Data Leakage**
Without tenant isolation, a tenant could query or view another tenant's private customer data, orders, and inventory information.

### 2. **Enforces Business Logic**
```typescript
// This check prevents cross-tenant operations
if (branch.tenantId !== input.tenantId) throw new ForbiddenError("Branch does not belong to this tenant");
```

### 3. **Cache Isolation**
Cache keys like `cart:tenant-a:cart-123` ensure Redis cache entries are never shared between tenants.

### 4. **Defense in Depth**
Even if an application bug allows a query to omit `tenantId`, the unique constraint `id_tenantId` in Prisma would reject the query.

### 5. **Compliance**
Multi-tenant systems handling personal data (customers, orders) must guarantee strict separation. A data breach due to missing tenant isolation could result in legal liability.

## Async Local Storage for Tenant Context

For internal service-to-service calls, tenantId is propagated using `AsyncLocalStorage` (src/lib/tenant-context.ts):

```typescript
import { AsyncLocalStorage } from "async_hooks";

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export async function runWithTenant<T>(
  tenantId: string,
  fn: () => Promise<T>
): Promise<T> {
  return tenantStorage.run({ tenantId }, fn);
}

// Usage in internal calls
await runWithTenant(tenantId, async () => {
  // Any code here can call getTenantId() to get the current tenant
});
```

## Cache Key Format Summary

| Cache Type | Key Format | Example |
|------------|------------|---------|
| Cart | `cart:{tenantId}:{cartId}` | `cart:tenant-abc:cart-123` |
| User Cart | `cart:{tenantId}:user:{userId}` | `cart:tenant-abc:user:user-456` |
| Stock | `stock:{tenantId}:{branchId}:{productId}:{variantId}` | `stock:tenant-abc:branch-1:prod-1:base` |
| Checkout Snapshot | `checkout:{tenantId}:snapshot:{preferenceId}` | `checkout:tenant-abc:snapshot:pref-789` |
| Query Cache | `qc:{type}:{tenantId}:{id}` | `qc:customer:tenant-abc:cust-111` |

## Validation Checklist

When adding new features, ensure:

- [ ] All Prisma queries include `tenantId` in where clauses
- [ ] All cache keys include `tenantId` as the second segment
- [ ] New token types include `tenantId` in payload
- [ ] Authorization checks verify `tenantId` ownership
- [ ] Tests mock `tenantId` consistently (e.g., `"tenant-1"`)
