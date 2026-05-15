import { builder } from "@graphql/builder";
import * as tenantService from "./service";

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
    name: t.string({ required: true }),
    slug: t.string({ required: true }),
    branchName: t.string(),
  }),
});

const UpdateTenantInput = builder.inputType("UpdateTenantInput", {
  fields: (t) => ({
    name: t.string(),
    isActive: t.boolean(),
  }),
});

const CreateBranchInput = builder.inputType("CreateBranchInput", {
  fields: (t) => ({
    tenantId: t.string({ required: true }),
    name: t.string({ required: true }),
    address: t.string(),
    phone: t.string(),
  }),
});

const UpdateBranchInput = builder.inputType("UpdateBranchInput", {
  fields: (t) => ({
    name: t.string(),
    address: t.string(),
    phone: t.string(),
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
    authScopes: { manager: true },
    resolve: async (_parent, _args, ctx) => {
      if (!ctx.tenantId) throw new Error("Tenant ID required");
      return tenantService.listBranches(ctx.tenantId);
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
    resolve: async (_parent, { id, input }) => tenantService.updateTenant(id, {
      name: input.name ?? undefined,
      isActive: input.isActive ?? undefined,
    }),
  })
);

builder.mutationField("createBranch", (t) =>
  t.field({
    type: Branch,
    args: { input: t.arg({ type: CreateBranchInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }) => tenantService.createBranch({
      ...input,
      address: input.address ?? undefined,
      phone: input.phone ?? undefined,
    }),
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
    resolve: async (_parent, { id, input }) => tenantService.updateBranch(id, {
      name: input.name ?? undefined,
      address: input.address ?? undefined,
      phone: input.phone ?? undefined,
      isActive: input.isActive ?? undefined,
    }),
  })
);
