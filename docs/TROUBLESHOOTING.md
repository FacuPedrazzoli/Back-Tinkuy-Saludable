# Troubleshooting Guide - back-tinkuy-saludable

A comprehensive guide for debugging common issues in the GraphQL backend.

## Table of Contents

- [Getting Started](#getting-started)
- [Debug Logging](#debug-logging)
- [Redis Issues](#redis-issues)
- [Database Issues](#database-issues)
- [JWT Authentication Errors](#jwt-authentication-errors)
- [MercadoPago Webhook Failures](#mercadopago-webhook-failures)
- [Rate Limiting](#rate-limiting)
- [GraphQL Errors](#graphql-errors)
- [Test Failures](#test-failures)

---

## Getting Started

### Where to Check Logs

**Console Output (Development)**
```bash
npm run dev
```
Logs are output as JSON to stdout. Check for `level: "error"` or `level: "warn"` entries.

**Production Logs**
The application outputs structured JSON logs. Parse with:
```bash
# Filter for errors only
cat app.log | jq 'select(.level == "error")'

# Filter by component
cat app.log | jq 'select(.component == "redis")'
```

**Log Levels**
Set via `LOG_LEVEL` env var: `debug`, `info`, `warn`, `error`, `fatal`
- Development default: `debug`
- Production default: `info`

### Environment Validation

On startup, the server validates required environment variables. Missing secrets cause `BOOTSTRAP_ERROR`:

```
Missing required environment variable: JWT_ADMIN_SECRET
```

**Required Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_ADMIN_SECRET` - Min 32 characters
- `JWT_CUSTOMER_SECRET` - Min 32 characters
- `MP_ACCESS_TOKEN` - MercadoPago access token
- `MP_WEBHOOK_SECRET` - MercadoPago webhook secret

---

## Debug Logging

### Enable Verbose Logging

```bash
LOG_LEVEL=debug npm run dev
```

### Log Component Filter

Components are tagged in logs. Filter by:

```bash
# Redis logs
cat logs.json | jq 'select(.component == "redis")'

# Auth logs
cat logs.json | jq 'select(.component == "auth")'

# MercadoPago logs
cat logs.json | jq 'select(.component == "mercadopago")'
```

### Key Log Entries

| Message | Meaning |
|---------|---------|
| `Redis connected` | Redis connection established |
| `Redis reconnecting` | Redis lost connection, attempting reconnect |
| `Redis connection error` | Redis connection failed |
| `Token has been revoked` | JWT is blacklisted |
| `Client error occurred` | 4xx error, check request |
| `Server error occurred` | 5xx error, needs investigation |

---

## Redis Issues

### Connection Refused

**Error:** `ECONNREFUSED` in logs

**Causes:**
1. Redis not running
2. Wrong `REDIS_URL`
3. Firewall blocking connection

**Solutions:**

```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# Start Redis if not running
redis-server

# Test connection manually
redis-cli -u redis://localhost:6379
```

**Verify REDIS_URL format:**
```
redis://localhost:6379           # Local
redis://user:pass@host:6379     # With auth
redis://host:6379/1             # Database index
```

### Redis Connection Timeout

**Error:** `Redis connection error` with timeout message

**Solutions:**
```bash
# Increase timeout in connection
# Edit src/lib/redis.ts:
connectTimeout: 5000,  # Increase from 5000ms
commandTimeout: 3000,   # Increase from 3000ms
```

### Redis Unavailable - Graceful Degradation

The app continues working without Redis but with limitations:
- Token revocation is skipped
- Cache operations fail silently
- Rate limiting may not work

**Check Redis availability:**
```typescript
import { isRedisAvailable } from '@/lib/redis';
const available = await isRedisAvailable();
```

---

## Database Issues

### Prisma Connection Failed

**Error:** `Can't reach database server`

**Solutions:**

1. Verify DATABASE_URL format:
```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=SCHEMA
```

2. Check if PostgreSQL is running:
```bash
psql -U postgres -c "SELECT 1"
```

3. Run migrations:
```bash
npm run db:migrate
npm run db:generate
```

### Prisma Client Not Generated

**Error:** `PrismaClient is not defined` or import errors

**Solution:**
```bash
npm run db:generate
```

### Migration Failures

**Error:** `Migration engine error`

**Solutions:**
```bash
# Reset database (DANGER: deletes data)
npx prisma migrate reset

# Create new migration
npx prisma migrate dev --name descriptive_name

# Verify schema
npx prisma validate
```

---

## JWT Authentication Errors

### "Invalid or expired token"

**Causes:**
1. Token expired (admin: 24h, customer: 7d)
2. Wrong secret used for verification
3. Token was revoked
4. Malformed token

**Debug Steps:**

1. Decode token at [jwt.io](https://jwt.io) to inspect:
   - `exp` - expiration time (Unix timestamp)
   - `sub` - user ID
   - `role` - should be `admin`, `manager`, or `customer`
   - `tenantId` - required for all tokens

2. Check if token is blacklisted:
```bash
# Tokens are stored with prefix "jwt:blacklist:"
redis-cli get "jwt:blacklist:${token}"
```

### "Token has been revoked"

**Cause:** Token was explicitly revoked via `revokeToken()`

**Solution:** User must re-authenticate to get a new token.

### "Missing required environment variable: JWT_ADMIN_SECRET"

**Cause:** Startup validation failed - secret not set or empty

**Solution:** Set `JWT_ADMIN_SECRET` in `.env` (min 32 characters)

### Wrong Token Type for Endpoint

**Error:** `Invalid token` when using admin token for customer endpoints (or vice versa)

**Cause:** The JWT library tries both secrets but only returns token if role matches the endpoint's expected role.

**Solution:** Use correct token type for the operation.

---

## MercadoPago Webhook Failures

### Webhook Verification Failed

**Error:** `401` from MercadoPago or signature mismatch

**Solutions:**

1. Verify `MP_WEBHOOK_SECRET` matches your MercadoPago dashboard:
```
MercadoPago Dashboard > Your app > Webhooks > Security token
```

2. Check notification URL is accessible:
```bash
curl -X GET https://your-domain.com/webhooks/mercadopago
```

3. Test webhook locally with ngrok:
```bash
ngrok http 4000
# Set ngrok URL in MercadoPago dashboard
```

### Webhook Timeout

**Error:** `Webhook timeout` in logs

**Solutions:**

1. Increase timeout in `.env`:
```
WEBHOOK_TIMEOUT_MS=30000
```

2. Acknowledge quickly, process async:
```typescript
// Webhook handler should respond fast
// Process payment status in background job
```

### Test Mode vs Production

**Symptom:** Webhooks not received or wrong behavior

**Check MP_MODE:**
```
MP_MODE=test        # Uses sandbox
MP_MODE=production  # Uses live MercadoPago
```

In test mode, use TEST access tokens from MercadoPago dashboard.

---

## Rate Limiting

### 429 Too Many Requests

**Error:** `Rate limit exceeded`

**Default Limits:**
| Endpoint | Window | Max Requests |
|----------|--------|--------------|
| General | 60s | 100 |
| Auth | 15min | 10 |
| Checkout | 60s | 10 |

**Solutions:**

1. Wait for window to reset
2. Implement exponential backoff in client
3. Check Redis is working (rate limits stored in Redis)

### Rate Limit Headers

The API returns headers on rate-limited responses:
```
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640000000
Retry-After: 60
```

---

## GraphQL Errors

### Error Codes Reference

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `UNAUTHENTICATED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `VALIDATION_ERROR` | 400 | Invalid input |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Duplicate resource |
| `RATE_LIMITED` | 429 | Too many requests |
| `BOOTSTRAP_ERROR` | 500 | Startup config error |
| `INTERNAL_SERVER_ERROR` | 500 | Unexpected error |

### "Cannot query field"

**Error:** `Cannot query field "xyz" on type "Query"`

**Cause:** Field not defined in GraphQL schema

**Solution:** Check schema at `/graphql` endpoint or in `src/graphql/`

### "Variable 'X' expected"

**Error:** `Variable 'X' of required type 'String!' was not provided`

**Cause:** Missing required argument in GraphQL operation

**Solution:** Check the resolver signature matches the operation variables

### Schema Validation Errors

**Error:** `Schema must contain uniquely named types`

**Cause:** Duplicate type definitions

**Solution:**
```bash
npm run typecheck
```

---

## Test Failures

### Test Setup

Tests use environment:
```bash
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/test_db
REDIS_URL=redis://localhost:6379
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npx vitest run --coverage
```

### "Cannot find module" Errors

**Cause:** Path aliases not resolved

**Solution:** Check `vitest.config.ts` has correct aliases:
```typescript
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
    "@lib": path.resolve(__dirname, "./src/lib"),
  },
}
```

### Database Tests Failing

**Cause:** Test database not available or migrations not run

**Solution:**
```bash
# Create test database
createdb test_db

# Run migrations on test db
DATABASE_URL="postgresql://test:test@localhost:5432/test_db" npm run db:migrate
```

### Redis Mock for Tests

If Redis is unavailable during tests, the code gracefully degrades:
```typescript
// Token revocation skipped when Redis unavailable
// Rate limiting may not work
```

To mock Redis in tests, update `tests/setup.ts`:
```typescript
vi.mock('@/lib/redis', () => ({
  redis: { ping: vi.fn().mockResolvedValue('PONG') },
  isRedisAvailable: vi.fn().mockResolvedValue(true),
}));
```

### Timeout Errors

**Error:** `Test timeout exceeded`

**Solution:** Increase timeout in `vitest.config.ts`:
```typescript
test: {
  timeout: 10000, // 10 seconds
}
```

---

## Common Issues Quick Reference

| Problem | Likely Cause | Quick Fix |
|---------|--------------|-----------|
| Server won't start | Missing env vars | Check `.env` against `.env.example` |
| Login fails | Wrong credentials | Verify email/password in DB |
| Webhook not received | URL not accessible | Test with ngrok |
| Slow queries | Missing indexes | Run `prisma migrate dev` |
| Token expired | Clock skew | Sync system time |
| CORS errors | Wrong FRONTEND_URL | Set correct origin |
| Cache stale | Redis restarted | Cache auto-rebuilds |

---

## Getting Help

When reporting issues, include:
1. Full error message and stack trace
2. Environment variables (redact secrets)
3. Relevant log entries
4. Steps to reproduce
5. Expected vs actual behavior
