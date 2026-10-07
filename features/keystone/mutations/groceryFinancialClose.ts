import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { closePeriod, compileFinancialClose, matchStatementEntry, readReportRows, reportHash, rowsToCsv, statementEntries } from '../lib/reportingClose';
import { withSerializableRetry } from '../utils/serializableTransaction';

async function financialActor(context: Context) {
  await requireFreshCapability(context, 'canManagePayments');
  return { store: await requireSessionStore(context), userId: context.session!.itemId };
}
function requestKey(value: string) {
  if (!value || value.length < 12 || value.length > 200) throw new Error('A valid financial request idempotency key is required');
  return value;
}

export async function createCloseInTransaction(tx: any, actor: { store: { id: string; currencyCode: string }; userId: string }, input: {
  startDate: string; endDate: string; timezone: string; idempotencyKey: string; note?: string | null;
}, now = new Date()) {
  const period = closePeriod(input.startDate, input.endDate, input.timezone, now);
  const key = requestKey(input.idempotencyKey), note = input.note?.trim() || '';
  if (note.length > 2000) throw new Error('Close note must be at most 2000 characters');
  await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', actor.store.id);
  const existing = await tx.financialClose.findUnique({ where: { idempotencyKey: key } });
  if (existing) {
    if (existing.storeId !== actor.store.id || existing.snapshot.startDate !== period.startDate || existing.snapshot.endDate !== period.endDate || existing.timezone !== period.timezone || existing.note !== note) throw new Error('Close idempotency key was reused with different scope or input');
    return { id: existing.id, status: existing.status, contentHash: existing.contentHash, snapshot: existing.snapshot, reused: true };
  }
  const range = { gte: period.start, lt: new Date(Math.min(period.end.getTime(), now.getTime() + 1)) };
  const [orders, payments, refunds, statements, movements, lots, coupons] = await Promise.all([
    readReportRows(tx.order, { where: { storeId: actor.store.id, OR: [{ createdAt: range }, { metadata: { path: ['finalSale', 'finalizedAt'], gte: period.start.toISOString(), lt: range.lt.toISOString() } }] }, select: { id: true, storeId: true, createdAt: true, status: true, subtotalCents: true, metadata: true } }),
    readReportRows(tx.payment, { where: { storeId: actor.store.id, OR: [{ processedAt: range }, { processedAt: null, createdAt: range }] }, select: { id: true, storeId: true, orderId: true, processedAt: true, createdAt: true, amountCents: true, status: true, providerPaymentId: true } }),
    readReportRows(tx.paymentRefund, { where: { payment: { storeId: actor.store.id }, OR: [{ processedAt: range }, { processedAt: null, requestedAt: range }] }, select: { id: true, amountCents: true, status: true, processedAt: true, requestedAt: true, providerRefundId: true, providerData: true, failureMessage: true, payment: { select: { storeId: true, orderId: true } } } }),
    readReportRows(tx.settlementMatch, { where: { storeId: actor.store.id, settledAt: range, createdAt: { lte: now } } }),
    readReportRows(tx.inventoryMovement, { where: { storeId: actor.store.id, createdAt: { lt: new Date(Math.min(period.end.getTime(), now.getTime())) } }, select: { id: true, storeId: true, inventoryLotId: true, orderId: true, sequence: true, quantityDelta: true, quantityAfter: true, createdAt: true, reason: true } }),
    readReportRows(tx.inventoryLot, { where: { storeId: actor.store.id, createdAt: { lte: now } }, select: { id: true, storeId: true, createdAt: true, costPerUnitCents: true } }),
    readReportRows(tx.userCoupon, { where: { user: { storeId: actor.store.id }, clippedAt: { lte: now } }, select: { id: true, clippedAt: true, usedAt: true, user: { select: { storeId: true } }, coupon: { select: { id: true, code: true, discountType: true, discountValueCents: true, validTo: true } } } }),
  ]);
  // Include captured orders with missing legacy recognition evidence, even when
  // they were requested earlier. Never infer a finalization date from createdAt.
  const capturedOrderIds = [...new Set(payments.map(payment => payment.orderId).filter(Boolean))].filter(id => !orders.some(order => order.id === id));
  if (capturedOrderIds.length) orders.push(...await readReportRows(tx.order, { where: { storeId: actor.store.id, id: { in: capturedOrderIds } }, select: { id: true, storeId: true, createdAt: true, status: true, subtotalCents: true, metadata: true } }));
  const settlements = orders.length ? await readReportRows(tx.orderSettlement, { where: { orderId: { in: orders.map(order => order.id) }, status: 'finalized', createdAt: { lte: now } }, select: { id: true, orderId: true, status: true, snapshot: true } }) : [];
  for (const order of orders) order.settlements = settlements.filter(settlement => settlement.orderId === order.id);
  const snapshot = compileFinancialClose(actor.store.id, actor.store.currencyCode, period, { orders, payments, refunds, statements, movements, lots, coupons });
  if (snapshot.exceptions.length && note.length < 8) throw new Error(`Record a close note acknowledging ${snapshot.exceptions.length} unresolved exceptions: ${snapshot.exceptions.slice(0, 5).map(entry => `${entry.sourceType} ${entry.sourceId}: ${entry.reason}`).join('; ')}`);
  const contentHash = reportHash(snapshot), status = snapshot.exceptions.length ? 'closed_with_exceptions' : 'reconciled';
  const record = await tx.financialClose.create({ data: { idempotencyKey: key, storeId: actor.store.id, recordedById: actor.userId,
    periodStart: period.start, periodEnd: period.end, timezone: period.timezone, cutoff: now, status, note, contentHash, snapshot } });
  return { id: record.id, status, contentHash, snapshot, reused: false };
}

