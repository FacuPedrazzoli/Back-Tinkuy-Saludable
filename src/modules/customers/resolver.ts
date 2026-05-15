import { builder } from "@graphql/builder";
import * as customerService from "./service";

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
    firstName: t.string(),
    lastName: t.string(),
    phone: t.string(),
  }),
});

const CreateAddressInput = builder.inputType("CreateAddressInput", {
  fields: (t) => ({
    label: t.string({ required: true }),
    street: t.string({ required: true }),
    city: t.string({ required: true }),
    province: t.string({ required: true }),
    zipCode: t.string({ required: true }),
    country: t.string(),
    isDefault: t.boolean(),
  }),
});

const UpdateAddressInput = builder.inputType("UpdateAddressInput", {
  fields: (t) => ({
    label: t.string(),
    street: t.string(),
    city: t.string(),
    province: t.string(),
    zipCode: t.string(),
    country: t.string(),
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
      return customerService.getCustomerProfile(ctx.user.id);
    },
  })
);

builder.mutationField("updateProfile", (t) =>
  t.field({
    type: Customer,
    authScopes: { customer: true },
    args: { input: t.arg({ type: UpdateProfileInput, required: true }) },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.user) throw new Error("Unauthorized");
      return customerService.updateCustomerProfile(ctx.user.id, {
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
      if (!ctx.user) throw new Error("Unauthorized");
      return customerService.createAddress({
        ...input,
        customerId: ctx.user.id,
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
    resolve: async (_parent, { id, input }) =>
      customerService.updateAddress(id, {
        label: input.label ?? undefined,
        street: input.street ?? undefined,
        city: input.city ?? undefined,
        province: input.province ?? undefined,
        zipCode: input.zipCode ?? undefined,
        country: input.country ?? undefined,
        isDefault: input.isDefault ?? undefined,
      }),
  })
);

builder.mutationField("deleteAddress", (t) =>
  t.field({
    type: "Boolean",
    authScopes: { customer: true },
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_parent, { id }) => {
      await customerService.deleteAddress(id);
      return true;
    },
  })
);
