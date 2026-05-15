import { redis, isRedisAvailable } from "./redis";

const STOCK_TTL_SECONDS = 300; // 5 minutes

function stockCacheKey(productId: string, branchId: string, variantId?: string | null): string {
  return variantId
    ? `stock:${branchId}:${productId}:${variantId}`
    : `stock:${branchId}:${productId}:base`;
}

/**
 * Cache computed stock in Redis.
 */
export async function setStockCached(
  productId: string,
  branchId: string,
  quantity: number,
  variantId?: string | null
): Promise<void> {
  if (!(await isRedisAvailable())) return;
  const key = stockCacheKey(productId, branchId, variantId);
  await redis.setex(key, STOCK_TTL_SECONDS, String(quantity));
}

export type StockCacheResult = { found: true; value: number } | { found: false; value: null };

/**
 * Get cached stock. Returns metadata to distinguish cache miss from error.
 */
export async function getStockCached(
  productId: string,
  branchId: string,
  variantId?: string | null
): Promise<StockCacheResult> {
  if (!(await isRedisAvailable())) return { found: false, value: null };
  const key = stockCacheKey(productId, branchId, variantId);
  try {
    const value = await redis.get(key);
    if (value === null) return { found: false, value: null };
    return { found: true, value: parseInt(value, 10) };
  } catch {
    return { found: false, value: null };
  }
}

/**
 * Invalidate stock cache for a product/branch/variant.
 */
export async function invalidateStockCache(
  productId: string,
  branchId: string,
  variantId?: string | null
): Promise<void> {
  if (!(await isRedisAvailable())) return;
  const key = stockCacheKey(productId, branchId, variantId);
  await redis.del(key);
}

/**
 * Invalidate all stock cache keys for a product (all branches and variants).
 */
export async function invalidateProductStock(productId: string): Promise<void> {
  if (!(await isRedisAvailable())) return;
  const pattern = `stock:*:${productId}:*`;
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== "0");
}
