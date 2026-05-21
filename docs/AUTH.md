# Authentication & Authorization

## Overview

This backend uses **JWT (JSON Web Tokens)** for stateless authentication with **role-based access control (RBAC)** and **tenant isolation**.

```
┌─────────────────────────────────────────────────────────────────┐
│                        AUTHENTICATION FLOW                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Client                    Backend                    Database  │
│    │                          │                           │      │
│    │  POST /graphql           │                           │      │
│    │  { login(email,pass) }  │                           │      │
│    │ ──────────────────────► │                           │      │
│    │                          │  findUserByEmail(tenantId)│      │
│    │                          │ ─────────────────────────►│      │
│    │                          │                           │      │
│    │                          │        bcrypt.compare()    │      │
│    │                          │ ◄──────────────────────── │      │
│    │                          │                           │      │
│    │   JWT Token              │  signAdminToken() or     │      │
│    │   + User Info            │  signCustomerToken()     │      │
│    │ ◄────────────────────── │                           │      │
│    │                          │                           │      │
└─────────────────────────────────────────────────────────────────┘
```

## Authorization Header Format

All authenticated requests must include the `Authorization` header:

```
Authorization: Bearer <jwt_token>
```

Example:
```bash
curl -X POST http://localhost:3000/graphql \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{"query": "{ me { id email role tenantId } }"}'
```

## Login Flow

### Admin Login (`adminLogin`)

```graphql
mutation {
  adminLogin(input: {
    email: "admin@example.com"
    password: "SecurePass123!"
    tenantId: "tenant-uuid-here"
  }) {
    token      # JWT string
    user {
      id
      email
      firstName
      lastName
      role      # "admin" | "manager"
      tenantId
    }
  }
}
```

### Customer Login (`customerLogin`)

```graphql
mutation {
  customerLogin(input: {
    email: "customer@example.com"
    password: "SecurePass123!"
    tenantId: "tenant-uuid-here"
  }) {
    token
    customer {
      id
      email
      firstName
      lastName
    }
  }
}
```

### Customer Registration (`customerRegister`)

```graphql
mutation {
  customerRegister(input: {
    email: "newcustomer@example.com"
    password: "SecurePass123!"
    firstName: "John"
    lastName: "Doe"
    phone: "+5491123456789"
    tenantId: "tenant-uuid-here"
  }) {
    token
    customer {
      id
      email
      firstName
      lastName
    }
  }
}
```

## JWT Structure

### Admin Token Payload

```typescript
interface AdminTokenPayload {
  sub: string;        // adminUserId (UUID)
  role: "admin" | "manager";
  tenantId: string;   // UUID - critical for tenant isolation
  branchId?: string;  // Optional - restricts access to specific branch
}
```

