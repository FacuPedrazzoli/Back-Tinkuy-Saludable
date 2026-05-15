import { redis, isRedisAvailable } from "./redis";
import { config } from "./config";

function stockCacheKey(productId: string, branchId: string, variantId?: string | null, tenantId?: string): string {
  const base = tenantId ? `stock:${tenantId}` : 'stock';
  return variantId
    ? `${base}:${branchId}:${productId}:${variantId}`
    : `${base}:${branchId}:${productId}:base`;
}

/**
 * Cache computed stock in Redis.
 */
export async function setStockCached(
  productId: string,
  branchId: string,
  quantity: number,
  variantId?: string | null,
  tenantId?: string
): Promise<void> {
  if (!(await isRedisAvailable())) return;
  const key = stockCacheKey(productId, branchId, variantId, tenantId);
  await redis.setex(key, config.cache.stockTtlSeconds, String(quantity));
}

export type StockCacheResult = { found: true; value: number } | { found: false; value: null };

/**
 * Get cached stock. Returns metadata to distinguish cache miss from error.
 */
export async function getStockCached(
  productId: string,
  branchId: string,
  variantId?: string | null,
  tenantId?: string
): Promise<StockCacheResult> {
  if (!(await isRedisAvailable())) return { found: false, value: null };
  const key = stockCacheKey(productId, branchId, variantId, tenantId);
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
  variantId?: string | null,
  tenantId?: string
): Promise<void> {
  if (!(await isRedisAvailable())) return;
  const key = stockCacheKey(productId, branchId, variantId, tenantId);
  await redis.del(key);
}

/**
 * Invalidate all stock cache keys for a product (all branches and variants).
 */
export async function invalidateProductStock(productId: string, tenantId?: string): Promise<void> {
  if (!(await isRedisAvailable())) return;
  const base = tenantId ? `stock:${tenantId}` : 'stock';
  const pattern = `${base}:*:${productId}:*`;
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== "0");
}

export type BatchStockKey = { productId: string; branchId: string; variantId?: string | null; tenantId?: string };

export async function getBatchStockCached(keys: BatchStockKey[]): Promise<(number | null)[]> {
  if (!(await isRedisAvailable())) {
    return keys.map(() => null);
  }
  if (keys.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.get(stockCacheKey(key.productId, key.branchId, key.variantId, key.tenantId));
  }

  const results = await pipeline.exec();
  if (!results) return keys.map(() => null);

  return results.map(([err, value]) => {
    if (err || value === null) return null;
    return parseInt(value as string, 10);
  });
}
