'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
export async function voidAuthorizationAction(input: { paymentId: string; reason: string; idempotencyKey: string }) {
  const result = await keystoneClient(`mutation VoidAuthorization($paymentId: ID!, $reason: String!, $idempotencyKey: String!) { voidGroceryPaymentAuthorization(paymentId: $paymentId, reason: $reason, idempotencyKey: $idempotencyKey) { success paymentId status reused } }`, input);
  if (!result.success) throw new Error(result.error);
  revalidatePath('/dashboard/platform/payments'); revalidatePath('/dashboard/platform/orders');
  return result.data.voidGroceryPaymentAuthorization;
}
