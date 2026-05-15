import { redis, isRedisAvailable } from "@lib/redis";
import { ValidationError } from "@lib/errors";
import { getStockCached } from "@lib/cache";
import { prisma } from "@lib/prisma";
import { sanitizeString } from "@lib/validation";
import { config } from "@lib/config";
import { randomUUID } from "crypto";
import { LRUCache } from "lru-cache";

const CART_TTL_SECONDS = config.cart.ttlSeconds;

const CART_LOCK_TTL_SECONDS = config.cart.lockTtlSeconds;
const CART_LOCK_RETRY_COUNT = config.cart.lockRetryCount;
const CART_LOCK_RETRY_DELAY_MS = config.cart.lockRetryDelayMs;

const memoryCarts = new LRUCache<string, Cart>({
  max: 1000,
  ttl: CART_TTL_SECONDS * 1000,
});

interface CartSnapshot {
  cart: Cart;
  tenantId: string;
  branchId: string;
  validatedAt: number;
}

const memorySnapshots = new LRUCache<string, CartSnapshot>({
  max: 1000,
  ttl: 15 * 60 * 1000,
});

export interface CartItem {
  productId: string;
  variantId: string | null;
  name: string;
  sku?: string | null;
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

export interface Cart {
  id: string;
  items: CartItem[];
  totalItems: number;
  totalAmount: number;
}

function cartKey(cartId: string, tenantId: string): string {
  return `cart:${tenantId}:${cartId}`;
}

function userCartKey(userId: string, tenantId: string): string {
  return `cart:${tenantId}:user:${userId}`;
}

function lockKey(key: string): string {
  return `lock:${key}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(key: string): Promise<boolean> {
  if (!(await isRedisAvailable())) {
    return true;
  }

  const fullLockKey = lockKey(key);
  for (let i = 0; i < CART_LOCK_RETRY_COUNT; i++) {
    const result = await redis.set(fullLockKey, "1", "EX", CART_LOCK_TTL_SECONDS, "NX");
    if (result === "OK") {
      return true;
    }
    await sleep(CART_LOCK_RETRY_DELAY_MS);
  }
  return false;
}

async function releaseLock(key: string): Promise<void> {
  if (!(await isRedisAvailable())) {
    return;
  }
  await redis.del(lockKey(key));
}

function isValidCart(obj: unknown): obj is Cart {
  if (!obj || typeof obj !== "object") return false;
  const cart = obj as Record<string, unknown>;
  return (
    typeof cart.id === "string" &&
    Array.isArray(cart.items) &&
    typeof cart.totalItems === "number" &&
    typeof cart.totalAmount === "number"
  );
}

async function getCartRaw(key: string): Promise<Cart | null> {
  if (await isRedisAvailable()) {
    const data = await redis.get(key);
    if (!data) return null;
    try {
      const parsed = JSON.parse(data);
      if (!isValidCart(parsed)) return null;
      await redis.expire(key, CART_TTL_SECONDS);
      return parsed;
    } catch {
      return null;
    }
  }
  return memoryCarts.get(key) ?? null;
}

async function saveCart(key: string, cart: Cart): Promise<void> {
  if (await isRedisAvailable()) {
    await redis.setex(key, CART_TTL_SECONDS, JSON.stringify(cart));
    await redis.expire(key, CART_TTL_SECONDS);
  } else {
    memoryCarts.set(key, cart);
  }
}

export async function getGuestCart(cartId: string, tenantId: string, isUserCart = false): Promise<Cart> {
  const key = isUserCart ? userCartKey(cartId, tenantId) : cartKey(cartId, tenantId);
  const cart = await getCartRaw(key);
  return cart ?? { id: cartId, items: [], totalItems: 0, totalAmount: 0 };
}

export async function createGuestCart(tenantId: string): Promise<string> {
  const cartId = randomUUID();
  const cart: Cart = {
    id: cartId,
    items: [],
    totalItems: 0,
    totalAmount: 0,
  };
  await saveCart(cartKey(cartId, tenantId), cart);
  return cartId;
}

export async function getUserCart(userId: string, tenantId: string): Promise<Cart> {
  const cart = await getCartRaw(userCartKey(userId, tenantId));
  return cart ?? { id: userId, items: [], totalItems: 0, totalAmount: 0 };
}

function computeTotals(items: CartItem[]): Pick<Cart, "totalItems" | "totalAmount"> {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return { totalItems, totalAmount };
}

export async function addToCart(
  cartId: string,
  item: CartItem,
  isUserCart = false,
  tenantId?: string,
  branchId?: string
): Promise<Cart> {
  const key = isUserCart ? userCartKey(cartId, tenantId ?? "") : cartKey(cartId, tenantId ?? "");

  if (!await acquireLock(key)) {
    throw new ValidationError("Cart is being modified, please retry");
  }

  try {
    const cart = (await getCartRaw(key)) ?? {
      id: cartId,
      items: [],
      totalItems: 0,
      totalAmount: 0,
    };

    const normalizedVariantId = item.variantId ?? null;
    const existingIndex = cart.items.findIndex(
      (i) =>
        i.productId === item.productId && i.variantId === normalizedVariantId
    );

    if (existingIndex >= 0) {
      const newQuantity = cart.items[existingIndex].quantity + item.quantity;
      if (tenantId && branchId) {
        const stockResult = await getStockCached(item.productId, branchId, item.variantId, tenantId);
        if (stockResult.found && stockResult.value < newQuantity) {
          throw new ValidationError(
            `Insufficient stock for ${sanitizeString(item.name)}: available ${stockResult.value}, requested ${newQuantity}`
          );
        }
      }
      cart.items[existingIndex].quantity = newQuantity;
    } else {
      if (tenantId && branchId) {
        const stockResult = await getStockCached(item.productId, branchId, normalizedVariantId, tenantId);
        if (stockResult.found && stockResult.value < item.quantity) {
          throw new ValidationError(
            `Insufficient stock for ${sanitizeString(item.name)}: available ${stockResult.value}, requested ${item.quantity}`
          );
        }
      }
      cart.items.push({ ...item, variantId: normalizedVariantId });
    }

    const totals = computeTotals(cart.items);
    cart.totalItems = totals.totalItems;
    cart.totalAmount = totals.totalAmount;

    await saveCart(key, cart);
    return cart;
  } finally {
    await releaseLock(key);
  }
}

export async function updateCartItem(
  cartId: string,
  productId: string,
  quantity: number,
  variantId?: string | null,
  isUserCart = false,
  tenantId?: string
): Promise<Cart> {
  if (quantity < 0) {
    throw new ValidationError("Quantity cannot be negative");
  }

  const key = isUserCart ? userCartKey(cartId, tenantId ?? "") : cartKey(cartId, tenantId ?? "");

  if (!await acquireLock(key)) {
    throw new ValidationError("Cart is being modified, please retry");
  }

  try {
    const cart = await getCartRaw(key);
    if (!cart) {
      throw new ValidationError("Cart not found");
    }

    const normalizedVariantId = variantId ?? null;
    const itemIndex = cart.items.findIndex(
      (i) => i.productId === productId && i.variantId === normalizedVariantId
    );

    if (itemIndex < 0) {
      throw new ValidationError("Item not found in cart");
    }

    if (quantity === 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      cart.items[itemIndex].quantity = quantity;
    }

    const totals = computeTotals(cart.items);
    cart.totalItems = totals.totalItems;
    cart.totalAmount = totals.totalAmount;

    await saveCart(key, cart);
    return cart;
  } finally {
    await releaseLock(key);
  }
}

export async function removeFromCart(
  cartId: string,
  productId: string,
  variantId?: string | null,
  isUserCart = false,
  tenantId?: string
): Promise<Cart> {
  return updateCartItem(cartId, productId, 0, variantId, isUserCart, tenantId);
}

export async function clearCart(cartId: string, tenantId: string, isUserCart = false): Promise<void> {
  const key = isUserCart ? userCartKey(cartId, tenantId) : cartKey(cartId, tenantId);
  if (await isRedisAvailable()) {
    await redis.del(key);
  } else {
    memoryCarts.delete(key);
  }
}

export async function mergeGuestCartIntoUserCart(
  guestCartId: string,
  userId: string,
  tenantId: string
): Promise<Cart> {
  const guestKey = cartKey(guestCartId, tenantId);
  const userKey = userCartKey(userId, tenantId);

  if (!(await isRedisAvailable())) {
    throw new ValidationError("Cart merge requires Redis for atomicity");
  }

  const guestLock = await acquireLock(guestKey);
  const userLock = await acquireLock(userKey);

  if (!guestLock || !userLock) {
    if (guestLock) await releaseLock(guestKey);
    if (userLock) await releaseLock(userKey);
    throw new ValidationError("Cart is being modified, please retry");
  }

  try {
    const guestCart = await getGuestCart(guestCartId, tenantId);
    const userCart = await getUserCart(userId, tenantId);

    for (const item of guestCart.items) {
      const existing = userCart.items.find(
        (i) => i.productId === item.productId && i.variantId === (item.variantId ?? null)
      );
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        userCart.items.push({ ...item, variantId: item.variantId ?? null });
      }
    }

    const totals = computeTotals(userCart.items);
    userCart.totalItems = totals.totalItems;
    userCart.totalAmount = totals.totalAmount;

    await saveCart(userKey, userCart);
    await redis.del(guestKey);

    return userCart;
  } finally {
    await releaseLock(guestKey);
    await releaseLock(userKey);
  }
}

export async function validateCartStock(
  cart: Cart,
  branchId: string,
  tenantId?: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  const uncachedItems: { productId: string; variantId: string | null; name: string; quantity: number }[] = [];

  const stockResults = await Promise.all(
    cart.items.map((item) => getStockCached(item.productId, branchId, item.variantId, tenantId))
  );

  for (let i = 0; i < cart.items.length; i++) {
    const item = cart.items[i];
    const stockResult = stockResults[i];
    if (stockResult.found) {
      if (stockResult.value < item.quantity) {
        errors.push(
          `Insufficient stock for ${sanitizeString(item.name)}: available ${stockResult.value}, requested ${item.quantity}`
        );
      }
    } else {
      uncachedItems.push(item);
    }
  }

  if (uncachedItems.length > 0) {
    const productIds = [...new Set(uncachedItems.map((i) => i.productId))];
    const movements = await prisma.stockMovement.groupBy({
      by: ["productId", "variantId"],
      where: {
        branchId,
        productId: { in: productIds },
        OR: uncachedItems.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
        })),
      },
      _sum: { quantity: true },
    });

    const stockMap = new Map<string, number>();
    for (const m of movements) {
      stockMap.set(`${m.productId}:${m.variantId ?? "null"}`, Number(m._sum.quantity ?? 0));
    }

    for (const item of uncachedItems) {
      const stock = stockMap.get(`${item.productId}:${item.variantId ?? "null"}`) ?? 0;
      if (stock < item.quantity) {
        errors.push(
          `Insufficient stock for ${sanitizeString(item.name)}: available ${stock}, requested ${item.quantity}`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export async function storeValidatedCartSnapshot(
  cart: Cart,
  tenantId: string,
  branchId: string,
  preferenceId: string
): Promise<void> {
  const snapshotKey = `checkout:${tenantId}:snapshot:${preferenceId}`;
  const snapshot: CartSnapshot = {
    cart,
    tenantId,
    branchId,
    validatedAt: Date.now(),
  };
  const SNAPSHOT_TTL_SECONDS = 24 * 60 * 60;
  if (await isRedisAvailable()) {
    await redis.setex(snapshotKey, SNAPSHOT_TTL_SECONDS, JSON.stringify(snapshot));
  } else {
    memorySnapshots.set(snapshotKey, snapshot);
  }
}

export async function getValidatedCartSnapshot(
  preferenceId: string,
  tenantId: string
): Promise<{ cart: Cart; tenantId: string; branchId: string } | null> {
  const snapshotKey = `checkout:${tenantId}:snapshot:${preferenceId}`;
  if (await isRedisAvailable()) {
    const data = await redis.get(snapshotKey);
    if (!data) return null;
    try {
      const parsed = JSON.parse(data) as CartSnapshot;
      if (!parsed.cart || !parsed.tenantId || !parsed.branchId) {
        return null;
      }
      return { cart: parsed.cart, tenantId: parsed.tenantId, branchId: parsed.branchId };
    } catch {
      return null;
    }
  }
  const snapshot = memorySnapshots.get(snapshotKey);
  if (!snapshot) return null;
  return { cart: snapshot.cart, tenantId: snapshot.tenantId, branchId: snapshot.branchId };
}

export async function clearValidatedCartSnapshot(preferenceId: string, tenantId: string): Promise<void> {
  const snapshotKey = `checkout:${tenantId}:snapshot:${preferenceId}`;
  if (await isRedisAvailable()) {
    await redis.del(snapshotKey);
  } else {
    memorySnapshots.delete(snapshotKey);
  }
}
