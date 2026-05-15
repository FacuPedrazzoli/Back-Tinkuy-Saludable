import type { Request, Response } from "express";
import { createHmac } from "crypto";
import { MercadoPagoConfig } from "mercadopago";
import { Prisma } from "@prisma/client";
import { prisma } from "@lib/prisma";
import { ValidationError } from "@lib/errors";
import { clearCart, getValidatedCartSnapshot, clearValidatedCartSnapshot } from "@modules/cart/service";
import { createOrderFromCheckout, updateOrderPaymentStatus } from "@modules/orders/service";

const mpConfig = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN ?? "",
});

async function fetchPaymentFromMP(paymentId: string) {
  const { Payment } = await import("mercadopago");
  const paymentClient = new Payment(mpConfig);
  return paymentClient.get({ id: paymentId });
}

function verifyMercadoPagoSignature(payload: string, signature: string, secret: string): boolean {
  const [timestampPart, hashPart] = signature.split(",");
  if (!timestampPart || !hashPart) return false;

  const timestamp = timestampPart.replace("t=", "");
  const expectedHash = hashPart.replace("v1=", "");

  const dataToSign = `${timestamp}${payload}`;
  const hmac = createHmac("sha256", secret);
  hmac.update(dataToSign);
  const computedHash = hmac.digest("hex");

  return computedHash === expectedHash;
}

const TIMEOUT_MS = 30000;

