'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { keystoneClient } from '@/features/platform/lib/platformClient';
import { parseMoneyToCents, parsePercentToBps } from '@/features/lib/moneyInput';

export type ProductFormValues = Record<string, string>;
export type ProductActionState = { ok: boolean; error: string | null; message: string | null; values?: ProductFormValues };

const STATUSES = new Set(['draft', 'published', 'archived']);
const PRICING = new Set(['unit', 'weight', 'volume']);
const UNITS = new Set(['each', 'lb', 'oz', 'kg', 'g', 'L', 'mL', 'gallon', 'quart', 'pint']);
const TEXT_FIELDS = ['title', 'handle', 'sku', 'status', 'price', 'pricingMethod', 'unitOfMeasure', 'departmentId', 'supplierId', 'imageUrl', 'shelfLife', 'taxRate', 'lowStockThreshold'];

/**
 * Create or edit a catalog product through the product-managed Product list,
 * which enforces Store scope, SKU identity and unit immutability once stock or
 * orders exist. Stock, nutrition and allergens are not written here.
 */
export async function saveProductAction(_previous: ProductActionState, formData: FormData): Promise<ProductActionState> {
  const id = String(formData.get('id') || '');
  const values: ProductFormValues = Object.fromEntries(TEXT_FIELDS.map((name) => [name, String(formData.get(name) ?? '').trim()]));
  values.isPerishable = formData.get('isPerishable') === 'on' ? 'on' : '';
  values.organicCertified = formData.get('organicCertified') === 'on' ? 'on' : '';
  const fail = (error: string): ProductActionState => ({ ok: false, error, message: null, values });

  if (!values.title || values.title.length > 200) return fail('Enter a product name of up to 200 characters.');
  values.handle = values.handle.toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.handle) || values.handle.length > 120) return fail('Use a handle of lowercase letters, numbers and single hyphens, for example “greek-yogurt-500g”.');
  if (values.sku.length > 64) return fail('Keep the SKU to 64 characters.');
  if (!STATUSES.has(values.status)) return fail('Choose draft, published or archived.');
  const priceCents = parseMoneyToCents(values.price);
  if (priceCents === null) return fail('Enter the price as an amount, for example 3.49.');
  if (!PRICING.has(values.pricingMethod) || !UNITS.has(values.unitOfMeasure)) return fail('Choose how the product is priced and its unit.');
  if (values.imageUrl && (!/^https:\/\/\S+$/.test(values.imageUrl) || values.imageUrl.length > 2048)) return fail('The image must be an https:// address.');
  if (values.shelfLife && !/^\d{1,4}$/.test(values.shelfLife)) return fail('Shelf life is a whole number of days.');
  if (!/^\d{1,6}$/.test(values.lowStockThreshold || '0')) return fail('The low-stock alert level is a whole number.');
  const taxRateBasisPoints = values.taxRate === '' ? null : parsePercentToBps(values.taxRate);
  if (values.taxRate !== '' && taxRateBasisPoints === null) return fail('Enter the tax rate as a percentage such as 8.25, or leave it blank to use the store rate.');

  const data: Record<string, unknown> = {
    title: values.title, handle: values.handle, sku: values.sku, status: values.status,
    price: priceCents / 100, pricingMethod: values.pricingMethod, unitOfMeasure: values.unitOfMeasure,
    imageUrl: values.imageUrl, isPerishable: values.isPerishable === 'on', organicCertified: values.organicCertified === 'on',
    shelfLife: values.shelfLife ? Number(values.shelfLife) : null, taxRateBasisPoints, lowStockThreshold: Number(values.lowStockThreshold || 0),
    departmentRef: values.departmentId ? { connect: { id: values.departmentId } } : id ? { disconnect: true } : undefined,
    supplier: values.supplierId ? { connect: { id: values.supplierId } } : id ? { disconnect: true } : undefined,
  };
  const response = id
    ? await keystoneClient<any>('mutation($id:ID!,$data:ProductUpdateInput!){ updateProduct(where:{id:$id},data:$data){ id title } }', { id, data }, { cache: 'no-store' })
    : await keystoneClient<any>('mutation($data:ProductCreateInput!){ createProduct(data:$data){ id title } }', { data }, { cache: 'no-store' });
  if (!response.success) {
    const error = response.error || 'The product could not be saved.';
    return fail(/unique constraint/i.test(error) ? 'Another product already uses this handle or SKU. Choose a different one.' : error);
  }
  revalidatePath('/dashboard/platform/products');
  revalidatePath('/dashboard/platform/merchandising');
  if (!id) redirect(`/dashboard/platform/products/${encodeURIComponent(response.data.createProduct.id)}?created=1`);
  return { ok: true, error: null, message: `Saved ${values.title}.`, values };
}
