export function stripeCheckoutActivated() {
  return process.env.STRIPE_ENABLED?.trim().toLowerCase() === 'true';
}