async function processWebhookWithTimeout(req: Request, res: Response): Promise<Response> {
  const signature = req.headers["x-signature"] as string | undefined;
  const webhookSecret = process.env.MP_WEBHOOK_SECRET;

  if (!webhookSecret || !signature) {
    if (process.env.NODE_ENV === "production") {
      console.error("Webhook verification failed: missing secret or signature");
      return res.status(401).json({ error: "Missing webhook credentials" });
    }
    console.warn("Webhook signature not verified in development mode");
  } else {
    const rawPayload = Buffer.isBuffer(req.body) ? req.body.toString() : JSON.stringify(req.body);
    const isValid = verifyMercadoPagoSignature(rawPayload, signature, webhookSecret);
    if (!isValid) {
      console.error("Invalid webhook signature");
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
  }

  const payload = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
  const { type, data } = payload;

  if (type !== "payment") {
    console.warn(`Unknown webhook type received: ${type}`);
    return res.status(400).json({ error: "Only payment events are supported" });
  }

  if (!data?.id) {
    return res.status(400).json({ error: "Missing payment ID in webhook payload" });
  }

  const paymentId = String(data.id);

  const existingEvent = await prisma.webhookEvent.findUnique({
    where: {
      source_eventId: { source: "mercadopago", eventId: paymentId },
    },
  });

  if (existingEvent?.processed) {
    return res.status(200).json({ message: "Already processed" });
  }

  let event;
  try {
    event = await prisma.$transaction(async (tx) => {
      if (existingEvent) {
        const updated = await tx.webhookEvent.updateMany({
          where: {
            source: "mercadopago",
            eventId: paymentId,
            processed: false,
          },
          data: { payload: payload as any, processed: true },
        });
        if (updated.count === 0) {
          return null;
        }
        return tx.webhookEvent.findUnique({
          where: { source_eventId: { source: "mercadopago", eventId: paymentId } },
        });
      } else {
        return tx.webhookEvent.create({
          data: {
            source: "mercadopago",
            eventId: paymentId,
            payload: payload as any,
            processed: true,
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      event = null;
    } else {
      throw error;
    }
  }

  if (!event) {
    return res.status(200).json({ message: "Already processed" });
  }

  try {
    const paymentStatus = payload.data?.status ?? payload.action;

    if (paymentStatus === "payment.created" || paymentStatus === "payment.updated") {
      const mpPayment = await fetchPaymentFromMP(paymentId);
      const status = mpPayment.status;

      if (status === "approved") {
        await processApprovedPayment(payload, mpPayment);
      } else if (status === "rejected" || status === "cancelled") {
        await processRejectedOrCancelledPayment(payload, mpPayment);
      }
    }
  } catch (err) {
    console.error("Error processing webhook:", err);
    return res.status(500).json({ error: "Webhook processing failed" });
  }

  return res.status(200).json({ received: true });
}

export async function handleWebhook(req: Request, res: Response) {
  const timeout = new Promise<Response>((_, reject) =>
    setTimeout(() => reject(new Error("Webhook timeout after 30s")), TIMEOUT_MS)
  );

  const processing = processWebhookWithTimeout(req, res);

  return Promise.race([processing, timeout]).catch((err) => {
    console.error("Webhook error:", err.message);
    return res.status(500).json({ error: "Webhook processing failed" });
  });
}

async function processApprovedPayment(payload: any, mpPayment: any) {
  const preferenceId = payload.data?.preference_id;
  const paymentId = String(payload.data?.id);

  if (!preferenceId) {
    throw new ValidationError("Missing preference ID");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const guestEmail = mpPayment.payer?.email;
  if (guestEmail && !emailRegex.test(guestEmail)) {
    throw new ValidationError("Invalid payer email format");
  }

  const tenantIdFromExtRef = mpPayment.external_reference?.split(":")[0] ?? "";
  const snapshot = await getValidatedCartSnapshot(preferenceId, tenantIdFromExtRef);

  if (!snapshot) {
    console.warn("Cart snapshot not found for webhook", preferenceId);
    await prisma.webhookEvent.updateMany({
      where: { eventId: paymentId, source: "mercadopago" },
      data: { processed: true },
    });
    return;
  }

  const { cart, tenantId, branchId } = snapshot;
  const isUserCart = payload.data?.external_reference?.endsWith(":user") ?? false;

  if (cart.items.length === 0) {
    console.warn("Cart empty or expired for webhook", preferenceId);
    await clearValidatedCartSnapshot(preferenceId, tenantId);
    await prisma.webhookEvent.updateMany({
      where: { eventId: paymentId, source: "mercadopago" },
      data: { processed: true },
    });
    return;
  }

  const cartTotal = cart.items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
  const paidAmount = mpPayment.transaction_amount;

  if (Math.abs(cartTotal - paidAmount) > 0.01) {
    throw new ValidationError(
      `Payment amount mismatch: cart total ${cartTotal}, paid ${paidAmount}`
    );
  }

  const cartId = payload.data?.external_reference?.split(":")[2] ?? "";

  try {
    await createOrderFromCheckout({
      tenantId,
      branchId,
      customerId: isUserCart ? cartId : undefined,
      guestEmail: guestEmail,
      paymentId,
      preferenceId,
      items: cart.items.map((item: any) => ({
        productId: item.productId,
        variantId: item.variantId,
        name: item.name,
        sku: item.sku ?? null,
        price: item.price,
        quantity: item.quantity,
      })),
      totalAmount: cart.totalAmount,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      console.log("Order already exists for paymentId:", paymentId);
    } else {
      throw error;
    }
  }

  await clearCart(cartId, tenantId, isUserCart);
  await clearValidatedCartSnapshot(preferenceId, tenantId);
}

async function processRejectedOrCancelledPayment(payload: any, mpPayment: any) {
  const paymentId = String(payload.data?.id);
  const preferenceId = payload.data?.preference_id;

  if (!preferenceId) {
    console.warn("Missing preference ID in rejected/cancelled payment");
    return;
  }

  const tenantIdFromExtRef = mpPayment.external_reference?.split(":")[0] ?? "";
  const snapshot = await getValidatedCartSnapshot(preferenceId, tenantIdFromExtRef);

  if (!snapshot) {
    console.warn("Cart snapshot not found for rejected/cancelled webhook", preferenceId);
    return;
  }

  const { tenantId } = snapshot;
  const cartId = payload.data?.external_reference?.split(":")[2] ?? "";
  const isUserCart = payload.data?.external_reference?.endsWith(":user") ?? false;

  const existingOrder = await prisma.order.findFirst({
    where: {
      paymentId,
      tenantId,
    },
  });

  if (existingOrder) {
    await updateOrderPaymentStatus(existingOrder.id, "rejected");
  }

  await clearCart(cartId, tenantId, isUserCart);
  await clearValidatedCartSnapshot(preferenceId, tenantId);
}
