import { createHash } from 'node:crypto';
import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { canonicalGroceryOutboxPayload } from '../lib/groceryOutbox';
import { quantityMilli } from '../lib/inventoryMovements';
import { supplierAmountCents, supplierInvoicePayable, supplierLineCents, supplierMatchedQuantity } from '../lib/supplierMatching';
import { withSerializableRetry } from '../utils/serializableTransaction';

type Args = { action: string; idempotencyKey: string; invoiceId?: string; creditId?: string; input: any };
const identity = (...parts: string[]) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const requiredText = (value: unknown, label: string) => { if (typeof value !== 'string' || !value.trim() || value.length > 1000) throw new Error(`${label} is required`); return value.trim(); };
const date = (value: unknown, label: string) => { const result = new Date(String(value)); if (!Number.isFinite(result.getTime())) throw new Error(`${label} must be a valid date`); return result; };

async function supplierRows(tx: any, model: string, where: any) {
  const rows: any[] = [];
  for (let skip = 0; ; skip += 100) {
    const page = await tx[model].findMany({ where, take: 100, skip, orderBy: { id: 'asc' } });
    rows.push(...page);
    if (page.length < 100) return rows;
  }
}

/** Manual document capture and external settlement evidence; never initiates a payment. */
export async function manageSupplierSettlement(_root: unknown, args: Args, context: Context) {
  if (!['capture_invoice', 'approve_invoice', 'open_claim', 'resolve_claim', 'record_debit', 'settle_invoice', 'void_invoice'].includes(args.action)) throw new Error('Unsupported supplier settlement action');
  await requireFreshCapability(context, args.action === 'settle_invoice' ? 'canManagePayments' : 'canManageInventory');
  const store = await requireSessionStore(context);
  if (args.idempotencyKey?.trim().length < 12) throw new Error('Supplier operation idempotency key is required');
  const input = args.input || {};
  const fingerprint = canonicalGroceryOutboxPayload({ action: args.action, input, invoiceId: args.invoiceId || null, creditId: args.creditId || null });
  const event = { action: args.action, idempotencyKey: args.idempotencyKey.trim(), fingerprint, actorId: context.session!.itemId, at: new Date().toISOString(), input };
  return withSerializableRetry(() => context.transaction(async transactionContext => {
    const tx: any = transactionContext.prisma;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-supplier-settlement'), hashtext($1))", args.invoiceId || `${store.id}:${input.supplierId || args.idempotencyKey}`);
    let invoice: any;
    if (args.action === 'capture_invoice') {
      const supplierId = requiredText(input.supplierId, 'Supplier');
      const invoiceNumber = requiredText(input.invoiceNumber, 'Supplier invoice number');
      const currencyCode = requiredText(input.currencyCode, 'Invoice currency').toUpperCase();
      if (currencyCode !== String(store.currencyCode || 'USD').toUpperCase()) throw new Error('Supplier invoice currency must match the active store');
      const invoiceDate = date(input.invoiceDate, 'Invoice date');
      const dueDate = input.dueDate ? date(input.dueDate, 'Due date') : null;
      if (dueDate && dueDate < invoiceDate) throw new Error('Invoice due date cannot precede the invoice date');
      const documentReference = requiredText(input.documentReference, 'Supplier invoice document reference');
      const identityKey = identity(store.id, supplierId, invoiceNumber.toUpperCase());
      const existing = await tx.supplierInvoice.findUnique({ where: { identityKey } }) || await tx.supplierInvoice.findUnique({ where: { idempotencyKey: args.idempotencyKey.trim() } });
      if (existing) {
        if (existing.storeId !== store.id || existing.inputFingerprint !== fingerprint) throw new Error('Supplier invoice identity was reused with different document inputs');
        const credits = await supplierRows(tx, 'supplierCredit', { storeId: store.id, invoiceId: existing.id });
        return { success: true, invoiceId: existing.id, creditId: null, status: existing.status, grossCents: existing.grossCents, payableCents: supplierInvoicePayable(existing, credits), reused: true };
      }
      const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier || supplier.storeId !== store.id) throw new Error('Supplier not found in active store');
      if (!Array.isArray(input.items) || !input.items.length || input.items.length > 500 || new Set(input.items.map((line: any) => line.receiptId)).size !== input.items.length) throw new Error('Invoice requires one to 500 distinct receipt lines');
      const previousInvoices = await supplierRows(tx, 'supplierInvoice', { storeId: store.id, supplierId });
      const lines: any[] = [];
      for (const item of [...input.items].sort((a, b) => String(a.receiptId).localeCompare(String(b.receiptId)))) {
        await tx.$queryRawUnsafe('SELECT "id" FROM "PurchaseReceipt" WHERE "id" = $1 FOR UPDATE', item.receiptId);
        const receipt = await tx.purchaseReceipt.findUnique({ where: { id: item.receiptId } });
        if (!receipt || receipt.storeId !== store.id || receipt.supplierId !== supplierId) throw new Error('Invoice receipt is outside the active supplier and store');
        const remainingMilli = quantityMilli(receipt.quantity) - quantityMilli(supplierMatchedQuantity(receipt.id, previousInvoices));
        const billedMilli = quantityMilli(item.quantity);
        const matchedMilli = item.matchedQuantity == null ? Math.min(billedMilli, remainingMilli) : quantityMilli(item.matchedQuantity);
        if (billedMilli <= 0 || matchedMilli <= 0 || matchedMilli > remainingMilli || matchedMilli > billedMilli) throw new Error('Invoice match exceeds unmatched receipt quantity or billed quantity');
        const unitCostCents = supplierAmountCents(item.unitCostCents, 'Billed unit cost');
        const billedCents = supplierLineCents(billedMilli / 1000, unitCostCents);
        const expectedCents = supplierLineCents(matchedMilli / 1000, receipt.unitCostCents);
        lines.push({ receiptId: receipt.id, purchaseOrderId: receipt.purchaseOrderId, poItemId: receipt.poItemId, inventoryLotId: receipt.inventoryLotId, productId: receipt.productId, supplierLotNumber: receipt.supplierLotNumber, quantity: billedMilli / 1000, matchedQuantity: matchedMilli / 1000, receiptQuantity: Number(receipt.quantity), unitCostCents, expectedUnitCostCents: Number(receipt.unitCostCents), billedCents, expectedCents, varianceCents: billedCents - expectedCents, quantityVariance: (billedMilli - matchedMilli) / 1000, conditionStatus: receipt.conditionStatus, inspectionNote: receipt.inspectionNote || '' });
      }
      const subtotalCents = supplierAmountCents(lines.reduce((total, line) => total + line.billedCents, 0));
      const expectedCents = supplierAmountCents(lines.reduce((total, line) => total + line.expectedCents, 0));
      const taxCents = supplierAmountCents(input.taxCents || 0), freightCents = supplierAmountCents(input.freightCents || 0);
      const grossCents = supplierAmountCents(subtotalCents + taxCents + freightCents);
      const variance = lines.some(line => line.varianceCents !== 0 || line.quantityVariance !== 0 || line.conditionStatus !== 'accepted');
      invoice = await tx.supplierInvoice.create({ data: { storeId: store.id, supplierId, supplierName: supplier.name, invoiceNumber, identityKey, idempotencyKey: args.idempotencyKey.trim(), currencyCode, invoiceDate, dueDate, documentReference, status: variance ? 'variance' : 'captured', lines, subtotalCents, expectedCents, taxCents, freightCents, grossCents, varianceCents: subtotalCents - expectedCents, capturedBy: context.session!.itemId, inputFingerprint: fingerprint, events: [event] } });
      return { success: true, invoiceId: invoice.id, creditId: null, status: invoice.status, grossCents, payableCents: grossCents, reused: false };
    }

    if (!args.invoiceId) throw new Error('Supplier invoice is required');
    await tx.$queryRawUnsafe('SELECT "id" FROM "SupplierInvoice" WHERE "id" = $1 FOR UPDATE', args.invoiceId);
    invoice = await tx.supplierInvoice.findUnique({ where: { id: args.invoiceId } });
    if (!invoice || invoice.storeId !== store.id) throw new Error('Supplier invoice not found in active store');
    const credits = await supplierRows(tx, 'supplierCredit', { storeId: store.id, invoiceId: invoice.id });
    const events = invoice.events || [];
    const replay = events.find((entry: any) => entry.idempotencyKey === args.idempotencyKey.trim());
    if (replay) {
      if (replay.fingerprint !== fingerprint) throw new Error('Supplier operation replay conflicts with original evidence');
      return { success: true, invoiceId: invoice.id, creditId: replay.creditId || null, status: invoice.status, grossCents: invoice.grossCents, payableCents: supplierInvoicePayable(invoice, credits), reused: true };
    }
    if (['settled', 'voided'].includes(invoice.status)) throw new Error('Settled and voided invoices are immutable');
    let creditId: string | null = null;
    const update: any = {};
    if (args.action === 'approve_invoice') {
      if (!['captured', 'variance'].includes(invoice.status)) throw new Error('Only captured or variance invoices can be approved');
      requiredText(input.reason, 'Approval reason');
      if (invoice.status === 'variance' && invoice.capturedBy === context.session!.itemId) throw new Error('A different operator must approve supplier invoice variances');
      if (credits.some(credit => credit.status === 'open')) throw new Error('Resolve open supplier claims before invoice approval');
      Object.assign(update, { status: 'approved', approvedBy: context.session!.itemId, approvedAt: new Date() });
    } else if (args.action === 'open_claim' || args.action === 'record_debit') {
      const reason = requiredText(input.reason, 'Supplier claim or debit reason');
      const reference = requiredText(input.reference, 'Supplier claim or debit reference');
      const evidence = requiredText(input.evidence, 'Supplier claim or debit document evidence');
      const amountCents = supplierAmountCents(input.amountCents);
      if (amountCents <= 0) throw new Error('Supplier claim or debit amount must be positive');
      if (input.receiptId && !(invoice.lines || []).some((line: any) => line.receiptId === input.receiptId)) throw new Error('Claim receipt does not belong to the invoice');
      if (args.action === 'open_claim' && amountCents > supplierInvoicePayable(invoice, credits)) throw new Error('Claim exceeds current supplier invoice liability');
      const identityKey = identity(store.id, invoice.supplierId, args.action, reference.toUpperCase());
      if (await tx.supplierCredit.findUnique({ where: { identityKey } })) throw new Error('Supplier claim or debit reference is already recorded');
      const credit = await tx.supplierCredit.create({ data: { storeId: store.id, supplierId: invoice.supplierId, invoiceId: invoice.id, receiptId: input.receiptId || null, identityKey, responseIdentityKey: identity(store.id, 'pending-response', args.idempotencyKey), idempotencyKey: args.idempotencyKey.trim(), kind: args.action === 'record_debit' ? 'debit' : 'claim', status: args.action === 'record_debit' ? 'accepted' : 'open', reference, amountCents, claimedAmountCents: amountCents, currencyCode: invoice.currencyCode, reason, evidence, openedBy: context.session!.itemId, ...(args.action === 'record_debit' ? { resolvedBy: context.session!.itemId, resolvedAt: new Date() } : {}), events: [event] } });
      creditId = credit.id;
      credits.push(credit);
      if (invoice.status === 'approved') Object.assign(update, { status: 'variance', approvedAt: null, approvedBy: '' });
    } else if (args.action === 'resolve_claim') {
      const credit = credits.find(credit => credit.id === args.creditId);
      if (!credit || credit.kind !== 'claim' || credit.status !== 'open') throw new Error('An open claim belonging to this invoice is required');
      if (!['credit', 'rejected'].includes(input.outcome)) throw new Error('Claim outcome must be credit or rejected');
      requiredText(input.reason, 'Claim resolution reason');
      const reference = requiredText(input.reference, 'Supplier response or credit document reference');
      const evidence = requiredText(input.evidence, 'Supplier response evidence');
      const amountCents = input.outcome === 'credit' ? supplierAmountCents(input.amountCents) : 0;
      if (input.outcome === 'credit' && (amountCents <= 0 || amountCents > credit.claimedAmountCents || amountCents > supplierInvoicePayable(invoice, credits))) throw new Error('Credit must be positive and cannot exceed claim or invoice liability');
      const acceptedIdentity = identity(store.id, invoice.supplierId, input.outcome === 'credit' ? 'supplier_credit' : 'rejected_claim', reference.toUpperCase());
      if (await tx.supplierCredit.findUnique({ where: { responseIdentityKey: acceptedIdentity } })) throw new Error('Supplier credit response document is already recorded');
      const updated = await tx.supplierCredit.update({ where: { id: credit.id }, data: { responseIdentityKey: acceptedIdentity, kind: input.outcome === 'credit' ? 'credit' : 'claim', status: input.outcome === 'credit' ? 'accepted' : 'rejected', reference, evidence, amountCents, resolvedBy: context.session!.itemId, resolvedAt: new Date(), events: [...credit.events, event] } });
      credits.splice(credits.indexOf(credit), 1, updated);
      creditId = credit.id;
    } else if (args.action === 'settle_invoice') {
      if (invoice.status !== 'approved') throw new Error('Invoice must be approved before recording settlement');
      if (credits.some(credit => credit.status === 'open')) throw new Error('Open supplier claims prevent settlement');
      const payableCents = supplierInvoicePayable(invoice, credits);
      if (supplierAmountCents(input.amountCents) !== payableCents) throw new Error('External settlement amount must equal the approved net payable');
      const reference = requiredText(input.reference, 'External payment reference');
      const evidence = requiredText(input.evidence, 'External payment evidence');
      const paidAt = date(input.paidAt, 'External payment date');
      if (paidAt > new Date()) throw new Error('External settlement cannot be recorded in the future');
      Object.assign(update, { status: 'settled', settledBy: context.session!.itemId, settledAt: new Date(), settlement: { amountCents: payableCents, currencyCode: invoice.currencyCode, reference, evidence, paidAt: paidAt.toISOString(), recordedBy: context.session!.itemId } });
    } else if (args.action === 'void_invoice') {
      requiredText(input.reason, 'Invoice void reason');
      if (invoice.status === 'approved' || credits.some(credit => credit.status === 'accepted' || credit.status === 'open')) throw new Error('Resolve claims and liability adjustments before voiding an invoice');
      update.status = 'voided';
    }
    await tx.supplierInvoice.update({ where: { id: invoice.id }, data: { ...update, events: [...events, { ...event, creditId }] } });
    return { success: true, invoiceId: invoice.id, creditId, status: update.status || invoice.status, grossCents: invoice.grossCents, payableCents: supplierInvoicePayable(invoice, credits), reused: false };
  }, { isolationLevel: 'Serializable' as any }));
}
