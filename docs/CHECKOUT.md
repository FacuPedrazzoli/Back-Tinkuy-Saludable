# Checkout & Payment Flow Documentation

## Overview

This document describes the checkout and payment flow for the Tinkuy Saludable backend, including MercadoPago integration, webhook handling, and inventory management.

---

## 1. Checkout Initiation

### Sequence Diagram

```
┌─────────┐          ┌─────────────┐          ┌─────────────┐          ┌──────────────┐
│ Client  │          │ GraphQL API │          │   Cart Svc  │          │ MercadoPago  │
└────┬────┘          └──────┬──────┘          └──────┬──────┘          └──────┬───────┘
     │                       │                       │                       │
     │ checkout(cartId,      │                       │                       │
     │        branchId,      │                       │                       │
     │        guestEmail?)   │                       │                       │
     │──────────────────────>│                       │                       │
     │                       │                       │                       │
     │                       │ getUserCart/getGuestCart                      │
     │                       │───────────────────────>                       │
     │                       │                       │                       │
     │                       │              validateCartStock                │
     │                       │                       │                       │
     │                       │                       │ storeValidatedCartSnapshot
     │                       │                       │──────┐                │
     │                       │                       │      │ (Redis)         │
     │                       │                       │<─────┘                │
     │                       │                       │                       │
     │                       │                       │ createPreference      │
     │                       │                       │─────────────────────>│
     │                       │                       │                       │
     │                       │                       │   preferenceId       │
     │                       │                       │   initPoint          │
     │                       │                       │<─────────────────────│
     │                       │                       │                       │
     │ { preferenceId,       │                       │                       │
     │   initPoint,          │                       │                       │
     │   totalAmount }       │                       │                       │
     │<──────────────────────│                       │                       │
```

### Process Details

1. **GraphQL Mutation**: Client calls `checkout(input: CheckoutInput)` mutation
2. **Cart Validation**: Retrieves cart and validates:
   - Cart is not empty
   - Product prices match current database prices (price mismatch protection)
   - Stock is available via `validateCartStock()`
3. **Snapshot Storage**: Cart contents are stored in Redis with key pattern:
   ```
   checkout:{tenantId}:snapshot:{preferenceId}
   ```
   - TTL: 24 hours
   - Contains: cart items, tenantId, branchId, validation timestamp
4. **MercadoPago Preference**: Creates a payment preference containing:
   - Items with prices and quantities
   - External reference: `{tenantId}:{branchId}:{cartId}:{userType}:{customerId}`
   - Webhook URL for payment notifications
   - Success/failure/pending redirect URLs

### External Reference Format

```
tenantId:branchId:cartId:userType:customerId
```

Example: `abc123:branch-456:cart-789:user:customer-001`

The `userType` is either `user` or `guest`.

---

## 2. MercadoPago Integration

### Configuration

```typescript
// src/lib/mercadopago.ts
const mpConfig = new MercadoPagoConfig({
  accessToken: config.mercadoPago.accessToken,
});
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `MP_ACCESS_TOKEN` | MercadoPago access token |
| `MP_WEBHOOK_SECRET` | Secret for webhook signature verification |

### Test Mode Fallback

When `MP_ACCESS_TOKEN` is not configured or mode is `test`, the system returns mock preferences:
```typescript
{
  id: `mock-pref-${Date.now()}`,
  init_point: `https://www.mercadopago.com.ar/checkout/start?pref_id=${Date.now()}`,
  sandbox_init_point: `https://sandbox.mercadopago.com.ar/checkout/start?pref_id=${Date.now()}`,
}
```

### Circuit Breaker

MercadoPago calls are protected by a circuit breaker (`src/lib/circuit-breaker.ts`) that:
- Opens after 5 consecutive failures
- Stays open for 30 seconds
- Allows 3 retry attempts with exponential backoff

---

## 3. Webhook Handling

### Endpoint

```
POST /webhooks/mercadopago
Content-Type: application/json
X-Signature: t={timestamp},v1={signature}
```

### Sequence Diagram

```
┌──────────────┐          ┌─────────────┐          ┌──────────────┐
│ MercadoPago  │          │  Express    │          │   Database   │
└──────┬───────┘          └──────┬──────┘          └───────┬──────┘
       │                         │                       │
       │ POST /webhooks/mercadopago                       │
       │ payment.created/updated                          │
       │────────────────────────>│                       │
       │                         │                       │
       │                         │ verifyMercadoPagoSignature
       │                         │──────┐                 │
       │                         │      │ HMAC-SHA256     │
       │                         │<─────┘                 │
       │                         │                       │
       │                         │ check WebhookEvent    │
       │                         │──────────────────────>│
       │                         │                       │
       │                         │     Already processed?│
       │                         │<──────────────────────│
       │                         │                       │
       │                         │ $transaction:         │
       │                         │ create/update         │
       │                         │ WebhookEvent          │
       │                         │──────────────────────>│
       │                         │                       │
       │                         │ fetchPaymentFromMP    │
       │                         │ (get payment details) │
       │                         │                       │
       │                         │ payment approved?     │
       │                         │──────────────────────>│
       │                         │                       │
       │                         │ createOrderFromCheckout
       │                         │──────────────────────>│
       │                         │                       │
       │                         │ clearCart            │
       │                         │ clearValidatedCartSnapshot
       │                         │──────────────────────>│
       │                         │                       │
       │ 200 OK                 │                       │
       │<────────────────────────│                       │
