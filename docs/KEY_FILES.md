# Back-End Key Files Quick Reference

## Entry Point

| Path | `src/index.ts` |
|------|----------------|
| **Purpose** | Express server bootstrap with Apollo GraphQL, middleware chain, and graceful shutdown |

### Key Functions
| Function | Description |
|----------|-------------|
| `bootstrap()` | Initializes server: validates config, connects DB/Redis, starts Apollo Server |
| Health endpoints | `GET /health` - DB + Redis status; `GET /metrics` - application metrics |
| MercadoPago webhook | `POST /webhooks/mercadopago` - handles payment notifications |

### Middleware Stack (in order)
1. `helmet` - Security headers (CSP, HSTS, X-Frame-Options)
2. `cors` - Origin validation from `FRONTEND_URL`
3. `compression` - Gzip compression
4. `timeout('30s')` - Request timeout
5. `requestLoggingMiddleware` - HTTP request logging
6. Tenant resolution via `x-tenant-id` header or JWT `tenantId` claim

### Environment
- Port: `process.env.PORT` (default 4000)
- Requires: `JWT_ADMIN_SECRET`, `JWT_CUSTOMER_SECRET`, `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`

---

## Cache Utility

| Path | `src/lib/cache.ts` |
|------|-------------------|
| **Purpose** | Tenant-aware Redis caching for stock levels |

### Key Functions
| Function | Description |
|----------|-------------|
| `setStockCached(productId, branchId, quantity, variantId?, tenantId?)` | Cache stock level with TTL |
| `getStockCached(productId, branchId, variantId?, tenantId?)` | Returns `{ found: true, value }` or `{ found: false }` |
| `invalidateStockCache(productId, branchId, variantId?, tenantId?)` | Delete single cache entry |
| `invalidateProductStock(productId, tenantId?)` | Delete ALL cache entries for a product (all branches/variants) |
| `getBatchStockCached(keys[])` | Pipeline batch read for multiple stock items |

### Cache Key Format
```
stock:{tenantId}:{branchId}:{productId}:{variantId|base}
```
Without tenantId prefix for global keys.

### Configuration
- Stock TTL: `config.cache.stockTtlSeconds`
- Falls back gracefully when Redis unavailable

---

## Checkout Webhook

| Path | `src/modules/checkout/webhook.handler.ts` |
|------|------------------------------------------|
| **Purpose** | Processes MercadoPago payment notifications |

### Flow
1. **Signature verification** - HMAC SHA256 validation using `MP_WEBHOOK_SECRET`
2. **Idempotency** - Checks `WebhookEvent` table for duplicate `paymentId`
3. **Fetch payment** - Retrieves full payment details from MercadoPago API
4. **Approval processing** - On `approved` status:
   - Validates cart snapshot exists for `preferenceId`
   - Verifies payment amount matches cart total (tolerance 0.01)
   - Creates order via `createOrderFromCheckout()`
   - Clears cart and snapshot

### Key Functions
| Function | Description |
|----------|-------------|
| `handleWebhook(req, res)` | Entry point with 30s timeout wrapper |
| `processWebhookWithTimeout(req, res)` | Core processing with signature verification |
| `processApprovedPayment(payload, mpPayment)` | Order creation on successful payment |
| `verifyMercadoPagoSignature(payload, signature, secret)` | HMAC validation |

### External Reference Format
```
{tenantId}:{cartType}:{cartId}
```
e.g., `tenant123:user:cart-id` or `tenant123:guest:cart-id`

---

## Auth Resolvers

| Path | `src/modules/auth/resolver.ts` + `src/modules/auth/service.ts` |
|------|--------------------------------------------------------------|
| **Purpose** | Authentication (login, register, password change) for admins and customers |

### GraphQL Mutations
| Mutation | Description |
|----------|-------------|
| `adminLogin(input: AdminLoginInput)` | Admin authentication, returns `AdminAuthResult` |
| `customerLogin(input: CustomerLoginInput)` | Customer authentication, returns `CustomerAuthResult` |
| `customerRegister(input: CustomerRegisterInput)` | New customer registration |
| `changePassword(input: ChangePasswordInput)` | Authenticated password change |

### GraphQL Query
| Query | Description |
|-------|-------------|
| `me` | Returns current user based on JWT context |

### Service Functions (`service.ts`)
| Function | Description |
|----------|-------------|
| `adminLogin(input)` | Validates admin credentials, returns JWT |
| `customerLogin(input)` | Validates customer credentials, returns JWT |
| `customerRegister(input)` | Creates customer with bcrypt-hashed password |
| `changePassword(userId, role, oldPassword, newPassword)` | Validates old password, updates hash |
| `createAdmin(input)` | Admin creation (internal use) |

### Password Requirements
- Minimum 8, maximum 128 characters
- At least 1 uppercase, 1 number, 1 special character

### Token Configuration
| Role | Secret | Expiry |
|------|--------|--------|
| Admin | `JWT_ADMIN_SECRET` | 24h |
| Customer | `JWT_CUSTOMER_SECRET` | 7d |

### Rate Limiting
- Auth endpoints limited by `rateLimitAuth()` - identifier is email
- Format: `auth:{email}`

---

## Cart Service

| Path | `src/modules/cart/service.ts` |
|------|-------------------------------|
| **Purpose** | Tenant-isolated shopping cart with Redis persistence and locking |

### Key Types
```typescript
interface CartItem {
  productId: string;
  variantId: string | null;
  name: string;
  sku?: string | null;
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

interface Cart {
  id: string;
  items: CartItem[];
  totalItems: number;
  totalAmount: number;
}
```

