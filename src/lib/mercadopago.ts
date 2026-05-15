import { MercadoPagoConfig, Preference } from "mercadopago";
import { config } from "./config";
import { mpCircuitBreaker } from "./circuit-breaker";
import { logger } from "./logger";

const mpConfig = new MercadoPagoConfig({
  accessToken: config.mercadoPago.accessToken,
});

export const preferenceClient = new Preference(mpConfig);

const MP_MODE = config.mercadoPago.mode;

export interface CartItemForCheckout {
  id: string;
  title: string;
  unit_price: number;
  quantity: number;
  currency_id: string;
}

export interface PreferenceResponse {
  id: string;
  init_point: string;
  sandbox_init_point: string;
}

function isMercadoPagoConfigured(): boolean {
  return !!config.mercadoPago.accessToken && config.mercadoPago.accessToken.length > 0;
}

export async function createPreference(input: {
  items: CartItemForCheckout[];
  external_reference: string;
  notification_url: string;
  back_urls: {
    success: string;
    failure: string;
    pending: string;
  };
  payer?: {
    email: string;
    name?: string;
    surname?: string;
  };
}) {
  const isTestMode = MP_MODE === "test" || !isMercadoPagoConfigured();
  if (isTestMode) {
    return {
      id: `mock-pref-${Date.now()}`,
      init_point: `https://www.mercadopago.com.ar/checkout/start?pref_id=${Date.now()}`,
      sandbox_init_point: `https://sandbox.mercadopago.com.ar/checkout/start?pref_id=${Date.now()}`,
      collector_id: 123456789,
      operation_type: "regular_payment",
      status: "pending",
      items: input.items,
      payer: input.payer,
      back_urls: input.back_urls,
      auto_return: "approved",
      external_reference: input.external_reference,
      date_created: new Date().toISOString(),
      date_expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  const makeRequest = async (attempt: number): Promise<PreferenceResponse> => {
    try {
      return await preferenceClient.create({
        body: {
          items: input.items.map((item) => ({
            id: item.id,
            title: item.title,
            unit_price: item.unit_price,
            quantity: item.quantity,
            currency_id: item.currency_id,
          })),
          external_reference: input.external_reference,
          notification_url: input.notification_url,
          back_urls: input.back_urls,
          auto_return: "approved",
          payer: input.payer
            ? {
                email: input.payer.email,
                name: input.payer.name,
                surname: input.payer.surname,
              }
            : undefined,
        },
      }) as PreferenceResponse;
    } catch (err: unknown) {
      const is5xx = err instanceof Error && /5\d{2}/.test(err.message);
      if (is5xx && attempt < 3) {
        const delay = Math.min(100 * Math.pow(2, attempt), 5000);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return makeRequest(attempt + 1);
      }
      throw err;
    }
  };

  try {
    const result = await mpCircuitBreaker.execute(() => makeRequest(1));
    clearTimeout(timeoutId);
    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    logger.error({ err, component: "mercadopago" }, "MercadoPago preference creation failed");
    if (process.env.NODE_ENV === "production") {
      throw new Error("MercadoPago preference creation failed");
    }
    return {
      id: `mock-pref-${Date.now()}`,
      init_point: `https://www.mercadopago.com.ar/checkout/start?pref_id=${Date.now()}`,
      sandbox_init_point: `https://sandbox.mercadopago.com.ar/checkout/start?pref_id=${Date.now()}`,
      collector_id: 123456789,
      operation_type: "regular_payment",
      status: "pending",
      items: input.items,
      payer: input.payer,
      back_urls: input.back_urls,
      auto_return: "approved",
      external_reference: input.external_reference,
      date_created: new Date().toISOString(),
      date_expiration: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}
