import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@lib/prisma", () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
    },
    productVariant: {
      findMany: vi.fn(),
    },
    webhookEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    order: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@lib/mercadopago", () => ({
  createPreference: vi.fn(),
  mpCircuitBreaker: {
    execute: vi.fn((fn) => fn()),
  },
}));

vi.mock("@modules/cart/service", () => ({
  getGuestCart: vi.fn(),
  getUserCart: vi.fn(),
  validateCartStock: vi.fn(),
  storeValidatedCartSnapshot: vi.fn(),
}));

vi.mock("@lib/cache", () => ({
  getStockCached: vi.fn(),
}));

import { prisma } from "@lib/prisma";
import { createPreference } from "@lib/mercadopago";
import { getGuestCart, getUserCart, validateCartStock, storeValidatedCartSnapshot } from "@modules/cart/service";
import { createCheckout } from "@modules/checkout/service";

const mockedPrisma = vi.mocked(prisma);
const mockedCreatePreference = vi.mocked(createPreference);
const mockedGetGuestCart = vi.mocked(getGuestCart);
const mockedGetUserCart = vi.mocked(getUserCart);
const mockedValidateCartStock = vi.mocked(validateCartStock);
const mockedStoreValidatedCartSnapshot = vi.mocked(storeValidatedCartSnapshot);

