import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { catalogHash, catalogProductSnapshot, parseCatalogCsv, planCatalogImport } from '../lib/catalogImport';
import { withSerializableRetry } from '../utils/serializableTransaction';

type ImportArgs = { mode: string; schemaVersion: number; sourceSystem: string; sourceBatchId: string; idempotencyKey: string; csv: string; expectedPayloadHash?: string; expectedReviewHash?: string };
export async function importGroceryCatalog(_root: unknown, args: ImportArgs, context: Context) {
  await requireFreshCapability(context, 'canManageProducts');
  const store = await requireSessionStore(context);
  if (context.session?.data.store?.id !== store.id) throw new Error('Refresh the active Store session before importing catalog data');
  if (!['dry_run', 'commit'].includes(args.mode)) throw new Error('Choose dry_run or commit');
  const sourceSystem = args.sourceSystem?.trim(), sourceBatchId = args.sourceBatchId?.trim(), requestKey = args.idempotencyKey?.trim();
  if (!sourceSystem || sourceSystem.length > 100 || !sourceBatchId || sourceBatchId.length > 150 || !requestKey || requestKey.length < 12 || requestKey.length > 150) throw new Error('Source system, source batch and a stable request identity are required');
  const rows = parseCatalogCsv(args.csv, args.schemaVersion);
  const payloadHash = catalogHash({ storeId: store.id, schemaVersion: args.schemaVersion, sourceSystem, sourceBatchId, csv: args.csv });
  const identityKey = catalogHash([store.id, sourceSystem, sourceBatchId]), idempotencyKey = catalogHash([store.id, requestKey]);
  if (args.mode === 'commit' && args.expectedPayloadHash !== payloadHash) throw new Error('The exact catalog payload must be reviewed before commit');
  return withSerializableRetry(() => context.transaction(async transactionContext => {
    const tx: any = transactionContext.prisma;
    if (args.mode === 'commit') {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-catalog-import'), hashtext($1))", store.id);
      for (const sku of rows.map(row => row.sku).sort()) await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-catalog-sku'), hashtext($1))", `${store.id}:${sku}`);
    }
    const [existingBatch, existingRequest] = await Promise.all([tx.catalogImport.findUnique({ where: { identityKey } }), tx.catalogImport.findUnique({ where: { idempotencyKey } })]);
    if (existingRequest && (existingRequest.identityKey !== identityKey || existingRequest.payloadHash !== payloadHash)) throw new Error('Catalog request identity was reused for different content or source batch');
    if (existingBatch) {
      if (existingBatch.storeId !== store.id || existingBatch.payloadHash !== payloadHash) throw new Error('Source batch already committed with a different payload');
      return { valid: true, committed: true, reused: true, importId: existingBatch.id, payloadHash, reviewHash: existingBatch.reviewHash, currencyCode: existingBatch.currencyCode, issues: [], plan: existingBatch.result };
    }
    // Lock only existing batch products before the final baseline read. New SKU
    // predicates are protected by Serializable isolation; retry revalidates review.
    if (args.mode === 'commit') {
      const matches = await tx.product.findMany({ where: { storeId: store.id, sku: { in: rows.map(row => row.sku) } }, select: { id: true } });
      for (const product of matches.sort((a: any, b: any) => a.id.localeCompare(b.id))) await tx.$queryRawUnsafe('SELECT "id" FROM "Product" WHERE "id" = $1 FOR UPDATE', product.id);
    }
    const planned = await planCatalogImport(tx, store.id, rows);
    if (args.mode === 'dry_run' || planned.issues.length) return { valid: !planned.issues.length, committed: false, reused: false, importId: null, payloadHash, currencyCode: store.currencyCode, ...planned };
    if (args.expectedReviewHash !== planned.reviewHash) throw new Error('Catalog changed after review; run a fresh dry run before committing');
    const result = [];
    const productDb = transactionContext.sudo().db.Product;
    for (const item of planned.plan) {
      const next = item.after;
      // Keystone Product hooks remain the source authority for priceCents and
      // Store relationship validation. No inventory/cache/cost fields are sent.
      const data: any = { sku: next.sku, title: next.title, price: next.priceCents / 100, unitOfMeasure: next.unitOfMeasure, pricingMethod: next.pricingMethod, taxRateBasisPoints: next.taxRateBasisPoints,
        departmentRef: next.departmentId ? { connect: { id: next.departmentId } } : { disconnect: true }, supplier: next.supplierId ? { connect: { id: next.supplierId } } : { disconnect: true } };
      let product;
      if (item.before) product = await productDb.updateOne({ where: { id: item.before.id }, data });
      else {
        if (!next.departmentId) delete data.departmentRef;
        if (!next.supplierId) delete data.supplier;
        product = await productDb.createOne({ data: { ...data, status: 'draft', handle: `import-${catalogHash([store.id, next.sku]).slice(0, 32)}` } });
      }
      const persisted = await tx.product.findUnique({ where: { id: product.id } });
      if (!persisted || persisted.storeId !== store.id || Number(persisted.priceCents) !== next.priceCents) throw new Error('Product source hooks did not preserve imported Store and price authority');
      result.push({ ...item, productId: product.id, persisted: catalogProductSnapshot(persisted) });
    }
    const record = await tx.catalogImport.create({ data: { identityKey, idempotencyKey, sourceSystem, sourceBatchId, schemaVersion: args.schemaVersion, payloadHash, reviewHash: planned.reviewHash, storeId: store.id, currencyCode: store.currencyCode, rowCount: rows.length, rows, result, committedAt: new Date(), actorId: context.session!.itemId } });
    return { valid: true, committed: true, reused: false, importId: record.id, payloadHash, reviewHash: planned.reviewHash, currencyCode: store.currencyCode, issues: [], plan: result };
  }, { isolationLevel: 'Serializable' as any }));
}
