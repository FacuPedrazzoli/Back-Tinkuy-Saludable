import { builder } from "@graphql/builder";
import { prisma } from "@lib/prisma";
import * as customerService from "./service";
import { AuthenticationError, ForbiddenError } from "@lib/errors";
import { encodeCursor, decodeCursor, PageInfo } from "@graphql/types/connection";

export const Customer = builder.prismaObject("Customer", {
  fields: (t) => ({
    id: t.exposeID("id"),
    email: t.exposeString("email"),
    firstName: t.exposeString("firstName"),
    lastName: t.exposeString("lastName"),
    phone: t.exposeString("phone", { nullable: true }),
    isActive: t.exposeBoolean("isActive"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    addresses: t.relation("addresses"),
    totalOrders: t.field({
      type: "Int",
      resolve: async (customer) => {
        return prisma.order.count({ where: { customerId: customer.id } });
      },
    }),
    totalSpent: t.field({
      type: "Decimal",
      resolve: async (customer) => {
        const result = await prisma.order.aggregate({
          where: { customerId: customer.id, paymentStatus: "approved" },
          _sum: { totalAmount: true },
        });
        return String(result._sum.totalAmount ?? 0);
      },
    }),
  }),
});

const AdminCustomer = builder.objectRef<{
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  totalOrders: number;
  totalSpent: number;
  createdAt: Date;
}>("AdminCustomer").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    email: t.exposeString("email"),
    firstName: t.exposeString("firstName"),
    lastName: t.exposeString("lastName"),
    phone: t.exposeString("phone", { nullable: true }),
    totalOrders: t.exposeInt("totalOrders"),
    totalSpent: t.exposeFloat("totalSpent"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

const CustomerEdge = builder.objectRef<{ node: unknown; cursor: string }>("CustomerEdge").implement({
  fields: (t) => ({
    node: t.field({
      type: AdminCustomer,
      resolve: (parent) => parent.node as any,
    }),
    cursor: t.exposeString("cursor"),
  }),
});

const CustomerConnection = builder.objectRef<{
  edges: { node: unknown; cursor: string }[];
  pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null };
  totalCount: number;
}>("CustomerConnection").implement({
  fields: (t) => ({
    edges: t.field({
      type: [CustomerEdge],
      resolve: (parent) => parent.edges,
    }),
    pageInfo: t.field({
      type: PageInfo,
      resolve: (parent) => parent.pageInfo,
    }),
    totalCount: t.exposeInt("totalCount"),
  }),
});

export const CustomerAddress = builder.prismaObject("CustomerAddress", {
  fields: (t) => ({
    id: t.exposeID("id"),
    label: t.exposeString("label"),
    street: t.exposeString("street"),
    city: t.exposeString("city"),
    province: t.exposeString("province"),
    zipCode: t.exposeString("zipCode"),
    country: t.exposeString("country"),
    isDefault: t.exposeBoolean("isDefault"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    customer: t.relation("customer"),
  }),
});

const UpdateProfileInput = builder.inputType("UpdateProfileInput", {
  fields: (t) => ({
    firstName: t.string({ validate: { maxLength: 100 } }),
    lastName: t.string({ validate: { maxLength: 100 } }),
    phone: t.string({ validate: { maxLength: 20 } }),
  }),
});

const CreateAddressInput = builder.inputType("CreateAddressInput", {
  fields: (t) => ({
    label: t.string({ required: true, validate: { maxLength: 100 } }),
    street: t.string({ required: true, validate: { maxLength: 255 } }),
    city: t.string({ required: true, validate: { maxLength: 100 } }),
    province: t.string({ required: true, validate: { maxLength: 100 } }),
    zipCode: t.string({ required: true, validate: { maxLength: 20 } }),
    country: t.string({ validate: { maxLength: 2 } }),
    isDefault: t.boolean(),
  }),
});

const UpdateAddressInput = builder.inputType("UpdateAddressInput", {
  fields: (t) => ({
    label: t.string({ validate: { maxLength: 100 } }),
    street: t.string({ validate: { maxLength: 255 } }),
    city: t.string({ validate: { maxLength: 100 } }),
    province: t.string({ validate: { maxLength: 100 } }),
    zipCode: t.string({ validate: { maxLength: 20 } }),
    country: t.string({ validate: { maxLength: 2 } }),
    isDefault: t.boolean(),
  }),
});

builder.queryField("meCustomer", (t) =>
  t.field({
    type: Customer,
    nullable: true,
    authScopes: { customer: true },
    resolve: async (_parent, _args, ctx) => {
      if (!ctx.user) return null;
      return customerService.getCustomerProfile(ctx.user.id, ctx.tenantId!);
    },
  })
);

builder.queryField("customers", (t) =>
  t.field({
    type: CustomerConnection,
    args: {
      search: t.arg.string(),
      first: t.arg.int(),
      after: t.arg.string(),
    },
    authScopes: { manager: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");

      const first = args.first ?? 20;
      const cursor = args.after ? decodeCursor(args.after) : undefined;

      const where: any = { tenantId: ctx.tenantId };

      if (args.search) {
        where.OR = [
          { email: { contains: args.search, mode: "insensitive" } },
          { firstName: { contains: args.search, mode: "insensitive" } },
          { lastName: { contains: args.search, mode: "insensitive" } },
        ];
      }

      if (cursor) {
        where.id = { gt: cursor };
      }

      const [customers, count] = await Promise.all([
        prisma.customer.findMany({
          where,
          take: first + 1,
          skip: 0,
          orderBy: { id: 'asc' },
        }),
        prisma.customer.count({ where }),
      ]);

      const hasNextPage = customers.length > first;
      const customerEdges = customers.slice(0, first).map((customer) => ({
        node: customer,
        cursor: encodeCursor(customer.id),
      }));

      const nodesWithStats = await Promise.all(
        customerEdges.map(async (edge) => {
          const [orderCount, orderAgg] = await Promise.all([
            prisma.order.count({ where: { customerId: (edge.node as any).id } }),
            prisma.order.aggregate({
              where: { customerId: (edge.node as any).id, paymentStatus: "approved" },
              _sum: { totalAmount: true },
            }),
          ]);
          return {
            node: {
              id: (edge.node as any).id,
              email: (edge.node as any).email,
              firstName: (edge.node as any).firstName,
              lastName: (edge.node as any).lastName,
              phone: (edge.node as any).phone,
              totalOrders: orderCount,
              totalSpent: Number(orderAgg._sum.totalAmount ?? 0),
              createdAt: (edge.node as any).createdAt,
            },
            cursor: edge.cursor,
          };
        })
      );

      return {
        edges: nodesWithStats,
        pageInfo: {
          hasNextPage,
          hasPreviousPage: !!args.after,
          startCursor: nodesWithStats[0]?.cursor ?? null,
          endCursor: nodesWithStats[nodesWithStats.length - 1]?.cursor ?? null,
        },
        totalCount: count,
      };
    },
  })
);

builder.mutationField("updateProfile", (t) =>
  t.field({
    type: Customer,
    authScopes: { customer: true },
    args: { input: t.arg({ type: UpdateProfileInput, required: true }) },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.user) throw new AuthenticationError("Unauthorized");
      return customerService.updateCustomerProfile(ctx.user.id, ctx.tenantId!, {
        firstName: input.firstName ?? undefined,
        lastName: input.lastName ?? undefined,
        phone: input.phone ?? undefined,
      });
    },
  })
);