describe("checkout.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCheckout", () => {
    it("throws ValidationError when cart is empty", async () => {
      mockedGetGuestCart.mockResolvedValue({
        id: "cart-1",
        items: [],
        totalItems: 0,
        totalAmount: 0,
      });

      await expect(
        createCheckout({
          cartId: "cart-1",
          tenantId: "tenant-1",
          branchId: "branch-1",
          frontendUrl: "https://example.com",
          webhookUrl: "https://example.com/webhook",
        })
      ).rejects.toThrow("Cart is empty");
    });

    it("throws ValidationError when cart is empty for user cart", async () => {
      mockedGetUserCart.mockResolvedValue({
        id: "user-1",
        items: [],
        totalItems: 0,
        totalAmount: 0,
      });

      await expect(
        createCheckout({
          cartId: "user-1",
          tenantId: "tenant-1",
          branchId: "branch-1",
          frontendUrl: "https://example.com",
          webhookUrl: "https://example.com/webhook",
          isUserCart: true,
        })
      ).rejects.toThrow("Cart is empty");
    });

    it("throws ValidationError when price in cart does not match database", async () => {
      mockedGetGuestCart.mockResolvedValue({
        id: "cart-1",
        items: [
          {
            productId: "prod-1",
            variantId: null,
            name: "Product 1",
            price: 150,
            quantity: 1,
          },
        ],
        totalItems: 1,
        totalAmount: 150,
      });

      mockedPrisma.product.findMany.mockResolvedValue([
        { id: "prod-1", basePrice: 100 },
      ] as any);
      mockedPrisma.productVariant.findMany.mockResolvedValue([]);

      await expect(
        createCheckout({
          cartId: "cart-1",
          tenantId: "tenant-1",
          branchId: "branch-1",
          frontendUrl: "https://example.com",
          webhookUrl: "https://example.com/webhook",
        })
      ).rejects.toThrow("Price mismatch for Product 1: cart has 150, expected 100");
    });

    it("throws ValidationError when price in cart is less than database", async () => {
      mockedGetGuestCart.mockResolvedValue({
        id: "cart-1",
        items: [
          {
            productId: "prod-1",
            variantId: null,
            name: "Product 1",
            price: 80,
            quantity: 1,
          },
        ],
        totalItems: 1,
        totalAmount: 80,
      });

      mockedPrisma.product.findMany.mockResolvedValue([
        { id: "prod-1", basePrice: 100 },
      ] as any);
      mockedPrisma.productVariant.findMany.mockResolvedValue([]);

      await expect(
        createCheckout({
          cartId: "cart-1",
          tenantId: "tenant-1",
          branchId: "branch-1",
          frontendUrl: "https://example.com",
          webhookUrl: "https://example.com/webhook",
        })
      ).rejects.toThrow("Price mismatch for Product 1: cart has 80, expected 100");
    });

    it("throws ValidationError when variant price does not match cart", async () => {
      mockedGetGuestCart.mockResolvedValue({
        id: "cart-1",
        items: [
          {
            productId: "prod-1",
            variantId: "var-1",
            name: "Product 1 Variant",
            price: 80,
            quantity: 1,
          },
        ],
        totalItems: 1,
        totalAmount: 80,
      });

      mockedPrisma.product.findMany.mockResolvedValue([
        { id: "prod-1", basePrice: 100 },
      ] as any);
      mockedPrisma.productVariant.findMany.mockResolvedValue([
        { id: "var-1", price: 120 },
      ] as any);

      await expect(
        createCheckout({
          cartId: "cart-1",
          tenantId: "tenant-1",
          branchId: "branch-1",
          frontendUrl: "https://example.com",
          webhookUrl: "https://example.com/webhook",
        })
      ).rejects.toThrow("Price mismatch for Product 1 Variant: cart has 80, expected 120");
    });

    it("throws ValidationError when stock is insufficient", async () => {
      mockedGetGuestCart.mockResolvedValue({
        id: "cart-1",
        items: [
          {
            productId: "prod-1",
            variantId: null,
            name: "Product 1",
            price: 100,
            quantity: 10,
          },
        ],
        totalItems: 10,
        totalAmount: 1000,
      });

      mockedPrisma.product.findMany.mockResolvedValue([
        { id: "prod-1", basePrice: 100 },
      ] as any);
      mockedPrisma.productVariant.findMany.mockResolvedValue([]);

      mockedValidateCartStock.mockResolvedValue({
        valid: false,
        errors: ["Insufficient stock for Product 1: available 5, requested 10"],
      });

      await expect(
        createCheckout({
          cartId: "cart-1",
          tenantId: "tenant-1",
          branchId: "branch-1",
          frontendUrl: "https://example.com",
          webhookUrl: "https://example.com/webhook",
        })
      ).rejects.toThrow("Insufficient stock for Product 1: available 5, requested 10");
    });

    it("throws ValidationError when multiple stock errors exist", async () => {
      mockedGetGuestCart.mockResolvedValue({
        id: "cart-1",
        items: [
          { productId: "prod-1", variantId: null, name: "Product 1", price: 100, quantity: 10 },
          { productId: "prod-2", variantId: null, name: "Product 2", price: 200, quantity: 5 },
        ],
        totalItems: 15,
        totalAmount: 2000,
      });

      mockedPrisma.product.findMany.mockResolvedValue([
        { id: "prod-1", basePrice: 100 },
        { id: "prod-2", basePrice: 200 },
      ] as any);
      mockedPrisma.productVariant.findMany.mockResolvedValue([]);

      mockedValidateCartStock.mockResolvedValue({
        valid: false,
        errors: [
          "Insufficient stock for Product 1: available 5, requested 10",
          "Insufficient stock for Product 2: available 2, requested 5",
        ],
      });

      await expect(
        createCheckout({
          cartId: "cart-1",
          tenantId: "tenant-1",
          branchId: "branch-1",
          frontendUrl: "https://example.com",
          webhookUrl: "https://example.com/webhook",
        })
      ).rejects.toThrow(/Insufficient stock for Product 1.*Insufficient stock for Product 2/s);
    });

    it("creates checkout successfully with valid cart and prices", async () => {
      mockedGetGuestCart.mockResolvedValue({
        id: "cart-1",
        items: [
          { productId: "prod-1", variantId: null, name: "Product 1", price: 100, quantity: 2 },
        ],
        totalItems: 2,
        totalAmount: 200,
      });

      mockedPrisma.product.findMany.mockResolvedValue([
        { id: "prod-1", basePrice: 100 },
      ] as any);
      mockedPrisma.productVariant.findMany.mockResolvedValue([]);

      mockedValidateCartStock.mockResolvedValue({ valid: true, errors: [] });

      mockedCreatePreference.mockResolvedValue({
        id: "pref-123",
        init_point: "https://mercadopago.com/init",
        sandbox_init_point: "https://sandbox.mercadopago.com/init",
      });

      mockedStoreValidatedCartSnapshot.mockResolvedValue(undefined);

      const result = await createCheckout({
        cartId: "cart-1",
        tenantId: "tenant-1",
        branchId: "branch-1",
        frontendUrl: "https://example.com",
        webhookUrl: "https://example.com/webhook",
      });

      expect(result.preferenceId).toBe("pref-123");
      expect(result.totalAmount).toBe(200);
      expect(mockedStoreValidatedCartSnapshot).toHaveBeenCalled();
    });

    it("throws when product not found in database", async () => {
      mockedGetGuestCart.mockResolvedValue({
        id: "cart-1",
        items: [
          { productId: "prod-1", variantId: null, name: "Product 1", price: 100, quantity: 1 },
        ],
        totalItems: 1,
        totalAmount: 100,
      });

      mockedPrisma.product.findMany.mockResolvedValue([]);

      await expect(
        createCheckout({
          cartId: "cart-1",
          tenantId: "tenant-1",
          branchId: "branch-1",
          frontendUrl: "https://example.com",
          webhookUrl: "https://example.com/webhook",
        })
      ).rejects.toThrow("Product or variant not found: prod-1");
    });
  });
});
