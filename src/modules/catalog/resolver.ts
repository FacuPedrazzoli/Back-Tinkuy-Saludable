import { builder } from "@graphql/builder";
import * as catalogService from "./service";
import { moneySchema } from "@lib/validation";
import { ValidationError, ForbiddenError } from "@lib/errors";
import { rateLimitGeneral } from "@lib/rate-limit";
import { encodeCursor, decodeCursor, PageInfo } from "@graphql/types/connection";
import { prisma } from "@lib/prisma";

// ─── Types ───

export const Product = builder.prismaObject("Product", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    slug: t.exposeString("slug"),
    description: t.exposeString("description", { nullable: true }),
    sku: t.exposeString("sku", { nullable: true }),
    isActive: t.exposeBoolean("isActive"),
    isVisible: t.exposeBoolean("isVisible"),
    basePrice: t.field({ type: "Decimal", resolve: (product) => String(product.basePrice) }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    variants: t.relation("variants"),
    attributes: t.relation("attributes"),
    images: t.relation("images"),
    tags: t.relation("tags"),
    suppliers: t.relation("suppliers"),
    stock: t.field({
      type: "Int",
      nullable: true,
      args: { branchId: t.arg.string() },
      resolve: async (product, args, ctx) => {
        const branchId = args.branchId ?? ctx.user?.branchId;
        if (!branchId) return null;
        try {
          const cached = await ctx.stockLoader.load({ tenantId: ctx.tenantId!, productId: product.id, branchId });
          return cached ?? 0;
        } catch {
          return 0;
        }
      },
    }),
  }),
});

export const ProductVariant = builder.prismaObject("ProductVariant", {
  fields: (t) => ({
    id: t.exposeID("id"),
    sku: t.exposeString("sku"),
    name: t.exposeString("name"),
    price: t.field({ type: "Decimal", resolve: (variant) => String(variant.price) }),
    isActive: t.exposeBoolean("isActive"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    product: t.relation("product"),
    attributes: t.relation("attributes"),
    images: t.relation("images"),
    stock: t.field({
      type: "Int",
      nullable: true,
      args: { branchId: t.arg.string() },
      resolve: async (variant, args, ctx) => {
        const branchId = args.branchId ?? ctx.user?.branchId;
        if (!branchId) return null;
        try {
          const cached = await ctx.stockLoader.load({ tenantId: ctx.tenantId!, productId: variant.id, branchId, variantId: variant.id });
          return cached ?? 0;
        } catch {
          return 0;
        }
      },
    }),
  }),
});

export const Tag = builder.prismaObject("Tag", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    slug: t.exposeString("slug"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    products: t.relation("products"),
  }),
});

export const Supplier = builder.prismaObject("Supplier", {
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    email: t.exposeString("email", { nullable: true }),
    phone: t.exposeString("phone", { nullable: true }),
    address: t.exposeString("address", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
    products: t.relation("products"),
  }),
});

