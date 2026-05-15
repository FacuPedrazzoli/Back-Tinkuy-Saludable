import { prisma } from "@lib/prisma";
import { sendEmail } from "@lib/email";
import { abandonedCartEmail } from "@emails/abandoned-cart";
import { logger } from "@lib/logger";

const ABANDONED_CART_THRESHOLD_HOURS = 24;
const JOB_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface CartItem {
  productId: string;
  variantId: string | null;
  name: string;
  sku?: string | null;
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

interface CartData {
  items: CartItem[];
  totalAmount: number;
}

export async function processAbandonedCarts(): Promise<void> {
  const cutoffTime = new Date();
  cutoffTime.setHours(cutoffTime.getHours() - ABANDONED_CART_THRESHOLD_HOURS);

  const abandonedCarts = await prisma.abandonedCart.findMany({
    where: {
      reminderSentAt: null,
      recoveredAt: null,
      createdAt: { lt: cutoffTime },
    },
    include: {
      customer: {
        select: {
          email: true,
          firstName: true,
        },
      },
    },
  });

  if (abandonedCarts.length === 0) {
    logger.debug({ component: "abandonedCart" }, "No abandoned carts to process");
    return;
  }

  logger.info(
    { component: "abandonedCart", count: abandonedCarts.length },
    "Processing abandoned carts"
  );

  for (const cart of abandonedCarts) {
    try {
      const cartData = cart.cartData as unknown as CartData;
      if (!cartData?.items || cartData.items.length === 0) {
        continue;
      }

      const email = cart.customer?.email ?? cart.email;
      if (!email) {
        logger.warn(
          { component: "abandonedCart", cartId: cart.id },
          "No email found for abandoned cart"
        );
        continue;
      }

      const hoursSinceCreation = Math.floor(
        (Date.now() - cart.createdAt.getTime()) / (1000 * 60 * 60)
      );

      const emailPayload = abandonedCartEmail({
        email,
        firstName: cart.customer?.firstName,
        items: cartData.items.map((item: CartItem) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          imageUrl: item.imageUrl,
        })),
        totalAmount: cartData.totalAmount,
        cartAgeHours: hoursSinceCreation,
      });

      await sendEmail(emailPayload);

      await prisma.abandonedCart.update({
        where: { id: cart.id },
        data: { reminderSentAt: new Date() },
      });

      logger.info(
        { component: "abandonedCart", cartId: cart.id, email },
        "Abandoned cart email sent"
      );
    } catch (error) {
      logger.error(
        { component: "abandonedCart", cartId: cart.id, error },
        "Failed to process abandoned cart"
      );
    }
  }
}

let abandonedCartJobInterval: NodeJS.Timeout | null = null;

export function startAbandonedCartJob(): void {
  if (abandonedCartJobInterval) {
    return;
  }

  logger.info(
    { component: "abandonedCart", intervalMs: JOB_INTERVAL_MS },
    "Starting abandoned cart job"
  );

  processAbandonedCarts().catch((err) =>
    logger.error({ component: "abandonedCart", err }, "Initial abandoned cart job failed")
  );

  abandonedCartJobInterval = setInterval(() => {
    processAbandonedCarts().catch((err) =>
      logger.error({ component: "abandonedCart", err }, "Abandoned cart job failed")
    );
  }, JOB_INTERVAL_MS);
}

export function stopAbandonedCartJob(): void {
  if (abandonedCartJobInterval) {
    clearInterval(abandonedCartJobInterval);
    abandonedCartJobInterval = null;
    logger.info({ component: "abandonedCart" }, "Abandoned cart job stopped");
  }
}
