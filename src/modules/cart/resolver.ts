import { builder } from "@graphql/builder";
import * as cartService from "./service";

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
    cartId: t.string(),
    productId: t.string({ required: true }),
    variantId: t.string(),
    name: t.string({ required: true }),
    price: t.float({ required: true }),
    quantity: t.int({ required: true }),
    imageUrl: t.string(),
  }),
});

const UpdateCartItemInput = builder.inputType("UpdateCartItemInput", {
  fields: (t) => ({
    productId: t.string({ required: true }),
    variantId: t.string(),
    quantity: t.int({ required: true }),
  }),
});

// ─── Queries ───

builder.queryField("cart", (t) =>
  t.field({
    type: Cart,
    args: { cartId: t.arg.string({ required: true }) },
    authScopes: { public: true },
    resolve: async (_parent, args) => cartService.getGuestCart(args.cartId),
  })
);

builder.queryField("myCart", (t) =>
  t.field({
    type: Cart,
    authScopes: { customer: true },
    resolve: async (_parent, _args, ctx) => {
      if (!ctx.user) throw new Error("Unauthorized");
      return cartService.getUserCart(ctx.user.id);
    },
  })
);

// ─── Mutations ───

builder.mutationField("createCart", (t) =>
  t.field({
    type: "String",
    authScopes: { public: true },
    resolve: async () => cartService.createGuestCart(),
  })
);

builder.mutationField("addToCart", (t) =>
  t.field({
    type: Cart,
    args: { input: t.arg({ type: AddToCartInput, required: true }) },
    authScopes: { public: true },
    resolve: async (_parent, { input }, ctx) => {
      const isUserCart = !!ctx.user;
      const cartId = input.cartId ?? ctx.user?.id;
      if (!cartId) throw new Error("Cart ID required");

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
        isUserCart
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
      const isUserCart = cartId.startsWith("user:") || !!ctx.user;
      return cartService.updateCartItem(
        cartId,
        input.productId,
        input.quantity,
        input.variantId ?? null,
        isUserCart
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
      const isUserCart = cartId.startsWith("user:") || !!ctx.user;
      return cartService.removeFromCart(cartId, productId, variantId ?? null, isUserCart);
    },
  })
);

builder.mutationField("clearCart", (t) =>
  t.field({
    type: "Boolean",
    args: { cartId: t.arg.string({ required: true }) },
    authScopes: { public: true },
    resolve: async (_parent, { cartId }, ctx) => {
      const isUserCart = cartId.startsWith("user:") || !!ctx.user;
      await cartService.clearCart(cartId, isUserCart);
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
      if (!ctx.user) throw new Error("Unauthorized");
      return cartService.mergeGuestCartIntoUserCart(guestCartId, ctx.user.id);
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
    resolve: async (_parent, { cartId, branchId }) => {
      const cart = await cartService.getGuestCart(cartId);
      return cartService.validateCartStock(cart, branchId);
    },
  })
);