export async function createGroceryFinancialClose(_root: unknown, input: Parameters<typeof createCloseInTransaction>[2], context: Context) {
  const actor = await financialActor(context);
  return withSerializableRetry(() => context.transaction(tc => createCloseInTransaction(tc.prisma, actor, input), { isolationLevel: 'RepeatableRead' as any }));
}

export async function importStatementInTransaction(tx: any, actor: { store: { id: string; currencyCode: string }; userId: string }, input: {
  providerCode: string; statementReference: string; csv: string; idempotencyKey: string;
}, now = new Date()) {
  const key = requestKey(input.idempotencyKey), statementReference = input.statementReference.trim(), providerCode = input.providerCode.trim();
  if (!statementReference || statementReference.length > 200 || !providerCode || providerCode.length > 200) throw new Error('Provider and statement references are required');
  const entries = statementEntries(input.csv, now), fingerprint = reportHash({ providerCode, statementReference, entries });
  await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', actor.store.id);
  const prior = await tx.settlementMatch.findFirst({ where: { storeId: actor.store.id, evidence: { path: ['importKey'], equals: key } } });
  if (prior && prior.evidence.importFingerprint !== fingerprint) throw new Error('Statement idempotency key was reused with different input');
  const imported = [];
  for (const entry of entries) {
    const sourceKey = reportHash([actor.store.id, providerCode, statementReference, entry.entryReference]);
    const existing = await tx.settlementMatch.findUnique({ where: { sourceKey } });
    if (existing) {
      if (existing.evidence.entryFingerprint !== reportHash(entry)) throw new Error('A statement entry reference was reused with changed amounts or evidence');
      imported.push(existing); continue;
    }
    const candidates = await tx.payment.findMany({ where: { storeId: actor.store.id, providerPaymentId: entry.paymentReference, paymentProvider: { code: providerCode } }, take: 2,
      include: { paymentProvider: true, order: { select: { currencyCode: true } }, refunds: true } });
    const payment = candidates.length === 1 ? candidates[0] : null;
    const match = matchStatementEntry(entry, payment, actor.store.id, providerCode);
    if (match.status === 'matched') {
      const duplicate = await tx.settlementMatch.findFirst({ where: { storeId: actor.store.id, paymentId: payment.id, entryType: entry.entryType, refundReference: entry.refundReference, status: 'matched' } });
      if (duplicate) { match.status = 'unresolved'; match.reason = 'Duplicate provider entry for the same local capture/refund'; }
    }
    imported.push(await tx.settlementMatch.create({ data: { ...entry, settledAt: new Date(entry.settledAt), ...match, sourceKey, storeId: actor.store.id,
      providerCode, statementReference, recordedById: actor.userId, evidence: { importKey: key, importFingerprint: fingerprint, entryFingerprint: reportHash(entry), importedAt: now.toISOString(), revisions: [] } } }));
  }
  return { entries: imported.map(entry => ({ id: entry.id, entryReference: entry.entryReference, status: entry.status, reason: entry.reason })),
    matched: imported.filter(entry => entry.status === 'matched').length, unresolved: imported.filter(entry => entry.status === 'unresolved').length, reused: Boolean(prior) };
}

export async function importGrocerySettlementStatement(_root: unknown, input: Parameters<typeof importStatementInTransaction>[2], context: Context) {
  const actor = await financialActor(context);
  return withSerializableRetry(() => context.transaction(tc => importStatementInTransaction(tc.prisma, actor, input), { isolationLevel: 'RepeatableRead' as any }));
}

