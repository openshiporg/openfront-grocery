const LABELS: Record<string, string> = { pp_stripe_default: 'Stripe', pp_test_default: 'Test payments' };
export function providerLabel(code: string | null | undefined) {
  return (code && LABELS[code]) || code || 'Unknown provider';
}
