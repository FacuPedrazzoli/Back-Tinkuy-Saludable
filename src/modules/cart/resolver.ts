import { builder } from "@graphql/builder";
import * as cartService from "./service";
import { AuthenticationError, ValidationError } from "@lib/errors";
import { rateLimitGeneral } from "@lib/rate-limit";

// ─── Types ───

interface CartItemShape {
  productId: string;
  variantId?: string | null;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

const CartItem = builder.objectRef<CartItemShape>("CartItem").implement({
  fields: (t) => ({
    productId: t.exposeID("productId"),
    variantId: t.exposeID("variantId", { nullable: true }),
    name: t.exposeString("name"),
    price: t.exposeFloat("price"),
    quantity: t.exposeInt("quantity"),
    imageUrl: t.exposeString("imageUrl", { nullable: true }),
  }),
});

interface CartShape {
  id: string;
  items: CartItemShape[] | { productId: string; variantId?: string | null; name: string; price: number; quantity: number; imageUrl?: string | null }[];
  totalItems: number;
  totalAmount: number;
}

const Cart = builder.objectRef<CartShape>("Cart").implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    items: t.field({
      type: [CartItem],
      resolve: (parent) => parent.items,
    }),
    totalItems: t.exposeInt("totalItems"),
    totalAmount: t.exposeFloat("totalAmount"),
  }),
});

interface StockValidationResultShape {
  valid: boolean;
  errors: string[];
}

const StockValidationResult = builder.objectRef<StockValidationResultShape>("StockValidationResult").implement({
  fields: (t) => ({
    valid: t.exposeBoolean("valid"),
    errors: t.field({ type: ["String"], resolve: (parent) => parent.errors }),
  }),
});

// ─── Inputs ───

const AddToCartInput = builder.inputType("AddToCartInput", {
  fields: (t) => ({
    cartId: t.string({ maxLength: 64 }),
    productId: t.string({ required: true, maxLength: 64 }),
    variantId: t.string({ maxLength: 64 }),
    name: t.string({ required: true, maxLength: 255 }),
    price: t.float({ required: true }),
    quantity: t.int({ required: true, minValue: 1 }),
    imageUrl: t.string({ maxLength: 2048 }),
  }),
});

const UpdateCartItemInput = builder.inputType("UpdateCartItemInput", {
  fields: (t) => ({
    productId: t.string({ required: true, maxLength: 64 }),
    variantId: t.string({ maxLength: 64 }),
    quantity: t.int({ required: true, minValue: 0 }),
  }),
});

// ─── Queries ───

builder.queryField("cart", (t) =>
  t.field({
    type: Cart,
    args: { cartId: t.arg.string({ required: true }) },
    authScopes: { public: true },
    resolve: async (_parent, args, ctx) => {
      const cartId = args.cartId;
      if (!cartId || cartId.length < 10 || cartId.length > 100) {
        throw new ValidationError("Invalid cart ID format");
      }
      const isUserCart = !!ctx.user;
      const tenantId = ctx.tenantId ?? "";
      return cartService.getGuestCart(cartId, tenantId, isUserCart);
    },
  })
);

builder.queryField("myCart", (t) =>
  t.field({
    type: Cart,
    authScopes: { customer: true },
    resolve: async (_parent, _args, ctx) => {
      if (!ctx.user) throw new AuthenticationError("Unauthorized");
      const tenantId = ctx.tenantId ?? "";
      return cartService.getUserCart(ctx.user.id, tenantId);
    },
  })
);

// ─── Mutations ───

builder.mutationField("createCart", (t) =>
  t.field({
    type: "String",
    authScopes: { public: true },
    resolve: async (_parent, _args, ctx) => {
      const tenantId = ctx.tenantId ?? "";
      return cartService.createGuestCart(tenantId);
    },
  })
);

