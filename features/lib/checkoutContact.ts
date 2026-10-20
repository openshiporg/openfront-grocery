/**
 * One contact/address contract for checkout, applied identically before the
 * payment provider is called (initiatePaymentSession), when the order is
 * submitted, and when a checkout is recovered — so the instructions bound into
 * the immutable checkout fingerprint are valid at every step.
 *
 * Names follow the account model (one name field): a single-part name or a
 * one-character name part is legitimate, so only the first-name field is
 * required and no surname is ever invented.
 */
export type CheckoutContactInput = {
  email?: string | null;
  fulfillmentMethod: 'delivery' | 'pickup';
  deliveryAddress?: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    address1?: string | null;
    city?: string | null;
    province?: string | null;
    postalCode?: string | null;
  } | null;
};

const MAX_FIELD = 200;
const EMAIL_MAX = 254;

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

export function checkoutContactProblem(input: CheckoutContactInput): string | null {
  const email = text(input.email).trim();
  if (!email || email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.';
  const address = input.deliveryAddress || {};
  const firstName = text(address.firstName), lastName = text(address.lastName), phone = text(address.phone);
  if (!firstName.trim() || firstName.length > MAX_FIELD || lastName.length > MAX_FIELD) return 'Enter your name (up to 200 characters).';
  if (phone.replace(/\D/g, '').length < 3 || phone.length > MAX_FIELD) return 'Enter a phone number the store can reach you on.';
  if (input.fulfillmentMethod === 'delivery') {
    for (const value of [address.address1, address.city, address.province, address.postalCode]) {
      if (!text(value).trim() || text(value).length > MAX_FIELD) return 'Enter the full delivery address: street, city, state and postal code.';
    }
  }
  return null;
}
