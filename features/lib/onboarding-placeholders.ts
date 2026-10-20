/**
 * Onboarding seeds merchant-specific Store Settings with explicit "Replace with your …" values
 * (and a reserved example.com address for the email field, which must stay a valid email). They
 * are editable and visible to the merchant, but never published to shoppers as real details.
 */
export const PLACEHOLDER_EMAIL = 'replace-with-your-store-email@example.com';

export function isOnboardingPlaceholder(value: unknown) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return /^replace with your\b/i.test(text) || text.toLowerCase() === PLACEHOLDER_EMAIL;
}
