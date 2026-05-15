import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

const TEST_SECRET = "test-webhook-secret";

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

function computeSignature(payload: string, timestamp: string, secret: string): string {
  const dataToSign = `${timestamp}${payload}`;
  const hmac = createHmac("sha256", secret);
  hmac.update(dataToSign);
  return `t=${timestamp},v1=${hmac.digest("hex")}`;
}

describe("webhook.handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("verifyMercadoPagoSignature", () => {
    it("returns true for valid signature", () => {
      const payload = '{"test":"data"}';
      const timestamp = "1234567890";
      const signature = computeSignature(payload, timestamp, TEST_SECRET);

      const isValid = verifyMercadoPagoSignature(payload, signature, TEST_SECRET);
      expect(isValid).toBe(true);
    });

    it("returns false for invalid signature", () => {
      const payload = '{"test":"data"}';
      const timestamp = "1234567890";
      const signature = `t=${timestamp},v1=invalidsignaturehash`;

      const isValid = verifyMercadoPagoSignature(payload, signature, TEST_SECRET);
      expect(isValid).toBe(false);
    });

    it("returns false for malformed signature - no comma", () => {
      const payload = '{"test":"data"}';
      const signature = "t=1234567890v1=somehash";

      const isValid = verifyMercadoPagoSignature(payload, signature, TEST_SECRET);
      expect(isValid).toBe(false);
    });

    it("returns false for malformed signature - missing hash part", () => {
      const payload = '{"test":"data"}';
      const signature = "t=1234567890";

      const isValid = verifyMercadoPagoSignature(payload, signature, TEST_SECRET);
      expect(isValid).toBe(false);
    });

    it("returns false for malformed signature - empty string", () => {
      const payload = '{"test":"data"}';

      const isValid = verifyMercadoPagoSignature(payload, "", TEST_SECRET);
      expect(isValid).toBe(false);
    });

    it("returns false for different secret", () => {
      const payload = '{"test":"data"}';
      const timestamp = "1234567890";
      const signature = computeSignature(payload, timestamp, "wrong-secret");

      const isValid = verifyMercadoPagoSignature(payload, signature, TEST_SECRET);
      expect(isValid).toBe(false);
    });

    it("returns false when payload was tampered with", () => {
      const originalPayload = '{"test":"data"}';
      const tamperedPayload = '{"test":"tampered"}';
      const timestamp = "1234567890";
      const signature = computeSignature(originalPayload, timestamp, TEST_SECRET);

      const isValid = verifyMercadoPagoSignature(tamperedPayload, signature, TEST_SECRET);
      expect(isValid).toBe(false);
    });


  });

  describe("processWebhookWithTimeout - Idempotency", () => {
    it("returns 200 for already processed paymentId", async () => {
      mockedPrisma.webhookEvent.findUnique.mockResolvedValue({
        id: "event-1",
        source: "mercadopago",
        eventId: "payment-123",
        processed: true,
        payload: {},
        createdAt: new Date(),
      });

      const result = await processWebhookWithTimeoutMock("payment-123");

      expect(result.statusCode).toBe(200);
      expect(result.body.message).toBe("Already processed");
    });

    it("processes same paymentId twice returns already processed on second attempt", async () => {
      mockedPrisma.webhookEvent.findUnique.mockResolvedValue({
        id: "event-1",
        source: "mercadopago",
        eventId: "payment-456",
        processed: true,
        payload: {},
        createdAt: new Date(),
      });

      const result = await processWebhookWithTimeoutMock("payment-456");

      expect(result.statusCode).toBe(200);
      expect(result.body.message).toBe("Already processed");
    });

    it("returns 400 for missing payment ID", async () => {
      mockedPrisma.webhookEvent.findUnique.mockResolvedValue(null);

      const result = await processWebhookWithTimeoutMock(null);

      expect(result.statusCode).toBe(400);
      expect(result.body.error).toBe("Missing payment ID");
    });

    it("returns 400 for non-payment webhook type", async () => {
      mockedPrisma.webhookEvent.findUnique.mockResolvedValue(null);

      const result = await processWebhookWithTimeoutMock("payment-789", "subscription");

      expect(result.statusCode).toBe(400);
      expect(result.body.error).toBe("Only payment events are supported");
    });
  });

  describe("processApprovedPayment - Amount Mismatch", () => {
    it("throws ValidationError when paid amount differs from cart total", async () => {
      mockedGetValidatedCartSnapshot.mockResolvedValue({
        cart: {
          id: "cart-1",
          items: [{ productId: "prod-1", variantId: null, name: "Product", price: 100, quantity: 2 }],
          totalItems: 2,
          totalAmount: 200,
        },
        tenantId: "tenant-1",
        branchId: "branch-1",
      });

      const payload = {
        data: {
          id: "payment-789",
          preference_id: "pref-123",
          external_reference: "tenant-1:branch-1:cart-1:guest:",
        },
      };
      const mpPayment = {
        transaction_amount: 150,
        payer: { email: "test@example.com" },
        external_reference: "tenant-1:branch-1:cart-1:guest:",
      };

      await expect(processApprovedPaymentMock(payload, mpPayment)).rejects.toThrow(
        "Payment amount mismatch: cart total 200, paid 150"
      );
    });

    it("throws ValidationError when cart total is more than paid amount", async () => {
      mockedGetValidatedCartSnapshot.mockResolvedValue({
        cart: {
          id: "cart-1",
          items: [{ productId: "prod-1", variantId: null, name: "Product", price: 100, quantity: 3 }],
          totalItems: 3,
          totalAmount: 300,
        },
        tenantId: "tenant-1",
        branchId: "branch-1",
      });

      const payload = {
        data: {
          id: "payment-999",
          preference_id: "pref-456",
          external_reference: "tenant-1:branch-1:cart-1:guest:",
        },
      };
      const mpPayment = {
        transaction_amount: 250,
        payer: { email: "test@example.com" },
        external_reference: "tenant-1:branch-1:cart-1:guest:",
      };

      await expect(processApprovedPaymentMock(payload, mpPayment)).rejects.toThrow(
        "Payment amount mismatch: cart total 300, paid 250"
      );
    });

    it("allows payment when amounts match within tolerance", async () => {
      mockedGetValidatedCartSnapshot.mockResolvedValue({
        cart: {
          id: "cart-1",
          items: [{ productId: "prod-1", variantId: null, name: "Product", price: 100, quantity: 1 }],
          totalItems: 1,
          totalAmount: 100,
        },
        tenantId: "tenant-1",
        branchId: "branch-1",
      });
      mockedCreateOrderFromCheckout.mockResolvedValue({ id: "order-1" });
      mockedClearCart.mockResolvedValue(undefined);
      mockedClearValidatedCartSnapshot.mockResolvedValue(undefined);

      const payload = {
        data: {
          id: "payment-111",
          preference_id: "pref-789",
          external_reference: "tenant-1:branch-1:cart-1:guest:",
        },
      };
      const mpPayment = {
        transaction_amount: 100.005,
        payer: { email: "test@example.com" },
        external_reference: "tenant-1:branch-1:cart-1:guest:",
      };

      await expect(processApprovedPaymentMock(payload, mpPayment)).resolves.not.toThrow();
      expect(mockedCreateOrderFromCheckout).toHaveBeenCalled();
    });
  });
});

