import { permissions } from '../access';

/**
 * Payment provider records are deployment-wide: every Store's checkout uses
 * them. A Store-scoped capability combination is not authority over other
 * Stores, so changing them requires explicit deployment authority — the user
 * must be named in PAYMENT_PROVIDER_ADMIN_USER_IDS (set by whoever operates the
 * deployment) and still hold current payment and onboarding capabilities.
 * With no administrators configured, provider settings are read-only in the
 * app; onboarding still installs the seeded provider through its own path.
 */
export function deploymentProviderAdministrators() {
  return new Set((process.env.PAYMENT_PROVIDER_ADMIN_USER_IDS || '').split(',').map((value) => value.trim()).filter(Boolean));
}

export async function canAdministerPaymentProviders(args: { session?: any; context?: any }) {
  const userId = args.session?.itemId;
  if (!userId || !deploymentProviderAdministrators().has(String(userId))) return false;
  return Boolean(await permissions.canManagePayments(args) && await permissions.canManageOnboarding(args));
}

/** Reading non-secret provider readiness keeps the existing Store-staff rule: payments plus onboarding. */
export async function canReadPaymentProviderConfiguration(args: { session?: any; context?: any }) {
  return Boolean(await permissions.canManagePayments(args) && await permissions.canManageOnboarding(args));
}