export async function resolveGrocerySettlementMatch(_root: unknown, input: { matchId: string; reason: string; idempotencyKey: string }, context: Context) {
  const actor = await financialActor(context), key = requestKey(input.idempotencyKey), reason = input.reason.trim();
  if (reason.length < 8 || reason.length > 1000) throw new Error('Record a review reason between 8 and 1000 characters');
  return withSerializableRetry(() => context.transaction(async tc => {
    const tx = tc.prisma as any;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', actor.store.id);
    const match = await tx.settlementMatch.findFirst({ where: { id: input.matchId, storeId: actor.store.id } });
    if (!match) throw new Error('Statement entry not found in active store');
    const revisions = match.evidence?.revisions || [], previous = revisions.find((entry: any) => entry.idempotencyKey === key);
    if (previous) {
      if (previous.reason !== reason) throw new Error('Review idempotency key was reused with changed evidence');
      return { id: match.id, status: previous.status, reason: previous.matchReason, reused: true };
    }
    if (revisions.length >= 100) throw new Error('Statement entry reached the review history limit');
    const candidates = await tx.payment.findMany({ where: { storeId: actor.store.id, providerPaymentId: match.paymentReference, paymentProvider: { code: match.providerCode } }, take: 2,
      include: { paymentProvider: true, order: { select: { currencyCode: true } }, refunds: true } });
    const result = matchStatementEntry(match, candidates.length === 1 ? candidates[0] : null, actor.store.id, match.providerCode);
    if (result.status === 'matched' && await tx.settlementMatch.findFirst({ where: { id: { not: match.id }, storeId: actor.store.id, paymentId: result.paymentId, entryType: match.entryType, refundReference: match.refundReference, status: 'matched' } })) {
      result.status = 'unresolved'; result.reason = 'Duplicate provider entry for the same local capture/refund';
    }
    await tx.settlementMatch.update({ where: { id: match.id }, data: { ...result, evidence: { ...match.evidence,
      revisions: [...revisions, { idempotencyKey: key, reason, status: result.status, matchReason: result.reason, actorId: actor.userId, occurredAt: new Date().toISOString() }] } } });
    return { id: match.id, status: result.status, reason: result.reason, reused: false };
  }, { isolationLevel: 'RepeatableRead' as any }));
}

export async function groceryFinancialCloses(_root: unknown, args: { page?: number; pageSize?: number }, context: Context) {
  const actor = await financialActor(context), page = args.page || 1, pageSize = args.pageSize || 25;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('Invalid report page');
  const tx = context.prisma as any;
  const [closes, total, exceptions, totalExceptions] = await Promise.all([
    tx.financialClose.findMany({ where: { storeId: actor.store.id }, orderBy: [{ cutoff: 'desc' }, { id: 'asc' }], skip: (page - 1) * pageSize, take: pageSize,
      select: { id: true, periodStart: true, periodEnd: true, timezone: true, cutoff: true, status: true, contentHash: true, note: true } }),
    tx.financialClose.count({ where: { storeId: actor.store.id } }),
    tx.settlementMatch.findMany({ where: { storeId: actor.store.id, status: 'unresolved' }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: pageSize, skip: (page - 1) * pageSize,
      select: { id: true, statementReference: true, entryReference: true, paymentReference: true, amountCents: true, currencyCode: true, payoutReference: true, reason: true } }),
    tx.settlementMatch.count({ where: { storeId: actor.store.id, status: 'unresolved' } }),
  ]);
  return { closes, total, page, pageSize, exceptions, totalExceptions, currencyCode: actor.store.currencyCode, timezone: actor.store.timezone };
}

export async function groceryFinancialCloseExport(_root: unknown, { closeId }: { closeId: string }, context: Context) {
  const actor = await financialActor(context);
  const record = await (context.prisma as any).financialClose.findFirst({ where: { id: closeId, storeId: actor.store.id } });
  if (!record) throw new Error('Financial close not found in active store');
  if (reportHash(record.snapshot) !== record.contentHash) throw new Error('Stored close snapshot does not match its content hash');
  return { id: record.id, contentHash: record.contentHash, snapshot: record.snapshot,
    csv: rowsToCsv([{ sourceType: 'close_summary', sourceId: record.id, ...record.snapshot.totals, contentHash: record.contentHash,
      periodStart: record.snapshot.periodStart, periodEndExclusive: record.snapshot.periodEndExclusive, timezone: record.snapshot.timezone, cutoff: record.snapshot.cutoff, basis: record.snapshot.basis },
      ...record.snapshot.rows, ...record.snapshot.exceptions.map((entry: any) => ({ sourceType: 'exception', sourceId: entry.sourceId, relatedSourceType: entry.sourceType, reason: entry.reason }))]),
    filename: `grocery-close-${record.snapshot.startDate}-${record.snapshot.endDate}-${record.id}.csv` };
}
