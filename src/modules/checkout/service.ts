import { ValidationError } from "@lib/errors";
import { createPreference, type CartItemForCheckout } from "@lib/mercadopago";
import { getGuestCart, getUserCart, validateCartStock, storeValidatedCartSnapshot } from "@modules/cart/service";
import { prisma } from "@lib/prisma";

export async function createCheckout(input: {
  cartId: string;
  tenantId: string;
  branchId: string;
  customerId?: string;
  guestEmail?: string;
  frontendUrl: string;
  webhookUrl: string;
  isUserCart?: boolean;
}) {
  const cart = input.isUserCart
    ? await getUserCart(input.cartId)
    : await getGuestCart(input.cartId);

  if (cart.items.length === 0) {
    throw new ValidationError("Cart is empty");
  }

  const productIds = cart.items.map((i) => i.productId);
  const variantIds = cart.items.map((i) => i.variantId).filter(Boolean);

  const [products, variants] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds }, tenantId: input.tenantId },
      select: { id: true, basePrice: true },
    }),
    variantIds.length > 0
      ? prisma.productVariant.findMany({
          where: { id: { in: variantIds as string[] }, productId: { in: productIds } },
          select: { id: true, price: true },
        })
      : Promise.resolve([]),
  ]);

  const productPriceMap = new Map(products.map((p) => [p.id, p.basePrice]));
  const variantPriceMap = new Map(variants.map((v) => [v.id, v.price]));

  for (const item of cart.items) {
    const expectedPrice = item.variantId
      ? variantPriceMap.get(item.variantId) ?? productPriceMap.get(item.productId)
      : productPriceMap.get(item.productId);

    if (expectedPrice === undefined) {
      throw new ValidationError(`Product or variant not found: ${item.productId}`);
    }
    const itemPriceNum = Number(item.price);
    const expectedPriceNum = Number(expectedPrice);
    if (Math.abs(itemPriceNum - expectedPriceNum) > 0.01) {
      throw new ValidationError(
        `Price mismatch for ${item.name}: cart has ${itemPriceNum}, expected ${expectedPriceNum}`
      );
    }
  }

  const stockCheck = await validateCartStock(cart, input.branchId);
  if (!stockCheck.valid) {
    throw new ValidationError(stockCheck.errors.join("; "));
  }

  const items: CartItemForCheckout[] = cart.items.map((item) => ({
    id: item.variantId ?? item.productId,
    title: item.name,
    unit_price: item.price,
    quantity: item.quantity,
    currency_id: "ARS",
  }));

  const totalAmount = cart.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const preference = await createPreference({
    items,
    external_reference: `${input.tenantId}:${input.branchId}:${input.cartId}:${input.isUserCart ? "user" : "guest"}:${input.customerId ?? ""}`,
    notification_url: input.webhookUrl,
    back_urls: {
      success: `${input.frontendUrl}/checkout/success`,
      failure: `${input.frontendUrl}/checkout/failure`,
      pending: `${input.frontendUrl}/checkout/pending`,
    },
    payer: input.guestEmail
      ? { email: input.guestEmail }
      : undefined,
  });

  await storeValidatedCartSnapshot(cart, input.tenantId, input.branchId, preference.id ?? "");

  return {
    preferenceId: preference.id,
    initPoint: preference.init_point,
    sandboxInitPoint: preference.sandbox_init_point,
    totalAmount,
  };
}
