import { builder } from "@graphql/builder";
import * as mediaService from "./service";
import { ForbiddenError, ValidationError } from "@lib/errors";

export const ProductImage = builder.prismaObject("ProductImage", {
  fields: (t) => ({
    id: t.exposeID("id"),
    url: t.exposeString("url"),
    altText: t.exposeString("altText", { nullable: true }),
    position: t.exposeInt("position"),
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
    position: t.int(),
  }),
});

const UpdateImageInput = builder.inputType("UpdateImageInput", {
  fields: (t) => ({
    url: t.string(),
    altText: t.string(),
    position: t.int(),
  }),
});

builder.mutationField("createImage", (t) =>
  t.field({
    type: ProductImage,
    args: { input: t.arg({ type: CreateImageInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      if (!input.productId && !input.variantId) {
        throw new ValidationError("Either productId or variantId is required");
      }
      return mediaService.createImage({
        ...input,
        tenantId: ctx.tenantId,
        productId: input.productId ?? undefined,
        variantId: input.variantId ?? undefined,
        altText: input.altText ?? undefined,
        position: input.position ?? undefined,
      });
    },
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
    resolve: async (_parent, { id, input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return mediaService.updateImage(id, {
        url: input.url ?? undefined,
        altText: input.altText ?? undefined,
        position: input.position ?? undefined,
      }, ctx.tenantId);
    },
  })
);

builder.mutationField("deleteImage", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { id }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      await mediaService.deleteImage(id, ctx.tenantId);
      return true;
    },
  })
);
