'use client';

import { useRef, useState, useTransition } from 'react';
import { findPurchasingOptions } from '../actions/findPurchasingOptions';
import { useRouter } from 'next/navigation';
import { Plus, Search, X } from 'lucide-react';
import { createPurchaseOrderTask } from '@/features/platform/lib/taskActions';
import { PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformInput, platformSelect, platformTable, platformTextarea } from '@/features/platform/components/platformStyles';
import { formatMoney } from '@/features/platform/lib/format';
import { parseMoneyToCents } from '@/features/lib/moneyInput';

type Line = { productId: string; title: string; quantity: string; unitCost: string };

function lineValues(line: Line) {
  const quantity = /^\d{1,6}$/.test(line.quantity.trim()) ? Number(line.quantity) : null;
  const unitCostCents = parseMoneyToCents(line.unitCost);
  return { quantity: quantity && quantity >= 1 ? quantity : null, unitCostCents };
}

/**
 * A draft holds one or more product lines. The request key belongs to the
 * exact reviewed draft: resubmitting the same draft after an uncertain
 * response reuses it, and the server returns the original purchase order.
 */
export function CreatePurchaseOrderForm({ suppliers, products, currencyCode = 'USD' }: { suppliers: Array<{ id: string; name: string }>; products: Array<{ id: string; title: string }>; currencyCode?: string }) {
  const router = useRouter();
  const [supplierOptions, setSupplierOptions] = useState(suppliers), [productOptions, setProductOptions] = useState(products);
  const [supplierSearch, setSupplierSearch] = useState(''), [productSearch, setProductSearch] = useState('');
  const [pending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [candidateId, setCandidateId] = useState(products[0]?.id || '');
  const [lines, setLines] = useState<Line[]>([]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const requestKeys = useRef(new Map<string, string>());

  const findSuppliers = () => startTransition(async () => {
    try { const rows = await findPurchasingOptions('supplier', supplierSearch); setSupplierOptions(rows); setSupplierId(rows[0]?.id || ''); }
    catch { setFailed(true); setMessage('Supplier search is unavailable. Try again.'); }
  });
  const findProducts = () => startTransition(async () => {
    try { const rows = await findPurchasingOptions('product', productSearch); setProductOptions(rows); setCandidateId(rows[0]?.id || ''); }
    catch { setFailed(true); setMessage('Product search is unavailable. Try again.'); }
  });
  const addLine = () => {
    const product = productOptions.find((option) => option.id === candidateId);
    if (!product || lines.some((line) => line.productId === product.id)) return;
    setLines((current) => [...current, { productId: product.id, title: product.title, quantity: '1', unitCost: '' }]);
  };
  const updateLine = (productId: string, patch: Partial<Line>) => setLines((current) => current.map((line) => line.productId === productId ? { ...line, ...patch } : line));

  const parsed = lines.map((line) => ({ line, ...lineValues(line) }));
  const valid = parsed.length > 0 && parsed.every((entry) => entry.quantity !== null && entry.unitCostCents !== null);
  const totalCents = valid ? parsed.reduce((sum, entry) => sum + entry.quantity! * entry.unitCostCents!, 0) : null;
  const candidateAdded = lines.some((line) => line.productId === candidateId);

  return <form className="space-y-5" aria-busy={pending} onSubmit={(event) => {
    event.preventDefault();
    if (!valid) return;
    setMessage(null); setFailed(false);
    const items = parsed.map((entry) => ({ productId: entry.line.productId, quantity: entry.quantity!, unitCostCents: entry.unitCostCents! }));
    const fingerprint = JSON.stringify([supplierId, expectedDeliveryDate, notes.trim(), items]);
    const idempotencyKey = requestKeys.current.get(fingerprint) || `platform-po:${crypto.randomUUID()}`;
    requestKeys.current.set(fingerprint, idempotencyKey);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createPurchaseOrderTask>>;
      try {
        result = await createPurchaseOrderTask({ idempotencyKey, supplierId, items, expectedDeliveryDate: expectedDeliveryDate || undefined, notes });
      } catch {
        setFailed(true);
        setMessage('We couldn’t confirm whether the draft was created. Submit the same draft again; it won’t be duplicated.');
        return;
      }
      if (!result.ok) { setFailed(true); setMessage(result.error); return; }
      const draft = result.data?.createPurchaseOrderDraft;
      requestKeys.current.clear();
      setLines([]); setNotes(''); setExpectedDeliveryDate('');
      const lineCount = draft?.itemCount ?? items.length;
      setMessage(`${draft?.reused ? 'Draft already created' : 'Draft created'}${draft?.poNumber ? `: ${draft.poNumber}` : ''} · ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}.`);
      router.refresh();
    });
  }}>
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <div className="flex items-end gap-2">
          <PlatformField label="Find supplier" className="flex-1"><input className={platformInput} value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); findSuppliers(); } }} placeholder="Name" /></PlatformField>
          <button type="button" className={platformButton('secondary', 'md')} onClick={findSuppliers}><Search aria-hidden="true" />Find</button>
        </div>
        <PlatformField label="Supplier"><select required className={platformSelect} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>{supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></PlatformField>
      </div>
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <div className="flex items-end gap-2">
          <PlatformField label="Find product or SKU" className="flex-1"><input className={platformInput} value={productSearch} onChange={e => setProductSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); findProducts(); } }} placeholder="Title or SKU" /></PlatformField>
          <button type="button" className={platformButton('secondary', 'md')} onClick={findProducts}><Search aria-hidden="true" />Find</button>
        </div>
        <div className="flex items-end gap-2">
          <PlatformField label="Product" className="flex-1"><select className={platformSelect} value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>{productOptions.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></PlatformField>
          <button type="button" className={platformButton('secondary', 'md')} onClick={addLine} disabled={!candidateId || candidateAdded}><Plus aria-hidden="true" />{candidateAdded ? 'Added' : 'Add line'}</button>
        </div>
      </div>
    </div>
    <p className="-mt-2 text-xs text-muted-foreground">Search shows up to 50 matches. Refine by name or SKU to find any product.</p>

    {lines.length ? (
      <div className={platformTable.wrap}>
        <table className={`${platformTable.table} min-w-[36rem]`}>
          <thead className={platformTable.head}><tr><th className={platformTable.th}>Product</th><th className={platformTable.thNumeric}>Quantity</th><th className={platformTable.thNumeric}>Unit cost ({currencyCode})</th><th className={platformTable.thNumeric}>Line total</th><th className={platformTable.th}><span className="sr-only">Remove</span></th></tr></thead>
          <tbody>
            {parsed.map(({ line, quantity, unitCostCents }) => (
              <tr key={line.productId} className={platformTable.row}>
                <td className={platformTable.td}><p className="font-medium">{line.title}</p></td>
                <td className="px-3 py-2 text-right"><input aria-label={`Quantity of ${line.title}`} required inputMode="numeric" className={`${platformInput} ml-auto w-24 text-right tabular-nums`} value={line.quantity} onChange={(event) => updateLine(line.productId, { quantity: event.target.value })} aria-invalid={quantity === null} /></td>
                <td className="px-3 py-2 text-right"><input aria-label={`Unit cost of ${line.title}`} required inputMode="decimal" placeholder="0.00" className={`${platformInput} ml-auto w-28 text-right tabular-nums`} value={line.unitCost} onChange={(event) => updateLine(line.productId, { unitCost: event.target.value })} aria-invalid={line.unitCost !== '' && unitCostCents === null} /></td>
                <td className={platformTable.tdNumeric}>{quantity !== null && unitCostCents !== null ? formatMoney(quantity * unitCostCents, currencyCode) : '—'}</td>
                <td className="px-3 py-2 text-right"><button type="button" className={platformButton('ghost', 'sm')} onClick={() => setLines((current) => current.filter((entry) => entry.productId !== line.productId))} aria-label={`Remove ${line.title}`}><X aria-hidden="true" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">Add at least one product line.</p>}

    <div className="grid gap-3 sm:grid-cols-3">
      <PlatformField label="Expected delivery"><input className={platformInput} type="date" value={expectedDeliveryDate} onChange={(event) => setExpectedDeliveryDate(event.target.value)} /></PlatformField>
      <PlatformField label="PO note (optional)" hint="Shown on the purchase order, for example its purpose." className="sm:col-span-2"><textarea className={`${platformTextarea} min-h-16`} maxLength={1000} value={notes} onChange={(event) => setNotes(event.target.value)} /></PlatformField>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-t pt-4">
      <button type="submit" disabled={pending || !supplierId || !valid} className={platformButton('primary', 'md')}>{pending ? 'Creating draft…' : 'Create draft'}</button>
      <span className="text-sm text-muted-foreground">Total <span className="font-semibold text-foreground tabular-nums">{totalCents === null ? '—' : formatMoney(totalCents, currencyCode)}</span></span>
      {lines.length && !valid ? <span className="text-xs text-destructive">Enter a whole quantity and a unit cost such as 2.50 on every line.</span> : null}
    </div>
    {message ? <PlatformFeedback tone={failed ? 'error' : 'success'}>{message}</PlatformFeedback> : null}
  </form>;
}
