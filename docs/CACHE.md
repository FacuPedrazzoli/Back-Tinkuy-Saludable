# Caching Architecture

## Overview

This backend uses a multi-layer caching strategy with Redis as the primary cache and in-memory fallbacks for resilience.

## Cache Implementation

### Stock Cache (`src/lib/cache.ts`)

The stock cache stores computed inventory quantities to reduce database queries.

```typescript
import { setStockCached, getStockCached, invalidateStockCache } from "@lib/cache";

// Store stock
await setStockCached(productId, branchId, quantity, variantId, tenantId);

// Retrieve stock
const result = await getStockCached(productId, branchId, variantId, tenantId);
if (result.found) {
  console.log(result.value); // number
}

// Invalidate specific stock entry
await invalidateStockCache(productId, branchId, variantId, tenantId);

// Invalidate all stock for a product across branches
await invalidateProductStock(productId, tenantId);
```

### Batch Stock Operations

For efficiency, multiple stock values can be fetched in a single pipeline:

```typescript
const keys: BatchStockKey[] = [
  { productId: "p1", branchId: "b1", tenantId: "t1" },
  { productId: "p2", branchId: "b1", tenantId: "t1" },
];
const results = await getBatchStockCached(keys);
// Returns: (number | null)[]
```

## Cache Key Format

All cache keys follow the tenant-aware pattern: `type:tenantId:id`

### Stock Keys

```
stock:{tenantId}:{branchId}:{productId}:{variantId}
stock:{tenantId}:{branchId}:{productId}:base
stock:global:{branchId}:{productId}:{variantId}  (no tenant)
```

**Examples:**
- `stock:tenant123:branch456:product789:variant101` - specific variant
- `stock:tenant123:branch456:product789:base` - base product stock

### Cart Keys

```
cart:{tenantId}:{cartId}
cart:{tenantId}:user:{userId}
lock:cart:{tenantId}:{cartId}
checkout:{tenantId}:snapshot:{preferenceId}
```

**Examples:**
- `cart:tenant123:cart-uuid-456` - guest cart
- `cart:tenant123:user:user-789` - authenticated user cart
- `lock:cart:tenant123:cart-uuid-456` - cart modification lock

### Rate Limit Keys

```
rl:auth:{identifier}
rl:checkout:{identifier}
rl:general:{identifier}
```

### Query Cache Keys

```
qc:{key}
```

## Data Cached

### Stock/Inventory
- **What:** Computed stock quantities per branch/product/variant
- **TTL:** 300 seconds (configurable via `STOCK_TTL_SECONDS`)
- **Invalidation:** On stock movement creation (OUTBOUND, INBOUND, ADJUSTMENT, TRANSFER)

### Cart
- **What:** Shopping cart contents and totals
- **TTL:** 24 hours (configurable via `CART_TTL_SECONDS`)
- **Invalidation:** On cart modification, explicit clear, or merge

### Cart Snapshots
- **What:** Validated cart state at checkout start
- **TTL:** 24 hours
- **Purpose:** Preserves cart state for payment confirmation

### Query Cache
- **What:** Generic query results (products, orders, customers, tenants)
- **TTL:** 60-300 seconds depending on data type
- **Purpose:** Reduce database load for frequently accessed data

## Fallback Mechanism

When Redis is unavailable, the system gracefully degrades:

### Stock Cache Fallback
```typescript
// getStockCached returns { found: false, value: null } when Redis is down
// Caller falls back to database query
const result = await getStockCached(productId, branchId);
if (!result.found) {
  // Query database directly
  stock = await getStockFromDB(productId, branchId);
}
```

### Cart Fallback
```typescript
// Uses LRU in-memory cache when Redis unavailable
const memoryCarts = new LRUCache<string, Cart>({
  max: 1000,
  ttl: CART_TTL_SECONDS * 1000,
});
```

### Rate Limit Fallback
```typescript
// In production: throws RateLimitError when Redis unavailable
// In development: uses in-memory Map with limit
const memoryFallback = new Map<string, { count: number; resetAt: number }>();
```

## Cache Invalidation Strategies

