// The one SMTP transport, shared by password resets and customer order emails.
// Not a 'use server' module, so nothing here is callable from the browser.
import { createTransport } from "nodemailer";

export const transport = createTransport({
  // @ts-ignore
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  // Same bounds as the customer-message transport: an unreachable SMTP host fails the
  // request within seconds instead of holding it for nodemailer's multi-minute defaults.
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 30000,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

/** Send one transactional email; returns the provider message id. */
export async function sendStoreEmail({ to, subject, html }: { to: string; subject: string; html: string }): Promise<string | null> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) throw new Error('SMTP_HOST and SMTP_FROM are required to send email');
  const info = await transport.sendMail({ to, from: process.env.SMTP_FROM, subject, html });
  return info?.messageId || null;
}