```

### Webhook Payload Structure

```json
{
  "type": "payment",
  "data": {
    "id": "payment-id-123",
    "status": "approved",
    "preference_id": "pref-id-456",
    "external_reference": "tenantId:branchId:cartId:userType:customerId"
  },
  "action": "payment.created"
}
```

---

## 4. Race Condition Prevention

### Idempotency Table

```prisma
model WebhookEvent {
  id        String   @id @default(uuid())
  source    String   // "mercadopago"
  eventId   String   // payment ID
  payload   Json
  processed Boolean  @default(false)

  @@unique([source, eventId])
}
```

### Prevention Logic

```typescript
// src/modules/checkout/webhook.handler.ts

// 1. Check if already processed
const existingEvent = await prisma.webhookEvent.findUnique({
  where: {
    source_eventId: { source: "mercadopago", eventId: paymentId },
  },
});

if (existingEvent?.processed) {
  return res.status(200).json({ message: "Already processed" });
}

// 2. Use transaction with conditional update
event = await prisma.$transaction(async (tx) => {
  if (existingEvent) {
    // Try to claim this event (only if not yet processed)
    const updated = await tx.webhookEvent.updateMany({
      where: {
        source_eventId: { source: "mercadopago", eventId: paymentId },
        processed: false,
      },
      data: { payload, processed: true },
    });
    if (updated.count === 0) {
      return null; // Another process claimed it
    }
    return tx.webhookEvent.findUnique({ ... });
  } else {
    // Create new event atomically
    return tx.webhookEvent.create({
      data: {
        source: "mercadopago",
        eventId: paymentId,
        payload,
        processed: true,
      },
    });
  }
});
```

### How It Prevents Race Conditions

1. **First webhook arrives**: Creates `WebhookEvent` with `processed=true`
2. **Duplicate webhook arrives**: `findUnique` finds the event, but `updateMany` with `processed=false` condition updates 0 rows
3. **Result**: Returns "Already processed" without double-processing

---

## 5. Signature Verification

### Algorithm

```
signature = "t={timestamp},v1={hmac_sha256}"
hmac_sha256 = HMAC-SHA256(secret, timestamp + payload)
```

### Implementation

```typescript
// src/modules/checkout/webhook.handler.ts

function verifyMercadoPagoSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
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
```

### Verification Steps

1. Extract `timestamp` and `hash` from signature header
2. Concatenate: `timestamp + raw_payload`
3. Compute HMAC-SHA256 using webhook secret
4. Compare computed hash with provided hash

### Security Notes

- In **development mode**: Signature verification is skipped (warning logged)
- In **production mode**: Missing signature or secret returns 401

---

## 6. Order Status Transitions

### State Machine

```
                    ┌──────────────┐
                    │   pending    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            │
     ┌────────────┐        │    ┌────────────┐
     │ confirmed  │        │    │ cancelled  │
     └──────┬─────┘        │    └────────────┘
            │              │
     ┌──────┴──────┐       │
     │             │       │
     ▼             ▼       │
┌────────────┐ ┌────────────┐
│ cancelled  │ │ refunded  │
└────────────┘ └────────────┘
```

### Valid Transitions

| From | To | Description |
|------|-----|-------------|
| `pending` | `confirmed` | Order confirmed by merchant |
| `pending` | `cancelled` | Order cancelled before confirmation |
| `confirmed` | `cancelled` | Order cancelled after confirmation |
| `confirmed` | `refunded` | Payment refunded to customer |
| `cancelled` | - | Terminal state |
| `refunded` | - | Terminal state |

### Transition Validation Code

```typescript
// src/modules/orders/service.ts

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "refunded"],
  cancelled: [],
  refunded: [],
};

export async function updateOrderStatus(id, newStatus, tenantId) {
  const order = await tx.order.findUnique({ where: { id, tenantId } });
  const allowedTransitions = VALID_TRANSITIONS[order.status];

  if (!allowedTransitions.includes(newStatus)) {
    throw new ValidationError(
      `Invalid status transition from "${order.status}" to "${newStatus}"`
    );
  }
  // ... perform update
}
```

---

## 7. Inventory Update After Payment

### Process Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Order     │     │   Stock     │     │   Order     │     │   Cache     │
│  Created    │────>│  Movement   │────>│   Cache     │────>│ Invalidation│
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

### Order Creation with Inventory

```typescript
// src/modules/orders/service.ts

