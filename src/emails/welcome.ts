import { EmailPayload } from "@lib/email";

const LOGO_URL = "https://tinkuy.com.ar/logo.png";
const SHOP_URL = "https://tinkuy.com.ar";

interface WelcomeEmailData {
  firstName: string;
  email: string;
}

export function welcomeEmail(data: WelcomeEmailData): EmailPayload {
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>¡Bienvenido a Tinkuy!</title>
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
              <h1 style="margin:0 0 20px;font-size:28px;color:#1a1a1a;font-weight:600;">
                ¡Hola, ${data.firstName}!
              </h1>
              <p style="margin:0 0 20px;font-size:16px;color:#666666;line-height:1.6;">
                Bienvenido/a a <strong style="color:#2d5a27;">Tinkuy</strong>. Tu cuenta ha sido creada exitosamente y ya podés empezar a disfrutar de todos nuestros productos saludables.
              </p>
              <p style="margin:0 0 30px;font-size:16px;color:#666666;line-height:1.6;">
                ¿Ya viste nuestra selección de productos frescos y naturales? Tenemos todo lo que necesitás para una alimentación saludable.
              </p>
              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background:#2d5a27;border-radius:8px;">
                    <a href="${SHOP_URL}" target="_blank" style="display:inline-block;padding:16px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                      Explorar la tienda →
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
    subject: `¡Bienvenido/a ${data.firstName}! 🌿`,
    html,
  };
}
