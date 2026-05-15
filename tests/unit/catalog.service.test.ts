import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@lib/prisma", () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    productVariant: {
      create: vi.fn(),
      update: vi.fn(),
    },
    tag: { create: vi.fn(), findMany: vi.fn() },
    supplier: { create: vi.fn(), findMany: vi.fn() },
    productAttribute: { create: vi.fn() },
  },
}));

vi.mock("@lib/cache", () => ({
  getStockCached: vi.fn().mockResolvedValue({ found: false, value: null }),
  invalidateStockCache: vi.fn(),
}));

import { prisma } from "@lib/prisma";
import {
  createProduct,
  getProduct,
  listProducts,
  updateProduct,
  createVariant,
  updateVariant,
} from "@modules/catalog/service";

const mockedPrisma = vi.mocked(prisma);

describe("Catalog Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createProduct", () => {
    it("creates product with slug from name", async () => {
      vi.mocked(mockedPrisma.product.create).mockResolvedValue({
        id: "prod-1",
        name: "Test Product",
        slug: "test-product",
        basePrice: 100,
        tenantId: "tenant-1",
        description: null,
        sku: null,
        isActive: true,
        isVisible: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await createProduct({
        tenantId: "tenant-1",
        name: "Test Product",
        basePrice: 100,
      });

      expect(result.slug).toBe("test-product");
    });
  });

  describe("getProduct", () => {
    it("returns product for public query with active filter", async () => {
      vi.mocked(mockedPrisma.product.findUnique).mockResolvedValue({
        id: "prod-1",
        name: "Test",
        tenantId: "tenant-1",
        isActive: true,
        isVisible: true,
        basePrice: 100,
        slug: "test",
        description: null,
        sku: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        variants: [],
        attributes: [],
        images: [],
        tags: [],
        suppliers: [],
      });

      const result = await getProduct("prod-1", "tenant-1", true);
      expect(mockedPrisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: "prod-1", tenantId: "tenant-1", isActive: true, isVisible: true },
        include: expect.any(Object),
      });
      expect(result.name).toBe("Test");
    });

    it("returns product for admin without active filter", async () => {
      vi.mocked(mockedPrisma.product.findUnique).mockResolvedValue({
        id: "prod-1",
        name: "Test",
        tenantId: "tenant-1",
        isActive: false,
        isVisible: false,
        basePrice: 100,
        slug: "test",
        description: null,
        sku: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        variants: [],
        attributes: [],
        images: [],
        tags: [],
        suppliers: [],
      });

      const result = await getProduct("prod-1", "tenant-1", false);
      expect(mockedPrisma.product.findUnique).toHaveBeenCalledWith({
        where: { id: "prod-1", tenantId: "tenant-1" },
        include: expect.any(Object),
      });
      expect(result.name).toBe("Test");
    });

    it("throws NotFoundError when product missing", async () => {
      vi.mocked(mockedPrisma.product.findUnique).mockResolvedValue(null);
      await expect(getProduct("missing", "tenant-1")).rejects.toThrow("Product not found");
    });
  });

  describe("listProducts", () => {
    it("filters by visibility", async () => {
      vi.mocked(mockedPrisma.product.findMany).mockResolvedValue([]);
      vi.mocked(mockedPrisma.product.count).mockResolvedValue(0);

      await listProducts({ tenantId: "tenant-1", isVisible: true });

      expect(mockedPrisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isVisible: true }),
        })
      );
    });
  });

  describe("createVariant", () => {
    it("creates variant with correct product relation", async () => {
      vi.mocked(mockedPrisma.productVariant.create).mockResolvedValue({
        id: "var-1",
        productId: "prod-1",
        sku: "SKU-001",
        name: "Variant A",
        price: 50,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await createVariant({
        productId: "prod-1",
        sku: "SKU-001",
        name: "Variant A",
        price: 50,
      });

      expect(result.sku).toBe("SKU-001");
      expect(mockedPrisma.productVariant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ productId: "prod-1" }),
      });
    });
  });

  describe("updateVariant", () => {
    it("updates variant fields", async () => {
      vi.mocked(mockedPrisma.productVariant.update).mockResolvedValue({
        id: "var-1",
        productId: "prod-1",
        name: "Updated",
        price: 75,
        sku: "SKU-001",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await updateVariant("var-1", { name: "Updated", price: 75 });
      expect(result.name).toBe("Updated");
    });
  });
});