**Example decoded payload:**
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "role": "admin",
  "tenantId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "branchId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "iat": 1715000000,
  "exp": 1715086400
}
```

### Customer Token Payload

```typescript
interface CustomerTokenPayload {
  sub: string;        // customerId (UUID)
  role: "customer";
  tenantId: string;   // UUID - critical for tenant isolation
}
```

**Example decoded payload:**
```json
{
  "sub": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "role": "customer",
  "tenantId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "iat": 1715000000,
  "exp": 1715604800
}
```

### Token Expiration

| Token Type | Secret Used | Expiration |
|------------|-------------|------------|
| Admin | `JWT_ADMIN_SECRET` | 4 hours (see `src/lib/jwt.ts:45`) |
| Customer | `JWT_CUSTOMER_SECRET` | 24 hours |

## JWT Verification Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     JWT VERIFICATION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Request with Bearer Token                                      │
│   │                                                             │
│   ▼                                                             │
│   extractToken() ──── validates "Bearer <token>" format         │
│   │                                                             │
│   ▼                                                             │
│   verifyToken()                                                 │
│   │                                                             │
│   ├──► Check Redis blacklist (TOKEN_BLACKLIST_PREFIX)           │
│   │    └──► If blacklisted: throw AuthenticationError            │
│   │                                                             │
│   ├──► Try admin secret first                                   │
│   │    └──► jwt.verify(token, validatedAdminSecret)             │
│   │         └──► If valid + role in ["admin","manager"]: OK      │
│   │                                                             │
│   └──► Try customer secret                                      │
│        └──► jwt.verify(token, validatedCustomerSecret)          │
│             └──► If valid + role === "customer": OK              │
│                                                                  │
│   └──► buildUserContext(payload) ──── extracts user info         │
│        └──► Returns UserContext { id, role, tenantId, branchId }│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Source: `src/graphql/context.ts`

```typescript
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
```

### Source: `src/lib/jwt.ts`

```typescript
export async function verifyToken(token: string): Promise<TokenPayload> {
  // 1. Check blacklist
  const blacklisted = await isTokenBlacklisted(token);
  if (blacklisted) {
    throw new AuthenticationError("Token has been revoked");
  }

  // 2. Try admin secret first
  const secrets = [
    { secret: validatedAdminSecret, roles: ["admin", "manager"] as const },
    { secret: validatedCustomerSecret, roles: ["customer"] as const },
  ];

  // 3. Try each secret until one works
  for (const { secret, roles } of secrets) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ["HS256"] }) as TokenPayload;
      if ((roles as readonly string[]).includes(payload.role)) {
        return payload;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  throw new AuthenticationError("Invalid or expired token");
}
```

## Tenant Isolation

Tenant isolation is enforced at multiple levels:

### 1. JWT Contains tenantId

Every token **must** contain a `tenantId` claim. This is set during login:

```typescript
// src/modules/auth/service.ts
const payload: AdminTokenPayload = {
  sub: admin.id,
  role: admin.role as "admin" | "manager",
  tenantId: admin.tenantId,  // <-- From the user's tenant
  branchId: admin.branchId ?? undefined,
};
```

### 2. Context Extraction

On every request, `tenantId` is extracted from the verified JWT:

```typescript
// src/graphql/context.ts
export async function createContext({ req }: { req: Request }): Promise<Context> {
  const token = extractToken(req);
  let user: UserContext | null = null;

  if (token) {
    const payload = await verifyToken(token);
    user = buildUserContext(payload);  // tenantId comes from JWT
  }

  // Priority: JWT tenantId > header tenantId > default
  if (user) {
    tenantId = user.tenantId;
  } else {
    tenantId = headerTenantId ?? getTenantId() ?? null;
  }
  // ...
}
```

### 3. Database Queries Use tenantId

Prisma queries filter by `tenantId`:

```typescript
// Admin lookup uses composite unique key
await prisma.adminUser.findUnique({
  where: { tenantId_email: { tenantId: input.tenantId, email: input.email } },
});

// Customer lookup
await prisma.customer.findUnique({
  where: { tenantId_email: { tenantId: input.tenantId, email: input.email } },
});
```

### 4. Prisma Client Middleware (Runtime Safety)

```typescript
// src/lib/prisma.ts
prisma.$use(async (params, next) => {
  const tenantId = getTenantId();
  // Automatically inject tenantId where applicable
  // ...
});
```

### Flow Diagram: Tenant Isolation

```
┌─────────────────────────────────────────────────────────────────┐
│                    TENANT ISOLATION FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Request ──► JWT Verification ──► Extract tenantId            │
│                             │                                   │
│                             ▼                                   │
│                    ┌─────────────────┐                          │
│                    │ tenantId: "T1"  │  (from JWT claim)        │
│                    └─────────────────┘                          │
│                             │                                   │
│         ┌───────────────────┼───────────────────┐              │
│         │                   │                   │              │
│         ▼                   ▼                   ▼              │
│    AdminUser.find      Product.find        Order.find         │
│    where tenantId=T1   where tenantId=T1    where tenantId=T1   │
│         │                   │                   │              │
│         └───────────────────┴───────────────────┘              │
│                             │                                   │
│                             ▼                                   │
│                    Data filtered by                            │
│                    tenantId automatically                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Password Change Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                  PASSWORD CHANGE FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Authenticated Request (Bearer Token)                          │
│   │                                                             │
│   ▼                                                             │
│   rateLimitAuth(`changepw:${userId}`)                           │
│   │  - Uses auth rate limit config                             │
│   │  - Default: 5 requests per 15 minutes (see `src/lib/config.ts:34`)                      │
│   │                                                             │
│   ▼                                                             │
│   Validate new password                                         │
│   │  - Min 8 chars, max 128                                     │
│   │  - At least 1 uppercase                                     │
│   │  - At least 1 number                                        │
│   │  - At least 1 special character                            │
│   │                                                             │
│   ▼                                                             │
│   bcrypt.compare(oldPassword, storedHash)                       │
│   │                                                             │
│   ├──► Invalid ──► AuthenticationError                          │
│   │                                                             │
│   └──► Valid ──► bcrypt.hash(newPassword, 12)                   │
│                │                                                │
│                ▼                                                │
│           Update user.password ──► Success                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### GraphQL Mutation

