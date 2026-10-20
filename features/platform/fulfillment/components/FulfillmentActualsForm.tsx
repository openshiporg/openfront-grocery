'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { findFulfillmentProducts, saveFulfillmentActual, finalizeFulfillmentSale, proposeFulfillmentSubstitution, type FulfillmentProductOption } from '../actualsActions';
import { PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformInput, platformSelect, platformTextarea } from '@/features/platform/components/platformStyles';

type ActualLine = {
  id: string; quantity: number; title: string;
  metadata?: { commercial?: { pricingMethod?: string; unitOfMeasure?: string; unitOfMeasurement?: string }; substitutionPreference?: string } | null;
  product?: { id: string; pricingMethod?: string; unitOfMeasure?: string } | null;
  fulfillment?: { resolution: string; productTitle: string; quantityMilli: number; unitOfMeasure: string; subtotalCents: number } | null;
};

export type SubstitutionProposalView = {
  id: string; productId: string; productTitle: string; productSku?: string; quantityMilli: number; unitOfMeasure: string;
  unitPriceCents: number; estimatedSubtotalCents: number; reason?: string; status: 'pending' | 'approved' | 'rejected'; decidedAt?: string;
};

export function FulfillmentActualsForm({ orderId, email, status, preference, item, proposal }: {
  orderId: string; email: string; status: string; preference?: string | null; item: ActualLine; proposal?: SubstitutionProposalView | null;
}) {
  const router = useRouter();
  const approved = proposal?.status === 'approved' ? proposal : null;
  const formRef = useRef<HTMLFormElement | null>(null);
  const [resolution, setResolution] = useState<'picked' | 'short' | 'substituted'>(approved ? 'substituted' : 'picked');
  const [products, setProducts] = useState<FulfillmentProductOption[]>(approved ? [{ id: approved.productId, title: approved.productTitle, sku: approved.productSku || '', priceCents: approved.unitPriceCents, pricingMethod: '', unitOfMeasure: approved.unitOfMeasure }] : []);
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState(approved?.productId || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [key] = useState(() => `actual:${item.id}:${globalThis.crypto.randomUUID()}`);
  const [proposalKey, setProposalKey] = useState(() => `proposal:${item.id}:${globalThis.crypto.randomUUID()}`);
  const [consentChannel, setConsentChannel] = useState(approved ? 'online' : '');
  const originalUnit = item.metadata?.commercial?.unitOfMeasure || item.metadata?.commercial?.unitOfMeasurement || item.product?.unitOfMeasure || 'each';
  const selectedProduct = products.find(product => product.id === productId);
  const unit = resolution === 'substituted' ? selectedProduct?.unitOfMeasure || 'each' : originalUnit;
  const noSubstitution = preference === 'refund' || ['remove', 'none', 'refund', 'no_substitutions'].includes(item.metadata?.substitutionPreference || '');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try {
      const result = await saveFulfillmentActual({ orderId, lineItemId: item.id, resolution,
        productId: resolution === 'substituted' ? productId : undefined,
        quantity: String(form.get('quantity') || '0'), tare: String(form.get('tare') || '0'),
        unitOfMeasure: String(form.get('unitOfMeasure') || unit), reason: String(form.get('reason') || ''),
        consentChannel, consentCustomer: consentChannel ? email : '', consentEvidence: String(form.get('consentEvidence') || ''), idempotencyKey: key });
      if (!result.ok) { setError(result.error); return; }
      setSaved(true); setMessage(`Resolved ${(result.data.quantityMilli / 1000).toFixed(3)} ${unit}; goods $${(result.data.subtotalCents / 100).toFixed(2)}.`);
      router.refresh();
    } catch { setError('Could not resolve this line. Check your connection and try again.'); }
    finally { setBusy(false); }
  }

  async function askCustomer() {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const data = new FormData(form);
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await proposeFulfillmentSubstitution({ orderId, lineItemId: item.id, productId, quantity: String(data.get('quantity') || '0'),
        unitOfMeasure: String(data.get('unitOfMeasure') || unit), reason: String(data.get('reason') || ''), idempotencyKey: proposalKey });
      if (!result.ok) { setError(result.error); return; }
      setProposalKey(`proposal:${item.id}:${globalThis.crypto.randomUUID()}`);
      setMessage('Sent to the customer to approve or decline on their order page.');
      router.refresh();
    } catch { setError('The replacement could not be sent. Check your connection and try again.'); }
    finally { setBusy(false); }
  }

  if (item.fulfillment) return (
    <PlatformFeedback tone="success" title={<span className="capitalize">{item.fulfillment.resolution}: {item.fulfillment.productTitle}</span>}>
      {item.fulfillment.quantityMilli / 1000} {item.fulfillment.unitOfMeasure} · ${(item.fulfillment.subtotalCents / 100).toFixed(2)} before tax and discount
    </PlatformFeedback>
  );
  if (saved) return <PlatformFeedback tone="success">{message}</PlatformFeedback>;
  if (status !== 'picking') return <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">Start picking to record actual goods.</p>;
  const proposalNotice = proposal ? <PlatformFeedback className="sm:col-span-2" tone={proposal.status === 'approved' ? 'success' : proposal.status === 'rejected' ? 'warning' : 'info'} title={proposal.status === 'approved' ? 'Customer approved the replacement online' : proposal.status === 'rejected' ? 'Customer declined the replacement' : 'Waiting for the customer’s answer'}>
    {proposal.productTitle} · {proposal.quantityMilli / 1000} {proposal.unitOfMeasure} · est. ${(proposal.estimatedSubtotalCents / 100).toFixed(2)}.{' '}
    {proposal.status === 'approved' ? 'Record the actual replacement up to the approved quantity.' : proposal.status === 'rejected' ? 'Resolve the line as short, or propose a different product.' : 'You can still resolve the line as short if the customer does not answer in time.'}
  </PlatformFeedback> : null;
  return <form ref={formRef} className="grid gap-3 border-t pt-3 sm:grid-cols-2" onSubmit={submit} aria-busy={busy}>
    {proposalNotice}
    <PlatformField label="Line resolution" className="sm:col-span-2">
      <select className={platformSelect} value={resolution} onChange={event => setResolution(event.target.value as typeof resolution)}>
        <option value="picked">Picked requested product</option><option value="short">Short / remove missing quantity</option>
        {!noSubstitution && <option value="substituted">Replacement product</option>}
      </select>
    </PlatformField>
    {resolution === 'substituted' && <>
      <div className="flex items-end gap-2 sm:col-span-2">
        <PlatformField label="Find replacement" className="flex-1"><input className={platformInput} value={search} onChange={event => setSearch(event.target.value)} placeholder="Product title" /></PlatformField>
        <button type="button" className={platformButton('secondary', 'md')} disabled={busy} onClick={async () => {
          setBusy(true); setError('');
          try { const result = await findFulfillmentProducts(search); if (result.ok) setProducts(result.data); else setError(result.error); } catch { setError('Product search failed. Try again.'); } finally { setBusy(false); }
        }}>Search</button>
      </div>
      <PlatformField label="Replacement product" className="sm:col-span-2"><select className={platformSelect} required value={productId} onChange={event => setProductId(event.target.value)}><option value="">Select a product</option>{products.map(product => <option value={product.id} key={product.id}>{product.title} · {product.sku} · ${(product.priceCents / 100).toFixed(2)}/{product.unitOfMeasure}</option>)}</select></PlatformField>
    </>}
    <PlatformField label="Actual gross quantity"><input className={`${platformInput} tabular-nums`} name="quantity" type="number" min="0" step="0.001" required defaultValue={approved ? approved.quantityMilli / 1000 : item.quantity} /></PlatformField>
    <PlatformField label="Tare to subtract"><input className={`${platformInput} tabular-nums`} name="tare" type="number" min="0" step="0.001" defaultValue="0" /></PlatformField>
    <PlatformField label="Measurement unit" hint={`Converts to ${unit}; up to three decimals.`}><select className={platformSelect} name="unitOfMeasure" key={unit} defaultValue={unit}>{['each', 'lb', 'oz', 'kg', 'g', 'L', 'mL', 'gallon', 'quart', 'pint'].map(value => <option key={value} value={value}>{value}</option>)}</select></PlatformField>
    <PlatformField label="Customer consent"><select className={platformSelect} value={consentChannel} onChange={event => setConsentChannel(event.target.value)}><option value="">No additional approval</option>{approved ? <option value="online">Approved online by the customer</option> : null}<option value="phone">Phone approval</option><option value="in_person">In-person approval</option></select></PlatformField>
    <PlatformField label={resolution === 'picked' ? 'Reason (optional)' : 'Reason'} className="sm:col-span-2"><textarea className={`${platformTextarea} min-h-16`} name="reason" required={resolution !== 'picked'} placeholder="Shortage or replacement details" /></PlatformField>
    {consentChannel && consentChannel !== 'online' && <PlatformField label={`Approval from ${email}`} className="sm:col-span-2"><textarea className={`${platformTextarea} min-h-16`} name="consentEvidence" required minLength={8} placeholder="Who approved, what changed, and the agreed quantity/price" /></PlatformField>}
    <p className="text-xs leading-snug text-muted-foreground sm:col-span-2">Resolve each line once. Contact preferences and quantities above the estimate need recorded customer approval; final tax and discount are calculated when the sale is finalized.</p>
    {error && <PlatformFeedback tone="error" className="sm:col-span-2">{error}</PlatformFeedback>}
    {message && <PlatformFeedback tone="success" className="sm:col-span-2">{message}</PlatformFeedback>}
    <div className="flex flex-wrap gap-2 sm:col-span-2">
      <button type="submit" className={platformButton('primary', 'md', 'w-full sm:w-auto')} disabled={busy}>{busy ? 'Working…' : 'Resolve actual goods'}</button>
      {resolution === 'substituted' && !noSubstitution && proposal?.status !== 'pending' && !(approved && approved.productId === productId) ? <button type="button" className={platformButton('secondary', 'md', 'w-full sm:w-auto')} disabled={busy || !productId} onClick={askCustomer}>Ask the customer to approve online</button> : null}
    </div>
  </form>;
}

export function FinalizeFulfillmentSaleButton({ orderId, finalized }: { orderId: string; finalized: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return <div className="flex flex-col gap-1.5">
    <button type="button" className={platformButton('secondary', 'sm', 'h-[34px]')} disabled={busy || finalized} onClick={async () => {
      setBusy(true); setError('');
      try {
        const result = await finalizeFulfillmentSale(orderId);
        if (!result.ok) { setError(result.error); return; }
        setMessage(result.data.message || (result.data.status === 'finalized' ? 'Actual sale finalized. This order can be packed.' : 'Final payment needs resolution before packing.'));
        router.refresh();
      } catch { setError('Could not finalize the sale. Check your connection and try again.'); } finally { setBusy(false); }
    }}>{finalized ? 'Sale finalized' : busy ? 'Finalizing…' : 'Finalize actual sale'}</button>
    {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
