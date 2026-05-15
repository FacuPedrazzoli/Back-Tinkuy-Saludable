import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@lib/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    expire: vi.fn(),
  },
  isRedisAvailable: vi.fn(),
}));

vi.mock("@lib/prisma", () => ({
  prisma: {
    stockMovement: {
      groupBy: vi.fn(),
    },
  },
}));

vi.mock("@lib/cache", () => ({
  getStockCached: vi.fn(),
  setStockCached: vi.fn(),
  invalidateStockCache: vi.fn(),
}));

vi.mock("@lib/config", () => ({
  config: {
    redis: { url: "redis://localhost:6379" },
    cart: {
      ttlSeconds: 3600,
      lockTtlSeconds: 10,
      lockRetryCount: 3,
      lockRetryDelayMs: 100,
    },
    cache: { stockTtlSeconds: 300 },
  },
}));

import { redis, isRedisAvailable } from "@lib/redis";
import { prisma } from "@lib/prisma";
import { getStockCached } from "@lib/cache";
import {
  addToCart,
  mergeGuestCartIntoUserCart,
  validateCartStock,
  createGuestCart,
} from "@modules/cart/service";

const mockedRedis = vi.mocked(redis);
const mockedIsRedisAvailable = vi.mocked(isRedisAvailable);
const mockedPrisma = vi.mocked(prisma);
const mockedGetStockCached = vi.mocked(getStockCached);

