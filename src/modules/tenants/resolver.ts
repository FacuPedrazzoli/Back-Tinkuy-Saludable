import { builder } from "@graphql/builder";
import * as tenantService from "./service";
import { ForbiddenError } from "@lib/errors";

// ─── Types ───

export const Tenant = builder.prismaObject("Tenant", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    slug: t.exposeString("slug"),
    isActive: t.exposeBoolean("isActive"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    branches: t.relation("branches"),
  }),
});

export const Branch = builder.prismaObject("Branch", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    address: t.exposeString("address", { nullable: true }),
    phone: t.exposeString("phone", { nullable: true }),
    isActive: t.exposeBoolean("isActive"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    tenant: t.relation("tenant"),
  }),
});

// ─── Inputs ───

const CreateTenantInput = builder.inputType("CreateTenantInput", {
  fields: (t) => ({
    name: t.string({ required: true, validate: { maxLength: 255 } }),
    slug: t.string({ required: true, validate: { maxLength: 120 } }),
    branchName: t.string({ validate: { maxLength: 255 } }),
  }),
});

const UpdateTenantInput = builder.inputType("UpdateTenantInput", {
  fields: (t) => ({
    name: t.string({ validate: { maxLength: 255 } }),
    isActive: t.boolean(),
  }),
});

const CreateBranchInput = builder.inputType("CreateBranchInput", {
  fields: (t) => ({
    tenantId: t.string({ required: true, validate: { maxLength: 64 } }),
    name: t.string({ required: true, validate: { maxLength: 255 } }),
    address: t.string({ validate: { maxLength: 500 } }),
    phone: t.string({ validate: { maxLength: 20 } }),
  }),
});

const UpdateBranchInput = builder.inputType("UpdateBranchInput", {
  fields: (t) => ({
    name: t.string({ validate: { maxLength: 255 } }),
    address: t.string({ validate: { maxLength: 500 } }),
    phone: t.string({ validate: { maxLength: 20 } }),
    isActive: t.boolean(),
  }),
});

// ─── Queries ───

interface TenantListShape {
  items: Awaited<ReturnType<typeof tenantService.listTenants>>["items"];
  count: number;
}

const TenantList = builder.objectRef<TenantListShape>("TenantList").implement({
  fields: (t2) => ({
    items: t2.field({
      type: [Tenant],
      resolve: (parent) => parent.items,
    }),
    count: t2.exposeInt("count"),
  }),
});

builder.queryField("tenants", (t) =>
  t.field({
    type: TenantList,
    args: {
      take: t.arg.int({ defaultValue: 20 }),
      skip: t.arg.int({ defaultValue: 0 }),
    },
    authScopes: { admin: true },
    resolve: async (_parent, args) =>
      tenantService.listTenants({ take: args.take ?? 20, skip: args.skip ?? 0 }),
  })
);

builder.queryField("tenant", (t) =>
  t.field({
    type: Tenant,
    args: { slug: t.arg.string({ required: true }) },
    authScopes: { public: true },
    resolve: async (_parent, args) => tenantService.getTenantBySlug(args.slug),
  })
);

builder.queryField("branches", (t) =>
  t.field({
    type: [Branch],
    args: {
      take: t.arg.int({ defaultValue: 50 }),
      skip: t.arg.int({ defaultValue: 0 }),
    },
    authScopes: { manager: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return tenantService.listBranches(ctx.tenantId, {
        take: args.take ?? 50,
        skip: args.skip ?? 0,
      });
    },
  })
);

// ─── Mutations ───

builder.mutationField("createTenant", (t) =>
  t.field({
    type: Tenant,
    args: { input: t.arg({ type: CreateTenantInput, required: true }) },
    authScopes: { admin: true },
    resolve: async (_parent, { input }) => tenantService.createTenant({
      ...input,
      branchName: input.branchName ?? undefined,
    }),
  })
);

builder.mutationField("updateTenant", (t) =>
  t.field({
    type: Tenant,
    args: {
      id: t.arg.string({ required: true }),
      input: t.arg({ type: UpdateTenantInput, required: true }),
    },
    authScopes: { admin: true },
    resolve: async (_parent, { id, input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      if (ctx.tenantId !== id) {
        throw new ForbiddenError("Cannot update another tenant");
      }
      return tenantService.updateTenant(id, {
        name: input.name ?? undefined,
        isActive: input.isActive ?? undefined,
      });
    },
  })
);

builder.mutationField("createBranch", (t) =>
  t.field({
    type: Branch,
    args: { input: t.arg({ type: CreateBranchInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      if (input.tenantId !== ctx.tenantId) {
        throw new ForbiddenError("Cannot create branch for another tenant");
      }
      return tenantService.createBranch({
        ...input,
        address: input.address ?? undefined,
        phone: input.phone ?? undefined,
      });
    },
  })
);

builder.mutationField("updateBranch", (t) =>
  t.field({
    type: Branch,
    args: {
      id: t.arg.string({ required: true }),
      input: t.arg({ type: UpdateBranchInput, required: true }),
    },
    authScopes: { manager: true },
    resolve: async (_parent, { id, input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return tenantService.updateBranch(id, {
        name: input.name ?? undefined,
        address: input.address ?? undefined,
        phone: input.phone ?? undefined,
        isActive: input.isActive ?? undefined,
      }, ctx.tenantId);
    },
  })
);
