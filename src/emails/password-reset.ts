import { EmailPayload } from "@lib/email";

const LOGO_URL = "https://tinkuy.com.ar/logo.png";
const FRONTEND_URL = process.env.FRONTEND_URL ?? "https://tinkuy.com.ar";

interface PasswordResetEmailData {
  email: string;
  firstName: string;
  resetToken: string;
}

export function passwordResetEmail(data: PasswordResetEmailData): EmailPayload {
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${data.resetToken}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperá tu contraseña</title>
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
                ¿Olvidaste tu contraseña?
              </h1>
              <p style="margin:0 0 20px;font-size:16px;color:#666666;line-height:1.6;">
                Hola <strong>${data.firstName}</strong>, recebimos un pedido para cambiar tu contraseña. Hacé clic en el botón de abajo para crear una nueva.
              </p>
              <p style="margin:0 0 30px;font-size:14px;color:#999999;">
                Este link expira en 1 hora.
              </p>
              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 30px;">
                <tr>
                  <td style="background:#2d5a27;border-radius:8px;">
                    <a href="${resetUrl}" target="_blank" style="display:inline-block;padding:16px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;">
                      Crear nueva contraseña →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#999999;text-align:center;">
                Si no pediste este cambio, ignorá este email. Tu contraseña sigue siendo la misma.
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
    subject: "Recuperá tu contraseña de Tinkuy",
    html,
  };
}
