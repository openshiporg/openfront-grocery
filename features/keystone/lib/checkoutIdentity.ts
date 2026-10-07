import { groceryOutboxPayloadHash } from './groceryOutbox';
/** Payment intent binds customer instructions/ownership as well as commercial amount. */
export function checkoutRequestFingerprint(data: any) {
  if (!data || typeof data !== 'object') throw new Error('Checkout request evidence is missing');
  const address = data.deliveryAddress || {};
  const ownerId = data.checkoutOwnerId || null;
  return groceryOutboxPayloadHash({ cartId: data.cartId, ownerId, sessionId: ownerId ? null : String(data.sessionId || '').trim() || null,
    email: String(data.email || '').trim().toLowerCase(),
    address: Object.fromEntries(['firstName', 'lastName', 'address1', 'address2', 'city', 'province', 'postalCode', 'phone'].map(key => [key, String(address[key] || '').trim()])),
    fulfillmentMethod: data.fulfillmentMethod, deliverySlotId: data.deliverySlotId || null, pickupSlotId: data.pickupSlotId || null,
    couponCode: String(data.couponCode || '').trim().toUpperCase(), substitutionPreference: data.substitutionPreference,
    deliveryInstructions: String(data.deliveryInstructions || '').trim(),
  });
}
export function checkoutCartFingerprint(cart: any) {
  return groceryOutboxPayloadHash({ items: (cart.items || []).map((item: any) => ({ id: item.id, quantity: item.quantity,
    productId: item.product?.id, unitPriceCents: item.product?.priceCents, taxRateBasisPoints: item.product?.taxRateBasisPoints ?? null,
    substitutionPreference: item.substitutionPreference || null, pricingMethod: item.product?.pricingMethod, unitOfMeasure: item.product?.unitOfMeasure,
  })).sort((a: any, b: any) => a.id.localeCompare(b.id)) });
}
function moneyCents(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}
function checkoutDateKey(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}
/** Binds an explicit compensated-checkout restart to the same customer-visible commercial terms. */
export function checkoutTermsFingerprint(data: any) {
  return groceryOutboxPayloadHash({
    amountInCents: Number(data?.amountInCents ?? 0),
    subtotalCents: moneyCents(data?.subtotal),
    taxCents: moneyCents(data?.tax),
    deliveryFeeCents: moneyCents(data?.deliveryFee),
    discountCents: moneyCents(data?.discount),
    currency: String(data?.currency || 'usd').toLowerCase(),
    captureMethod: data?.captureMethod || null,
    taxRateBps: data?.taxRateBps ?? null,
    commercial: data?.commercial ?? null,
    deliveryPolicySnapshot: data?.deliveryPolicySnapshot ?? null,
    fulfillmentMethod: data?.fulfillmentMethod ?? null,
    fulfillmentSlot: {
      id: data?.fulfillmentSlot?.id ?? null,
      date: checkoutDateKey(data?.fulfillmentSlot?.date),
      startTime: data?.fulfillmentSlot?.startTime ?? null,
      endTime: data?.fulfillmentSlot?.endTime ?? null,
    },
    deliverySlotId: data?.deliverySlotId ?? null,
    pickupSlotId: data?.pickupSlotId ?? null,
    couponCode: data?.couponCode ?? null,
  });
}
export function assertProviderCreationRetry(data: any, now = Date.now()) {
  if (data?.paymentIntentId) return;
  const raw = data?.firstProviderRequestAt ?? data?.claimedAt;
  if (raw === undefined || raw === null) return;
  const first = Number(raw);
  if (!Number.isSafeInteger(first) || first <= 0 || first > now || now - first >= 23 * 60 * 60 * 1000) throw new Error('Payment creation outcome is unknown beyond its safe retry window; operator reconciliation is required');
}
export function claimPaymentCreationData(existing: any, input: any, token: string, now = Date.now()) {
  if (existing?.checkoutFingerprint && existing.checkoutFingerprint !== input.checkoutFingerprint) throw new Error('Payment request no longer matches the original customer instructions');
  if (existing?.cartFingerprint && existing.cartFingerprint !== input.cartFingerprint) throw new Error('Payment request no longer matches the original basket');
  if (existing?.status === 'completed' || existing?.compensationStatus) throw new Error('Checkout payment has already completed or entered compensation');
  if (existing?.paymentIntentId) return { action: 'reuse' as const, data: existing };
  if (existing && Object.keys(existing).length && existing.firstProviderRequestAt == null && existing.claimedAt == null) throw new Error('Unknown legacy payment creation time requires operator reconciliation');
  assertProviderCreationRetry(existing, now);
  if (existing?.creationClaimToken && Number(existing.claimedAt) + 30000 > now) return { action: 'wait' as const, data: existing };
  return { action: 'create' as const, data: { ...input, ...existing, checkoutFingerprint: input.checkoutFingerprint,
    cartFingerprint: input.cartFingerprint, firstProviderRequestAt: existing?.firstProviderRequestAt ?? existing?.claimedAt ?? now,
    status: 'initiating', claimedAt: now, creationClaimToken: token } };
}

