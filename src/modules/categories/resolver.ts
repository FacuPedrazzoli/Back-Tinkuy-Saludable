import { builder } from "@graphql/builder";
import * as categoryService from "./service";
import { ForbiddenError } from "@lib/errors";

export const Category = builder.objectRef<{
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  productCount: number;
}>("Category").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    name: t.exposeString("name"),
    slug: t.exposeString("slug"),
    description: t.exposeString("description", { nullable: true }),
    imageUrl: t.exposeString("imageUrl", { nullable: true }),
    parentId: t.exposeString("parentId", { nullable: true }),
    sortOrder: t.exposeInt("sortOrder"),
    isActive: t.exposeBoolean("isActive"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    productCount: t.exposeInt("productCount"),
  }),
});

const CreateCategoryInput = builder.inputType("CreateCategoryInput", {
  fields: (t) => ({
    name: t.string({ required: true, validate: { maxLength: 255 } }),
    slug: t.string({ validate: { maxLength: 120 } }),
    description: t.string({ validate: { maxLength: 1000 } }),
    imageUrl: t.string({ validate: { maxLength: 2048 } }),
    parentId: t.string({ validate: { maxLength: 64 } }),
    sortOrder: t.int(),
  }),
});

const UpdateCategoryInput = builder.inputType("UpdateCategoryInput", {
  fields: (t) => ({
    name: t.string({ validate: { maxLength: 255 } }),
    slug: t.string({ validate: { maxLength: 120 } }),
    description: t.string({ validate: { maxLength: 1000 } }),
    imageUrl: t.string({ validate: { maxLength: 2048 } }),
    parentId: t.string({ validate: { maxLength: 64 } }),
    sortOrder: t.int(),
    isActive: t.boolean(),
  }),
});

const ReorderCategoriesInput = builder.inputType("ReorderCategoriesInput", {
  fields: (t) => ({
    orderedIds: t.stringList({ required: true }),
  }),
});

builder.queryField("categories", (t) =>
  t.field({
    type: [Category],
    authScopes: { public: true },
    resolve: async (_parent, _args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return categoryService.listCategories(ctx.tenantId);
    },
  })
);

builder.mutationField("createCategory", (t) =>
  t.field({
    type: Category,
    args: { input: t.arg({ type: CreateCategoryInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");

      const result = await categoryService.createCategory({
        tenantId: ctx.tenantId,
        name: input.name,
        slug: input.slug ?? undefined,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        parentId: input.parentId ?? null,
        sortOrder: input.sortOrder ?? 0,
      });

      return { ...result, productCount: 0 };
    },
  })
);

builder.mutationField("updateCategory", (t) =>
  t.field({
    type: Category,
    args: {
      id: t.arg.string({ required: true }),
      input: t.arg({ type: UpdateCategoryInput, required: true }),
    },
    authScopes: { manager: true },
    resolve: async (_parent, { id, input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");

      const result = await categoryService.updateCategory(id, {
        name: input.name ?? undefined,
        slug: input.slug ?? undefined,
        description: input.description !== undefined ? input.description : undefined,
        imageUrl: input.imageUrl !== undefined ? input.imageUrl : undefined,
        parentId: input.parentId !== undefined ? input.parentId : undefined,
        sortOrder: input.sortOrder ?? undefined,
        isActive: input.isActive ?? undefined,
      }, ctx.tenantId);

      return { ...result, productCount: 0 };
    },
  })
);

builder.mutationField("deleteCategory", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { id }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      await categoryService.deleteCategory(id, ctx.tenantId);
      return true;
    },
  })
);

builder.mutationField("reorderCategories", (t) =>
  t.field({
    type: [Category],
    args: { input: t.arg({ type: ReorderCategoriesInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return categoryService.reorderCategories(ctx.tenantId, input.orderedIds);
    },
  })
);
