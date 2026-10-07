'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import type { RefundLineInput } from '@/features/keystone/lib/refundAllocations';
export async function loadOrderRefundLines(orderId: string) {
  const result = await keystoneClient<any>('query($orderId:ID!){getGroceryOrderRefundLines(orderId:$orderId)}', { orderId }, { cache: 'no-store' });
  if (!result.success) return { ok: false as const, error: result.error || 'Final receipt could not be loaded' };
  return { ok: true as const, data: result.data?.getGroceryOrderRefundLines };
}
export async function refundOrderLinesTask(input: { orderId: string; paymentId: string; idempotencyKey: string; reason: string; lines: RefundLineInput[] }) {
  const result = await keystoneClient<any>('mutation($orderId:ID!,$paymentId:ID!,$idempotencyKey:String!,$reason:String!,$lines:JSON!){refundGroceryOrderLines(orderId:$orderId,paymentId:$paymentId,idempotencyKey:$idempotencyKey,reason:$reason,lines:$lines){success status paymentRefundId amountCents allocations reused message}}', input, { cache: 'no-store' });
  if (!result.success) return { ok: false as const, error: result.error || 'Line refund could not be confirmed; retry the same request' };
  revalidatePath('/dashboard/platform/payments'); revalidatePath('/dashboard/platform/orders');
  return { ok: true as const, data: result.data?.refundGroceryOrderLines };
}
