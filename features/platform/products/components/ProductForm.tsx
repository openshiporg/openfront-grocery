'use client';

import { useActionState } from 'react';
import { PlatformCheckboxRow, PlatformField, PlatformFieldset } from '@/features/platform/components/PlatformForm';
import { platformButton, platformCheckbox, platformInput, platformSelect } from '@/features/platform/components/platformStyles';
import { bpsToInput, centsToInput } from '@/features/lib/moneyInput';
import { saveProductAction, type ProductActionState } from '../actions';

export type EditableProduct = {
  id: string; title: string; handle: string; sku: string; status: string; priceCents: number; pricingMethod: string; unitOfMeasure: string;
  imageUrl?: string | null; isPerishable: boolean; shelfLife?: number | null; taxRateBasisPoints?: number | null; lowStockThreshold?: number | null; organicCertified: boolean;
  departmentRef?: { id: string; name: string } | null; supplier?: { id: string; name: string } | null;
};
type Option = { id: string; name: string };

const initial: ProductActionState = { ok: false, error: null, message: null };
const units = [['each', 'Each'], ['lb', 'Pound (lb)'], ['oz', 'Ounce (oz)'], ['kg', 'Kilogram (kg)'], ['g', 'Gram (g)'], ['L', 'Liter (L)'], ['mL', 'Milliliter (mL)'], ['gallon', 'Gallon'], ['quart', 'Quart'], ['pint', 'Pint']];

function withCurrent(options: Option[], current?: Option | null) {
  return current && !options.some((option) => option.id === current.id) ? [current, ...options] : options;
}

/** Catalog identity, placement, price and unit for one product. Without `product` it creates a draft. */
export function ProductForm({ product, departments, suppliers, currencyCode }: { product?: EditableProduct; departments: Option[]; suppliers: Option[]; currencyCode: string }) {
  const [state, action, pending] = useActionState(saveProductAction, initial);
  const value = (name: string, fallback: string) => state.values?.[name] ?? fallback;
  const checked = (name: string, fallback: boolean) => state.values ? state.values[name] === 'on' : fallback;
  return (
    <form action={action} className="space-y-5 p-4 md:p-5" aria-busy={pending}>
      {product ? <input type="hidden" name="id" value={product.id} /> : null}
      <fieldset disabled={pending} className="space-y-5">
        <PlatformFieldset legend="Catalog identity">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <PlatformField label="Name" className="sm:col-span-2"><input name="title" required maxLength={200} className={platformInput} defaultValue={value('title', product?.title ?? '')} /></PlatformField>
            <PlatformField label="Handle" hint="Used in the product's web address."><input name="handle" required maxLength={120} className={`${platformInput} font-mono`} defaultValue={value('handle', product?.handle ?? '')} /></PlatformField>
            <PlatformField label="SKU"><input name="sku" maxLength={64} className={`${platformInput} font-mono`} defaultValue={value('sku', product?.sku ?? '')} /></PlatformField>
            <PlatformField label="Status" hint="Only published products are shown in the shop.">
              <select name="status" className={platformSelect} defaultValue={value('status', product?.status ?? 'draft')}><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option></select>
            </PlatformField>
            <PlatformField label="Image address" className="sm:col-span-2 lg:col-span-3"><input name="imageUrl" type="url" maxLength={2048} placeholder="https://" className={platformInput} defaultValue={value('imageUrl', product?.imageUrl ?? '')} /></PlatformField>
          </div>
        </PlatformFieldset>
        <PlatformFieldset legend="Placement">
          <div className="grid gap-3 sm:grid-cols-2">
            <PlatformField label="Department">
              <select name="departmentId" className={platformSelect} defaultValue={value('departmentId', product?.departmentRef?.id ?? '')}><option value="">No department</option>{withCurrent(departments, product?.departmentRef).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
            </PlatformField>
            <PlatformField label="Supplier">
              <select name="supplierId" className={platformSelect} defaultValue={value('supplierId', product?.supplier?.id ?? '')}><option value="">No supplier</option>{withCurrent(suppliers, product?.supplier).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
            </PlatformField>
          </div>
        </PlatformFieldset>
        <PlatformFieldset legend="Price and unit" hint="Units can't be changed once the product has stock or orders; create a separate product instead.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <PlatformField label={`Price (${currencyCode})`}><input name="price" required inputMode="decimal" className={`${platformInput} tabular-nums`} defaultValue={value('price', product ? centsToInput(product.priceCents) : '')} placeholder="0.00" /></PlatformField>
            <PlatformField label="Priced by">
              <select name="pricingMethod" className={platformSelect} defaultValue={value('pricingMethod', product?.pricingMethod ?? 'unit')}><option value="unit">Item</option><option value="weight">Weight</option><option value="volume">Volume</option></select>
            </PlatformField>
            <PlatformField label="Unit">
              <select name="unitOfMeasure" className={platformSelect} defaultValue={value('unitOfMeasure', product?.unitOfMeasure ?? 'each')}>{units.map(([unit, label]) => <option key={unit} value={unit}>{label}</option>)}</select>
            </PlatformField>
            <PlatformField label="Tax rate (%)" hint="Blank uses the store rate; 0 is exempt."><input name="taxRate" inputMode="decimal" className={`${platformInput} tabular-nums`} defaultValue={value('taxRate', product?.taxRateBasisPoints === null || product?.taxRateBasisPoints === undefined ? '' : bpsToInput(product.taxRateBasisPoints))} /></PlatformField>
            <PlatformField label="Low-stock alert at"><input name="lowStockThreshold" inputMode="numeric" className={`${platformInput} tabular-nums`} defaultValue={value('lowStockThreshold', String(product?.lowStockThreshold ?? 10))} /></PlatformField>
          </div>
        </PlatformFieldset>
        <PlatformFieldset legend="Handling">
          <div className="grid gap-3 sm:grid-cols-3">
            <PlatformCheckboxRow><input type="checkbox" name="isPerishable" className={platformCheckbox} defaultChecked={checked('isPerishable', product?.isPerishable ?? false)} /><span>Perishable</span></PlatformCheckboxRow>
            <PlatformCheckboxRow><input type="checkbox" name="organicCertified" className={platformCheckbox} defaultChecked={checked('organicCertified', product?.organicCertified ?? false)} /><span>Certified organic</span></PlatformCheckboxRow>
            <PlatformField label="Shelf life (days)"><input name="shelfLife" inputMode="numeric" className={`${platformInput} tabular-nums`} defaultValue={value('shelfLife', product?.shelfLife === null || product?.shelfLife === undefined ? '' : String(product.shelfLife))} /></PlatformField>
          </div>
        </PlatformFieldset>
        {state.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
        {state.ok && state.message ? <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p> : null}
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <button type="submit" className={platformButton('primary', 'md')}>{pending ? 'Saving…' : product ? 'Save product' : 'Create product'}</button>
        </div>
      </fieldset>
    </form>
  );
}
