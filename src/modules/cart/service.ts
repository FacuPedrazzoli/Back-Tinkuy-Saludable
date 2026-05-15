import { redis, isRedisAvailable } from "@lib/redis";
import { ValidationError } from "@lib/errors";
import { getStockCached } from "@lib/cache";
import { prisma } from "@lib/prisma";
import { randomUUID } from "crypto";
import { LRUCache } from "lru-cache";

const CART_TTL_SECONDS = 24 * 60 * 60;

const CART_LOCK_TTL_SECONDS = 5;
const CART_LOCK_RETRY_COUNT = 3;
const CART_LOCK_RETRY_DELAY_MS = 100;

const memoryCarts = new LRUCache<string, Cart>({
  max: 1000,
  ttl: CART_TTL_SECONDS * 1000,
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

function cartKey(cartId: string): string {
  return `cart:${cartId}`;
}

function userCartKey(userId: string): string {
  return `cart:user:${userId}`;
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

async function getCartRaw(key: string): Promise<Cart | null> {
  if (await isRedisAvailable()) {
    const data = await redis.get(key);
    if (!data) return null;
    try {
      const parsed = JSON.parse(data) as Cart;
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

export async function getGuestCart(cartId: string): Promise<Cart> {
  const cart = await getCartRaw(cartKey(cartId));
  return cart ?? { id: cartId, items: [], totalItems: 0, totalAmount: 0 };
}

export async function createGuestCart(): Promise<string> {
  const cartId = randomUUID();
  const cart: Cart = {
    id: cartId,
    items: [],
    totalItems: 0,
    totalAmount: 0,
  };
  await saveCart(cartKey(cartId), cart);
  return cartId;
}

export async function getUserCart(userId: string): Promise<Cart> {
  const cart = await getCartRaw(userCartKey(userId));
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
  const key = isUserCart ? userCartKey(cartId) : cartKey(cartId);

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
        const stockResult = await getStockCached(item.productId, branchId, item.variantId);
        if (stockResult.found && stockResult.value < newQuantity) {
          throw new ValidationError(
            `Insufficient stock for ${item.name}: available ${stockResult.value}, requested ${newQuantity}`
          );
        }
      }
      cart.items[existingIndex].quantity = newQuantity;
    } else {
      if (tenantId && branchId) {
        const stockResult = await getStockCached(item.productId, branchId, normalizedVariantId);
        if (stockResult.found && stockResult.value < item.quantity) {
          throw new ValidationError(
            `Insufficient stock for ${item.name}: available ${stockResult.value}, requested ${item.quantity}`
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
  isUserCart = false
): Promise<Cart> {
  if (quantity < 0) {
    throw new ValidationError("Quantity cannot be negative");
  }

  const key = isUserCart ? userCartKey(cartId) : cartKey(cartId);

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
  isUserCart = false
): Promise<Cart> {
  return updateCartItem(cartId, productId, 0, variantId, isUserCart);
}

export async function clearCart(cartId: string, isUserCart = false): Promise<void> {
  const key = isUserCart ? userCartKey(cartId) : cartKey(cartId);
  if (await isRedisAvailable()) {
    await redis.del(key);
  } else {
    memoryCarts.delete(key);
  }
}

export async function mergeGuestCartIntoUserCart(
  guestCartId: string,
  userId: string
): Promise<Cart> {
  const guestKey = cartKey(guestCartId);
  const userKey = userCartKey(userId);

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
    const guestCart = await getGuestCart(guestCartId);
    const userCart = await getUserCart(userId);

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
  branchId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (const item of cart.items) {
    let stock: number | null = null;
    const stockResult = await getStockCached(item.productId, branchId, item.variantId);
    if (stockResult.found) {
      stock = stockResult.value;
    } else {
      const result = await prisma.stockMovement.aggregate({
        where: {
          branchId,
          productId: item.productId,
          variantId: item.variantId ?? null,
        },
        _sum: { quantity: true },
      });
      stock = result._sum.quantity ?? 0;
    }
    if (stock < item.quantity) {
      errors.push(
        `Insufficient stock for ${item.name}: available ${stock}, requested ${item.quantity}`
      );
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
  const snapshotKey = `checkout:snapshot:${preferenceId}`;
  const snapshot = {
    cart,
    tenantId,
    branchId,
    validatedAt: Date.now(),
  };
  if (await isRedisAvailable()) {
    await redis.setex(snapshotKey, 15 * 60, JSON.stringify(snapshot));
  } else {
    memoryCarts.set(snapshotKey, snapshot as unknown as Cart);
  }
}

export async function getValidatedCartSnapshot(
  preferenceId: string
): Promise<{ cart: Cart; tenantId: string; branchId: string } | null> {
  const snapshotKey = `checkout:snapshot:${preferenceId}`;
  if (await isRedisAvailable()) {
    const data = await redis.get(snapshotKey);
    if (!data) return null;
    return JSON.parse(data);
  }
  const snapshot = memoryCarts.get(snapshotKey);
  if (!snapshot) return null;
  return snapshot as unknown as { cart: Cart; tenantId: string; branchId: string };
}

export async function clearValidatedCartSnapshot(preferenceId: string): Promise<void> {
  const snapshotKey = `checkout:snapshot:${preferenceId}`;
  if (await isRedisAvailable()) {
    await redis.del(snapshotKey);
  } else {
    memoryCarts.delete(snapshotKey);
  }
}