builder.mutationField("createAddress", (t) =>
  t.field({
    type: CustomerAddress,
    authScopes: { customer: true },
    args: { input: t.arg({ type: CreateAddressInput, required: true }) },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.user) throw new AuthenticationError("Unauthorized");
      return customerService.createAddress(ctx.user.id, ctx.tenantId!, {
        label: input.label,
        street: input.street,
        city: input.city,
        province: input.province,
        zipCode: input.zipCode,
        country: input.country ?? undefined,
        isDefault: input.isDefault ?? undefined,
      });
    },
  })
);

builder.mutationField("updateAddress", (t) =>
  t.field({
    type: CustomerAddress,
    authScopes: { customer: true },
    args: {
      id: t.arg.string({ required: true }),
      input: t.arg({ type: UpdateAddressInput, required: true }),
    },
    resolve: async (_parent, { id, input }, ctx) => {
      if (!ctx.user) throw new AuthenticationError("Unauthorized");
      const address = await customerService.getAddressById(id, ctx.tenantId!);
      if (!address || address.customerId !== ctx.user.id) {
        throw new ForbiddenError("Address not found or access denied");
      }
      return customerService.updateAddress(id, ctx.tenantId!, {
        label: input.label ?? undefined,
        street: input.street ?? undefined,
        city: input.city ?? undefined,
        province: input.province ?? undefined,
        zipCode: input.zipCode ?? undefined,
        country: input.country ?? undefined,
        isDefault: input.isDefault ?? undefined,
      });
    },
  })
);

builder.mutationField("deleteAddress", (t) =>
  t.field({
    type: "Boolean",
    authScopes: { customer: true },
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_parent, { id }, ctx) => {
      if (!ctx.user) throw new AuthenticationError("Unauthorized");
      const address = await customerService.getAddressById(id, ctx.tenantId!);
      if (!address || address.customerId !== ctx.user.id) {
        throw new ForbiddenError("Address not found or access denied");
      }
      await customerService.deleteAddress(id, ctx.tenantId!);
      return true;
    },
  })
);
