'use client';

import { useState, useTransition } from 'react';
import {findPurchasingOptions} from '../actions/findPurchasingOptions';
import { useRouter } from 'next/navigation';
import { createPurchaseOrderTask } from '@/features/platform/lib/taskActions';

export function CreatePurchaseOrderForm({ suppliers, products }: { suppliers: Array<{ id: string; name: string }>; products: Array<{ id: string; title: string; price?: number | null }> }) {
  const router = useRouter();
  const [supplierOptions,setSupplierOptions]=useState(suppliers),[productOptions,setProductOptions]=useState(products);
  const [supplierSearch,setSupplierSearch]=useState(''),[productSearch,setProductSearch]=useState('');
  const [pending, startTransition] = useTransition();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || '');
  const [productId, setProductId] = useState(products[0]?.id || '');
  const [quantity, setQuantity] = useState(1);
  const [unitCost, setUnitCost] = useState('0.00');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);


  return <form className="space-y-4" aria-busy={pending} onSubmit={(event) => {
    event.preventDefault();
    setMessage(null); setFailed(false);
    startTransition(async () => {
      try {
        await createPurchaseOrderTask({ supplierId, productId, quantity, unitCost: Number(unitCost), expectedDeliveryDate: expectedDeliveryDate || undefined });
        setMessage('Draft created.');
        router.refresh();
      } catch (cause) { setFailed(true); setMessage(cause instanceof Error ? cause.message : 'Unable to create purchase order'); }
    });
  }}>
    <div className="flex flex-wrap gap-3"><label className="grid text-xs">Find supplier across all records<input className="min-h-10 rounded border p-2" value={supplierSearch} onChange={e=>setSupplierSearch(e.target.value)}/></label><button type="button" className="rounded border px-3" onClick={()=>startTransition(async()=>{try{const rows=await findPurchasingOptions('supplier',supplierSearch);setSupplierOptions(rows);setSupplierId(rows[0]?.id || '');}catch(e){setFailed(true);setMessage(String(e));}})}>Find suppliers</button><label className="grid text-xs">Find product or SKU<input className="min-h-10 rounded border p-2" value={productSearch} onChange={e=>setProductSearch(e.target.value)}/></label><button type="button" className="rounded border px-3" onClick={()=>startTransition(async()=>{try{const rows=await findPurchasingOptions('product',productSearch);setProductOptions(rows);setProductId(rows[0]?.id || '');}catch(e){setFailed(true);setMessage(String(e));}})}>Find products</button></div><p className="text-xs text-muted-foreground">Search returns up to 50 matches. Refine by name or SKU to select any catalog item.</p>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Supplier<select required className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>{supplierOptions.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Product<select required className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={productId} onChange={(event) => setProductId(event.target.value)}>{productOptions.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Quantity<input required className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} /></label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Unit cost<input required className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="number" min="0" step="0.01" inputMode="decimal" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">Expected delivery<input className="h-10 rounded-md border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" type="date" value={expectedDeliveryDate} onChange={(event) => setExpectedDeliveryDate(event.target.value)} /></label>
    </div>
    <div className="flex flex-wrap items-center gap-3"><button type="submit" disabled={pending || !supplierId || !productId || quantity < 1 || Number(unitCost) < 0} className="h-10 rounded-md bg-foreground px-4 text-sm font-medium text-background hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50">{pending ? 'Creating draft…' : 'Create draft'}</button>{message ? <p role={failed ? 'alert' : 'status'} className={`text-sm ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</p> : null}</div>
  </form>;
}
