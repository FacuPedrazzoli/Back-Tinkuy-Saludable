import { prisma } from "@lib/prisma";
import { NotFoundError, ValidationError } from "@lib/errors";
import { invalidateStockCache } from "@lib/cache";
import { Prisma } from "@prisma/client";

type OrderStatus = "pending" | "confirmed" | "cancelled" | "refunded";

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "refunded"],
  cancelled: [],
  refunded: [],
};

export async function createOrderFromCheckout(input: {
  tenantId: string;
  branchId: string;
  customerId?: string;
  guestEmail?: string;
  paymentId: string;
  preferenceId?: string;
  items: {
    productId: string;
    variantId?: string | null;
    name: string;
    sku?: string | null;
    price: number;
    quantity: number;
  }[];
  totalAmount: number;
}) {
  return prisma.$transaction(async (tx) => {
    const productIds = input.items.map((i) => i.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, tenantId: input.tenantId },
    });

    const inactiveProducts = products.filter((p) => !p.isActive || !p.isVisible);
    if (inactiveProducts.length > 0) {
      throw new ValidationError(
        `Products not available: ${inactiveProducts.map((p) => p.name).join(", ")}`
      );
    }

    for (const item of input.items) {
      const currentStockResult = await tx.$queryRaw<{ total: bigint }[]>`
        SELECT COALESCE(SUM(quantity), 0) as total
        FROM "StockMovement"
        WHERE "tenantId" = ${input.tenantId}
          AND "branchId" = ${input.branchId}
          AND "productId" = ${item.productId}
          AND ("variantId" = ${item.variantId} OR (${item.variantId} IS NULL AND "variantId" IS NULL))
        FOR UPDATE
      `;
      const currentStock = Number(currentStockResult[0]?.total ?? 0);

      if (currentStock < item.quantity) {
        throw new ValidationError(
          `Insufficient stock for ${item.name}: available ${currentStock}, requested ${item.quantity}`
        );
      }
    }

    const order = await tx.order.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        customerId: input.customerId,
        guestEmail: input.guestEmail,
        status: "pending",
        paymentStatus: "pending",
        paymentId: input.paymentId,
        preferenceId: input.preferenceId,
        totalAmount: input.totalAmount,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            name: item.name,
            sku: item.sku,
            price: item.price,
            quantity: item.quantity,
            total: item.price * item.quantity,
          })),
        },
      },
      include: { items: true, customer: true, branch: true },
    });

    for (const item of input.items) {
      await tx.stockMovement.create({
        data: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          productId: item.productId,
          variantId: item.variantId,
          type: "OUTBOUND",
          quantity: -item.quantity,
          reason: `Order ${order.id}`,
          referenceId: order.id,
        },
      });

      await invalidateStockCache(item.productId, input.branchId, item.variantId);
    }

    return order;
  });
}

export async function getOrder(id: string, tenantId: string) {
  const order = await prisma.order.findUnique({
    where: { id, tenantId },
    include: {
      items: { include: { product: true, variant: true } },
      customer: true,
      branch: true,
    },
  });
  if (!order) throw new NotFoundError("Order");
  return order;
}

export async function listOrders(args: {
  tenantId: string;
  customerId?: string;
  status?: OrderStatus;
  take?: number;
  skip?: number;
}) {
  const where: Prisma.OrderWhereInput = { tenantId: args.tenantId };
  if (args.customerId) where.customerId = args.customerId;
  if (args.status) where.status = args.status;

  const [items, count] = await Promise.all([
    prisma.order.findMany({
      where,
      take: args.take ?? 20,
      skip: args.skip ?? 0,
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { product: true, variant: true } },
        customer: true,
        branch: true,
      },
    }),
    prisma.order.count({ where }),
  ]);

  return { items, count };
}

export async function updateOrderStatus(
  id: string,
  newStatus: OrderStatus
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundError("Order");

    const currentStatus = order.status as OrderStatus;
    const allowedTransitions = VALID_TRANSITIONS[currentStatus];

    if (!allowedTransitions.includes(newStatus)) {
      throw new ValidationError(
        `Invalid status transition from "${currentStatus}" to "${newStatus}"`
      );
    }

    const updatedOrder = await tx.order.update({
      where: { id },
      data: { status: newStatus },
      include: { items: true, customer: true },
    });

    if (newStatus === "cancelled" || newStatus === "refunded") {
      for (const item of updatedOrder.items) {
        await tx.stockMovement.create({
          data: {
            tenantId: order.tenantId,
            branchId: order.branchId,
            productId: item.productId,
            variantId: item.variantId,
            type: "INBOUND",
            quantity: item.quantity,
            reason: `${newStatus} order ${order.id}`,
            referenceId: order.id,
          },
        });

        await invalidateStockCache(item.productId, order.branchId, item.variantId);
      }
    }

    return updatedOrder;
  });
}

export async function getGuestOrders(email: string) {
  return prisma.order.findMany({
    where: { guestEmail: email },
    orderBy: { createdAt: "desc" },
    include: { items: true, branch: true },
  });
}
