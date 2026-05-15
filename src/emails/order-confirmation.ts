import { EmailPayload } from "@lib/email";

const LOGO_URL = "https://tinkuy.com.ar/logo.png";
const SHOP_URL = "https://tinkuy.com.ar";

interface OrderItemData {
  name: string;
  sku?: string | null;
  price: number;
  quantity: number;
}

interface OrderConfirmationEmailData {
  email: string;
  firstName: string;
  orderId: string;
  items: OrderItemData[];
  subtotal: number;
  discountAmount?: number;
  shippingCost?: number;
  totalAmount: number;
}

export function orderConfirmationEmail(data: OrderConfirmationEmailData): EmailPayload {
  const itemsHtml = data.items
    .map(
      (item) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #eeeeee;color:#333333;font-size:15px;">
          ${item.name}
          ${item.sku ? `<br><span style="color:#999999;font-size:13px;">SKU: ${item.sku}</span>` : ""}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eeeeee;color:#333333;font-size:15px;text-align:center;">
          ${item.quantity}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eeeeee;color:#333333;font-size:15px;text-align:right;">
          $${item.price.toFixed(2)}
        </td>
        <td style="padding:12px 0;border-bottom:1px solid #eeeeee;color:#333333;font-size:15px;text-align:right;">
          $${(item.price * item.quantity).toFixed(2)}
        </td>
      </tr>
    `
    )
    .join("");

  const discountRow =
    data.discountAmount && data.discountAmount > 0
      ? `
      <tr>
        <td colspan="3" style="padding:8px 0;color:#666666;font-size:14px;text-align:right;">Descuento:</td>
        <td style="padding:8px 0;color:#e74c3c;font-size:14px;text-align:right;">-$${data.discountAmount.toFixed(2)}</td>
      </tr>
    `
      : "";

  const shippingRow =
    data.shippingCost !== undefined
      ? `
      <tr>
        <td colspan="3" style="padding:8px 0;color:#666666;font-size:14px;text-align:right;">Envío:</td>
        <td style="padding:8px 0;color:#666666;font-size:14px;text-align:right;">$${data.shippingCost.toFixed(2)}</td>
      </tr>
    `
      : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmación de tu pedido</title>
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
                ¡Pedido confirmado!
              </h1>
              <p style="margin:0 0 5px;font-size:16px;color:#666666;">
                Hola <strong>${data.firstName}</strong>, tu pedido ha sido recibido y está siendo procesado.
              </p>
              <p style="margin:0 0 30px;font-size:14px;color:#999999;">
                Orden #${data.orderId}
              </p>

              <!-- Order Items Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;">
                <thead>
                  <tr style="background:#f9f9f9;">
                    <th style="padding:12px 0;color:#666666;font-size:13px;font-weight:600;text-align:left;">Producto</th>
                    <th style="padding:12px 0;color:#666666;font-size:13px;font-weight:600;text-align:center;">Cantidad</th>
                    <th style="padding:12px 0;color:#666666;font-size:13px;font-weight:600;text-align:right;">Precio</th>
                    <th style="padding:12px 0;color:#666666;font-size:13px;font-weight:600;text-align:right;">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>

              <!-- Totals -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;border-top:2px solid #2d5a27;padding-top:20px;">
                <tr>
                  <td colspan="3" style="padding:8px 0;color:#666666;font-size:14px;text-align:right;">Subtotal:</td>
                  <td style="padding:8px 0;color:#333333;font-size:14px;text-align:right;">$${data.subtotal.toFixed(2)}</td>
                </tr>
                ${discountRow}
                ${shippingRow}
                <tr>
                  <td colspan="3" style="padding:12px 0;color:#1a1a1a;font-size:18px;font-weight:600;text-align:right;">Total:</td>
                  <td style="padding:12px 0;color:#2d5a27;font-size:18px;font-weight:600;text-align:right;">$${data.totalAmount.toFixed(2)}</td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:#2d5a27;border-radius:8px;">
                    <a href="${SHOP_URL}" target="_blank" style="display:inline-block;padding:16px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                      Ver estado del pedido →
                    </a>
                  </td>
                </tr>
              </table>
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
    subject: `Pedido #${data.orderId} confirmado ✓`,
    html,
  };
}
