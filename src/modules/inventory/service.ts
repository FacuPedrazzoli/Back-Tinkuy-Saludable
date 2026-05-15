import { prisma } from "@lib/prisma";
import { ValidationError, NotFoundError, ForbiddenError } from "@lib/errors";
import { invalidateStockCache } from "@lib/cache";
import { Prisma } from "@prisma/client";

export async function createStockMovement(input: {
  tenantId: string;
  branchId: string;
  productId: string;
  variantId?: string | null;
  type: "INBOUND" | "OUTBOUND" | "ADJUSTMENT" | "TRANSFER";
  quantity: number;
  reason?: string | null;
  referenceId?: string | null;
  validateBranchOwnership?: boolean;
}) {
  if (input.quantity <= 0) {
    throw new ValidationError("Quantity must be positive");
  }
  if (input.quantity > 1000000) {
    throw new ValidationError("Quantity exceeds maximum allowed (1000000)");
  }

  if (input.validateBranchOwnership !== false) {
    const branch = await prisma.branch.findUnique({
      where: { id: input.branchId },
      select: { tenantId: true },
    });
    if (!branch) throw new NotFoundError("Branch");
    if (branch.tenantId !== input.tenantId) throw new ForbiddenError("Branch does not belong to this tenant");
  }

  const movement = await prisma.$transaction(async (tx) => {
    if (input.type === "OUTBOUND") {
      const currentStock = await tx.$queryRaw<{ total: bigint }[]>`
        SELECT COALESCE(SUM(quantity), 0) as total
        FROM "StockMovement"
        WHERE "tenantId" = ${input.tenantId}
          AND "branchId" = ${input.branchId}
          AND "productId" = ${input.productId}
          AND ("variantId" = ${input.variantId} OR (${input.variantId} IS NULL AND "variantId" IS NULL))
        FOR UPDATE
      `;
      const available = Number(currentStock[0]?.total ?? 0);
      if (available < input.quantity) {
        throw new ValidationError(
          `Insufficient stock. Available: ${available}, requested: ${input.quantity}`
        );
      }
    }

    return tx.stockMovement.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        productId: input.productId,
        variantId: input.variantId,
        type: input.type,
        quantity:
          input.type === "OUTBOUND" ? -input.quantity : input.quantity,
        reason: input.reason,
        referenceId: input.referenceId,
      },
    });
  }, {
    isolationLevel: "Serializable",
  });

  await invalidateStockCache(input.productId, input.branchId, input.variantId, input.tenantId);

  return movement;
}

export async function listStockMovements(args: {
  tenantId: string;
  branchId?: string;
  productId?: string;
  variantId?: string;
  take?: number;
  skip?: number;
}) {
  const where: Prisma.StockMovementWhereInput = { tenantId: args.tenantId };
  if (args.branchId) where.branchId = args.branchId;
  if (args.productId) where.productId = args.productId;
  if (args.variantId) where.variantId = args.variantId;

  const [items, count] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      take: args.take ?? 20,
      skip: args.skip ?? 0,
      orderBy: { createdAt: "desc" },
      include: { branch: true, product: true, variant: true },
    }),
    prisma.stockMovement.count({ where }),
  ]);

  return { items, count };
}

export async function getStock(args: {
  tenantId: string;
  branchId: string;
  productId: string;
  variantId?: string | null;
}) {
  const result = await prisma.stockMovement.aggregate({
    where: {
      tenantId: args.tenantId,
      branchId: args.branchId,
      productId: args.productId,
      variantId: args.variantId ?? null,
    },
    _sum: { quantity: true },
  });

  return result._sum.quantity ?? 0;
}

export async function getProductStockAllBranches(productId: string, tenantId: string) {
  const movements = await prisma.stockMovement.groupBy({
    by: ["branchId"],
    where: { productId, tenantId },
    _sum: { quantity: true },
  });

  return movements.map((m) => ({
    branchId: m.branchId,
    stock: m._sum.quantity ?? 0,
  }));
}
