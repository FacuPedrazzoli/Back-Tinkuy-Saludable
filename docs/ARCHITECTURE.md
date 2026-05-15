# Backend Architecture - Tinkuy Saludable

## Overview

A multi-tenant e-commerce backend for a dietética (health food store) built with Node.js, TypeScript, GraphQL, and PostgreSQL. Supports product catalog management, inventory tracking, shopping cart, and MercadoPago checkout integration.

## Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js >= 20.0.0 |
| Language | TypeScript 5.3 |
| API | GraphQL (Pothos) + Express |
| Database | PostgreSQL (Prisma ORM) |
| Cache | Redis (ioredis) |
| Authentication | JWT (jsonwebtoken) |
| Payments | MercadoPago SDK |
| Validation | Zod |
| Testing | Vitest |

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Express Server                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Health     │  │   GraphQL    │  │   Webhook Handler    │  │
│  │   /health    │  │   /graphql   │  │   /webhooks/mp      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
          ▼                  ▼                  ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │   JWT    │      │  Redis  │      │   DB     │
    │  Auth    │      │  Cache   │      │PostgreSQL│
    └──────────┘      └──────────┘      └──────────┘
```

## Directory Structure

```
src/
├── index.ts                 # Application entry point
├── graphql/
│   ├── builder.ts          # Pothos schema builder configuration
│   ├── schema.ts           # Schema assembly (imports all modules)
│   └── context.ts          # GraphQL context creation
├── lib/
│   ├── prisma.ts           # Prisma client with tenant middleware
│   ├── redis.ts            # Redis connection and utilities
│   ├── jwt.ts              # JWT signing, verification, revocation
│   ├── tenant-context.ts   # AsyncLocalStorage for tenant isolation
│   ├── rate-limit.ts       # Redis-based rate limiting
│   ├── errors.ts           # Custom error classes
│   ├── config.ts           # Environment configuration
│   ├── cache.ts            # Stock caching utilities
│   ├── query-cache.ts      # General query result caching
│   ├── mercadopago.ts      # MercadoPago API wrapper
│   ├── circuit-breaker.ts  # Circuit breaker for external services
│   ├── logger.ts           # Structured JSON logging
│   └── validation.ts       # Zod schemas for input validation
├── modules/
│   ├── auth/               # Authentication (login, register, password)
│   ├── tenants/            # Tenant and branch management
│   ├── catalog/            # Products, variants, tags, suppliers
│   ├── inventory/          # Stock movements (immutable ledger)
│   ├── cart/               # Shopping cart management
│   ├── orders/             # Order processing
│   ├── checkout/           # MercadoPago checkout orchestration
│   ├── customers/          # Customer profile and addresses
│   └── media/              # Media handling
└── types/
    └── graphql-depth-limit.d.ts
```

## Core Components

### 1. GraphQL Schema Builder (`src/graphql/builder.ts`)

Built with [Pothos](https://pothos-graphql.dev/) plugin framework:

- **PrismaPlugin**: Direct Prisma model exposure to GraphQL
- **ScopeAuthPlugin**: Role-based access control
- **ValidationPlugin**: Zod-based input validation

Auth scopes defined:
- `public` - No authentication required
- `authenticated` - Any logged-in user
- `admin` - Admin role only
- `manager` - Admin or manager role
- `customer` - Customer role only

### 2. Tenant Isolation (`src/lib/tenant-context.ts`)

Uses `AsyncLocalStorage` to propagate tenant context:

```typescript
// Tenant ID flows through the request via AsyncLocalStorage
const tenantStorage = new AsyncLocalStorage<TenantContext>();

