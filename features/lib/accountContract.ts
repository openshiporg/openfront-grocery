/**
 * One account contract for every shopper/customer entry point (storefront
 * registration, reset, profile, password change and operator provisioning).
 * The User password field stores 8–128 characters; shopper flows keep a
 * stronger 12-character minimum. Email addresses are capped at 254 characters
 * so every saved identity can be typed into the sign-in and reset forms.
 */
export const SHOPPER_PASSWORD_MIN = 12;
export const SHOPPER_PASSWORD_MAX = 128;
export const SHOPPER_EMAIL_MAX = 254;

export function shopperPasswordProblem(password: string): string | null {
  if (password.length < SHOPPER_PASSWORD_MIN || password.length > SHOPPER_PASSWORD_MAX) {
    return `Choose a password of ${SHOPPER_PASSWORD_MIN} to ${SHOPPER_PASSWORD_MAX} characters.`;
  }
  return null;
}

export function normalizeAccountEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function accountEmailProblem(email: string): string | null {
  if (!email || email.length > SHOPPER_EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return `Enter a valid email address of up to ${SHOPPER_EMAIL_MAX} characters.`;
  }
  return null;
}
