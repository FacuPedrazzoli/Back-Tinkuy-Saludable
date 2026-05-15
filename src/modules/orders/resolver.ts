import { builder } from "@graphql/builder";
import * as orderService from "./service";

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
    variant: t.relation("variant", { nullable: true }),
  }),
});

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
      if (!ctx.tenantId) throw new Error("Tenant ID required");
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
    type: [Order],
    authScopes: { customer: true },
    resolve: async (_parent, _args, ctx) => {
      if (!ctx.user) throw new Error("Unauthorized");
      if (!ctx.tenantId) throw new Error("Tenant ID required");
      const result = await orderService.listOrders({
        tenantId: ctx.tenantId,
        customerId: ctx.user.id,
      });
      return result.items;
    },
  })
);

builder.queryField("order", (t) =>
  t.field({
    type: Order,
    args: { id: t.arg.string({ required: true }) },
    authScopes: { authenticated: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new Error("Tenant ID required");
      return orderService.getOrder(args.id, ctx.tenantId);
    },
  })
);

builder.queryField("guestOrders", (t) =>
  t.field({
    type: [Order],
    args: { email: t.arg.string({ required: true }) },
    authScopes: { public: true },
    resolve: async (_parent, args) => orderService.getGuestOrders(args.email),
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
    resolve: async (_parent, { id, input }) =>
      orderService.updateOrderStatus(
        id,
        input.status as "pending" | "confirmed" | "cancelled" | "refunded"
      ),
  })
);
