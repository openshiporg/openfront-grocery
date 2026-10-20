/** Opt-in demo activation of the seeded Stripe record, without database writes. */
export function isPaymentProviderInstalled(provider: { code?: string; isInstalled?: boolean } | null | undefined): boolean {
  return Boolean(provider?.isInstalled || (provider?.code === 'pp_stripe_default' &&
    process.env.STRIPE_USE_ENVIRONMENT_PROVIDER === 'true' && process.env.STRIPE_ALLOW_TEST_MODE === 'true' &&
    stripeCheckoutActivated() && process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') &&
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.startsWith('pk_test_') && process.env.STRIPE_WEBHOOK_SECRET));
}

export function stripeCheckoutActivated() {
  return process.env.STRIPE_ENABLED?.trim().toLowerCase() === 'true';
}

/**
 * Why Stripe cannot take new payments right now, or null when it can. Checked
 * lazily at provider discovery and payment initiation — never at startup — so a
 * store without (or with incomplete) Stripe settings still serves its catalog,
 * staff dashboard and recovery of existing payments. Production stays
 * fail-closed: live keys unless test mode is explicitly allowed.
 */
export function stripeConfigurationProblem(): string | null {
  if (!stripeCheckoutActivated()) return 'Stripe checkout is disabled for new payments unless STRIPE_ENABLED=true';
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || '';
  if (!secretKey || !publishableKey || !process.env.STRIPE_WEBHOOK_SECRET?.trim()) return 'Stripe checkout is not fully configured';
  if (process.env.NODE_ENV === 'production') {
    const mode = process.env.STRIPE_ALLOW_TEST_MODE === 'true' ? 'test' : 'live';
    if (!secretKey.startsWith(`sk_${mode}_`) || !publishableKey.startsWith(`pk_${mode}_`)) return `Stripe checkout requires ${mode}-mode keys`;
  }
  return null;
}