// Inject tenant before processing
runWithTenantSync(tenantId, () => {
  // All database queries automatically scoped to tenant
});
```

### 3. Prisma Tenant Middleware (`src/lib/prisma.ts`)

Automatically injects `tenantId` filter into all queries for tenant-specific models:

```typescript
prisma.$use(async (params, next) => {
  if (isTenantModel(params.model)) {
    const tenantId = getTenantId();
    if (tenantId) {
      params.args = injectTenantFilter(params.args, tenantId);
    }
  }
  return next(params);
});
```

**Tenant-scoped models**: Branch, AdminUser, Customer, Product, ProductVariant, ProductAttribute, ProductImage, Tag, ProductTag, Supplier, ProductSupplier, StockMovement, Order, OrderItem

**Non-scoped models**: Tenant (has no tenantId, managed by admins)

## Module Architecture

### Auth Module (`src/modules/auth/`)

**Purpose**: User authentication and registration

**Types**:
- `AdminUser` - Staff accounts (admin/manager roles)
- `Customer` - End customer accounts

**JWT Tokens**:
- Admin tokens: Signed with `JWT_ADMIN_SECRET`, 24h expiry
- Customer tokens: Signed with `JWT_CUSTOMER_SECRET`, 7d expiry

**Token Revocation**: Blacklisted in Redis with 24h TTL

```typescript
// Token payload structure
interface AdminTokenPayload {
  sub: string;        // adminUserId
  role: "admin" | "manager";
  tenantId: string;
  branchId?: string;
}

interface CustomerTokenPayload {
  sub: string;        // customerId
  role: "customer";
  tenantId: string;
}
```

**Operations**:
- `adminLogin` - Staff authentication
- `customerLogin` - Customer authentication
- `customerRegister` - New customer signup
- `changePassword` - Password update

### Tenants Module (`src/modules/tenants/`)

**Purpose**: Multi-tenant management

**Entities**:
- `Tenant` - Top-level tenant (company/organization)
- `Branch` - Physical locations belonging to a tenant

Each tenant has isolated:
- Products and catalog
- Customers
- Orders
- Staff accounts
- Inventory

### Catalog Module (`src/modules/catalog/`)

**Purpose**: Product information management

**Entities**:
- `Product` - Base product with name, description, base price, visibility flags
- `ProductVariant` - Product variations (size, flavor, etc.) with own pricing
- `ProductAttribute` - Key-value attributes for products/variants
- `ProductImage` - Product images with alt text and sort order
- `Tag` - Categorization tags
- `Supplier` - Product suppliers with contact info
- `ProductSupplier` - Supplier-product associations with cost price

**Features**:
- Slug-based product lookup
- Visibility control (`isVisible`, `isActive`)
- Tag-based filtering
- Search by name

### Inventory Module (`src/modules/inventory/`)

**Purpose**: Stock tracking via immutable ledger

**Movement Types**:
- `INBOUND` - Stock received (positive quantity)
- `OUTBOUND` - Stock sold/dispatched (negative quantity)
- `ADJUSTMENT` - Manual stock corrections
- `TRANSFER` - Stock transferred between branches

**Key特性**:
- All stock changes create new `StockMovement` records (append-only)
- Current stock = SUM of all movements for product/branch
- `FOR UPDATE` locking prevents overselling
- `Serializable` isolation for stock-deducting transactions

```typescript
// Stock calculation from movements
const stock = await prisma.stockMovement.aggregate({
  where: { tenantId, branchId, productId, variantId },
  _sum: { quantity: true },
});
```

### Cart Module (`src/modules/cart/`)

**Purpose**: Shopping cart management

**Storage**: Redis (with LRU memory fallback)

**Key Features**:
- Guest carts (UUID-based) and user carts (user ID-based)
- Distributed locking for concurrent modifications
- Automatic stock validation on add-to-cart
- Cart merge for guest-to-user conversion
- 24-hour cart TTL

**Cart Structure**:
```typescript
interface Cart {
  id: string;
  items: CartItem[];
  totalItems: number;  // Sum of quantities
  totalAmount: number; // Sum of (price * quantity)
}

interface CartItem {
  productId: string;
  variantId: string | null;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}
```

### Orders Module (`src/modules/orders/`)

**Purpose**: Order processing and history

**Order Status Flow**:
```
pending → confirmed → cancelled
                  → refunded
