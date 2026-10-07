'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export async function supplierSettlementTask(input: { action: string; idempotencyKey: string; invoiceId?: string; creditId?: string; input: Record<string, unknown> }) {
  const response = await keystoneClient<any>(`mutation($action:String!,$idempotencyKey:String!,$invoiceId:ID,$creditId:ID,$input:JSON!){manageSupplierSettlement(action:$action,idempotencyKey:$idempotencyKey,invoiceId:$invoiceId,creditId:$creditId,input:$input)}`, input, { cache: 'no-store' });
  if (!response.success) return { ok: false as const, error: response.error || 'Supplier document could not be recorded' };
  revalidatePath('/dashboard/platform/purchasing');
  return { ok: true as const, data: response.data?.manageSupplierSettlement };
}
