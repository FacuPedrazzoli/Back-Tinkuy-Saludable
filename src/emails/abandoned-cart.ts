import { EmailPayload } from "@lib/email";

const LOGO_URL = "https://tinkuy.com.ar/logo.png";
const SHOP_URL = "https://tinkuy.com.ar";

interface AbandonedCartItemData {
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

interface AbandonedCartEmailData {
  email: string;
  firstName?: string;
  items: AbandonedCartItemData[];
  totalAmount: number;
  cartAgeHours: number;
}

export function abandonedCartEmail(data: AbandonedCartEmailData): EmailPayload {
  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding:16px 0;border-bottom:1px solid #eeeeee;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              ${
                item.imageUrl
                  ? `
              <td style="vertical-align:top;padding-right:16px;">
                <img src="${item.imageUrl}" alt="${item.name}" width="60" height="60" style="border-radius:8px;object-fit:cover;">
              </td>
              `
                  : ""
              }
              <td style="vertical-align:top;">
                <p style="margin:0 0 4px;font-size:15px;color:#1a1a1a;font-weight:500;">${item.name}</p>
                <p style="margin:0;font-size:14px;color:#666666;">Cantidad: ${item.quantity}</p>
              </td>
            </tr>
          </table>
        </td>
        <td style="padding:16px 0;border-bottom:1px solid #eeeeee;color:#2d5a27;font-size:15px;font-weight:600;text-align:right;vertical-align:middle;">
          $${item.price.toFixed(2)}
        </td>
      </tr>
    `
    )
    .join("");

  const greeting = data.firstName ? `Hola ${data.firstName},` : "Hola,";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>¿Olvidaste algo? 🧺</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#2d5a27;padding:40px 30px;text-align:center;">
              <img src="${LOGO_URL}" alt="Tinkuy" height="50" style="display:block;margin:0 auto;">
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 30px;">
              <h1 style="margin:0 0 10px;font-size:28px;color:#1a1a1a;font-weight:600;">
                ¿Olvidaste algo? 🧺
              </h1>
              <p style="margin:0 0 20px;font-size:16px;color:#666666;line-height:1.6;">
                ${greeting} notamos que dejaste productos en tu carrito. ¡Todavía están disponibles!
              </p>
              ${data.cartAgeHours >= 24 ? '<p style="margin:0 0 30px;font-size:14px;color:#e74c3c;font-weight:500;">⚡ Parece que pasó un tiempo... ¡Terminá tu pedido antes de que se agoten!</p>' : ""}

              <!-- Cart Items -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;background:#f9f9f9;border-radius:8px;padding:20px;">
                <tr>
                  <td>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      ${itemsHtml}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #2d5a27;">
                      <tr>
                        <td style="padding-top:16px;font-size:16px;color:#1a1a1a;font-weight:600;">Total del carrito:</td>
                        <td style="padding-top:16px;color:#2d5a27;font-size:18px;font-weight:700;text-align:right;">$${data.totalAmount.toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
                <tr>
                  <td style="background:#2d5a27;border-radius:8px;">
                    <a href="${SHOP_URL}" target="_blank" style="display:inline-block;padding:16px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                      Completar mi pedido →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#999999;text-align:center;">
                Este email es solo un recordatorio. Tu carrito se vaciará automáticamente.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;padding:30px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:14px;color:#999999;">
                ¿Preguntas? Escribinos a <a href="mailto:hola@tinkuy.com.ar" style="color:#2d5a27;">hola@tinkuy.com.ar</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  return {
    to: data.email,
    subject: "¿Olvidaste algo? 🧺 Tu carrito te espera",
    html,
  };
}