```graphql
mutation {
  changePassword(input: {
    oldPassword: "OldPass123!"
    newPassword: "NewPass456!"
  })
}
```

### Rate Limiting Configuration

| Config | Environment Variable | Default |
|--------|---------------------|---------|
| Auth window | `RATE_LIMIT_AUTH_WINDOW_MS` | 15 minutes (900000ms) |
| Auth max requests | `RATE_LIMIT_AUTH_MAX_REQUESTS` | 5 (see `src/lib/config.ts:34`) |

```typescript
// src/lib/config.ts
auth: {
  windowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS || 900000),
  maxRequests: Number(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS || 5),
},
```

## Rate Limiting

### Rate Limit Keys

| Purpose | Key Pattern | Default Limit |
|---------|-------------|---------------|
| Auth operations | `auth:{identifier}` | 5 per 15 min |
| Checkout | `checkout:{identifier}` | 10 per 1 min |
| General | `general:{identifier}` | 100 per 1 min |

### Auth Rate Limiting Examples

```typescript
// Admin login
await rateLimitAuth(`admin:${input.email.toLowerCase().trim()}`);

// Customer login
await rateLimitAuth(`customer:${input.email.toLowerCase().trim()}`);

// Registration
await rateLimitAuth(`register:${input.email.toLowerCase().trim()}`);

// Password change
await rateLimitAuth(`changepw:${ctx.user.id}`);
```

### Fallback Behavior

If Redis is unavailable:
- **Production**: Throws `RateLimitError`
- **Development**: Uses in-memory fallback (max 500 entries)

## Token Revocation

Tokens can be revoked by adding them to a Redis blacklist:

```typescript
// src/lib/jwt.ts
const TOKEN_BLACKLIST_PREFIX = "jwt:blacklist:";
const TOKEN_BLACKLIST_TTL = 86400; // 24 hours

export async function revokeToken(token: string): Promise<void> {
  const key = TOKEN_BLACKLIST_PREFIX + token;
  await redis.setex(key, TOKEN_BLACKLIST_TTL, "1");
}
```

## Password Requirements

Passwords must meet these criteria (enforced by Zod schema):

| Rule | Error Message |
|------|---------------|
| Min 8 characters | "Mínimo 8 caracteres" |
| Max 128 characters | "Máximo 128 caracteres" |
| At least 1 uppercase | "Al menos una mayúscula" |
| At least 1 number | "Al menos un número" |
| At least 1 special char | "Al menos un carácter especial" |

## Roles & Permissions

| Role | Description |
|------|-------------|
| `admin` | Full access within a tenant |
| `manager` | Limited admin access, usually branch-scoped |
| `customer` | Customer-facing access |

## Auth Errors

| Error | Cause |
|-------|-------|
| `AuthenticationError` | Invalid credentials, expired token, revoked token |
| `ValidationError` | Invalid password format |
| `RateLimitError` | Too many requests |
| `ConflictError` | Email already registered |

## Environment Variables Required

| Variable | Description |
|----------|-------------|
| `JWT_ADMIN_SECRET` | Secret key for signing admin/manager tokens (HS256) |
| `JWT_CUSTOMER_SECRET` | Secret key for signing customer tokens (HS256) |
| `REDIS_URL` | Redis connection URL (for rate limiting & token blacklist) |
| `DATABASE_URL` | PostgreSQL connection URL |

## Security Checklist

- [ ] Tokens are signed with HS256 algorithm
- [ ] Separate secrets for admin and customer tokens
- [ ] Passwords hashed with bcrypt (12 rounds)
- [ ] Rate limiting on all auth endpoints
- [ ] Token blacklist stored in Redis
- [ ] Tenant ID extracted from verified JWT (not user input)
- [ ] Composite unique keys enforce tenant+email uniqueness