export async function createOrderFromCheckout(input) {
  return prisma.$transaction(async (tx) => {
    // 1. Lock stock rows to prevent overselling
    const stockResults = await tx.$queryRaw`
      SELECT "productId", "variantId", COALESCE(SUM(quantity), 0) as total
      FROM "StockMovement"
      WHERE "tenantId" = ${input.tenantId}
        AND "branchId" = ${input.branchId}
        AND ("productId", COALESCE("variantId"::text, 'null')) IN (
          SELECT productId, variantId FROM UNNEST(${productIdsArr}, ${variantIdsArr}) AS t(productId, variantId)
        )
      GROUP BY "productId", "variantId"
      FOR UPDATE  -- ← Row-level lock
    `;

    // 2. Verify stock still available
    for (const item of input.items) {
      const currentStock = Number(stockMap.get(`${item.productId}:${item.variantId ?? "null"}`) ?? 0);
      if (currentStock < item.quantity) {
        throw new ValidationError(`Insufficient stock for ${item.name}`);
      }
    }

    // 3. Create order
    const order = await tx.order.create({
      data: {
        status: "pending",
        paymentStatus: "pending",
        // ... other fields
      }
    });

    // 4. Create OUTBOUND stock movements (deduct inventory)
    const stockMovementData = input.items.map((item) => ({
      tenantId: input.tenantId,
      branchId: input.branchId,
      productId: item.productId,
      variantId: item.variantId,
      type: "OUTBOUND",  // ← Negative quantity
      quantity: -item.quantity,
      reason: `Order ${order.id}`,
      referenceId: order.id,
    }));

    await tx.stockMovement.createMany({ data: stockMovementData });

    // 5. Invalidate stock cache
    await Promise.all(
      input.items.map((item) =>
        invalidateStockCache(item.productId, input.branchId, item.variantId, input.tenantId)
      )
    );

    return order;
  });
}
```

### Stock Movement Types

| Type | Quantity | Use Case |
|------|----------|----------|
| `OUTBOUND` | Negative | Order placed (deducts inventory) |
| `INBOUND` | Positive | Order cancelled/refunded (returns inventory) |
| `ADJUSTMENT` | +/- | Manual inventory corrections |
| `TRANSFER` | +/- | Stock transferred between branches |

### Inventory Restoration on Cancellation/Refund

```typescript
// When order is cancelled or refunded
if (newStatus === "cancelled" || newStatus === "refunded") {
  // Create INBOUND movements to restore stock
  const stockMovementData = updatedOrder.items.map((item) => ({
    tenantId: order.tenantId,
    branchId: order.branchId,
    productId: item.productId,
    variantId: item.variantId,
    type: "INBOUND",  // ← Positive quantity (restore)
    quantity: item.quantity,
    reason: `${newStatus} order ${order.id}`,
    referenceId: order.id,
  }));

  await tx.stockMovement.createMany({ data: stockMovementData });

  // Invalidate cache so subsequent reads see updated stock
  await Promise.all(
    updatedOrder.items.map((item) =>
      invalidateStockCache(item.productId, order.branchId, item.variantId, order.tenantId)
    )
  );
}
```

---

## 8. Payment Status Updates

### Order Payment Status Flow

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ pending  │───>│ approved │───>│ rejected │    │ cancelled│
└──────────┘    └──────────┘    └──────────┘    └──────────┘
                    │                                   ▲
                    │                                   │
                    └───────────────────────────────────┘
                         (refund)
```

### Payment Status Codes

| Status | Description | Inventory Impact |
|--------|-------------|------------------|
| `pending` | Payment initiated, not completed | None yet |
| `approved` | Payment successful | Creates OUTBOUND movements |
| `rejected` | Payment declined | Restores INBOUND movements |
| `cancelled` | Payment cancelled by user | Restores INBOUND movements |
| `refunded` | Payment refunded | Restores INBOUND movements |

---

## 9. Cart Snapshot Flow

### Why Snapshots?

The cart snapshot preserves the exact items and prices at checkout time because:
1. Cart contents may change between checkout start and payment completion
2. Product prices may be updated
3. Items may go out of stock

### Snapshot Storage

```typescript
// Key format: checkout:{tenantId}:snapshot:{preferenceId}
interface CartSnapshot {
  cart: Cart;
  tenantId: string;
  branchId: string;
  validatedAt: number; // timestamp
}

// TTL: 24 hours
// Storage: Redis (or in-memory fallback)
```

### Snapshot Lifecycle

```
1. checkout() called ──────> storeValidatedCartSnapshot() ──────> Redis
                                                                           │
2. Webhook receives ──────> getValidatedCartSnapshot() ─────────> Redis
                                                                           │
3. Order created ─────────> clearValidatedCartSnapshot() ───────> Redis deleted
```

---

## 10. Environment Variables Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `MP_ACCESS_TOKEN` | Yes (prod) | MercadoPago API access token |
| `MP_WEBHOOK_SECRET` | Yes (prod) | Webhook signature verification secret |
| `FRONTEND_URL` | Yes (prod) | Frontend base URL for redirects |
| `REDIS_URL` | No | Redis connection (defaults to in-memory) |
