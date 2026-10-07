import { quantityMilli } from './inventoryMovements';

export function supplierAmountCents(value: unknown, label = 'Amount') {
  if (value == null || value === '') throw new Error(`${label} is required`);
  const cents = Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 2147483647) throw new Error(`${label} must be a non-negative integer amount in minor units`);
  return cents;
}

export function supplierLineCents(quantity: unknown, unitCostCents: unknown) {
  const milli = quantityMilli(quantity);
  if (milli < 0) throw new Error('Invoice quantity cannot be negative');
  const cents = supplierAmountCents(unitCostCents, 'Unit cost');
  const total = (BigInt(milli) * BigInt(cents) + BigInt(500)) / BigInt(1000);
  return supplierAmountCents(Number(total), 'Line total');
}

export function supplierInvoicePayable(invoice: any, credits: any[], cutoff = new Date('9999-01-01')) {
  let payable = supplierAmountCents(invoice.grossCents);
  for (const credit of credits) {
    if ((credit.invoiceId || credit.invoice?.id) !== invoice.id || credit.status !== 'accepted' || new Date(credit.resolvedAt || credit.createdAt) > cutoff) continue;
    const amount = supplierAmountCents(credit.amountCents);
    if (credit.kind === 'credit') payable -= amount;
    else if (credit.kind === 'debit') payable += amount;
  }
  if (payable < 0) throw new Error('Supplier credits exceed invoice liability');
  return supplierAmountCents(payable, 'Invoice payable');
}

export function supplierMatchedQuantity(receiptId: string, invoices: any[], cutoff = new Date('9999-01-01')) {
  return invoices.reduce((total, invoice) => {
    if (new Date(invoice.createdAt) > cutoff) return total;
    const voidedAt = (invoice.events || []).find((event: any) => event.action === 'void_invoice')?.at;
    if (invoice.status === 'voided' && (!voidedAt || new Date(voidedAt) <= cutoff)) return total;
    return total + (invoice.lines || []).filter((line: any) => line.receiptId === receiptId).reduce((sum: number, line: any) => sum + quantityMilli(line.matchedQuantity), 0);
  }, 0) / 1000;
}

/** Receipt recognition basis: supplier invoice capture reserves matched physical units. */
export function grniAt(receipts: any[], invoices: any[], cutoff: Date) {
  return receipts.filter(receipt => new Date(receipt.createdAt) <= cutoff).map(receipt => {
    const matched = supplierMatchedQuantity(receipt.id, invoices, cutoff);
    const remaining = (quantityMilli(receipt.quantity) - quantityMilli(matched)) / 1000;
    if (remaining < 0) throw new Error('Receipt has overlapping supplier invoice matches');
    return { receiptId: receipt.id, purchaseOrderId: receipt.purchaseOrderId || receipt.purchaseOrder?.id, poItemId: receipt.poItemId || receipt.poItem?.id, supplierId: receipt.supplierId || receipt.supplier?.id, supplierLotNumber: receipt.supplierLotNumber, receivedQuantity: Number(receipt.quantity), matchedQuantity: matched, unmatchedQuantity: remaining, unitCostCents: Number(receipt.unitCostCents), unmatchedValueCents: supplierLineCents(remaining, receipt.unitCostCents), conditionStatus: receipt.conditionStatus };
  });
}
