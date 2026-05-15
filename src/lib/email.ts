import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.EMAIL_FROM ?? "hola@tinkuy.com.ar";
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? "Tinkuy";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(payload: EmailPayload): Promise<void> {
  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    console.log("\n📧 [EMAIL DEV MODE]");
    console.log("─────────────────────────────");
    console.log(`To:      ${payload.to}`);
    console.log(`From:    ${FROM_NAME} <${FROM_EMAIL}>`);
    console.log(`Subject: ${payload.subject}`);
    console.log("─────────────────────────────");
    console.log(payload.html);
    console.log("─────────────────────────────\n");
    return;
  }

  const { error } = await resend.emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: payload.to,
    subject: payload.subject,
    html: payload.html,
  });

  if (error) {
    console.error("Resend email error:", error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

export { sendEmail, FROM_EMAIL, FROM_NAME };
export type { EmailPayload };
