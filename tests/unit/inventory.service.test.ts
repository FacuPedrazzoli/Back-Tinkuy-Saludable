import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@lib/prisma", () => ({
  prisma: {
    branch: {
      findUnique: vi.fn(),
    },
    stockMovement: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("@lib/cache", () => ({
  invalidateStockCache: vi.fn(),
}));

import { prisma } from "@lib/prisma";
import { invalidateStockCache } from "@lib/cache";
import {
  createStockMovement,
  listStockMovements,
  getStock,
  getProductStockAllBranches,
} from "@modules/inventory/service";

const mockedPrisma = vi.mocked(prisma);
const mockedInvalidateStockCache = vi.mocked(invalidateStockCache);

describe("Inventory Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockedPrisma.$transaction).mockImplementation(async (callback) => {
      return callback(mockedPrisma);
    });
    vi.mocked(mockedPrisma.branch.findUnique).mockResolvedValue({ id: "branch-1", tenantId: "tenant-1" });
  });

  describe("createStockMovement", () => {
    it("creates INBOUND movement with positive quantity", async () => {
      vi.mocked(mockedPrisma.stockMovement.create).mockResolvedValue({
        id: "mov-1",
        type: "INBOUND",
        quantity: 10,
        tenantId: "tenant-1",
        branchId: "branch-1",
        productId: "prod-1",
        variantId: null,
        reason: null,
        referenceId: null,
        createdAt: new Date(),
      });

      const result = await createStockMovement({
        tenantId: "tenant-1",
        branchId: "branch-1",
        productId: "prod-1",
        type: "INBOUND",
        quantity: 10,
      });

      expect(result.quantity).toBe(10);
      expect(mockedInvalidateStockCache).toHaveBeenCalledWith("prod-1", "branch-1", undefined, "tenant-1");
    });

    it("creates OUTBOUND movement with negative quantity", async () => {
      vi.mocked(mockedPrisma.$queryRaw).mockResolvedValue([{ total: BigInt(100) }]);
      vi.mocked(mockedPrisma.stockMovement.create).mockResolvedValue({
        id: "mov-2",
        type: "OUTBOUND",
        quantity: -5,
        tenantId: "tenant-1",
        branchId: "branch-1",
        productId: "prod-1",
        variantId: null,
        reason: null,
        referenceId: null,
        createdAt: new Date(),
      });

      const result = await createStockMovement({
        tenantId: "tenant-1",
        branchId: "branch-1",
        productId: "prod-1",
        type: "OUTBOUND",
        quantity: 5,
      });

      expect(result.quantity).toBe(-5);
      expect(mockedInvalidateStockCache).toHaveBeenCalledWith("prod-1", "branch-1", undefined, "tenant-1");
    });

    it("throws for zero or negative quantity", async () => {
      await expect(
        createStockMovement({
          tenantId: "tenant-1",
          branchId: "branch-1",
          productId: "prod-1",
          type: "INBOUND",
          quantity: 0,
        })
      ).rejects.toThrow("Quantity must be positive");
    });

    it("throws for OUTBOUND when insufficient stock", async () => {
      vi.mocked(mockedPrisma.$queryRaw).mockResolvedValue([{ total: BigInt(3) }]);

      await expect(
        createStockMovement({
          tenantId: "tenant-1",
          branchId: "branch-1",
          productId: "prod-1",
          type: "OUTBOUND",
          quantity: 5,
        })
      ).rejects.toThrow("Insufficient stock");
    });

    it("allows OUTBOUND when stock is sufficient", async () => {
      vi.mocked(mockedPrisma.$queryRaw).mockResolvedValue([{ total: BigInt(10) }]);
      vi.mocked(mockedPrisma.stockMovement.create).mockResolvedValue({
        id: "mov-3",
        type: "OUTBOUND",
        quantity: -5,
        tenantId: "tenant-1",
        branchId: "branch-1",
        productId: "prod-1",
        variantId: null,
        reason: null,
        referenceId: null,
        createdAt: new Date(),
      });

      const result = await createStockMovement({
        tenantId: "tenant-1",
        branchId: "branch-1",
        productId: "prod-1",
        type: "OUTBOUND",
        quantity: 5,
      });

      expect(result.quantity).toBe(-5);
      expect(mockedInvalidateStockCache).toHaveBeenCalledWith("prod-1", "branch-1", undefined, "tenant-1");
    });

    it("invalidates cache with variantId when provided", async () => {
      vi.mocked(mockedPrisma.stockMovement.create).mockResolvedValue({
        id: "mov-4",
        type: "INBOUND",
        quantity: 10,
        tenantId: "tenant-1",
        branchId: "branch-1",
        productId: "prod-1",
        variantId: "var-1",
        reason: null,
        referenceId: null,
        createdAt: new Date(),
      });

      await createStockMovement({
        tenantId: "tenant-1",
        branchId: "branch-1",
        productId: "prod-1",
        variantId: "var-1",
        type: "INBOUND",
        quantity: 10,
      });

      expect(mockedInvalidateStockCache).toHaveBeenCalledWith("prod-1", "branch-1", "var-1", "tenant-1");
    });
  });

  describe("getStock", () => {
    it("returns aggregated stock quantity", async () => {
      vi.mocked(mockedPrisma.stockMovement.aggregate).mockResolvedValue({ _sum: { quantity: 42 } });

      const result = await getStock({
        tenantId: "tenant-1",
        branchId: "branch-1",
        productId: "prod-1",
      });

      expect(result).toBe(42);
    });

    it("returns aggregated stock for specific variant", async () => {
      vi.mocked(mockedPrisma.stockMovement.aggregate).mockResolvedValue({ _sum: { quantity: 15 } });

      const result = await getStock({
        tenantId: "tenant-1",
        branchId: "branch-1",
        productId: "prod-1",
        variantId: "var-1",
      });

      expect(result).toBe(15);
      expect(mockedPrisma.stockMovement.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ variantId: "var-1" }),
        })
      );
    });

    it("returns 0 when no movements exist", async () => {
      vi.mocked(mockedPrisma.stockMovement.aggregate).mockResolvedValue({ _sum: { quantity: null } });

      const result = await getStock({
        tenantId: "tenant-1",
        branchId: "branch-1",
        productId: "prod-1",
      });

      expect(result).toBe(0);
    });
  });

  describe("listStockMovements", () => {
    it("filters by branch and product", async () => {
      vi.mocked(mockedPrisma.stockMovement.findMany).mockResolvedValue([
        {
          id: "mov-1",
          type: "INBOUND" as const,
          quantity: 10,
          tenantId: "tenant-1",
          branchId: "branch-1",
          productId: "prod-1",
          variantId: null,
          reason: null,
          referenceId: null,
          createdAt: new Date(),
          branch: { id: "branch-1", name: "Branch 1", tenantId: "tenant-1" },
          product: { id: "prod-1", name: "Product 1" },
          variant: null,
        },
      ]);
      vi.mocked(mockedPrisma.stockMovement.count).mockResolvedValue(1);

      await listStockMovements({
        tenantId: "tenant-1",
        branchId: "branch-1",
        productId: "prod-1",
      });

      expect(mockedPrisma.stockMovement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: "tenant-1",
            branchId: "branch-1",
            productId: "prod-1",
          }),
        })
      );
    });
  });

  describe("getProductStockAllBranches", () => {
    it("returns stock grouped by branch", async () => {
      vi.mocked(mockedPrisma.stockMovement.groupBy).mockResolvedValue([
        { branchId: "branch-1", _sum: { quantity: 10 } },
        { branchId: "branch-2", _sum: { quantity: 20 } },
      ]);

      const result = await getProductStockAllBranches("prod-1");

      expect(result).toHaveLength(2);
      expect(result[0].stock).toBe(10);
      expect(result[1].stock).toBe(20);
    });
  });
});
