import { builder } from "@graphql/builder";
import * as couponService from "./service";
import { ForbiddenError, ValidationError } from "@lib/errors";

export const Coupon = builder.prismaObject("Coupon", {
  fields: (t) => ({
    id: t.exposeID("id"),
    code: t.exposeString("code"),
    description: t.exposeString("description", { nullable: true }),
    discountType: t.exposeString("discountType"),
    discountValue: t.field({ type: "Decimal", resolve: (c) => String(c.discountValue) }),
    minPurchase: t.field({ type: "Decimal", nullable: true, resolve: (c) => c.minPurchase ? String(c.minPurchase) : null }),
    maxUses: t.exposeInt("maxUses", { nullable: true }),
    usesCount: t.exposeInt("usesCount"),
    startsAt: t.expose("startsAt", { type: "DateTime" }),
    expiresAt: t.expose("expiresAt", { type: "DateTime" }),
    isActive: t.exposeBoolean("isActive"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});

const CreateCouponInput = builder.inputType("CreateCouponInput", {
  fields: (t) => ({
    code: t.string({ required: true }),
    description: t.string(),
    discountType: t.string({ required: true }),
    discountValue: t.float({ required: true }),
    minPurchase: t.float(),
    maxUses: t.int(),
    startsAt: t.string({ required: true }),
    expiresAt: t.string({ required: true }),
  }),
});

const UpdateCouponInput = builder.inputType("UpdateCouponInput", {
  fields: (t) => ({
    code: t.string(),
    description: t.string(),
    discountType: t.string(),
    discountValue: t.float(),
    minPurchase: t.float(),
    maxUses: t.int(),
    startsAt: t.string(),
    expiresAt: t.string(),
    isActive: t.boolean(),
  }),
});

builder.queryField("coupons", (t) =>
  t.field({
    type: [Coupon],
    authScopes: { manager: true },
    resolve: async (_parent, _args, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      return couponService.listCoupons(ctx.tenantId);
    },
  })
);

builder.mutationField("createCoupon", (t) =>
  t.field({
    type: Coupon,
    args: { input: t.arg({ type: CreateCouponInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");

      const discountType = input.discountType as "PERCENTAGE" | "FIXED";
      if (discountType !== "PERCENTAGE" && discountType !== "FIXED") {
        throw new ValidationError("discountType must be PERCENTAGE or FIXED");
      }

      return couponService.createCoupon({
        tenantId: ctx.tenantId,
        code: input.code,
        description: input.description ?? null,
        discountType,
        discountValue: input.discountValue,
        minPurchase: input.minPurchase ?? null,
        maxUses: input.maxUses ?? null,
        startsAt: new Date(input.startsAt),
        expiresAt: new Date(input.expiresAt),
      });
    },
  })
);

builder.mutationField("updateCoupon", (t) =>
  t.field({
    type: Coupon,
    args: {
      id: t.arg.string({ required: true }),
      input: t.arg({ type: UpdateCouponInput, required: true }),
    },
    authScopes: { manager: true },
    resolve: async (_parent, { id, input }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");

      const updateData: Parameters<typeof couponService.updateCoupon>[1] = {};

      if (input.code) updateData.code = input.code;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.discountType) {
        const dt = input.discountType as "PERCENTAGE" | "FIXED";
        if (dt !== "PERCENTAGE" && dt !== "FIXED") {
          throw new ValidationError("discountType must be PERCENTAGE or FIXED");
        }
        updateData.discountType = dt;
      }
      if (input.discountValue !== undefined) updateData.discountValue = input.discountValue ?? undefined;
      if (input.minPurchase !== undefined) updateData.minPurchase = input.minPurchase ?? undefined;
      if (input.maxUses !== undefined) updateData.maxUses = input.maxUses ?? undefined;
      if (input.startsAt) updateData.startsAt = new Date(input.startsAt);
      if (input.expiresAt) updateData.expiresAt = new Date(input.expiresAt);
      if (input.isActive !== undefined) updateData.isActive = input.isActive ?? undefined;

      return couponService.updateCoupon(id, updateData, ctx.tenantId);
    },
  })
);

builder.mutationField("deleteCoupon", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { id }, ctx) => {
      if (!ctx.tenantId) throw new ForbiddenError("Tenant ID required");
      await couponService.deleteCoupon(id, ctx.tenantId);
      return true;
    },
  })
);
