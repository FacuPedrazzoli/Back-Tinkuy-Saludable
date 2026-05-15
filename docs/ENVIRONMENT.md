# Environment Variables

This document describes all environment variables used by the backend.

## Quick Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `REDIS_URL` | Yes | - | Redis connection URL |
| `JWT_ADMIN_SECRET` | Yes | - | Secret key for admin JWT tokens (min 32 chars) |
| `JWT_CUSTOMER_SECRET` | Yes | - | Secret key for customer JWT tokens (min 32 chars) |
| `MP_ACCESS_TOKEN` | Yes | - | MercadoPago access token |
| `MP_WEBHOOK_SECRET` | Yes | - | MercadoPago webhook verification secret |
| `PORT` | No | `4000` | Server port |
| `NODE_ENV` | No | `development` | Environment: `development`, `production`, or `test` |
| `FRONTEND_URL` | No* | - | Frontend URL for CORS (*required in production) |
| `TRUST_PROXY` | No | - | Trust proxy setting (number or `true`) |
| `LOG_LEVEL` | No | `debug` (dev) / `info` (prod) | Log verbosity: `debug`, `info`, `warn`, `error`, `fatal` |
| `MP_MODE` | No | `test` | MercadoPago mode: `test` or `production` |
| `STOCK_TTL_SECONDS` | No | `300` | Stock cache TTL in seconds |
| `WEBHOOK_TIMEOUT_MS` | No | `30000` | Webhook request timeout in milliseconds |
| `CART_TTL_SECONDS` | No | `86400` | Cart expiration time in seconds (24 hours) |
| `CART_LOCK_TTL_SECONDS` | No | `5` | Cart lock TTL in seconds |
| `CART_LOCK_RETRY_COUNT` | No | `3` | Number of cart lock retry attempts |
| `CART_LOCK_RETRY_DELAY_MS` | No | `100` | Delay between cart lock retries in milliseconds |
| `RATE_LIMIT_GENERAL_WINDOW_MS` | No | `60000` | General rate limit window in ms |
| `RATE_LIMIT_GENERAL_MAX_REQUESTS` | No | `100` | Max requests per general rate limit window |
| `RATE_LIMIT_AUTH_WINDOW_MS` | No | `900000` | Auth rate limit window in ms (15 minutes) |
| `RATE_LIMIT_AUTH_MAX_REQUESTS` | No | `10` | Max requests per auth rate limit window |
| `RATE_LIMIT_CHECKOUT_WINDOW_MS` | No | `60000` | Checkout rate limit window in ms |
| `RATE_LIMIT_CHECKOUT_MAX_REQUESTS` | No | `10` | Max requests per checkout rate limit window |
| `RATE_LIMIT_FALLBACK_MEMORY_LIMIT` | No | `500` | Fallback memory limit for rate limiting |
| `DB_CONNECTION_LIMIT` | No | `10` | Database connection pool size |
| `DB_POOL_TIMEOUT` | No | `20` | Database pool timeout in seconds |
| `ADMIN_INITIAL_PASSWORD` | No | Random UUID | Initial admin password (used during database seeding) |

---

## Detailed Documentation

### Database

#### `DATABASE_URL`
- **Required:** Yes
- **Default:** None
- **Description:** PostgreSQL connection string. Must include schema (e.g., `public`).
- **Example (dev):** `postgresql://user:pass@localhost:5432/mydb?schema=public`
- **Example (prod):** `postgresql://user:pass@prod-db.example.com:5432/mydb?schema=public`

---

### Redis

#### `REDIS_URL`
- **Required:** Yes
- **Default:** None
- **Description:** Redis connection URL for caching, rate limiting, and session management.
- **Example (dev):** `redis://localhost:6379`
- **Example (prod):** `redis://prod-redis.example.com:6379`

---

### JWT Authentication

#### `JWT_ADMIN_SECRET`
- **Required:** Yes
- **Default:** None
- **Description:** Secret key for signing admin/manager JWT tokens. Must be at least 32 characters. Generate a strong random string.
- **Example:** `your-super-secret-admin-key-min-32-chars!!`