```

**Order Item Snapshot**: Order items store price/name at order time (not linked to current product data)

**Caching**: Order queries cached in Redis with 60s TTL

### Checkout Module (`src/modules/checkout/`)

**Purpose**: MercadoPago payment orchestration

**Flow**:
1. Validate cart contents and stock
2. Create MercadoPago preference with cart snapshot
3. Return payment URL (initPoint/sandboxInitPoint)
4. Webhook receives payment confirmation
5. Create order and deduct stock

**Webhook Processing**:
- Signature verification via HMAC-SHA256
- Idempotency via `WebhookEvent` table
- 30-second timeout protection
- Amount mismatch detection

### Customers Module (`src/modules/customers/`)

**Purpose**: Customer profile and address management

**Entities**:
- `Customer` - Customer account
- `CustomerAddress` - Multiple delivery addresses per customer

## How Modules Interact

```
Client Request
      │
      ▼
┌─────────────────────────────────────────┐
│           Express Middleware            │
│  (CORS, Helmet, Compression, Timeout)  │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         Tenant Resolution               │
│  JWT Token → tenantId or x-tenant-id    │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│           GraphQL Context               │
│  (user, tenantId, DataLoader)            │
└─────────────────┬───────────────────────┘
                  │
         ┌────────┴────────┐
         ▼                 ▼
   ┌──────────┐      ┌──────────────┐
   │ Query    │      │  Mutation    │
   │ Resolver │      │  Resolver    │
   └────┬─────┘      └──────┬───────┘
        │                   │
        ▼                   ▼
   ┌─────────────────────────────────┐
   │         Service Layer           │
   │  (Business Logic, Validation)   │
   └─────────────────┬───────────────┘
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │ Prisma  │  │  Redis  │  │Mercado  │
   │  (DB)   │  │ (Cache) │  │  Pago   │
   └─────────┘  └─────────┘  └─────────┘
```

### Example Flow: Checkout

```
checkout mutation
      │
      ▼
┌────────────────────────────────────┐
│ Validate cart not empty            │
│ Validate prices match catalog      │
│ Validate stock available           │
└─────────────────┬──────────────────┘
                  │
                  ▼
┌────────────────────────────────────┐
│ Create MercadoPago preference      │
│ Store validated cart snapshot      │
└─────────────────┬──────────────────┘
                  │
                  ▼ (Returns initPoint URL)
              Client pays on MP
                  │
                  ▼ (Webhook notification)
┌────────────────────────────────────┐
│ Verify MP signature               │
│ Check idempotency (WebhookEvent)  │
│ Validate payment amount            │
│ Create order with items snapshot   │
│ Create OUTBOUND stock movements    │
│ Clear cart and snapshot            │
└────────────────────────────────────┘
```

## Security Architecture

### JWT Authentication

Two separate secrets for admin and customer tokens:

```typescript
// Admin tokens (24h)
jwt.sign(payload, validatedAdminSecret, { expiresIn: "24h" });

// Customer tokens (7 days)
jwt.sign(payload, validatedCustomerSecret, { expiresIn: "7d" });
```

**Verification**: Tries both secrets until one succeeds

### Rate Limiting (`src/lib/rate-limit.ts`)

Redis-based sliding window rate limiting:

| Endpoint | Window | Max Requests |
|----------|--------|--------------|
| General | 60s | 100 |
| Auth | 15min | 10 |
| Checkout | 60s | 10 |

**Fallback**: In-memory Map when Redis unavailable

### Webhook Verification (`src/modules/checkout/webhook.handler.ts`)

```typescript
// MercadoPago signature verification
const [timestampPart, hashPart] = signature.split(",");
const dataToSign = `${timestampPart}${payload}`;
const expectedHash = createHmac("sha256", secret)
  .update(dataToSign)
  .digest("hex");
