import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { SupplierSettlementControls } from './SupplierSettlementControls';

export async function SupplierSettlementPanel({ currencyCode }: { currencyCode: string }) {
  const invoices: any[] = [], credits: any[] = [], receipts: any[] = [];
  let error: string | undefined;
  for (const [list, selection, rows] of [
    ['supplierInvoices', 'id invoiceNumber supplierName currencyCode status lines subtotalCents taxCents freightCents grossCents expectedCents varianceCents events createdAt documentReference supplier { id name }', invoices],
    ['supplierCredits', 'id kind status reference amountCents claimedAmountCents currencyCode reason evidence events resolvedAt createdAt invoice { id }', credits],
    ['purchaseReceipts', 'id quantity supplierLotNumber unitCostCents conditionStatus createdAt supplier { id name } purchaseOrder { id poNumber } poItem { id } product { id title }', receipts],
  ] as const) {
    for (let skip = 0; ; skip += 100) {
      const response = await keystoneClient<any>(`query($skip:Int!){${list}(take:100,skip:$skip,orderBy:[{createdAt:desc}]){${selection}}}`, { skip }, { cache: 'no-store' });
      if (!response.success) { error = response.error; break; }
      const page = response.data?.[list] || [];
      rows.push(...page);
      if (page.length < 100) break;
    }
  }
  return <SupplierSettlementControls invoices={invoices} credits={credits} receipts={receipts} currencyCode={currencyCode} loadError={error} />;
}