### 1. Direct Invalidation
Single key deletion for immediate removal:
```typescript
await invalidateStockCache(productId, branchId, variantId, tenantId);
await redis.del(`cart:${tenantId}:${cartId}`);
```

### 2. Pattern-Based Invalidation
Using SCAN to find and delete matching keys:
```typescript
// Invalidate all stock for a product across all branches
const pattern = `stock:${tenantId}:*:${productId}:*`;
let cursor = "0";
do {
  const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
  cursor = nextCursor;
  if (keys.length > 0) {
    await redis.del(...keys);
  }
} while (cursor !== "0");
```

### 3. Automatic Expiration
All cache entries have TTLs ensuring eventual cleanup:
```typescript
await redis.setex(key, ttlSeconds, value);
```

## Rate Limiting Cache

Rate limiting uses Redis sorted sets for sliding window counters:

```typescript
import { rateLimit, rateLimitAuth, rateLimitCheckout } from "@lib/rate-limit";

// Auth rate limit: 10 requests per 15 minutes
await rateLimitAuth("user-123");

// Checkout rate limit: 10 requests per minute
await rateLimitCheckout("user-123");

// General rate limit: 100 requests per minute
await rateLimitGeneral("api-key-or-ip");
```

### How It Works

1. **Sliding Window:** Uses sorted sets with timestamps as scores
2. **Cleanup:** Removes entries outside the window automatically
3. **Pipeline:** Uses Redis pipeline for atomic operations

```typescript
const pipeline = redis.pipeline();
pipeline.zremrangebyscore(windowKey, 0, windowStart);  // Remove old entries
pipeline.zcard(windowKey);                             // Count remaining
pipeline.zadd(windowKey, now, `${now}-${random}`);     // Add new request
pipeline.pexpire(windowKey, config.windowMs);          // Set expiry
```

## Configuration

Environment variables control cache behavior:

| Variable | Default | Description |
|----------|---------|-------------|
| `STOCK_TTL_SECONDS` | 300 | Stock cache TTL |
| `CART_TTL_SECONDS` | 86400 | Cart cache TTL (24h) |
| `CART_LOCK_TTL_SECONDS` | 5 | Cart lock duration |
| `CART_LOCK_RETRY_COUNT` | 3 | Lock acquisition retries |
| `RATE_LIMIT_GENERAL_WINDOW_MS` | 60000 | General rate limit window |
| `RATE_LIMIT_GENERAL_MAX_REQUESTS` | 100 | Max requests per window |
| `RATE_LIMIT_AUTH_WINDOW_MS` | 900000 | Auth rate limit window (15m) |
| `RATE_LIMIT_AUTH_MAX_REQUESTS` | 10 | Auth max requests |
| `RATE_LIMIT_CHECKOUT_WINDOW_MS` | 60000 | Checkout rate limit window |
| `RATE_LIMIT_CHECKOUT_MAX_REQUESTS` | 10 | Checkout max requests |
| `REDIS_URL` | (required) | Redis connection URL |

## Redis Connection

The Redis client is configured with resilience features:

```typescript
export const redis = new Redis(redisUrl, {
  retryStrategy(times) {
    const baseDelay = Math.min(100 * Math.pow(2, times), 30000);
    const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
    return Math.floor(baseDelay + jitter);
  },
  maxRetriesPerRequest: 3,
  connectTimeout: 5000,
  commandTimeout: 3000,
});
```

### Availability Check

Redis availability is cached for 5 seconds to avoid excessive pings:

```typescript
export async function isRedisAvailable(): Promise<boolean> {
  const now = Date.now();
  if (redisAvailableCache !== null && now - redisCacheTime < 5000) {
    return redisAvailableCache;
  }
  // ... check and cache result
}
```

## Best Practices

1. **Always handle cache misses** - Fall back to database queries
2. **Use batch operations** - `getBatchStockCached` for multiple stocks
3. **Invalidate on writes** - Stock cache is invalidated when inventory changes
4. **Use appropriate TTLs** - Short for frequently changing data, longer for static data
5. **Lock carts during modification** - Prevents race conditions
6. **Monitor Redis availability** - System degrades gracefully but performance suffers
