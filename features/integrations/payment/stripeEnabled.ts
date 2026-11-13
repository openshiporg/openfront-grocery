/** Stripe is installed once its keys are configured; the mode (test or live) follows the keys. */
export function isPaymentProviderInstalled(provider: { code?: string; isInstalled?: boolean } | null | undefined): boolean {
  return Boolean(provider?.isInstalled || (provider?.code === 'pp_stripe_default' && stripeConfigurationProblem() === null));
}

export function stripeCheckoutActivated() {
  return process.env.STRIPE_ENABLED?.trim().toLowerCase() === 'true';
}

/**
 * Why Stripe cannot take new payments right now, or null when it can. Checked
 * lazily at provider discovery and payment initiation — never at startup — so a
 * store without (or with incomplete) Stripe settings still serves its catalog,
 * staff dashboard and recovery of existing payments. The mode follows the keys:
 * a test key pair or a live key pair, never one of each.
 */
export function stripeConfigurationProblem(): string | null {
  if (!stripeCheckoutActivated()) return 'Stripe checkout is disabled for new payments unless STRIPE_ENABLED=true';
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim() || '';
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || '';
  if (!secretKey || !publishableKey || !process.env.STRIPE_WEBHOOK_SECRET?.trim()) return 'Stripe checkout is not fully configured';
  const mode = secretKey.startsWith('sk_live_') ? 'live' : 'test';
  if (!secretKey.startsWith(`sk_${mode}_`) || !publishableKey.startsWith(`pk_${mode}_`)) return `Stripe checkout needs a matching ${mode}-mode key pair`;
  return null;
}