describe("cart.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("addToCart - Lock Acquisition Failure", () => {
    it("throws ValidationError when lock acquisition fails", async () => {
      mockedIsRedisAvailable.mockResolvedValue(true);
      mockedRedis.set.mockResolvedValue(null);

      const cartId = await createGuestCart("tenant-1");

      await expect(
        addToCart(
          cartId,
          {
            productId: "prod-1",
            variantId: null,
            name: "Test Product",
            price: 100,
            quantity: 1,
          },
          false,
          "tenant-1",
          "branch-1"
        )
      ).rejects.toThrow("Cart is being modified, please retry");
    });

    it("throws ValidationError when Redis is unavailable", async () => {
      mockedIsRedisAvailable.mockResolvedValue(false);

      const cartId = await createGuestCart("tenant-1");

      await expect(
        addToCart(
          cartId,
          {
            productId: "prod-1",
            variantId: null,
            name: "Test Product",
            price: 100,
            quantity: 1,
          },
          false,
          "tenant-1",
          "branch-1"
        )
      ).rejects.toThrow("Cart is being modified, please retry");
    });
  });

  describe("mergeGuestCartIntoUserCart", () => {
    it("throws ValidationError when Redis is unavailable", async () => {
      mockedIsRedisAvailable.mockResolvedValue(false);

      await expect(
        mergeGuestCartIntoUserCart("guest-cart-1", "user-1", "tenant-1")
      ).rejects.toThrow("Cart merge requires Redis for atomicity");
    });

    it("throws ValidationError when cannot acquire guest lock", async () => {
      mockedIsRedisAvailable.mockResolvedValue(true);
      mockedRedis.set.mockResolvedValue(null);

      await expect(
        mergeGuestCartIntoUserCart("guest-cart-1", "user-1", "tenant-1")
      ).rejects.toThrow("Cart is being modified, please retry");
    });

    it("throws ValidationError when cannot acquire user lock", async () => {
      mockedIsRedisAvailable.mockResolvedValue(true);
      mockedRedis.set
        .mockResolvedValueOnce("OK")
        .mockResolvedValueOnce(null);

      await expect(
        mergeGuestCartIntoUserCart("guest-cart-1", "user-1", "tenant-1")
      ).rejects.toThrow("Cart is being modified, please retry");
    });

    it("merges guest cart items into user cart", async () => {
      mockedIsRedisAvailable.mockResolvedValue(true);
      mockedRedis.set.mockResolvedValue("OK");
      mockedRedis.get.mockResolvedValueOnce(
        JSON.stringify({ id: "guest-cart", items: [{ productId: "prod-1", variantId: null, name: "P1", price: 100, quantity: 2 }], totalItems: 2, totalAmount: 200 })
      );
      mockedRedis.get.mockResolvedValueOnce(
        JSON.stringify({ id: "user-cart", items: [{ productId: "prod-2", variantId: null, name: "P2", price: 50, quantity: 1 }], totalItems: 1, totalAmount: 50 })
      );
      mockedRedis.del.mockResolvedValue(1);

      const result = await mergeGuestCartIntoUserCart("guest-cart-1", "user-1", "tenant-1");

      expect(result.items).toHaveLength(2);
      const prod1 = result.items.find((i) => i.productId === "prod-1");
      expect(prod1?.quantity).toBe(2);
    });

    it("adds quantities when same product exists in both carts", async () => {
      mockedIsRedisAvailable.mockResolvedValue(true);
      mockedRedis.set.mockResolvedValue("OK");
      mockedRedis.get.mockResolvedValueOnce(
        JSON.stringify({ id: "guest-cart", items: [{ productId: "prod-1", variantId: null, name: "P1", price: 100, quantity: 3 }], totalItems: 3, totalAmount: 300 })
      );
      mockedRedis.get.mockResolvedValueOnce(
        JSON.stringify({ id: "user-cart", items: [{ productId: "prod-1", variantId: null, name: "P1", price: 100, quantity: 2 }], totalItems: 2, totalAmount: 200 })
      );
      mockedRedis.del.mockResolvedValue(1);

      const result = await mergeGuestCartIntoUserCart("guest-cart-1", "user-1", "tenant-1");

      expect(result.items).toHaveLength(1);
      expect(result.items[0].quantity).toBe(5);
      expect(result.totalAmount).toBe(500);
    });

    it("releases locks in finally block even on error", async () => {
      mockedIsRedisAvailable.mockResolvedValue(true);
      mockedRedis.set.mockResolvedValue("OK");
      mockedRedis.get.mockRejectedValue(new Error("Redis error"));

      await expect(
        mergeGuestCartIntoUserCart("guest-cart-1", "user-1", "tenant-1")
      ).rejects.toThrow();

      expect(mockedRedis.del).toHaveBeenCalled();
    });
  });

  describe("validateCartStock", () => {
    it("returns valid=true when stock is sufficient (cache hit)", async () => {
      mockedGetStockCached.mockResolvedValue({ found: true, value: 100 });

      const cart = {
        id: "cart-1",
        items: [{ productId: "prod-1", variantId: null, name: "Product", price: 50, quantity: 5 }],
        totalItems: 5,
        totalAmount: 250,
      };

      const result = await validateCartStock(cart, "branch-1", "tenant-1");

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("returns valid=false with error when stock is insufficient (cache hit)", async () => {
      mockedGetStockCached.mockResolvedValue({ found: true, value: 3 });

      const cart = {
        id: "cart-1",
        items: [{ productId: "prod-1", variantId: null, name: "Product", price: 50, quantity: 5 }],
        totalItems: 5,
        totalAmount: 250,
      };

      const result = await validateCartStock(cart, "branch-1", "tenant-1");

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Insufficient stock for Product");
      expect(result.errors[0]).toContain("available 3");
      expect(result.errors[0]).toContain("requested 5");
    });

    it("queries database on cache miss", async () => {
      mockedGetStockCached.mockResolvedValue({ found: false, value: null });
      mockedPrisma.stockMovement.groupBy.mockResolvedValue([
        { productId: "prod-1", variantId: null, _sum: { quantity: 10 } },
      ]);

      const cart = {
        id: "cart-1",
        items: [{ productId: "prod-1", variantId: null, name: "Product", price: 50, quantity: 5 }],
        totalItems: 5,
        totalAmount: 250,
      };

      const result = await validateCartStock(cart, "branch-1", "tenant-1");

      expect(result.valid).toBe(true);
      expect(mockedPrisma.stockMovement.groupBy).toHaveBeenCalled();
    });

    it("returns valid=false when database query shows insufficient stock", async () => {
      mockedGetStockCached.mockResolvedValue({ found: false, value: null });
      mockedPrisma.stockMovement.groupBy.mockResolvedValue([
        { productId: "prod-1", variantId: null, _sum: { quantity: 2 } },
      ]);

      const cart = {
        id: "cart-1",
        items: [{ productId: "prod-1", variantId: null, name: "Product", price: 50, quantity: 5 }],
        totalItems: 5,
        totalAmount: 250,
      };

      const result = await validateCartStock(cart, "branch-1", "tenant-1");

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("available 2");
      expect(result.errors[0]).toContain("requested 5");
    });

    it("returns valid=true when no stock movements exist (cache miss)", async () => {
      mockedGetStockCached.mockResolvedValue({ found: false, value: null });
      mockedPrisma.stockMovement.groupBy.mockResolvedValue([]);

      const cart = {
        id: "cart-1",
        items: [{ productId: "prod-1", variantId: null, name: "Product", price: 50, quantity: 5 }],
        totalItems: 5,
        totalAmount: 250,
      };

      const result = await validateCartStock(cart, "branch-1", "tenant-1");

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("available 0");
    });

    it("handles multiple items with mixed cache hits and misses", async () => {
      mockedGetStockCached
        .mockResolvedValueOnce({ found: true, value: 100 })
        .mockResolvedValueOnce({ found: false, value: null });

      mockedPrisma.stockMovement.groupBy.mockResolvedValue([
        { productId: "prod-2", variantId: null, _sum: { quantity: 20 } },
      ]);

      const cart = {
        id: "cart-1",
        items: [
          { productId: "prod-1", variantId: null, name: "Product 1", price: 50, quantity: 5 },
          { productId: "prod-2", variantId: null, name: "Product 2", price: 30, quantity: 10 },
        ],
        totalItems: 15,
        totalAmount: 550,
      };

      const result = await validateCartStock(cart, "branch-1", "tenant-1");

      expect(result.valid).toBe(true);
    });

    it("reports errors for both cache hit and cache miss items with insufficient stock", async () => {
      mockedGetStockCached
        .mockResolvedValueOnce({ found: true, value: 2 })
        .mockResolvedValueOnce({ found: false, value: null });

      mockedPrisma.stockMovement.groupBy.mockResolvedValue([
        { productId: "prod-2", variantId: null, _sum: { quantity: 1 } },
      ]);

      const cart = {
        id: "cart-1",
        items: [
          { productId: "prod-1", variantId: null, name: "Product 1", price: 50, quantity: 5 },
          { productId: "prod-2", variantId: null, name: "Product 2", price: 30, quantity: 10 },
        ],
        totalItems: 15,
        totalAmount: 550,
      };

      const result = await validateCartStock(cart, "branch-1", "tenant-1");

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain("Product 1");
      expect(result.errors[1]).toContain("Product 2");
    });

    it("validates variant stock correctly", async () => {
      mockedGetStockCached.mockResolvedValue({ found: true, value: 50 });

      const cart = {
        id: "cart-1",
        items: [{ productId: "prod-1", variantId: "var-1", name: "Variant Product", price: 75, quantity: 10 }],
        totalItems: 10,
        totalAmount: 750,
      };

      const result = await validateCartStock(cart, "branch-1", "tenant-1");

      expect(result.valid).toBe(true);
      expect(mockedGetStockCached).toHaveBeenCalledWith("prod-1", "branch-1", "var-1", "tenant-1");
    });
  });
});
