import { builder } from "@graphql/builder";
import * as orderService from "./service";
import { ForbiddenError, AuthenticationError, ValidationError } from "@lib/errors";
import { rateLimitGeneral } from "@lib/rate-limit";
import { emailSchema } from "@lib/validation";
import { encodeCursor, decodeCursor, PageInfo } from "@graphql/types/connection";
import { prisma } from "@lib/prisma";

export const Order = builder.prismaObject("Order", {
  fields: (t) => ({
    id: t.exposeID("id"),
    status: t.exposeString("status"),
    paymentStatus: t.exposeString("paymentStatus"),
    paymentId: t.exposeString("paymentId", { nullable: true }),
    preferenceId: t.exposeString("preferenceId", { nullable: true }),
    totalAmount: t.field({ type: "Decimal", resolve: (order) => String(order.totalAmount) }),
    notes: t.exposeString("notes", { nullable: true }),
    guestEmail: t.exposeString("guestEmail", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    branch: t.relation("branch"),
    customer: t.relation("customer", { nullable: true }),
    items: t.relation("items"),
    orderNumber: t.field({
      type: "String",
      resolve: (order) => `#${order.id.slice(0, 8).toUpperCase()}`,
    }),
    customerName: t.field({
      type: "String",
      nullable: true,
      resolve: async (order, _args, _ctx) => {
        const customer = (order as any).customer as { firstName: string; lastName: string } | null | undefined;
        if (customer?.firstName) {
          return `${customer.firstName} ${customer.lastName ?? ""}`.trim();
        }
        return null;
      },
    }),
    customerEmail: t.field({
      type: "String",
      nullable: true,
      resolve: async (order, _args, _ctx) => {
        const customer = (order as any).customer as { email: string } | null | undefined;
        return customer?.email ?? (order as any).guestEmail ?? null;
      },
    }),
  }),
});

export const OrderItem = builder.prismaObject("OrderItem", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    sku: t.exposeString("sku", { nullable: true }),
    price: t.field({ type: "Decimal", resolve: (item) => String(item.price) }),
    quantity: t.exposeInt("quantity"),
    total: t.field({ type: "Decimal", resolve: (item) => String(item.total) }),
    product: t.relation("product"),
    variant: t.relation("variant"),
  }),
});

const ORDER_STATUSES = ["pending", "confirmed", "cancelled", "refunded"] as const;

const UpdateOrderStatusInput = builder.inputType("UpdateOrderStatusInput", {
  fields: (t) => ({
    status: t.string({ required: true }),
  }),
});

const OrderEdge = builder.objectRef<{ node: unknown; cursor: string }>("OrderEdge").implement({
  fields: (t) => ({
    node: t.field({
      type: Order,
      resolve: (parent) => parent.node as any,
    }),
    cursor: t.exposeString("cursor"),
  }),
});

const OrderConnection = builder.objectRef<{
  edges: { node: unknown; cursor: string }[];
  pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null };
  totalCount: number;
}>("OrderConnection").implement({
  fields: (t) => ({
    edges: t.field({
      type: [OrderEdge],
      resolve: (parent) => parent.edges,
    }),
    pageInfo: t.field({
      type: PageInfo,
      resolve: (parent) => parent.pageInfo,
    }),
    totalCount: t.exposeInt("totalCount"),
  }),
});

builder.queryField("orders", (t) =>
  t.field({
    type: OrderConnection,
    args: {
      status: t.arg.string(),
      first: t.arg.int(),
      after: t.arg.string(),
    },
    authScopes: { manager: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");

      const first = args.first ?? 20;
      const cursor = args.after ? decodeCursor(args.after) : undefined;

      const where: Record<string, unknown> = { tenantId: ctx.tenantId };
      if (args.status) where.status = args.status;
      if (cursor) where.id = { gt: cursor };

      const [items, count] = await Promise.all([
        prisma.order.findMany({
          where,
          take: first + 1,
          skip: 0,
          orderBy: { id: 'asc' },
          include: {
            items: { include: { product: true, variant: true } },
            customer: true,
            branch: true,
          },
        }),
        prisma.order.count({ where }),
      ]);

      const hasNextPage = items.length > first;
      const edges = items.slice(0, first).map((item) => ({
        node: item,
        cursor: encodeCursor(item.id),
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!args.after,
          startCursor: edges[0]?.cursor ?? null,
          endCursor: edges[edges.length - 1]?.cursor ?? null,
        },
        totalCount: count,
      };
    },
  })
);

builder.queryField("myOrders", (t) =>
  t.field({
    type: OrderConnection,
    args: {
      first: t.arg.int(),
      after: t.arg.string(),
    },
    authScopes: { customer: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.user) throw new AuthenticationError("Unauthorized");
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");

      const first = args.first ?? 20;
      const cursor = args.after ? decodeCursor(args.after) : undefined;

      const where: Record<string, unknown> = { tenantId: ctx.tenantId, customerId: ctx.user.id };
      if (cursor) where.id = { gt: cursor };

      const [items, count] = await Promise.all([
        prisma.order.findMany({
          where,
          take: first + 1,
          skip: 0,
          orderBy: { id: 'asc' },
          include: {
            items: { include: { product: true, variant: true } },
            customer: true,
            branch: true,
          },
        }),
        prisma.order.count({ where }),
      ]);

      const hasNextPage = items.length > first;
      const edges = items.slice(0, first).map((item) => ({
        node: item,
        cursor: encodeCursor(item.id),
      }));

      return {
        edges,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!args.after,
          startCursor: edges[0]?.cursor ?? null,
          endCursor: edges[edges.length - 1]?.cursor ?? null,
        },
        totalCount: count,
      };
    },
  })
);

