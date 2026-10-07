'use server';

import { platformProjections } from '@/features/platform/lib/platformProjections';

type SupplierOption = { id: string; name: string };
type ProductOption = { id: string; title: string };

export async function findPurchasingOptions<T extends 'supplier' | 'product'>(
  kind: T,
  search: string,
): Promise<T extends 'supplier' ? SupplierOption[] : ProductOption[]> {
  if (kind !== 'supplier' && kind !== 'product') throw new Error('Unsupported purchasing lookup');
  const options = await platformProjections.purchasingOptions(kind, search);
  if (kind === 'supplier') {
    return (options || []).flatMap(({ id, name }) => name ? [{ id, name }] : []) as T extends 'supplier' ? SupplierOption[] : ProductOption[];
  }
  return (options || []).flatMap(({ id, title }) => title ? [{ id, title }] : []) as T extends 'supplier' ? SupplierOption[] : ProductOption[];
}