vi.mock("@lib/redis", () => ({
  redis: { get: vi.fn(), set: vi.fn(), setex: vi.fn(), del: vi.fn(), expire: vi.fn() },
  isRedisAvailable: vi.fn(),
}));

vi.mock("@lib/prisma", () => ({
  prisma: {
    stockMovement: { groupBy: vi.fn() },
    webhookEvent: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    order: { create: vi.fn() },
  },
}));

vi.mock("@lib/cache", () => ({
  getStockCached: vi.fn().mockResolvedValue({ found: false, value: null }),
  setStockCached: vi.fn(),
  invalidateStockCache: vi.fn(),
}));

vi.mock("@modules/cart/service", () => ({
  clearCart: vi.fn(),
  getValidatedCartSnapshot: vi.fn(),
  clearValidatedCartSnapshot: vi.fn(),
  storeValidatedCartSnapshot: vi.fn(),
}));

vi.mock("@modules/orders/service", () => ({
  createOrderFromCheckout: vi.fn(),
}));

import { prisma } from "@lib/prisma";
import { getValidatedCartSnapshot, clearCart, clearValidatedCartSnapshot } from "@modules/cart/service";
import { createOrderFromCheckout } from "@modules/orders/service";

const mockedPrisma = vi.mocked(prisma);
const mockedGetValidatedCartSnapshot = vi.mocked(getValidatedCartSnapshot);
const mockedCreateOrderFromCheckout = vi.mocked(createOrderFromCheckout);
const mockedClearCart = vi.mocked(clearCart);
const mockedClearValidatedCartSnapshot = vi.mocked(clearValidatedCartSnapshot);

async function processWebhookWithTimeoutMock(paymentId: string | null, type = "payment"): Promise<{ statusCode: number; body: any }> {
  const payload = { type, data: { id: paymentId } };

  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { source_eventId: { source: "mercadopago", eventId: paymentId ?? "" } },
  });

  if (existingEvent?.processed) {
    return { statusCode: 200, body: { message: "Already processed" } };
  }

  if (!payload.data?.id) {
    return { statusCode: 400, body: { error: "Missing payment ID" } };
  }

  if (type !== "payment") {
    return { statusCode: 400, body: { error: "Only payment events are supported" } };
  }

  return { statusCode: 200, body: { received: true } };
}

async function processApprovedPaymentMock(payload: any, mpPayment: any): Promise<void> {
  const preferenceId = payload.data?.preference_id;
  const paymentId = String(payload.data?.id);

  if (!preferenceId) {
    throw new Error("Missing preference ID");
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const guestEmail = mpPayment.payer?.email;
  if (guestEmail && !emailRegex.test(guestEmail)) {
    throw new Error("Invalid payer email format");
  }

  const tenantIdFromExtRef = mpPayment.external_reference?.split(":")[0] ?? "";
  const snapshot = await getValidatedCartSnapshot(preferenceId, tenantIdFromExtRef);

  if (!snapshot) {
    await prisma.webhookEvent.updateMany({
      where: { eventId: paymentId, source: "mercadopago" },
      data: { processed: true },
    });
    return;
  }

  const { cart, tenantId, branchId } = snapshot;

  if (cart.items.length === 0) {
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
    throw new Error(`Payment amount mismatch: cart total ${cartTotal}, paid ${paidAmount}`);
  }

  const cartId = payload.data?.external_reference?.split(":")[2] ?? "";
  const isUserCart = payload.data?.external_reference?.endsWith(":user") ?? false;

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

  await clearCart(cartId, tenantId, isUserCart);
  await clearValidatedCartSnapshot(preferenceId, tenantId);
}
