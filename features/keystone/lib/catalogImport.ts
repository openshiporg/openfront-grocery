import { createHash } from 'node:crypto';

export const CATALOG_IMPORT_COLUMNS = ['sku', 'title', 'priceCents', 'unitOfMeasure', 'pricingMethod', 'departmentId', 'supplierId', 'taxRateBasisPoints'] as const;
export type CatalogImportRow = { rowNumber: number; sku: string; title: string; priceCents: number; unitOfMeasure: string; pricingMethod: string; departmentId: string | null; supplierId: string | null; taxRateBasisPoints: number | null };
export const catalogHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Strict CSV with quoted commas/newlines/escaped quotes; never interprets formulas. */
export function parseCatalogCsv(csv: string, schemaVersion: number): CatalogImportRow[] {
  if (schemaVersion !== 1) throw new Error('Unsupported catalog schemaVersion; use version 1');
  if (typeof csv !== 'string' || Buffer.byteLength(csv, 'utf8') > 1_000_000) throw new Error('Catalog CSV must be at most 1 MB');
  const matrix: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  const finishCell = () => { row.push(cell); cell = ''; closed = false; };
  const finishRow = () => { finishCell(); if (row.some(value => value.length)) matrix.push(row); row = []; if (matrix.length > 501) throw new Error('Use batches of at most 500 catalog rows, each with its own sourceBatchId'); };
  const input = csv.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) { if (char === '"') { if (input[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += char; continue; }
    if (char === ',') { finishCell(); continue; }
    if (char === '\r' || char === '\n') { if (char === '\r' && input[i + 1] === '\n') i++; finishRow(); continue; }
    if (closed) throw new Error('Unexpected characters after a quoted CSV value');
    if (char === '"') { if (cell.length) throw new Error('Quotes must enclose an entire CSV value'); quoted = true; } else cell += char;
  }
  if (quoted) throw new Error('Unclosed quoted CSV value');
  if (cell.length || row.length || closed) finishRow();
  const header = matrix.shift()?.map(value => value.trim());
  if (!header || header.length !== CATALOG_IMPORT_COLUMNS.length || header.some((value, index) => value !== CATALOG_IMPORT_COLUMNS[index])) throw new Error(`CSV header must be exactly: ${CATALOG_IMPORT_COLUMNS.join(',')}`);
  if (!matrix.length) throw new Error('At least one catalog row is required');
  const seen = new Set<string>();
  const number = (value: string, max: number, label: string) => { if (!/^(0|[1-9]\d*)$/.test(value) || Number(value) > max) throw new Error(`${label} must be an integer between 0 and ${max}`); return Number(value); };
  return matrix.map((values, index) => {
    const rowNumber = index + 2;
    if (values.length !== header.length) throw new Error(`Row ${rowNumber}: expected ${header.length} columns`);
    const [sku, title, price, unitOfMeasure, pricingMethod, departmentId, supplierId, tax] = values.map(value => value.trim());
    if (!sku || sku.length > 100 || /[\r\n\u0000-\u001f]/.test(sku) || !title || title.length > 300) throw new Error(`Row ${rowNumber}: SKU and title are required (100/300 characters maximum)`);
    if (seen.has(sku)) throw new Error(`Row ${rowNumber}: duplicate SKU ${sku}`); seen.add(sku);
    const allowedUnits: Record<string, string[]> = { unit: ['each'], weight: ['lb', 'oz', 'kg', 'g'], volume: ['L', 'mL', 'gallon', 'quart', 'pint'] };
    if (!allowedUnits[pricingMethod]?.includes(unitOfMeasure)) throw new Error(`Row ${rowNumber}: unitOfMeasure must agree with pricingMethod`);
    if ([departmentId, supplierId].some(id => id.length > 200 || /[\r\n\u0000-\u001f]/.test(id))) throw new Error(`Row ${rowNumber}: invalid relationship identity`);
    return { rowNumber, sku, title, priceCents: number(price, 2147483647, `Row ${rowNumber} priceCents`), unitOfMeasure, pricingMethod, departmentId: departmentId || null, supplierId: supplierId || null, taxRateBasisPoints: tax === '' ? null : number(tax, 10000, `Row ${rowNumber} taxRateBasisPoints`) };
  });
}

export function catalogProductSnapshot(product: any) {
  return product ? { id: product.id, sku: product.sku, title: product.title, priceCents: Number(product.priceCents), unitOfMeasure: product.unitOfMeasure, pricingMethod: product.pricingMethod, departmentId: product.departmentRefId || null, supplierId: product.supplierId || null, taxRateBasisPoints: product.taxRateBasisPoints ?? null, status: product.status, updatedAt: product.updatedAt ? new Date(product.updatedAt).toISOString() : null } : null;
}

export async function planCatalogImport(tx: any, storeId: string, rows: CatalogImportRow[]) {
  // Only this batch's keys are queried; an unrelated large catalog is never truncated.
  const products = await tx.product.findMany({ where: { storeId, sku: { in: rows.map(row => row.sku) } } });
  const departmentIds = [...new Set(rows.map(row => row.departmentId).filter(Boolean))], supplierIds = [...new Set(rows.map(row => row.supplierId).filter(Boolean))];
  const [departments, suppliers] = await Promise.all([
    tx.department.findMany({ where: { id: { in: departmentIds }, storeId }, select: { id: true, name: true } }),
    tx.supplier.findMany({ where: { id: { in: supplierIds }, storeId }, select: { id: true, name: true } }),
  ]);
  const issues: string[] = [];
  const plan = rows.map(row => {
    const matches = products.filter((product: any) => product.sku === row.sku);
    if (matches.length > 1) issues.push(`Row ${row.rowNumber}: existing SKU ${row.sku} is ambiguous; resolve duplicate catalog identities first`);
    const before = catalogProductSnapshot(matches[0]);
    if (row.departmentId && !departments.some((department: any) => department.id === row.departmentId)) issues.push(`Row ${row.rowNumber}: department does not belong to the active Store`);
    if (row.supplierId && !suppliers.some((supplier: any) => supplier.id === row.supplierId)) issues.push(`Row ${row.rowNumber}: supplier does not belong to the active Store`);
    if (before && (before.unitOfMeasure !== row.unitOfMeasure || before.pricingMethod !== row.pricingMethod)) issues.push(`Row ${row.rowNumber}: an existing product's physical unit and pricing basis cannot be changed by catalog import`);
    return { rowNumber: row.rowNumber, action: before ? 'update' : 'create', before, after: { sku: row.sku, title: row.title, priceCents: row.priceCents, unitOfMeasure: row.unitOfMeasure, pricingMethod: row.pricingMethod, departmentId: row.departmentId, supplierId: row.supplierId, taxRateBasisPoints: row.taxRateBasisPoints, status: before?.status || 'draft' }, departmentName: departments.find((department: any) => department.id === row.departmentId)?.name || null, supplierName: suppliers.find((supplier: any) => supplier.id === row.supplierId)?.name || null };
  });
  return { issues, plan, reviewHash: catalogHash({ storeId, plan }) };
}
