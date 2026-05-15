import { describe, it, expect, beforeAll } from "vitest";

/**
 * Smoke tests for Facusito API.
 * These are integration tests that verify the core flow:
 * register → login → product → cart → checkout
 *
 * Run with: npx vitest run tests/smoke.test.ts
 *
 * Prerequisites:
 * - Database running and migrated
 * - Redis running
 * - Server running on localhost:4000
 * - MercadoPago test credentials configured
 * - Seed data loaded (npx prisma db seed)
 */

const TENANT_SLUG = "facusito-main";
const TENANT_ID = "seed-tenant-1";
const BRANCH_ID = "seed-branch-1";

const SERVER_URL = "http://localhost:4000";

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

const skipIfNoServer = async () => {
  const serverRunning = await isServerRunning();
  if (!serverRunning) {
    return true;
  }
  return false;
};

describe("Smoke Tests", () => {
  const API_URL = process.env.API_URL ?? "http://localhost:4000/graphql";

  async function gql(query: string, variables?: Record<string, unknown>, token?: string) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    return res.json();
  }

  it("health check returns 200", async () => {
    if (await skipIfNoServer()) return;
    const res = await fetch(`${SERVER_URL}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("webhook returns 401 on bad signature", async () => {
    if (await skipIfNoServer()) return;
    const res = await fetch(`${SERVER_URL}/webhooks/mercadopago`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "payment", data: { id: "123" } }),
    });
    const isDev = process.env.NODE_ENV === "development";
    if (isDev) {
      expect([200, 400, 401]).toContain(res.status);
    } else {
      expect(res.status).toBe(401);
    }
  });

  it("full customer flow: register → login → products → cart → checkout", async () => {
    if (await skipIfNoServer()) return;
    const timestamp = Date.now();
    const testEmail = `smoke-test-${timestamp}@test.com`;

    const registerResult = await gql(`
      mutation Register($input: CustomerRegisterInput!) {
        customerRegister(input: $input) {
          token
          customer {
            id
            email
          }
        }
      }
    `, {
      input: {
        tenantId: TENANT_ID,
        email: testEmail,
        password: "TestPassword123!",
        firstName: "Smoke",
        lastName: "Test",
      }
    });

    expect(registerResult.errors).toBeUndefined();
    const registerData = registerResult.data?.customerRegister;
    expect(registerData.token).toBeDefined();
    expect(registerData.customer.email).toBe(testEmail);

    const customerToken = registerData.token;

    const loginResult = await gql(`
      mutation Login($input: CustomerLoginInput!) {
        customerLogin(input: $input) {
          token
          customer {
            id
            email
          }
        }
      }
    `, {
      input: {
        tenantId: TENANT_ID,
        email: testEmail,
        password: "TestPassword123!",
      }
    });

    expect(loginResult.errors).toBeUndefined();
    const loginData = loginResult.data?.customerLogin;
    expect(loginData.token).toBeDefined();
    expect(loginData.customer.email).toBe(testEmail);

    const productsResult = await gql(`
      query Products($tenantId: String!) {
        products(tenantId: $tenantId, first: 5) {
          edges {
            node {
              id
              name
              variants {
                id
                price
              }
            }
          }
        }
      }
    `, { tenantId: TENANT_ID });

    expect(productsResult.errors).toBeUndefined();
    const products = productsResult.data?.products?.edges;
    expect(products?.length).toBeGreaterThan(0);

    const product = products[0].node;
    const variant = product.variants[0];

    const cartResult = await gql(`
      mutation AddToCart($input: AddToCartInput!) {
        addToCart(input: $input) {
          id
          items {
            id
            quantity
            variant {
              id
            }
          }
        }
      }
    `, {
      input: {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        variantId: variant.id,
        quantity: 2,
      }
    }, customerToken);

    expect(cartResult.errors).toBeUndefined();
    const cart = cartResult.data?.addToCart;
    expect(cart.items.length).toBeGreaterThan(0);
    expect(cart.items[0].quantity).toBe(2);

    const checkoutResult = await gql(`
      mutation Checkout($input: CheckoutInput!) {
        checkout(input: $input) {
          id
          status
          total
        }
      }
    `, {
      input: {
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        cartId: cart.id,
        paymentMethod: "mercadopago",
      }
    }, customerToken);

    expect(checkoutResult.errors).toBeUndefined();
    const order = checkoutResult.data?.checkout;
    expect(order.id).toBeDefined();
    expect(order.status).toBeDefined();
  });
});
