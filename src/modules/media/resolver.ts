import { builder } from "@graphql/builder";
import * as mediaService from "./service";

export const ProductImage = builder.prismaObject("ProductImage", {
  fields: (t) => ({
    id: t.exposeID("id"),
    url: t.exposeString("url"),
    altText: t.exposeString("altText", { nullable: true }),
    sortOrder: t.exposeInt("sortOrder"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    product: t.relation("product", { nullable: true }),
    variant: t.relation("variant", { nullable: true }),
  }),
});

const CreateImageInput = builder.inputType("CreateImageInput", {
  fields: (t) => ({
    productId: t.string(),
    variantId: t.string(),
    url: t.string({ required: true }),
    altText: t.string(),
    sortOrder: t.int(),
  }),
});

const UpdateImageInput = builder.inputType("UpdateImageInput", {
  fields: (t) => ({
    url: t.string(),
    altText: t.string(),
    sortOrder: t.int(),
  }),
});

builder.mutationField("createImage", (t) =>
  t.field({
    type: ProductImage,
    args: { input: t.arg({ type: CreateImageInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }) => mediaService.createImage({
      ...input,
      productId: input.productId ?? undefined,
      variantId: input.variantId ?? undefined,
      altText: input.altText ?? undefined,
      sortOrder: input.sortOrder ?? undefined,
    }),
  })
);

builder.mutationField("updateImage", (t) =>
  t.field({
    type: ProductImage,
    args: {
      id: t.arg.string({ required: true }),
      input: t.arg({ type: UpdateImageInput, required: true }),
    },
    authScopes: { manager: true },
    resolve: async (_parent, { id, input }) => mediaService.updateImage(id, {
      url: input.url ?? undefined,
      altText: input.altText ?? undefined,
      sortOrder: input.sortOrder ?? undefined,
    }),
  })
);

builder.mutationField("deleteImage", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { id }) => {
      await mediaService.deleteImage(id);
      return true;
    },
  })
);