/** The caller already established Cart ownership; this fences delayed provider responses. */
export async function writePaymentCreationResult(context: any, input: { sessionId: string; claimToken?: string; phase: 'provider_ready' | 'ready' | 'unknown'; paymentIntentId?: string; clientSecret?: string; noCharge?: any }) {
  return context.transaction(async (tc: any) => {
    const tx = tc.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "PaymentSession" WHERE "id"=$1 FOR UPDATE', input.sessionId);
    const session = await tx.paymentSession.findUnique({ where: { id: input.sessionId }, include: { paymentProvider: true } });
    if (!session) throw new Error('Payment session disappeared during creation');
    const current = session.data || {};
    if (input.paymentIntentId && current.paymentIntentId && input.paymentIntentId !== current.paymentIntentId) throw new Error('Provider retry returned a conflicting payment identity');
    if (current.status === 'completed' || current.compensationStatus) return session;
    if (input.phase === 'unknown') {
      // A stale failure cannot turn a newer ready intent back into an unknown request.
      if (current.creationClaimToken !== input.claimToken || current.paymentIntentId) return session;
      return tx.paymentSession.update({ where: { id: session.id }, data: { isInitiated: false, data: { ...current, status: 'unknown', creationClaimToken: null,
        error: 'Payment initialization requires recovery; retry the same request' } }, include: { paymentProvider: true } });
    }
    if (input.phase === 'provider_ready' && current.creationClaimToken !== input.claimToken) {
      if (current.paymentIntentId === input.paymentIntentId) return session;
      throw new Error('Payment creation claim changed; retry the same checkout');
    }
    const paymentIntentId = input.paymentIntentId || current.paymentIntentId;
    const clientSecret = input.clientSecret || current.clientSecret;
    const noCharge = input.noCharge || current.noCharge;
    if (noCharge) noChargeCheckoutState({ ...session, data: { ...current, paymentIntentId, noCharge } });
    if (!paymentIntentId || (!clientSecret && !noCharge)) throw new Error('Payment provider did not return a durable payment identity and client secret');
    if (input.phase === 'ready' && current.paymentIntentId !== paymentIntentId) throw new Error('Payment identity changed before checkout recovery was saved');
    return tx.paymentSession.update({ where: { id: session.id }, data: { isInitiated: true, data: { ...current, paymentIntentId, clientSecret: clientSecret || null, ...(noCharge ? { noCharge } : {}),
      status: input.phase === 'ready' ? 'ready' : 'attempt_pending', creationClaimToken: input.phase === 'ready' ? null : current.creationClaimToken,
      error: null } }, include: { paymentProvider: true } });
  });
}
export function noChargeCheckoutState(session: any) {
  const evidence = session?.data?.noCharge;
  if (!evidence) return null;
  if (evidence.version !== 1 || evidence.amountCents !== 0 || evidence.paymentSessionId !== session.id
    || !['coupon_covers_total', 'zero_priced_goods'].includes(evidence.reason)
    || session.amountCents !== 0 || session.data.amountInCents !== 0
    || !session.data.checkoutFingerprint || !session.data.cartFingerprint
    || session.data.paymentIntentId !== `grocery_no_charge:${session.id}`) throw new Error('Invalid server no-charge checkout evidence');
  return { status: 'succeeded', amount: 0, amountCents: 0, capturedAmountCents: 0, currency: 'usd', noCharge: evidence };
}
export function noChargeOrderPaymentState(payment: any) {
  if (!payment?.providerData?.noCharge) return null;
  return noChargeCheckoutState({ id: payment.providerData.noCharge.paymentSessionId, amountCents: payment.amountCents,
    data: { ...payment.providerData, paymentIntentId: payment.providerPaymentId } });
}
export function assertCheckoutAttemptIdentity(attempt: any, data: any, cart: any, session: any, providerPaymentId: string) {
  if (!attempt || attempt.providerPaymentId !== providerPaymentId || attempt.providerCode !== session.paymentProvider.code
    || attempt.storeId !== cart.store.id || attempt.cartId !== cart.id || attempt.paymentSessionId !== session.id
    || attempt.amountCents !== Number(session.amountCents ?? Math.round(Number(session.amount || 0) * 100)) || attempt.currencyCode !== 'usd'
    || checkoutRequestFingerprint(attempt.requestData) !== checkoutRequestFingerprint(data)) throw new Error('Checkout request differs from the immutable payment instructions');
}