export const ProductAttribute = builder.prismaObject("ProductAttribute", {
  fields: (t) => ({
    id: t.exposeID("id"),
    key: t.exposeString("key"),
    value: t.exposeString("value"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    product: t.relation("product", { nullable: true }),
    variant: t.relation("variant", { nullable: true }),
  }),
});

export const ProductTag = builder.prismaObject("ProductTag", {
  fields: (t) => ({
    product: t.relation("product"),
    tag: t.relation("tag"),
  }),
});

export const ProductSupplier = builder.prismaObject("ProductSupplier", {
  fields: (t) => ({
    product: t.relation("product"),
    supplier: t.relation("supplier"),
    costPrice: t.field({ type: "Decimal", nullable: true, resolve: (ps) => ps.costPrice ? String(ps.costPrice) : null }),
    sku: t.exposeString("sku", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

// ─── Inputs ───

const CreateProductInput = builder.inputType("CreateProductInput", {
  fields: (t) => ({
    name: t.string({ required: true, validate: { maxLength: 255 } }),
    slug: t.string({ validate: { maxLength: 120 } }),
    description: t.string({ validate: { maxLength: 5000 } }),
    sku: t.string({ validate: { maxLength: 100 } }),
    basePrice: t.float({ required: true }),
    tagIds: t.stringList(),
    supplierIds: t.stringList(),
  }),
});

const UpdateProductInput = builder.inputType("UpdateProductInput", {
  fields: (t) => ({
    name: t.string({ validate: { maxLength: 255 } }),
    slug: t.string({ validate: { maxLength: 120 } }),
    description: t.string({ validate: { maxLength: 5000 } }),
    sku: t.string({ validate: { maxLength: 100 } }),
    basePrice: t.float(),
    isActive: t.boolean(),
    isVisible: t.boolean(),
    tagIds: t.stringList(),
  }),
});

const CreateVariantInput = builder.inputType("CreateVariantInput", {
  fields: (t) => ({
    productId: t.string({ required: true, validate: { maxLength: 64 } }),
    sku: t.string({ required: true, validate: { maxLength: 100 } }),
    name: t.string({ required: true, validate: { maxLength: 255 } }),
    price: t.float({ required: true }),
  }),
});

const UpdateVariantInput = builder.inputType("UpdateVariantInput", {
  fields: (t) => ({
    sku: t.string({ validate: { maxLength: 100 } }),
    name: t.string({ validate: { maxLength: 255 } }),
    price: t.float(),
    isActive: t.boolean(),
  }),
});

const CreateTagInput = builder.inputType("CreateTagInput", {
  fields: (t) => ({
    name: t.string({ required: true, validate: { maxLength: 100 } }),
    slug: t.string({ validate: { maxLength: 120 } }),
  }),
});

const CreateSupplierInput = builder.inputType("CreateSupplierInput", {
  fields: (t) => ({
    name: t.string({ required: true, validate: { maxLength: 255 } }),
    email: t.string({ validate: { maxLength: 255 } }),
    phone: t.string({ validate: { maxLength: 20 } }),
    address: t.string({ validate: { maxLength: 500 } }),
  }),
});

const CreateAttributeInput = builder.inputType("CreateAttributeInput", {
  fields: (t) => ({
    productId: t.string({ validate: { maxLength: 64 } }),
    variantId: t.string({ validate: { maxLength: 64 } }),
    key: t.string({ required: true, validate: { maxLength: 100 } }),
    value: t.string({ required: true, validate: { maxLength: 500 } }),
  }),
});

// ─── Connection Types ───

const ProductEdge = builder.objectRef<{ node: unknown; cursor: string }>("ProductEdge").implement({
  fields: (t) => ({
    node: t.field({
      type: Product,
      resolve: (parent) => parent.node as any,
    }),
    cursor: t.exposeString("cursor"),
  }),
});

const ProductConnection = builder.objectRef<{
  edges: { node: unknown; cursor: string }[];
  pageInfo: { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null };
  totalCount: number;
}>("ProductConnection").implement({
  fields: (t) => ({
    edges: t.field({
      type: [ProductEdge],
      resolve: (parent) => parent.edges,
    }),
    pageInfo: t.field({
      type: PageInfo,
      resolve: (parent) => parent.pageInfo,
    }),
    totalCount: t.exposeInt("totalCount"),
  }),
});

// ─── Queries ───

builder.queryField("products", (t) =>
  t.field({
    type: ProductConnection,
    args: {
      search: t.arg.string(),
      tagSlug: t.arg.string(),
      isVisible: t.arg.boolean({ defaultValue: true }),
      first: t.arg.int(),
      after: t.arg.string(),
    },
    authScopes: { public: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");

      const first = args.first ?? 20;
      const cursor = args.after ? decodeCursor(args.after) : undefined;

      const where: Record<string, unknown> = {
        tenantId: ctx.tenantId,
      };

      if (args.isVisible !== undefined) {
        where.isVisible = args.isVisible;
      }

      if (args.search) {
        where.OR = [
          { name: { contains: args.search, mode: 'insensitive' } },
          { description: { contains: args.search, mode: 'insensitive' } },
          { sku: { contains: args.search, mode: 'insensitive' } },
        ];
      }

      if (args.tagSlug) {
        where.tags = {
          some: {
            tag: { slug: args.tagSlug },
          },
        };
      }

      if (cursor) {
        where.id = { gt: cursor };
      }

      const [items, count] = await Promise.all([
        prisma.product.findMany({
          where,
          include: {
            images: { where: { productId: { not: null } }, take: 1, orderBy: { position: 'asc' } },
            tags: { include: { tag: true } },
          },
          take: first + 1,
          skip: 0,
          orderBy: { id: 'asc' },
        }),
        prisma.product.count({ where }),
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

builder.queryField("product", (t) =>
  t.field({
    type: Product,
    args: { id: t.arg.string({ required: true }) },
    authScopes: { public: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return catalogService.getProduct(args.id, ctx.tenantId, true);
    },
  })
);

builder.queryField("tags", (t) =>
  t.field({
    type: [Tag],
    authScopes: { public: true },
    resolve: async (_parent, _args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return catalogService.listTags(ctx.tenantId);
    },
  })
);

builder.queryField("suppliers", (t) =>
  t.field({
    type: [Supplier],
    authScopes: { manager: true },
    resolve: async (_parent, _args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return catalogService.listSuppliers(ctx.tenantId);
    },
  })
);

// ─── Mutations ───

builder.mutationField("createProduct", (t) =>
  t.field({
    type: Product,
    args: { input: t.arg({ type: CreateProductInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      await rateLimitGeneral(`product:${ctx.tenantId}`);
      if (input.basePrice < 0) {
        throw new ValidationError("Price cannot be negative");
      }
      const result = moneySchema.safeParse(input.basePrice);
      if (!result.success) throw new ValidationError(result.error.errors[0]?.message ?? "Invalid price");
      return catalogService.createProduct({
        ...input,
        tenantId: ctx.tenantId,
        slug: input.slug ?? undefined,
        description: input.description ?? undefined,
        sku: input.sku ?? undefined,
        tagIds: input.tagIds ?? undefined,
        supplierIds: input.supplierIds ?? undefined,
      });
    },
  })
);

builder.mutationField("updateProduct", (t) =>
  t.field({
    type: Product,
    args: {
      id: t.arg.string({ required: true }),
      input: t.arg({ type: UpdateProductInput, required: true }),
    },
    authScopes: { manager: true },
    resolve: async (_parent, { id, input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      await rateLimitGeneral(`product:${ctx.tenantId}`);
      if (input.basePrice !== undefined && input.basePrice !== null) {
        if (input.basePrice < 0) {
          throw new ValidationError("Price cannot be negative");
        }
        const result = moneySchema.safeParse(input.basePrice);
        if (!result.success) throw new ValidationError(result.error.errors[0]?.message ?? "Invalid price");
      }
      return catalogService.updateProduct(id, {
        tenantId: ctx.tenantId,
        ...input,
        name: input.name ?? undefined,
        slug: input.slug ?? undefined,
        description: input.description ?? undefined,
        sku: input.sku ?? undefined,
        basePrice: input.basePrice ?? undefined,
        isActive: input.isActive ?? undefined,
        isVisible: input.isVisible ?? undefined,
        tagIds: input.tagIds ?? undefined,
      });
    },
  })
);

builder.mutationField("deleteProduct", (t) =>
  t.field({
    type: Product,
    args: { id: t.arg.string({ required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { id }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      await rateLimitGeneral(`product:${ctx.tenantId}`);
      return catalogService.deleteProduct(id, ctx.tenantId);
    },
  })
);

builder.mutationField("createVariant", (t) =>
  t.field({
    type: ProductVariant,
    args: { input: t.arg({ type: CreateVariantInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      await rateLimitGeneral(`variant:${ctx.tenantId}`);
      if (input.price < 0) {
        throw new ValidationError("Price cannot be negative");
      }
      const result = moneySchema.safeParse(input.price);
      if (!result.success) throw new ValidationError(result.error.errors[0]?.message ?? "Invalid price");
      return catalogService.createVariant(input, ctx.tenantId);
    },
  })
);

builder.mutationField("updateVariant", (t) =>
  t.field({
    type: ProductVariant,
    args: {
      id: t.arg.string({ required: true }),
      input: t.arg({ type: UpdateVariantInput, required: true }),
    },
    authScopes: { manager: true },
    resolve: async (_parent, { id, input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      await rateLimitGeneral(`variant:${ctx.tenantId}`);
      if (input.price !== undefined && input.price !== null) {
        if (input.price < 0) {
          throw new ValidationError("Price cannot be negative");
        }
        const result = moneySchema.safeParse(input.price);
        if (!result.success) throw new ValidationError(result.error.errors[0]?.message ?? "Invalid price");
      }
      return catalogService.updateVariant(id, {
        ...input,
        sku: input.sku ?? undefined,
        name: input.name ?? undefined,
        price: input.price ?? undefined,
        isActive: input.isActive ?? undefined,
      }, ctx.tenantId);
    },
  })
);

builder.mutationField("deleteVariant", (t) =>
  t.field({
    type: ProductVariant,
    args: { id: t.arg.string({ required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { id }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      await rateLimitGeneral(`variant:${ctx.tenantId}`);
      return catalogService.deleteVariant(id, ctx.tenantId);
    },
  })
);

builder.mutationField("createTag", (t) =>
  t.field({
    type: Tag,
    args: { input: t.arg({ type: CreateTagInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      await rateLimitGeneral(`tag:${ctx.tenantId}`);
      return catalogService.createTag({
        ...input,
        tenantId: ctx.tenantId,
        slug: input.slug ?? undefined,
      });
    },
  })
);

builder.mutationField("createSupplier", (t) =>
  t.field({
    type: Supplier,
    args: { input: t.arg({ type: CreateSupplierInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      await rateLimitGeneral(`supplier:${ctx.tenantId}`);
      return catalogService.createSupplier({
        ...input,
        tenantId: ctx.tenantId,
        email: input.email ?? undefined,
        phone: input.phone ?? undefined,
        address: input.address ?? undefined,
      });
    },
  })
);

builder.mutationField("createAttribute", (t) =>
  t.field({
    type: ProductAttribute,
    args: { input: t.arg({ type: CreateAttributeInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      if (!input.productId && !input.variantId) {
        throw new ValidationError("Either productId or variantId is required");
      }
      await rateLimitGeneral(`attribute:${ctx.tenantId}`);
      return catalogService.createAttribute({
        ...input,
        tenantId: ctx.tenantId,
        productId: input.productId ?? undefined,
        variantId: input.variantId ?? undefined,
      });
    },
  })
);
