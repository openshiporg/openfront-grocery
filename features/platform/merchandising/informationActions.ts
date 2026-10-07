'use server';
import {keystoneClient} from '@/features/dashboard/lib/keystoneClient';
import {revalidatePath} from 'next/cache';
export async function saveProductInformation(productId:string,input:any,idempotencyKey:string) {
  const result=await keystoneClient('mutation Info($productId:ID!,$input:JSON!,$idempotencyKey:String!){updateProductInformation(productId:$productId,input:$input,idempotencyKey:$idempotencyKey)}',{productId,input,idempotencyKey});
  if(!result.success)throw new Error(result.error);revalidatePath('/products','layout');return result.data.updateProductInformation;
}
export async function findInformationProducts(search:string) {
 const r=await keystoneClient('query Products($search:String!){products(where:{title:{contains:$search,mode:insensitive}},take:30,orderBy:[{title:asc},{id:asc}]){id title sku variantLabel variantOf{id} allergens nutrition informationSource packBaseUnitsMilli}}',{search:search.slice(0,100)});
 if(!r.success)throw new Error(r.error);return r.data.products as any[];
}
