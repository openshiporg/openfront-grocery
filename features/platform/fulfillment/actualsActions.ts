'use server';

import { revalidatePath } from 'next/cache';
import { gql } from 'graphql-request';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import type { FulfillmentActualInput } from '@/features/keystone/lib/fulfillmentActuals';

export async function saveFulfillmentActual(input: FulfillmentActualInput) {
  const response = await keystoneClient(gql`
    mutation ResolveFulfillmentActual($orderId: ID!, $lineItemId: ID!, $resolution: String!, $productId: ID,
      $quantity: String!, $tare: String, $unitOfMeasure: String!, $reason: String,
      $consentChannel: String, $consentCustomer: String, $consentEvidence: String, $idempotencyKey: String!) {
      resolveOrderLineFulfillment(orderId: $orderId, lineItemId: $lineItemId, resolution: $resolution, productId: $productId,
        quantity: $quantity, tare: $tare, unitOfMeasure: $unitOfMeasure, reason: $reason,
        consentChannel: $consentChannel, consentCustomer: $consentCustomer, consentEvidence: $consentEvidence, idempotencyKey: $idempotencyKey) {
        fulfillmentId lineItemId resolution quantityMilli subtotalCents reused
      }
    }
  `, input);
  if (!response.success) throw new Error(response.error);
  revalidatePath('/dashboard/platform/fulfillment');
  revalidatePath('/dashboard/platform/orders');
  return response.data.resolveOrderLineFulfillment;
}

export async function findFulfillmentProducts(search: string) {
  const response = await keystoneClient(gql`
    query FulfillmentProducts($search: String!) {
      products(where: { status: { equals: published }, title: { contains: $search, mode: insensitive } }, take: 30, orderBy: [{ title: asc }, { id: asc }]) {
        id title sku priceCents pricingMethod unitOfMeasure
      }
    }
  `, { search: search.trim().slice(0, 100) });
  if (!response.success) throw new Error(response.error);
  return response.data.products as Array<{ id: string; title: string; sku: string; priceCents: number; pricingMethod: string; unitOfMeasure: string }>;
}

export async function finalizeFulfillmentSale(orderId: string) {
  const response = await keystoneClient(gql`
    mutation FinalizeFulfillmentSale($orderId: ID!) { finalizeGroceryOrderActuals(orderId: $orderId) }
  `, { orderId });
  if (!response.success) throw new Error(response.error);
  revalidatePath('/dashboard/platform/fulfillment');
  revalidatePath('/dashboard/platform/orders');
  return response.data.finalizeGroceryOrderActuals;
}
