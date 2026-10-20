'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/platform/lib/platformClient';

export async function supplierSettlementTask(input: { action: string; idempotencyKey: string; invoiceId?: string; creditId?: string; input: Record<string, unknown> }) {
  const response = await keystoneClient<any>(`mutation($action:String!,$idempotencyKey:String!,$invoiceId:ID,$creditId:ID,$input:JSON!){manageSupplierSettlement(action:$action,idempotencyKey:$idempotencyKey,invoiceId:$invoiceId,creditId:$creditId,input:$input)}`, input, { cache: 'no-store' });
  if (!response.success) return { ok: false as const, error: response.error || 'Supplier document could not be recorded' };
  revalidatePath('/dashboard/platform/purchasing');
  return { ok: true as const, data: response.data?.manageSupplierSettlement };
}

/** The receipt/GRNI export at a cutoff, computed on the server over the complete history. */
export async function exportSupplierGrniTask(asOf: string): Promise<{ ok: true; csv: string } | { ok: false; error: string }> {
  const { grniAt } = await import('@/features/keystone/lib/supplierMatching');
  const { loadSupplierSettlementHistory } = await import('../lib/supplierSettlementData');
  const cutoff = new Date(`${asOf}Z`);
  if (!Number.isFinite(cutoff.getTime())) return { ok: false, error: 'Choose a valid cutoff.' };
  const history = await loadSupplierSettlementHistory();
  if (history.error) return { ok: false, error: history.error };
  const rows = grniAt(history.receipts, history.invoices, cutoff);
  const cell = (value: unknown) => { const text = String(value ?? ''); return `"${(/^[=+\-@\t\r]/.test(text) ? "'" : '') + text.replaceAll('"', '""')}"`; };
  const columns = ['receiptId', 'purchaseOrderId', 'poItemId', 'supplierId', 'supplierLotNumber', 'receivedQuantity', 'matchedQuantity', 'unmatchedQuantity', 'unitCostCents', 'unmatchedValueCents', 'conditionStatus'];
  return { ok: true, csv: [columns.map(cell).join(','), ...rows.map((row) => columns.map((key) => cell((row as any)[key])).join(','))].join('\r\n') };
}
