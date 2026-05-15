# Security Architecture

This document describes the security mechanisms implemented in the backend API.

## Table of Contents

- [JWT Authentication](#jwt-authentication)
- [Rate Limiting](#rate-limiting)
- [Webhook Signature Verification](#webhook-signature-verification)
- [Tenant Isolation](#tenant-isolation)
- [XSS Prevention](#xss-prevention)
- [CSRF Protection](#csrf-protection)
- [Redis Fallback Security](#redis-fallback-security)
- [Password Security](#password-security)
- [Error Handling](#error-handling)

---

## JWT Authentication

### Token Types

The system uses two distinct JWT secret keys for different user roles:

| Secret Key | Algorithm | Expiration | Users |
|------------|-----------|-------------|-------|
| `JWT_ADMIN_SECRET` | HS256 | 24 hours | Admin, Manager |
| `JWT_CUSTOMER_SECRET` | HS256 | 7 days | Customer |

### Token Structure

**Admin Token Payload:**
```typescript
{
  sub: string;        // adminUserId
  role: "admin" | "manager";
  tenantId: string;
  branchId?: string;
}
```

**Customer Token Payload:**
```typescript
{
  sub: string;        // customerId
  role: "customer";
  tenantId: string;
}
```

### Token Verification (`src/lib/jwt.ts:62-94`)

```typescript
export async function verifyToken(token: string): Promise<TokenPayload> {
  // 1. Check if token is blacklisted
  const blacklisted = await isTokenBlacklisted(token);
  if (blacklisted) {
    throw new AuthenticationError("Token has been revoked");
  }

  // 2. Try both secrets - admin and customer
  const secrets = [
    { secret: validatedAdminSecret, roles: ["admin", "manager"] },
    { secret: validatedCustomerSecret, roles: ["customer"] },
  ];

  for (const { secret, roles } of secrets) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
      if (roles.includes(payload.role)) {
        return payload;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new AuthenticationError("Invalid or expired token");
}
```

**Key security points:**
- Algorithm is explicitly restricted to `HS256` to prevent algorithm confusion attacks
- Tokens are verified against BOTH secrets to handle role-based token validation
- Blacklisted tokens are rejected immediately

### Token Revocation

Tokens are blacklisted in Redis upon logout:

```typescript
const TOKEN_BLACKLIST_PREFIX = "jwt:blacklist:";
const TOKEN_BLACKLIST_TTL = 86400; // 24 hours

export async function revokeToken(token: string): Promise<void> {
  const available = await isRedisAvailable();
  if (!available) {
    logger.warn({ component: "auth" }, "Redis unavailable, token revocation skipped");
    return; // Fail-open for revocation only
  }
  const key = TOKEN_BLACKLIST_PREFIX + token;
  await redis.setex(key, TOKEN_BLACKLIST_TTL, "1");
}
```

### Authorization Scopes (`src/graphql/builder.ts:40-47`)

The GraphQL schema uses scope-based authorization:

```typescript
authScopes: async (context) => ({
  public: false,
  authenticated: !!context.user,
  admin: context.user?.role === "admin",
  manager: context.user?.role === "admin" || context.user?.role === "manager",
  customer: context.user?.role === "customer",
}),
```

---

## Rate Limiting

### Implementation (`src/lib/rate-limit.ts`)

Rate limiting uses Redis sorted sets with a sliding window algorithm.

### Configuration

| Limit Type | Window | Max Requests |
|------------|--------|--------------|
| General | 60 seconds | 100 |
| Auth | 15 minutes | 10 |
| Checkout | 60 seconds | 10 |

### Redis-Based Rate Limiting

```typescript
export async function rateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_GENERAL
): Promise<void> {
  const isRedisAvailableNow = await checkRedis();
  if (!isRedisAvailableNow) {
    throw new RateLimitError('Service temporarily unavailable');
  }

  const windowKey = `rl:${key}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Redis pipeline for atomic operations
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(windowKey, 0, windowStart); // Remove expired
  pipeline.zcard(windowKey);                                // Count requests in window
  pipeline.zadd(windowKey, now, `${now}-${Math.random()}`); // Add current request
  pipeline.pexpire(windowKey, config.windowMs);            // Set TTL
  const results = await pipeline.exec() ?? [];
  const count = results[1][1] as number;

  if (count >= config.maxRequests) {
    throw new RateLimitError();
  }
}
```

### Fallback Behavior (Fail-Closed)

In production, if Redis is unavailable, rate limiting throws an error:

```typescript
if (!isRedisAvailableNow) {
  if (process.env.NODE_ENV === 'production') {
    throw new RateLimitError('Service temporarily unavailable');
  }
  // Development-only memory fallback
  memoryFallbackCleanup();
  // ... memory-based tracking ...
}
```

---

## Webhook Signature Verification

### MercadoPago Webhook Handler (`src/modules/checkout/webhook.handler.ts`)

Webhooks from MercadoPago are verified using HMAC-SHA256 signatures.

### Signature Verification

```typescript
function verifyMercadoPagoSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Parse signature header: "t=timestamp,v1=hash"
  const [timestampPart, hashPart] = signature.split(",");
  if (!timestampPart || !hashPart) return false;

  const timestamp = timestampPart.replace("t=", "");
  const expectedHash = hashPart.replace("v1=", "");

  // Compute HMAC-SHA256(timestamp + payload)
  const dataToSign = `${timestamp}${payload}`;
  const hmac = createHmac("sha256", secret);
  hmac.update(dataToSign);
  const computedHash = hmac.digest("hex");

  return computedHash === expectedHash;
}
```

### Webhook Processing Flow

1. **Signature verification** - Reject if signature invalid or missing (in production)
2. **Idempotency check** - Store webhook events in DB, skip if already processed
3. **Timeout protection** - 30-second timeout for webhook processing
4. **Amount validation** - Verify `transaction_amount` matches cart total
5. **Error handling** - Return appropriate HTTP status codes

```typescript
async function processWebhookWithTimeout(req: Request, res: Response): Promise<Response> {
  // 1. Verify signature
  if (!webhookSecret || !signature) {
    if (process.env.NODE_ENV === "production") {
      return res.status(401).json({ error: "Missing webhook credentials" });
    }
  } else {
    const isValid = verifyMercadoPagoSignature(rawPayload, signature, webhookSecret);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
  }

  // 2. Check for duplicate events
  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { source_eventId: { source: "mercadopago", eventId: paymentId } },
  });
  if (existingEvent?.processed) {
    return res.status(200).json({ message: "Already processed" });
  }

  // 3. Process with 30s timeout
  // ...
}
```

---

## Tenant Isolation

### Context Management (`src/lib/tenant-context.ts`)

Tenant context is maintained using `AsyncLocalStorage` to ensure isolation across async operations:

```typescript
const tenantStorage = new AsyncLocalStorage<TenantContext>();

export function getTenantId(): string | null {
  const store = tenantStorage.getStore();
  return store?.tenantId ?? null;
}

export async function runWithTenant<T>(
  tenantId: string,
  fn: () => Promise<T>
): Promise<T> {
  return tenantStorage.run({ tenantId }, fn);
}
```

### Context Creation (`src/graphql/context.ts:45-79`)

The GraphQL context extracts tenant information from:

1. **Authenticated user** - `user.tenantId` from JWT payload
2. **Header fallback** - `x-tenant-id` header (for public queries)
3. **AsyncLocalStorage** - For background jobs

```typescript
export async function createContext({ req }: { req: Request }): Promise<Context> {
  const token = extractToken(req);
  let user: UserContext | null = null;

  if (token) {
    try {
      const payload = await verifyToken(token);
      user = buildUserContext(payload);
    } catch (err) {
      user = null;
    }
  }

  let tenantId: string | null = null;
  if (user) {
    tenantId = user.tenantId;  // Priority: authenticated user
  } else {
    tenantId = headerTenantId ?? getTenantId() ?? null;  // Fallback chain
  }

  return { req, user, tenantId, stockLoader };
}
```

### Enforcing Tenant Isolation in Resolvers

Resolvers MUST verify tenant ownership before mutations:

```typescript
// From src/modules/tenants/resolver.ts
builder.mutationField("updateTenant", (t) =>
  t.field({
    // ...
    resolve: async (_parent, { id, input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      if (ctx.tenantId !== id) {
        throw new ForbiddenError("Cannot update another tenant");
      }
      return tenantService.updateTenant(id, { ... });
    },
  })
);
```

---

## XSS Prevention

### Input Sanitization (`src/lib/validation.ts:51-66`)

All string inputs are sanitized before processing:

```typescript
export function sanitizeString(input: string | null | undefined): string | null {
  if (!input) return null;
  return input
    .trim()
    .replace(/<[^>]*>/g, "")           // Remove HTML tags
    .replace(/javascript:/gi, "")      // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, "")        // Remove event handlers
    .replace(/&lt;/g, "<")            // Decode HTML entities
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .slice(0, 5000);                   // Limit length
}
```

### Password Validation

Passwords are validated against strict rules:

```typescript
export const passwordSchema = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .max(128, "Máximo 128 caracteres")
  .regex(/[A-Z]/, "Al menos una mayúscula")
  .regex(/[0-9]/, "Al menos un número")
  .regex(/[^A-Za-z0-9]/, "Al menos un carácter especial");
```

### GraphQL Depth Limit (`src/graphql/plugins/depth-limit.ts`)

Prevents deep nesting attacks:

```typescript
const MAX_DEPTH = 10;

export const depthLimitPlugin: ApolloServerPlugin = {
  async requestDidStart() {
    return {
      async didResolveOperation({ request, document }) {
        const errors = depthLimit(document, MAX_DEPTH, { ignoreIntrospection: false });
        if (errors) {
          throw new Error(`Query exceeds maximum depth of ${MAX_DEPTH}`);
        }
      },
    };
  },
};
```

---

## CSRF Protection

The backend does NOT implement CSRF protection for GraphQL mutations. CSRF protection is handled by the frontend.

**Rationale:** GraphQL API expects the `Authorization: Bearer <token>` header, which cannot be sent automatically by browsers via CSRF attacks (forms can only send GET/POST, not custom headers).

---

## Redis Fallback Security

### Fail-Closed Principle

The system follows fail-closed security for Redis-dependent features:

| Feature | Redis Unavailable | Behavior |
|---------|------------------|----------|
| Rate Limiting | Yes | **BLOCK** - Throw `RateLimitError` in production |
| Token Blacklist | Yes | **SKIP** - Log warning, allow token |
| Stock Cache | Yes | **IGNORE** - Proceed without cache |
| Cart Operations | Yes | **BLOCK** - Throw error |

### Health Check (`src/lib/redis.ts:47-59`)

```typescript
let redisAvailableCache: boolean | null = null;
let redisCacheTime = 0;

export async function isRedisAvailable(): Promise<boolean> {
  const now = Date.now();
  // Cache result for 5 seconds to reduce load
  if (redisAvailableCache !== null && now - redisCacheTime < 5000) {
    return redisAvailableCache;
  }
  try {
    const result = await redis.ping();
    redisAvailableCache = result === "PONG";
  } catch {
    redisAvailableCache = false;
  }
  redisCacheTime = now;
  return redisAvailableCache;
}
```

### Circuit Breaker for MercadoPago (`src/lib/circuit-breaker.ts`)

Protects against cascading failures:

```typescript
export const mpCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,      // Open after 5 failures
  resetTimeout: 30000,     // Try again after 30s
  halfOpenMaxCalls: 2,     // Allow 2 test calls
});
```

---

## Password Security

### Hashing (`src/modules/auth/service.ts`)

Passwords are hashed using bcrypt with a salt rounds of 12:

```typescript
const SALT_ROUNDS = 12;

const hashed = await bcrypt.hash(input.password, SALT_ROUNDS);
```

### Password Change Validation

Password changes require the old password:

```typescript
export async function changePassword(
  userId: string,
  role: "admin" | "manager" | "customer",
  oldPassword: string,
  newPassword: string
) {
  // Validate new password strength
  const passwordValidation = passwordSchema.safeParse(newPassword);
  if (!passwordValidation.success) {
    throw new ValidationError(passwordValidation.error.errors[0].message);
  }

  // Verify old password
  const valid = await bcrypt.compare(oldPassword, user.password);
  if (!valid) throw new AuthenticationError("Invalid current password");

  // Hash and update
  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.customer.update({ where: { id: userId }, data: { password: hashed } });
}
```

---

## Error Handling

### Error Types (`src/lib/errors.ts`)

Custom error hierarchy with appropriate HTTP status codes:

| Error Class | Code | Status |
|-------------|------|--------|
| `AppError` | - | 500 |
| `AuthenticationError` | `UNAUTHENTICATED` | 401 |
| `ForbiddenError` | `FORBIDDEN` | 403 |
| `ValidationError` | `VALIDATION_ERROR` | 400 |
| `NotFoundError` | `NOT_FOUND` | 404 |
| `RateLimitError` | `RATE_LIMITED` | 429 |

### Error Formatting

Production errors hide internal details:

```typescript
if (process.env.NODE_ENV === "production") {
  return {
    ...formattedError,
    message: "Internal server error",
    extensions: {
      ...formattedError.extensions,
      code: "INTERNAL_SERVER_ERROR",
      statusCode: 500,
    },
  };
}
```

### Request Logging (`src/lib/request-logger.ts`)

All requests are logged with request IDs for audit trails:

```typescript
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = req.headers["x-request-id"] ?? generateRequestId();
  req.requestId = requestId;

  const requestLog = createChildLogger({
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
  });

  const originalEnd = res.end;
  res.end = function (...args) {
    const duration = Date.now() - startTime;
    if (res.statusCode >= 400) {
      requestLog.error(`Request completed with status ${res.statusCode} in ${duration}ms`);
    }
    return originalEnd.apply(this, args);
  };
}
```

---

## Security Checklist

- [x] JWT with HS256 algorithm restriction
- [x] Separate secrets for admin/customer tokens
- [x] Token blacklisting via Redis
- [x] Rate limiting with Redis
- [x] Fail-closed for rate limiting in production
- [x] Webhook signature verification (HMAC-SHA256)
- [x] Idempotent webhook processing
- [x] Tenant isolation via AsyncLocalStorage
- [x] Tenant ownership verification in resolvers
- [x] Input sanitization (XSS prevention)
- [x] Password hashing with bcrypt (12 rounds)
- [x] GraphQL query depth limiting
- [x] Circuit breaker for external services
- [x] Structured error responses
- [x] Request logging with request IDs