builder.queryField("order", (t) =>
  t.field({
    type: Order,
    args: { id: t.arg.string({ required: true }) },
    authScopes: { authenticated: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      if (!ctx.user) throw new AuthenticationError("Unauthorized");

      const order = await orderService.getOrder(args.id, ctx.tenantId);

      if (ctx.user.role === "customer" && order.customerId !== ctx.user.id) {
        throw new ForbiddenError("Access denied to this order");
      }

      return order;
    },
  })
);

builder.queryField("guestOrders", (t) =>
  t.field({
    type: [Order],
    args: { email: t.arg.string({ required: true }) },
    authScopes: { public: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      const identifier = ctx.req.ip ?? "anonymous";
      await rateLimitGeneral(`guestOrders:${identifier}`);
      const emailValidation = emailSchema.safeParse(args.email);
      if (!emailValidation.success) {
        throw new ValidationError("Invalid email format");
      }
      return orderService.getGuestOrders(emailValidation.data, ctx.tenantId);
    },
  })
);

builder.mutationField("updateOrderStatus", (t) =>
  t.field({
    type: Order,
    args: {
      id: t.arg.string({ required: true }),
      input: t.arg({ type: UpdateOrderStatusInput, required: true }),
    },
    authScopes: { manager: true },
    resolve: async (_parent, { id, input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      if (!ORDER_STATUSES.includes(input.status as typeof ORDER_STATUSES[number])) {
        throw new ValidationError(`Invalid order status. Must be one of: ${ORDER_STATUSES.join(", ")}`);
      }
      return orderService.updateOrderStatus(
        id,
        input.status as "pending" | "confirmed" | "cancelled" | "refunded",
        ctx.tenantId
      );
    },
  })
);

const RecentOrder = builder.objectRef<{ id: string; orderNumber: string; customerName: string; customerEmail: string; total: number; status: string; paymentStatus: string; createdAt: Date }>("RecentOrder").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    orderNumber: t.exposeString("orderNumber"),
    customerName: t.exposeString("customerName"),
    customerEmail: t.exposeString("customerEmail"),
    total: t.exposeFloat("total"),
    status: t.exposeString("status"),
    paymentStatus: t.exposeString("paymentStatus"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

const TopProduct = builder.objectRef<{ productName: string; quantity: number; totalPrice: number }>("TopProduct").implement({
  fields: (t) => ({
    productName: t.exposeString("productName"),
    quantity: t.exposeInt("quantity"),
    totalPrice: t.exposeFloat("totalPrice"),
  }),
});

const AdminMetrics = builder.objectRef<{
  totalOrders: number;
  pendingOrders: number;
  totalCustomers: number;
  totalProducts: number;
  revenueToday: number;
  revenueThisMonth: number;
  avgOrderValue: number;
}>("AdminMetrics").implement({
  fields: (t) => ({
    totalOrders: t.exposeInt("totalOrders"),
    pendingOrders: t.exposeInt("pendingOrders"),
    totalCustomers: t.exposeInt("totalCustomers"),
    totalProducts: t.exposeInt("totalProducts"),
    revenueToday: t.exposeFloat("revenueToday"),
    revenueThisMonth: t.exposeFloat("revenueThisMonth"),
    avgOrderValue: t.exposeFloat("avgOrderValue"),
  }),
});

builder.queryField("adminMetrics", (t) =>
  t.field({
    type: AdminMetrics,
    authScopes: { manager: true },
    resolve: async (_parent, _args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return orderService.getAdminMetrics(ctx.tenantId);
    },
  })
);

builder.queryField("recentOrders", (t) =>
  t.field({
    type: [RecentOrder],
    args: {
      limit: t.arg.int({ defaultValue: 10 }),
    },
    authScopes: { manager: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      const orders = await orderService.getRecentOrders(ctx.tenantId, args.limit ?? 10);
      return orders.map((order) => ({
        id: order.id,
        orderNumber: `#${order.id.slice(0, 8).toUpperCase()}`,
        customerName: order.customer?.firstName
          ? `${order.customer.firstName} ${order.customer.lastName || ""}`.trim()
          : "Cliente",
        customerEmail: order.customer?.email || order.guestEmail || "-",
        total: Number(order.totalAmount),
        status: order.status,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
      }));
    },
  })
);

builder.queryField("topProducts", (t) =>
  t.field({
    type: [TopProduct],
    args: {
      limit: t.arg.int({ defaultValue: 5 }),
    },
    authScopes: { manager: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return orderService.getTopProducts(ctx.tenantId, args.limit ?? 5);
    },
  })
);
