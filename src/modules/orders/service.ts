import { prisma } from "@lib/prisma";
import { NotFoundError, ValidationError } from "@lib/errors";
import { invalidateStockCache } from "@lib/cache";
import { queryCache, ORDER_CACHE_TTL } from "@lib/query-cache";
import { Prisma } from "@prisma/client";

type OrderStatus = "pending" | "confirmed" | "cancelled" | "refunded";

const ORDER_STATUSES: OrderStatus[] = ["pending", "confirmed", "cancelled", "refunded"];

function isOrderStatus(status: string): status is OrderStatus {
  return ORDER_STATUSES.includes(status as OrderStatus);
}

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

    const productIdsArr = input.items.map((i) => i.productId);
    const variantIdsArr = input.items.map((i) => i.variantId ?? "null");

    const stockResults = await tx.$queryRaw<{ productId: string; variantId: string | null; total: bigint }[]>`
      SELECT "productId", "variantId", COALESCE(SUM(quantity), 0) as total
      FROM "StockMovement"
      WHERE "tenantId" = ${input.tenantId}
        AND "branchId" = ${input.branchId}
        AND ("productId", COALESCE("variantId"::text, 'null')) IN (
          SELECT productId, variantId FROM UNNEST(${productIdsArr}, ${variantIdsArr}) AS t(productId, variantId)
        )
      GROUP BY "productId", "variantId"
      FOR UPDATE
    `;

    const stockMap = new Map<string, bigint>();
    for (const r of stockResults) {
      stockMap.set(`${r.productId}:${r.variantId ?? "null"}`, r.total);
    }

    for (const item of input.items) {
      const currentStock = Number(stockMap.get(`${item.productId}:${item.variantId ?? "null"}`) ?? 0);
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

    const stockMovementData = input.items.map((item) => ({
      tenantId: input.tenantId,
      branchId: input.branchId,
      productId: item.productId,
      variantId: item.variantId,
      type: "OUTBOUND" as const,
      quantity: -item.quantity,
      reason: `Order ${order.id}`,
      referenceId: order.id,
    }));

    await tx.stockMovement.createMany({ data: stockMovementData });

    await Promise.all(
      input.items.map((item) => invalidateStockCache(item.productId, input.branchId, item.variantId, input.tenantId))
    );

    await queryCache.invalidatePattern(`orders:list:${input.tenantId}:*`);

    return order;
  });
}

export async function getOrder(id: string, tenantId: string) {
  const cacheKey = `order:${id}:${tenantId}`;
  const cached = await queryCache.get<NonNullable<ReturnType<typeof prisma.order.findUnique>>>(cacheKey);
  if (cached) return cached;

  const order = await prisma.order.findUnique({
    where: { id, tenantId },
    include: {
      items: { include: { product: true, variant: true } },
      customer: true,
      branch: true,
    },
  });
  if (!order) throw new NotFoundError("Order");

  await queryCache.set(cacheKey, order, { ttlSeconds: ORDER_CACHE_TTL });
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

  const cacheKey = `orders:list:${args.tenantId}:${args.customerId ?? "all"}:${args.status ?? "all"}:${args.take ?? 20}:${args.skip ?? 0}`;
  const cached = await queryCache.get<{ items: NonNullable<ReturnType<typeof prisma.order.findMany>>; count: number }>(cacheKey);
  if (cached) return cached;

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

  const result = { items, count };
  await queryCache.set(cacheKey, result, { ttlSeconds: ORDER_CACHE_TTL });
  return result;
}

export async function updateOrderStatus(
  id: string,
  newStatus: OrderStatus,
  tenantId: string
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id, tenantId } });
    if (!order) throw new NotFoundError("Order");

    const currentStatusStr = order.status;
    if (!isOrderStatus(currentStatusStr)) {
      throw new ValidationError(`Invalid order status: ${currentStatusStr}`);
    }
    const currentStatus = currentStatusStr;
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
      const stockMovementData = updatedOrder.items.map((item) => ({
        tenantId: order.tenantId,
        branchId: order.branchId,
        productId: item.productId,
        variantId: item.variantId,
        type: "INBOUND" as const,
        quantity: item.quantity,
        reason: `${newStatus} order ${order.id}`,
        referenceId: order.id,
      }));

      await tx.stockMovement.createMany({ data: stockMovementData });

      await Promise.all(
        updatedOrder.items.map((item) => invalidateStockCache(item.productId, order.branchId, item.variantId, order.tenantId))
      );
    }

    await queryCache.invalidate(`order:${id}:${order.tenantId}`);
    await queryCache.invalidatePattern(`orders:list:${order.tenantId}:*`);

    return updatedOrder;
  });
}

export async function getGuestOrders(email: string, tenantId: string, args: { take?: number; skip?: number } = {}) {
  return prisma.order.findMany({
    where: { guestEmail: email, tenantId },
    take: args.take ?? 20,
    skip: args.skip ?? 0,
    orderBy: { createdAt: "desc" },
    include: { items: true, branch: true },
  });
}

export async function updateOrderPaymentStatus(
  orderId: string,
  paymentStatus: "pending" | "approved" | "rejected" | "cancelled" | "refunded"
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundError("Order");
    }

    if (paymentStatus === "rejected" || paymentStatus === "cancelled") {
      const stockMovementData = order.items.map((item) => ({
        tenantId: order.tenantId,
        branchId: order.branchId,
        productId: item.productId,
        variantId: item.variantId,
        type: "INBOUND" as const,
        quantity: item.quantity,
        reason: `${paymentStatus} payment for order ${order.id}`,
        referenceId: order.id,
      }));

      await tx.stockMovement.createMany({ data: stockMovementData });

      for (const item of order.items) {
        await invalidateStockCache(item.productId, order.branchId, item.variantId, order.tenantId);
      }

      await queryCache.invalidate(`order:${orderId}:${order.tenantId}`);
      await queryCache.invalidatePattern(`orders:list:${order.tenantId}:*`);
    }

    return tx.order.update({
      where: { id: orderId },
      data: { paymentStatus },
    });
  });
}
