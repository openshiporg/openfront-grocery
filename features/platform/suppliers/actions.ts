'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/platform/lib/platformClient';
import { formatMoney } from '@/features/platform/lib/format';
import { parseMoneyToCents } from '@/features/lib/moneyInput';

export type SupplierFieldState = { ok: boolean; error: string | null; message: string | null; value?: string };

const TERMS: Record<string, string> = { net_30: 'Net 30', net_60: 'Net 60', cod: 'Cash on delivery' };

/** Save a supplier's payment terms; the stored terms stay unchanged unless the save succeeds. */
export async function updateSupplierTermsAction(_previous: SupplierFieldState, formData: FormData): Promise<SupplierFieldState> {
  const supplierId = String(formData.get('supplierId') || '');
  const paymentTerms = String(formData.get('paymentTerms') || '');
  if (!TERMS[paymentTerms]) return { ok: false, error: 'Choose Net 30, Net 60 or Cash on delivery.', message: null, value: paymentTerms };
  const response = await keystoneClient<any>(`mutation($id:ID!,$data:SupplierUpdateInput!){ updateSupplier(where:{id:$id},data:$data){ id paymentTerms } }`, { id: supplierId, data: { paymentTerms } }, { cache: 'no-store' });
  if (!response.success) return { ok: false, error: response.error || 'Payment terms could not be saved.', message: null, value: paymentTerms };
  revalidatePath('/dashboard/platform/suppliers');
  return { ok: true, error: null, message: `Payment terms saved as ${TERMS[response.data?.updateSupplier?.paymentTerms] || TERMS[paymentTerms]}.`, value: paymentTerms };
}

/** Save a supplier's minimum order, entered in currency units and stored as exact cents. */
export async function updateSupplierMinimumAction(_previous: SupplierFieldState, formData: FormData): Promise<SupplierFieldState> {
  const supplierId = String(formData.get('supplierId') || '');
  const currencyCode = String(formData.get('currencyCode') || 'USD');
  const value = String(formData.get('minimumOrder') || '').trim();
  const minimumOrderCents = parseMoneyToCents(value);
  if (minimumOrderCents === null) return { ok: false, error: 'Enter the minimum order as an amount, for example 250 or 250.00.', message: null, value };
  const response = await keystoneClient<any>(`mutation($supplierId:ID!,$minimumOrderCents:Int!){ updateSupplierMinimumOrder(supplierId:$supplierId,minimumOrderCents:$minimumOrderCents){ success id minimumOrderCents } }`, { supplierId, minimumOrderCents }, { cache: 'no-store' });
  if (!response.success || !response.data?.updateSupplierMinimumOrder?.success) return { ok: false, error: response.error || 'The minimum order could not be saved.', message: null, value };
  revalidatePath('/dashboard/platform/suppliers');
  return { ok: true, error: null, message: `Minimum order saved as ${formatMoney(response.data.updateSupplierMinimumOrder.minimumOrderCents, currencyCode)}.`, value };
}
