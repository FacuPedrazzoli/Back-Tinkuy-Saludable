import { builder } from "@graphql/builder";
import * as inventoryService from "./service";

export const StockMovement = builder.prismaObject("StockMovement", {
  fields: (t) => ({
    id: t.exposeID("id"),
    type: t.exposeString("type"),
    quantity: t.exposeInt("quantity"),
    reason: t.exposeString("reason", { nullable: true }),
    referenceId: t.exposeString("referenceId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    branch: t.relation("branch"),
    product: t.relation("product"),
    variant: t.relation("variant", { nullable: true }),
  }),
});

const CreateStockMovementInput = builder.inputType("CreateStockMovementInput", {
  fields: (t) => ({
    branchId: t.string({ required: true }),
    productId: t.string({ required: true }),
    variantId: t.string(),
    type: t.string({ required: true }),
    quantity: t.int({ required: true }),
    reason: t.string(),
    referenceId: t.string(),
  }),
});

interface StockMovementListShape {
  items: Awaited<ReturnType<typeof inventoryService.listStockMovements>>["items"];
  count: number;
}

const StockMovementList = builder.objectRef<StockMovementListShape>("StockMovementList").implement({
  fields: (t2) => ({
    items: t2.field({
      type: [StockMovement],
      resolve: (parent) => parent.items,
    }),
    count: t2.exposeInt("count"),
  }),
});

builder.queryField("stockMovements", (t) =>
  t.field({
    type: StockMovementList,
    args: {
      branchId: t.arg.string(),
      productId: t.arg.string(),
      variantId: t.arg.string(),
      take: t.arg.int({ defaultValue: 20 }),
      skip: t.arg.int({ defaultValue: 0 }),
    },
    authScopes: { manager: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new Error("Tenant ID required");
      return inventoryService.listStockMovements({
        tenantId: ctx.tenantId,
        branchId: args.branchId ?? undefined,
        productId: args.productId ?? undefined,
        variantId: args.variantId ?? undefined,
        take: args.take ?? 20,
        skip: args.skip ?? 0,
      });
    },
  })
);

builder.queryField("stock", (t) =>
  t.field({
    type: "Int",
    args: {
      branchId: t.arg.string({ required: true }),
      productId: t.arg.string({ required: true }),
      variantId: t.arg.string(),
    },
    authScopes: { manager: true },
    resolve: async (_parent, args, ctx) => {
      if (!ctx.tenantId) throw new Error("Tenant ID required");
      return inventoryService.getStock({
        tenantId: ctx.tenantId,
        branchId: args.branchId,
        productId: args.productId,
        variantId: args.variantId ?? null,
      });
    },
  })
);

builder.mutationField("createStockMovement", (t) =>
  t.field({
    type: StockMovement,
    args: { input: t.arg({ type: CreateStockMovementInput, required: true }) },
    authScopes: { manager: true },
    resolve: async (_parent, { input }, ctx) => {
      if (!ctx.tenantId) throw new Error("Tenant ID required");
      return inventoryService.createStockMovement({
        ...input,
        tenantId: ctx.tenantId,
        type: input.type as "INBOUND" | "OUTBOUND" | "ADJUSTMENT" | "TRANSFER",
        variantId: input.variantId ?? undefined,
        reason: input.reason ?? undefined,
        referenceId: input.referenceId ?? undefined,
      });
    },
  })
);
