/**
 * Onboarding seeds merchant-specific Store Settings with explicit "Replace with your …" values
 * (and a reserved example.com address for the email field, which must stay a valid email). They
 * are editable and visible to the merchant, but never published to shoppers as real details.
 */
export const PLACEHOLDER_EMAIL = 'replace-with-your-store-email@example.com';

export function isOnboardingPlaceholder(value: unknown) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  // Addresses on the reserved example domains (RFC 2606) can never receive mail, so they are
  // never a store's real contact: this covers the model default as well as the seeded value.
  return /^replace with your\b/i.test(text) || text.toLowerCase() === PLACEHOLDER_EMAIL
    || /^[^@\s]+@(?:[^@\s]+\.)?(?:example\.(?:com|org|net)|[^@\s.]+\.example)$/i.test(text);
}
