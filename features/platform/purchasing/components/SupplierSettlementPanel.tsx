import { supplierInvoicePayable, supplierMatchedQuantity } from '@/features/keystone/lib/supplierMatching';
import { loadSupplierSettlementHistory } from '../lib/supplierSettlementData';
import { SupplierSettlementControls } from './SupplierSettlementControls';

const RECENT_CLOSED_INVOICES = 20;

export async function SupplierSettlementPanel({ currencyCode }: { currencyCode: string }) {
  const history = await loadSupplierSettlementHistory();
  if (history.error) return <SupplierSettlementControls invoices={[]} credits={[]} receipts={[]} currencyCode={currencyCode} loadError={history.error} />;
  // Derived over the full history, so a bounded page never changes a match or payable.
  const receipts = history.receipts
    .map((receipt) => ({ ...receipt, remainingQuantity: Number(receipt.quantity) - supplierMatchedQuantity(receipt.id, history.invoices) }))
    .filter((receipt) => receipt.remainingQuantity > 0);
  const open = history.invoices.filter((invoice) => !['settled', 'voided'].includes(invoice.status));
  const closed = history.invoices.filter((invoice) => ['settled', 'voided'].includes(invoice.status)).slice(0, RECENT_CLOSED_INVOICES);
  const shown = [...open, ...closed].map((invoice) => ({ ...invoice, payableCents: supplierInvoicePayable(invoice, history.credits.filter((credit) => credit.invoice?.id === invoice.id)) }));
  const shownIds = new Set(shown.map((invoice) => invoice.id));
  const credits = history.credits.filter((credit) => (credit.invoice?.id && shownIds.has(credit.invoice.id)) || credit.status === 'open');
  return <SupplierSettlementControls invoices={shown} credits={credits} receipts={receipts} currencyCode={currencyCode} closedInvoiceCount={history.invoices.length - open.length} />;
}
