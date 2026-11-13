const LABELS: Record<string, string> = { pp_stripe_default: 'Stripe' };
export function providerLabel(code: string | null | undefined) {
  return (code && LABELS[code]) || code || 'Unknown provider';
}