#### `JWT_CUSTOMER_SECRET`
- **Required:** Yes
- **Default:** None
- **Description:** Secret key for signing customer JWT tokens. Must be at least 32 characters. Generate a strong random string.
- **Example:** `your-super-secret-customer-key-min-32-char`

---

### MercadoPago

#### `MP_ACCESS_TOKEN`
- **Required:** Yes
- **Default:** None
- **Description:** MercadoPago access token for API authentication. See [Obtaining MercadoPago Credentials](#obtaining-mercadopago-credentials) below.
- **Example (test):** `TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- **Example (prod):** `APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

#### `MP_WEBHOOK_SECRET`
- **Required:** Yes
- **Default:** None
- **Description:** Secret key for verifying MercadoPago webhook signatures. Found in your MercadoPago developer panel.
- **Example:** `whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### `MP_MODE`
- **Required:** No
- **Default:** `test`
- **Description:** Operating mode for MercadoPago integration.
- **Values:** `test` | `production`

---

### Server

#### `PORT`
- **Required:** No
- **Default:** `4000`
- **Description:** TCP port where the Express server listens.

#### `NODE_ENV`
- **Required:** No
- **Default:** `development`
- **Description:** Application environment. Controls logging, error handling, and introspection.
- **Values:** `development` | `production` | `test`

#### `FRONTEND_URL`
- **Required:** No (required in production)
- **Default:** None
- **Description:** Frontend application URL for CORS configuration. Used to allow cross-origin requests from the frontend.
- **Example:** `https://tinkuy-saludable.com`

#### `TRUST_PROXY`
- **Required:** No
- **Default:** None (untrusted)
- **Description:** Enables trust proxy for correct client IP detection behind load balancers or reverse proxies.
- **Values:** `true` (trust single proxy) or a number (trust multiple proxies)

#### `LOG_LEVEL`
- **Required:** No
- **Default:** `debug` (development), `info` (production)
- **Description:** Minimum log level to output.
- **Values:** `debug` | `info` | `warn` | `error` | `fatal`

---

### Caching

#### `STOCK_TTL_SECONDS`
- **Required:** No
- **Default:** `300` (5 minutes)
- **Description:** Time-to-live for stock information in the cache.

---

### Webhooks

#### `WEBHOOK_TIMEOUT_MS`
- **Required:** No
- **Default:** `30000` (30 seconds)
- **Description:** Timeout for MercadoPago webhook requests.

---

### Cart Configuration

#### `CART_TTL_SECONDS`
- **Required:** No
- **Default:** `86400` (24 hours)
- **Description:** How long a cart remains valid without activity.

#### `CART_LOCK_TTL_SECONDS`
- **Required:** No
- **Default:** `5` seconds
- **Description:** Duration of cart lock during checkout operations.

#### `CART_LOCK_RETRY_COUNT`
- **Required:** No
- **Default:** `3`
- **Description:** Number of retry attempts when acquiring a cart lock.

#### `CART_LOCK_RETRY_DELAY_MS`
- **Required:** No
- **Default:** `100` ms
- **Description:** Delay between cart lock retry attempts.

---

### Rate Limiting

#### `RATE_LIMIT_GENERAL_WINDOW_MS`
- **Required:** No
- **Default:** `60000` (1 minute)
- **Description:** Time window for general API rate limiting.

#### `RATE_LIMIT_GENERAL_MAX_REQUESTS`
- **Required:** No
- **Default:** `100`
- **Description:** Maximum requests per general rate limit window.

#### `RATE_LIMIT_AUTH_WINDOW_MS`
- **Required:** No
- **Default:** `900000` (15 minutes)
- **Description:** Time window for authentication-related rate limiting.

#### `RATE_LIMIT_AUTH_MAX_REQUESTS`
- **Required:** No
- **Default:** `10`
- **Description:** Maximum requests per auth rate limit window.

#### `RATE_LIMIT_CHECKOUT_WINDOW_MS`
- **Required:** No
- **Default:** `60000` (1 minute)
- **Description:** Time window for checkout-related rate limiting.

#### `RATE_LIMIT_CHECKOUT_MAX_REQUESTS`
- **Required:** No
- **Default:** `10`
- **Description:** Maximum requests per checkout rate limit window.

#### `RATE_LIMIT_FALLBACK_MEMORY_LIMIT`
- **Required:** No
- **Default:** `500`
- **Description:** Memory limit fallback for rate limiter when Redis is unavailable.

---

### Database Connection Pool

#### `DB_CONNECTION_LIMIT`
- **Required:** No
- **Default:** `10`
- **Description:** Maximum number of concurrent database connections.

#### `DB_POOL_TIMEOUT`
- **Required:** No
- **Default:** `20` seconds
- **Description:** Maximum time to wait for a database connection from the pool.

---

### Seeding

#### `ADMIN_INITIAL_PASSWORD`
- **Required:** No
- **Default:** Random UUID
- **Description:** Initial password for the admin user created during database seeding. If not provided, a random UUID is used and printed to the console.

---

## Obtaining MercadoPago Credentials

### Test Credentials

1. Go to [MercadoPago Developers](https://www.mercadopago.com.ar/developers/)
2. Log in with your MercadoPago account
3. Navigate to **My Apps** or **Credenciales de prueba**
4. Create a new application or select an existing one
5. Copy the **Access Token** (starts with `TEST-`)
6. For the webhook secret, go to **Webhooks** settings and configure your webhook URL

### Production Credentials

Production credentials require approval from MercadoPago:

1. Complete your MercadoPago account verification
2. Go to **MercadoPago Developers** > **Mi negocio** > **Tus integraciones**
3. Request production access for your application
4. Once approved, you will receive:
   - **Access Token** (starts with `APP_USR-`)
   - **Webhook Secret** from your webhook configuration

### Getting the Webhook Secret

1. In the MercadoPago developer panel, go to **Webhooks** or **Notificaciones**
2. Configure your webhook URL (e.g., `https://your-domain.com/webhooks/mercadopago`)
3. The webhook secret (`MP_WEBHOOK_SECRET`) will be provided or can be set manually
4. It's usually in the format `whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

---

## Example Configuration

### Development (.env)

```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/mydb?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT Secrets
JWT_ADMIN_SECRET="dev_admin_secret_at_least_32_characters_long"
JWT_CUSTOMER_SECRET="dev_customer_secret_at_least_32_characters_long"

# MercadoPago (Test)
MP_ACCESS_TOKEN="TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
MP_WEBHOOK_SECRET="whsec_test_secret"
MP_MODE="test"

# Server
PORT=4000
NODE_ENV=development
FRONTEND_URL="http://localhost:3000"

# Logs
LOG_LEVEL="debug"

# Cache
STOCK_TTL_SECONDS=300
```

### Production (.env)

```env
# Database
DATABASE_URL="postgresql://prod_user:secure_password@prod-db.example.com:5432/mydb?schema=public"

# Redis
REDIS_URL="redis://prod-redis.example.com:6379"

# JWT Secrets (use strong, unique values)
JWT_ADMIN_SECRET="prod_admin_secret_must_be_at_least_32_characters_LONG"
JWT_CUSTOMER_SECRET="prod_customer_secret_must_be_at_least_32_characters_LONG"

# MercadoPago (Production)
MP_ACCESS_TOKEN="APP_USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
MP_WEBHOOK_SECRET="whsec_production_secret"
MP_MODE="production"

# Server
PORT=4000
NODE_ENV=production
FRONTEND_URL="https://tinkuy-saludable.com"
TRUST_PROXY=1

# Logs
LOG_LEVEL="info"

# Cache
STOCK_TTL_SECONDS=300

# Rate Limiting (tuned for production)
RATE_LIMIT_GENERAL_MAX_REQUESTS=100
RATE_LIMIT_AUTH_MAX_REQUESTS=10

# Database Pool
DB_CONNECTION_LIMIT=20
DB_POOL_TIMEOUT=30
```