builder.mutationField("addToCart", (t) =>
  t.field({
    type: Cart,
    args: { input: t.arg({ type: AddToCartInput, required: true }) },
    authScopes: { public: true },
    resolve: async (_parent, { input }, ctx) => {
      const identifier = ctx.user?.id ?? ctx.req.ip ?? "anonymous";
      await rateLimitGeneral(`addToCart:${identifier}`);
      if (input.price < 0) {
        throw new ValidationError("Price cannot be negative");
      }
      if (input.quantity <= 0) {
        throw new ValidationError("Quantity must be positive");
      }
      const isUserCart = !!ctx.user;
      const cartId = input.cartId ?? ctx.user?.id;
      if (!cartId) throw new ValidationError("Cart ID required");
      const tenantId = ctx.tenantId ?? "";

      return cartService.addToCart(
        cartId,
        {
          productId: input.productId,
          variantId: input.variantId ?? null,
          name: input.name,
          price: input.price,
          quantity: input.quantity,
          imageUrl: input.imageUrl ?? null,
        },
        isUserCart,
        tenantId
      );
    },
  })
);

builder.mutationField("updateCartItem", (t) =>
  t.field({
    type: Cart,
    args: {
      cartId: t.arg.string({ required: true }),
      input: t.arg({ type: UpdateCartItemInput, required: true }),
    },
    authScopes: { public: true },
    resolve: async (_parent, { cartId, input }, ctx) => {
      const identifier = ctx.user?.id ?? ctx.req.ip ?? "anonymous";
      await rateLimitGeneral(`updateCartItem:${identifier}`);
      const isUserCart = cartId.startsWith("user:") || !!ctx.user;
      const tenantId = ctx.tenantId ?? "";
      return cartService.updateCartItem(
        cartId,
        input.productId,
        input.quantity,
        input.variantId ?? null,
        isUserCart,
        tenantId
      );
    },
  })
);

builder.mutationField("removeFromCart", (t) =>
  t.field({
    type: Cart,
    args: {
      cartId: t.arg.string({ required: true }),
      productId: t.arg.string({ required: true }),
      variantId: t.arg.string(),
    },
    authScopes: { public: true },
    resolve: async (_parent, { cartId, productId, variantId }, ctx) => {
      const identifier = ctx.user?.id ?? ctx.req.ip ?? "anonymous";
      await rateLimitGeneral(`removeFromCart:${identifier}`);
      const isUserCart = cartId.startsWith("user:") || !!ctx.user;
      const tenantId = ctx.tenantId ?? "";
      return cartService.removeFromCart(cartId, productId, variantId ?? null, isUserCart, tenantId);
    },
  })
);

builder.mutationField("clearCart", (t) =>
  t.field({
    type: "Boolean",
    args: { cartId: t.arg.string({ required: true }) },
    authScopes: { public: true },
    resolve: async (_parent, { cartId }, ctx) => {
      const identifier = ctx.user?.id ?? ctx.req.ip ?? "anonymous";
      await rateLimitGeneral(`clearCart:${identifier}`);
      const isUserCart = cartId.startsWith("user:") || !!ctx.user;
      const tenantId = ctx.tenantId ?? "";
      await cartService.clearCart(cartId, tenantId, isUserCart);
      return true;
    },
  })
);

builder.mutationField("mergeCart", (t) =>
  t.field({
    type: Cart,
    args: { guestCartId: t.arg.string({ required: true }) },
    authScopes: { customer: true },
    resolve: async (_parent, { guestCartId }, ctx) => {
      if (!ctx.user) throw new AuthenticationError("Unauthorized");
      const tenantId = ctx.tenantId ?? "";
      return cartService.mergeGuestCartIntoUserCart(guestCartId, ctx.user.id, tenantId);
    },
  })
);

builder.queryField("validateCartStock", (t) =>
  t.field({
    type: StockValidationResult,
    args: {
      cartId: t.arg.string({ required: true }),
      branchId: t.arg.string({ required: true }),
    },
    authScopes: { public: true },
    resolve: async (_parent, { cartId, branchId }, ctx) => {
      const tenantId = ctx.tenantId ?? "";
      const cart = await cartService.getGuestCart(cartId, tenantId);
      return cartService.validateCartStock(cart, branchId);
    },
  })
);