### Cart Key Format
| Type | Key Pattern |
|------|-------------|
| Guest Cart | `cart:{tenantId}:{cartId}` |
| User Cart | `cart:{tenantId}:user:{userId}` |
| Lock | `lock:cart:{tenantId}:{cartId}` |
| Checkout Snapshot | `checkout:{tenantId}:snapshot:{preferenceId}` |

### Key Functions
| Function | Description |
|----------|-------------|
| `getGuestCart(cartId, tenantId, isUserCart?)` | Retrieve or create empty cart |
| `createGuestCart(tenantId)` | Generate new UUID cart |
| `getUserCart(userId, tenantId)` | Get persistent user cart |
| `addToCart(cartId, item, isUserCart?, tenantId?, branchId?)` | Add item with stock validation |
| `updateCartItem(cartId, productId, quantity, variantId?, isUserCart?, tenantId?)` | Update quantity (0 = remove) |
| `removeFromCart(cartId, productId, variantId?, isUserCart?, tenantId?)` | Remove item |
| `clearCart(cartId, tenantId, isUserCart?)` | Delete entire cart |
| `mergeGuestCartIntoUserCart(guestCartId, userId, tenantId)` | Atomic merge with locks |
| `validateCartStock(cart, branchId, tenantId?)` | Verify all items available |
| `storeValidatedCartSnapshot(cart, tenantId, branchId, preferenceId)` | Store for checkout |
| `getValidatedCartSnapshot(preferenceId, tenantId)` | Retrieve snapshot |
| `clearValidatedCartSnapshot(preferenceId, tenantId)` | Delete snapshot |

### Concurrency
- Redis-based distributed locking with retry (3 attempts, 100ms delay)
- LRU fallback in-memory cache when Redis unavailable

---

## Inventory Service

| Path | `src/modules/inventory/service.ts` |
|------|------------------------------------|
| **Purpose** | Stock management with transactional integrity |

### Stock Movement Types
- `INBOUND` - Positive quantity
- `OUTBOUND` - Negative quantity (decreases stock)
- `ADJUSTMENT` - Positive or negative
- `TRANSFER` - Positive quantity

### Key Functions
| Function | Description |
|----------|-------------|
| `createStockMovement(input)` | Record stock change with validation |
| `listStockMovements(args)` | Paginated movement history |
| `getStock(args)` | Aggregate stock for product/branch/variant |
| `getProductStockAllBranches(productId, tenantId)` | Stock across all branches |

### Stock Calculation
```
current_stock = SUM(quantity) FROM StockMovement
              WHERE tenantId, branchId, productId, variantId
```
Uses `FOR UPDATE` lock during OUTBOUND to prevent overselling.

### Cache Invalidation
`invalidateStockCache()` called after every movement.

### Validation Rules
- Quantity must be positive (0 < qty <= 1,000,000)
- Branch ownership verified for tenant isolation
- Serializable isolation level for OUTBOUND transactions

---

## Key Security Files

### JWT Authentication
| Path | `src/lib/jwt.ts` |
|------|------------------|
| **Purpose** | Token signing, verification, and revocation |

| Function | Description |
|----------|-------------|
| `signAdminToken(payload)` | HS256 signed, 24h expiry |
| `signCustomerToken(payload)` | HS256 signed, 7d expiry |
| `verifyToken(token)` | Validates signature, checks blacklist, returns payload |
| `revokeToken(token)` | Adds to Redis blacklist (24h TTL) |
| `validateSecrets()` | Ensures env vars present at startup |

### Token Blacklist
```
jwt:blacklist:{token} = "1" (TTL 86400s)
```

### Rate Limiting
| Path | `src/lib/rate-limit.ts` |
|------|------------------------|
| **Purpose** | Redis-based request throttling with memory fallback |

| Function | Description |
|----------|-------------|
| `rateLimit(key, config)` | Core sliding window implementation |
| `rateLimitAuth(identifier)` | Auth endpoints (email-based) |
| `rateLimitCheckout(identifier)` | Checkout operations |
| `rateLimitGeneral(identifier)` | General API endpoints |

### Input Validation & Sanitization
| Path | `src/lib/validation.ts` |
|------|------------------------|
| **Purpose** | Zod schemas and sanitization functions |

| Schema/Function | Purpose |
|-----------------|---------|
| `emailSchema` | Lowercase transform, required, valid format |
| `passwordSchema` | 8-128 chars, A-Z, 0-9, special char required |
| `slugSchema` | Lowercase, alphanumeric, hyphens only |
| `uuidSchema` | UUID v4 validation |
| `paginationSchema` | take (1-100), skip (0+) |
| `moneySchema` | Non-negative, 2 decimal precision |
| `sanitizeString(input)` | XSS prevention - strips HTML/scripts/events |

### Tenant Isolation
| Path | `src/lib/tenant-context.ts` |
|------|------------------------------|
| **Purpose** | AsyncLocalStorage-based tenant context |

| Function | Description |
|----------|-------------|
| `getTenantId()` | Retrieve current tenant from context |
| `setTenantId(tenantId)` | Update tenant in context store |
| `runWithTenant(tenantId, fn)` | Execute async fn with tenant context |
| `runWithTenantSync(tenantId, fn)` | Execute sync fn with tenant context |

---

## Error Handling

| File | Purpose |
|------|---------|
| `src/lib/errors.ts` | Custom error classes: `ValidationError`, `AuthenticationError`, `NotFoundError`, `ForbiddenError`, `ConflictError`, `RateLimitError`, `AppError` |

---

## Database

| File | Purpose |
|------|---------|
| `src/lib/prisma.ts` | Prisma client singleton |
| `prisma/` | Schema and migrations |

### Key Prisma Models
- `AdminUser` - Staff accounts with role (admin/manager)
- `Customer` - End customer accounts
- `StockMovement` - All inventory changes
- `WebhookEvent` - Idempotency for MercadoPago webhooks
