'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { findFulfillmentProducts, saveFulfillmentActual, finalizeFulfillmentSale } from '../actualsActions';
import styles from './FulfillmentBoard.module.css';

type ActualLine = {
  id: string; quantity: number; title: string;
  metadata?: { commercial?: { pricingMethod?: string; unitOfMeasure?: string; unitOfMeasurement?: string }; substitutionPreference?: string } | null;
  product?: { id: string; pricingMethod?: string; unitOfMeasure?: string } | null;
  fulfillment?: { resolution: string; productTitle: string; quantityMilli: number; unitOfMeasure: string; subtotalCents: number } | null;
};

export function FulfillmentActualsForm({ orderId, email, status, preference, item }: {
  orderId: string; email: string; status: string; preference?: string | null; item: ActualLine;
}) {
  const router = useRouter();
  const [resolution, setResolution] = useState<'picked' | 'short' | 'substituted'>('picked');
  const [products, setProducts] = useState<Awaited<ReturnType<typeof findFulfillmentProducts>>>([]);
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [key] = useState(() => `actual:${item.id}:${globalThis.crypto.randomUUID()}`);
  const [consentChannel, setConsentChannel] = useState('');
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
      setSaved(true); setMessage(`Resolved ${(result.quantityMilli / 1000).toFixed(3)} ${unit}; goods $${(result.subtotalCents / 100).toFixed(2)}.`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not resolve this line'); }
    finally { setBusy(false); }
  }

  if (item.fulfillment) return <div role="status"><strong>{item.fulfillment.resolution}: {item.fulfillment.productTitle}</strong><p>{item.fulfillment.quantityMilli / 1000} {item.fulfillment.unitOfMeasure} · ${(item.fulfillment.subtotalCents / 100).toFixed(2)} before tax and discount</p></div>;
  if (saved) return <p role="status">{message}</p>;
  if (status !== 'picking') return <p>Start picking to record actual goods.</p>;
  return <form className={styles.substitutionForm} onSubmit={submit} aria-busy={busy}>
    <label>Line resolution<select value={resolution} onChange={event => setResolution(event.target.value as typeof resolution)}>
      <option value="picked">Picked requested product</option><option value="short">Short / remove missing quantity</option>
      {!noSubstitution && <option value="substituted">Replacement product</option>}
    </select></label>
    {resolution === 'substituted' && <>
      <label>Find replacement<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Product title" /></label>
      <button type="button" className={styles.cardButton} disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { setProducts(await findFulfillmentProducts(search)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Search failed'); } finally { setBusy(false); }
      }}>Search products</button>
      <label>Replacement product<select required value={productId} onChange={event => setProductId(event.target.value)}><option value="">Select a product</option>{products.map(product => <option value={product.id} key={product.id}>{product.title} · {product.sku} · ${(product.priceCents / 100).toFixed(2)}/{product.unitOfMeasure}</option>)}</select></label>
    </>}
    <label>Actual gross quantity<input name="quantity" type="number" min="0" step="0.001" required defaultValue={item.quantity} /></label>
    <label>Tare to subtract<input name="tare" type="number" min="0" step="0.001" defaultValue="0" /></label>
    <label>Measurement unit<select name="unitOfMeasure" key={unit} defaultValue={unit}>{['each', 'lb', 'oz', 'kg', 'g', 'L', 'mL', 'gallon', 'quart', 'pint'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <p className={styles.lineMeta}>Record up to three decimal places. Measurements convert to {unit}. Resolve each line once; final tax and discount are calculated when the sale is finalized.</p>
    <label>Reason<textarea name="reason" required={resolution !== 'picked'} placeholder="Shortage or replacement details" /></label>
    <label>Customer consent<select value={consentChannel} onChange={event => setConsentChannel(event.target.value)}><option value="">No additional approval recorded</option><option value="phone">Phone approval</option><option value="in_person">In-person approval</option></select></label>
    {consentChannel && <label>Approval from {email}<textarea name="consentEvidence" required minLength={8} placeholder="Who approved, what changed, and the agreed quantity/price" /></label>}
    <p className={styles.lineMeta}>Contact preferences and quantities above the estimate require recorded customer approval.</p>
    {error && <p role="alert">{error}</p>}
    <button type="submit" className={styles.cardButton} disabled={busy}>{busy ? 'Resolving…' : 'Resolve actual goods'}</button>
  </form>;
}

export function FinalizeFulfillmentSaleButton({ orderId, finalized }: { orderId: string; finalized: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return <div>
    <button type="button" className={styles.cardButton} disabled={busy || finalized} onClick={async () => {
      setBusy(true); setError('');
      try {
        const result = await finalizeFulfillmentSale(orderId);
        setMessage(result.message || (result.status === 'finalized' ? 'Actual sale finalized. This order can be packed.' : 'Final payment needs resolution before packing.'));
        router.refresh();
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not finalize sale'); } finally { setBusy(false); }
    }}>{finalized ? 'Sale finalized' : busy ? 'Finalizing…' : 'Finalize actual sale'}</button>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
