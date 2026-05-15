import { builder } from "@graphql/builder";
import * as orderService from "./service";
import { ForbiddenError, AuthenticationError, ValidationError } from "@lib/errors";
import { rateLimitGeneral } from "@lib/rate-limit";
import { emailSchema } from "@lib/validation";

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

interface OrderListShape {
  items: Awaited<ReturnType<typeof orderService.listOrders>>["items"];
  count: number;
}

const OrderList = builder.objectRef<OrderListShape>("OrderList").implement({
  fields: (t2) => ({
    items: t2.field({ type: [Order], resolve: (parent) => parent.items }),
    count: t2.exposeInt("count"),
  }),
});

builder.queryField("orders", (t) =>
  t.field({
    type: OrderList,
    args: {
      status: t.arg.string(),
      take: t.arg.int({ defaultValue: 20 }),
      skip: t.arg.int({ defaultValue: 0 }),
    },
    authScopes: { manager: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return orderService.listOrders({
        tenantId: ctx.tenantId,
        status: (args.status ?? undefined) as "pending" | "confirmed" | "cancelled" | "refunded" | undefined,
        take: args.take ?? 20,
        skip: args.skip ?? 0,
      });
    },
  })
);

builder.queryField("myOrders", (t) =>
  t.field({
    type: OrderList,
    args: {
      take: t.arg.int({ defaultValue: 20 }),
      skip: t.arg.int({ defaultValue: 0 }),
    },
    authScopes: { customer: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.user) throw new AuthenticationError("Unauthorized");
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return orderService.listOrders({
        tenantId: ctx.tenantId,
        customerId: ctx.user.id,
        take: args.take ?? 20,
        skip: args.skip ?? 0,
      });
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
