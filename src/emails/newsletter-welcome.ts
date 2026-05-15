import { EmailPayload } from "@lib/email";

const LOGO_URL = "https://tinkuy.com.ar/logo.png";
const SHOP_URL = "https://tinkuy.com.ar";

interface NewsletterWelcomeEmailData {
  email: string;
  firstName?: string;
}

export function newsletterWelcomeEmail(data: NewsletterWelcomeEmailData): EmailPayload {
  const greeting = data.firstName ? `Hola ${data.firstName}` : "Hola";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>¡Bienvenido/a al newsletter de Tinkuy!</title>
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
            <td style="padding:40px 30px;text-align:center;">
              <h1 style="margin:0 0 20px;font-size:28px;color:#1a1a1a;font-weight:600;">
                ${greeting}, ¡bienvenido/a al club! 🌿
              </h1>
              <p style="margin:0 0 30px;font-size:16px;color:#666666;line-height:1.6;">
                Gracias por suscribirte. A partir de ahora vas a recibir las mejores ofertas, novedades y consejos saludables directamente en tu email.
              </p>

              <!-- Discount Badge -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 30px;background:#f0f7f0;border-radius:12px;padding:30px;border:2px dashed #2d5a27;">
                <tr>
                  <td style="text-align:center;">
                    <p style="margin:0 0 8px;font-size:14px;color:#2d5a27;text-transform:uppercase;letter-spacing:1px;font-weight:600;">
                      Tu código de bienvenida
                    </p>
                    <p style="margin:0 0 16px;font-size:36px;color:#2d5a27;font-weight:700;letter-spacing:2px;">
                      BIENVENIDA10
                    </p>
                    <p style="margin:0;font-size:14px;color:#666666;">
                      10% OFF en tu primera compra
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
                <tr>
                  <td style="background:#2d5a27;border-radius:8px;">
                    <a href="${SHOP_URL}" target="_blank" style="display:inline-block;padding:16px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                      Usar mi descuento →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#999999;">
                Válido por 30 días. No combinable con otras ofertas.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9f9f9;padding:30px;text-align:center;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:14px;color:#999999;">
                ¿Preguntas? Escribinos a <a href="mailto:hola@tinkuy.com.ar" style="color:#2d5a27;">hola@tinkuy.com.ar</a>
              </p>
              <p style="margin:10px 0 0;font-size:12px;color:#cccccc;">
                Cancelá tu suscripción cuando quieras.
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
    subject: "¡Bienvenido/a! 🌿 Tu 10% de descuento te espera",
    html,
  };
}
