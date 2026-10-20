import { keystoneClient } from '@/features/platform/lib/platformClient';

const SELECTIONS = {
  supplierInvoices: 'id invoiceNumber supplierName currencyCode status lines subtotalCents taxCents freightCents grossCents expectedCents varianceCents events createdAt documentReference supplier { id name }',
  supplierCredits: 'id kind status reference amountCents claimedAmountCents currencyCode reason evidence events resolvedAt createdAt invoice { id }',
  purchaseReceipts: 'id quantity supplierLotNumber unitCostCents conditionStatus createdAt supplier { id name } purchaseOrder { id poNumber } poItem { id } product { id title }',
} as const;

/**
 * The complete supplier settlement history, read on the server. Matching,
 * payables and the GRNI export are calculated over all of it; the page receives
 * only what it shows. Any failed page makes the whole result unavailable —
 * partial history is never used for financial figures.
 */
export async function loadSupplierSettlementHistory(): Promise<{ invoices: any[]; credits: any[]; receipts: any[]; error: string | null }> {
  const result: Record<keyof typeof SELECTIONS, any[]> = { supplierInvoices: [], supplierCredits: [], purchaseReceipts: [] };
  for (const list of Object.keys(SELECTIONS) as Array<keyof typeof SELECTIONS>) {
    for (let skip = 0; ; skip += 100) {
      const response = await keystoneClient<any>(`query($skip:Int!){${list}(take:100,skip:$skip,orderBy:[{createdAt:desc},{id:asc}]){${SELECTIONS[list]}}}`, { skip }, { cache: 'no-store' });
      if (!response.success) return { invoices: [], credits: [], receipts: [], error: response.error || 'Supplier settlement history could not be loaded.' };
      const page = response.data?.[list] || [];
      result[list].push(...page);
      if (page.length < 100) break;
    }
  }
  return { invoices: result.supplierInvoices, credits: result.supplierCredits, receipts: result.purchaseReceipts, error: null };
}
