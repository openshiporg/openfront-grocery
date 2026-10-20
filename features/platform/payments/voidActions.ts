'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/platform/lib/platformClient';

export type PaymentActionResult<T> = { ok: true; data: T } | { ok: false; error: string; uncertain: boolean };

/** A GraphQL rejection is definite; a transport failure leaves the outcome unknown. */
export async function voidAuthorizationAction(input: { paymentId: string; reason: string; idempotencyKey: string }): Promise<PaymentActionResult<{ success: boolean; status: string; reused: boolean }>> {
  const result = await keystoneClient<any>(`mutation VoidAuthorization($paymentId: ID!, $reason: String!, $idempotencyKey: String!) { voidGroceryPaymentAuthorization(paymentId: $paymentId, reason: $reason, idempotencyKey: $idempotencyKey) { success paymentId status reused } }`, input, { cache: 'no-store' });
  if (!result.success) return { ok: false, error: result.error || 'The void could not be confirmed.', uncertain: !result.errors?.length };
  revalidatePath('/dashboard/platform/payments'); revalidatePath('/dashboard/platform/orders');
  return { ok: true, data: result.data.voidGroceryPaymentAuthorization };
}

/** Record a revised authorization the provider created but this store did not save; the server verifies it with the provider. */
export async function recoverRevisedAuthorizationAction(input: { orderId: string; providerPaymentId: string; reason: string }): Promise<PaymentActionResult<{ recovered: boolean; alreadyRecorded: boolean; paymentIntentId: string | null }>> {
  const result = await keystoneClient<any>(`mutation Recover($orderId: ID!, $providerPaymentId: String!, $reason: String!) { recoverRevisedAuthorization(orderId: $orderId, providerPaymentId: $providerPaymentId, reason: $reason) { recovered alreadyRecorded paymentIntentId } }`, input, { cache: 'no-store' });
  if (!result.success) return { ok: false, error: result.error || 'The authorization could not be recovered.', uncertain: !result.errors?.length };
  revalidatePath('/dashboard/platform/payments'); revalidatePath('/dashboard/platform/orders');
  return { ok: true, data: result.data.recoverRevisedAuthorization };
}
