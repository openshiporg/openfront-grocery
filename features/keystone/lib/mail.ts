'use server'

import { createTransport, getTestMessageUrl } from "nodemailer";
import { developmentSiteOrigin } from "./runtimeConfig";
import { emailButton, emailLayout, emailMuted, emailParagraph } from "./email-layout";

// Utility function to get base URL for emails
function getBaseUrlForEmails(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (value) {
    const parsed = new URL(value);
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new Error('Password reset origin must use HTTPS in production');
    }
    return value.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'production') throw new Error('NEXT_PUBLIC_SITE_URL is required in production');
  return developmentSiteOrigin();
}

const transport = createTransport({
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

function passwordResetEmail({ url }: { url: string }): string {
  return emailLayout({
    preheader: "Use this link to choose a new password.",
    title: "Reset your password",
    body: `${emailParagraph("We received a request to reset the password for your account. Use the button below to choose a new one.")}
${emailButton("Reset password", url)}
${emailMuted("If you did not request this, you can safely ignore this email. Your password will not change.")}`,
  });
}

export async function sendPasswordResetEmail(resetToken: string, to: string, baseUrl?: string, resetPath = '/dashboard/reset'): Promise<void> {
  if (process.env.NODE_ENV === 'production' && (!process.env.SMTP_HOST || !process.env.SMTP_FROM)) {
    throw new Error('SMTP_HOST and SMTP_FROM are required in production');
  }
  const frontendUrl = baseUrl || getBaseUrlForEmails();

  // email the user a token
  const info = await transport.sendMail({
    to,
    from: process.env.SMTP_FROM,
    subject: "Your password reset token!",
    html: passwordResetEmail({
      url: `${frontendUrl}${resetPath}?token=${encodeURIComponent(resetToken)}`,
    }),
  });
  if (process.env.MAIL_USER?.includes("ethereal.email")) {
    console.log(`📧 Message Sent!  Preview it at ${getTestMessageUrl(info as any)}`);
  }
}