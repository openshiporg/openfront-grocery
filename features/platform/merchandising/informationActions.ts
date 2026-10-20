'use server';
import { keystoneClient } from '@/features/platform/lib/platformClient';
import { revalidatePath } from 'next/cache';

export type InformationSaveResult = { ok: true; reused: boolean } | { ok: false; error: string };

/** Business errors come back as results; production Next.js masks messages thrown from server actions. */
export async function saveProductInformation(productId: string, input: any, idempotencyKey: string): Promise<InformationSaveResult> {
  const result = await keystoneClient<any>('mutation Info($productId:ID!,$input:JSON!,$idempotencyKey:String!){updateProductInformation(productId:$productId,input:$input,idempotencyKey:$idempotencyKey)}', { productId, input, idempotencyKey }, { cache: 'no-store' });
  if (!result.success) return { ok: false, error: result.error || 'Product information could not be saved.' };
  revalidatePath('/products', 'layout');
  return { ok: true, reused: Boolean(result.data?.updateProductInformation?.reused) };
}

const PRODUCT_FIELDS = 'id title sku variantLabel variantOf{id title} allergens nutrition informationSource packBaseUnitsMilli';

export async function findInformationProducts(search: string) {
  const r = await keystoneClient<any>(`query Products($search:String!){products(where:{title:{contains:$search,mode:insensitive}},take:30,orderBy:[{title:asc},{id:asc}]){${PRODUCT_FIELDS}}}`, { search: search.slice(0, 100) }, { cache: 'no-store' });
  if (!r.success) throw new Error(r.error);
  return r.data.products as any[];
}

/** Root products (not themselves a pack of another product) a variant can belong to. */
export async function findRootProducts(search: string) {
  const r = await keystoneClient<any>('query Roots($search:String!){products(where:{title:{contains:$search,mode:insensitive},variantOf:null},take:30,orderBy:[{title:asc},{id:asc}]){id title sku}}', { search: search.slice(0, 100) }, { cache: 'no-store' });
  if (!r.success) throw new Error(r.error);
  return r.data.products as Array<{ id: string; title: string; sku: string }>;
}