```

### Security Headers (Helmet)

```typescript
helmet({
  contentSecurityPolicy: { /* strict CSP */ },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  xFrameOptions: "DENY",
  xContentTypeOptions: true,
});
```

## Caching Strategy

### Stock Cache (`src/lib/cache.ts`)

- TTL: 300 seconds (configurable)
- Key pattern: `stock:{tenantId}:{branchId}:{productId}:{variantId?}`
- Batch loading via DataLoader

### Query Cache (`src/lib/query-cache.ts`)

- Generic Redis + LRU memory fallback
- Pattern-based invalidation
- TTLs by entity type:
  - Products: 300s
  - Orders: 60s
  - Customers: 120s
  - Tenants: 300s

### Cart Storage (`src/modules/cart/service.ts`)

- Primary: Redis with 24h TTL
- Fallback: In-memory LRU cache
- Distributed locking for concurrent edits

## Error Handling

Custom error hierarchy (`src/lib/errors.ts`):

```typescript
class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500
  ) {}
}

// Specific errors
class AuthenticationError extends AppError { /* 401 */ }
class ForbiddenError extends AppError { /* 403 */ }
class ValidationError extends AppError { /* 400 */ }
class NotFoundError extends AppError { /* 404 */ }
class RateLimitError extends AppError { /* 429 */ }
```

Error responses include machine-readable `code` and `statusCode` in extensions.

## Database Schema (Prisma)

### Entity Relationships

```
Tenant (1) ──┬── (*) Branch
             ├── (*) AdminUser
             ├── (*) Customer
             ├── (*) Product
             ├── (*) Tag
             ├── (*) Supplier
             ├── (*) StockMovement
             └── (*) Order

Product (1) ──┬── (*) ProductVariant
              ├── (*) ProductAttribute
              ├── (*) ProductImage
              ├── (*) ProductTag ── Tag
              └── (*) ProductSupplier ── Supplier

Order (1) ──┬── (*) OrderItem
            └── (0/1) Customer
```

### Key Indexes

```prisma
// Product queries
@@index([tenantId, isVisible, isActive])
@@index([tenantId, slug])

// Order queries
@@index([tenantId, createdAt])
@@index([tenantId, customerId])
@@index([paymentId])

// Stock movement queries
@@index([tenantId, branchId, productId])
@@index([tenantId, productId, variantId])
@@index([referenceId])
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | Redis connection string | Yes |
| `JWT_ADMIN_SECRET` | Secret for admin JWT (min 32 chars) | Yes |
| `JWT_CUSTOMER_SECRET` | Secret for customer JWT | Yes |
| `MP_ACCESS_TOKEN` | MercadoPago access token | Yes |
| `MP_WEBHOOK_SECRET` | MercadoPago webhook verification secret | Yes |
| `MP_MODE` | `test` or `production` | Yes |
| `PORT` | Server port (default 4000) | No |
| `FRONTEND_URL` | CORS origin for production | Production |
| `RATE_LIMIT_*` | Rate limiting configuration | No |
| `CART_TTL_SECONDS` | Cart expiration (default 86400) | No |

## Testing

Test setup with Vitest:

```bash
npm test          # Run all tests
npm run test:watch # Watch mode
```

Test structure:
```
tests/
├── unit/          # Unit tests for services
│   ├── auth.service.test.ts
│   ├── catalog.service.test.ts
│   └── inventory.service.test.ts
└── smoke.test.ts  # Basic health checks
```

## Deployment

**Commands**:
```bash
npm run dev          # Development with hot reload
npm run build        # Compile TypeScript
npm start            # Production server
npm run db:migrate   # Run Prisma migrations
npm run db:seed      # Seed database
```

**Docker**: `Dockerfile` provided for containerization

**Platform**: Configured for Railway deployment (`railway.json`)

## Key Patterns

### 1. Soft Delete

Products and variants use `isActive` flag rather than hard delete:
```typescript
await prisma.product.update({
  where: { id },
  data: { isActive: false, isVisible: false },
});
```

### 2. Immutable Stock Ledger

StockMovement records are never modified or deleted. Stock = SUM of movements.

### 3. Cart Price Snapshot

Cart stores prices at time of addition; checkout re-validates against current catalog prices.

### 4. Order Item Snapshot

Order items copy product name, SKU, and price at order time to preserve historical accuracy.

### 5. Idempotent Webhooks

`WebhookEvent` table tracks processed MercadoPago payment IDs to prevent duplicate processing.
