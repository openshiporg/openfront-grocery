'use server';

import { revalidatePath } from 'next/cache';
import { gql } from 'graphql-request';
import { keystoneClient } from '@/features/platform/lib/platformClient';
import type { FulfillmentActualInput } from '@/features/keystone/lib/fulfillmentActuals';

// Server actions return their business error instead of throwing: production Next.js
// replaces thrown action errors with a generic Server Components message.
type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function revalidateFulfillment() {
  revalidatePath('/dashboard/platform/fulfillment');
  revalidatePath('/dashboard/platform/orders');
}

export async function saveFulfillmentActual(input: FulfillmentActualInput): Promise<ActionResult<{ quantityMilli: number; subtotalCents: number }>> {
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
  if (!response.success) return { ok: false, error: response.error || 'Could not resolve this line' };
  revalidateFulfillment();
  return { ok: true, data: response.data.resolveOrderLineFulfillment };
}

export type FulfillmentProductOption = { id: string; title: string; sku: string; priceCents: number; pricingMethod: string; unitOfMeasure: string };

export async function findFulfillmentProducts(search: string): Promise<ActionResult<FulfillmentProductOption[]>> {
  const response = await keystoneClient(gql`
    query FulfillmentProducts($search: String!) {
      products(where: { status: { equals: published }, title: { contains: $search, mode: insensitive } }, take: 30, orderBy: [{ title: asc }, { id: asc }]) {
        id title sku priceCents pricingMethod unitOfMeasure
      }
    }
  `, { search: search.trim().slice(0, 100) });
  if (!response.success) return { ok: false, error: response.error || 'Product search failed' };
  return { ok: true, data: response.data.products };
}

export async function finalizeFulfillmentSale(orderId: string): Promise<ActionResult<{ status?: string; message?: string }>> {
  const response = await keystoneClient(gql`
    mutation FinalizeFulfillmentSale($orderId: ID!) { finalizeGroceryOrderActuals(orderId: $orderId) }
  `, { orderId });
  if (!response.success) return { ok: false, error: response.error || 'Could not finalize sale' };
  revalidateFulfillment();
  return { ok: true, data: response.data.finalizeGroceryOrderActuals || {} };
}

export async function proposeFulfillmentSubstitution(input: { orderId: string; lineItemId: string; productId: string; quantity: string; unitOfMeasure: string; reason: string; idempotencyKey: string }): Promise<ActionResult<{ proposalId: string; status: string }>> {
  const response = await keystoneClient(gql`
    mutation ProposeSubstitution($orderId: ID!, $lineItemId: ID!, $productId: ID!, $quantity: String!, $unitOfMeasure: String!, $reason: String!, $idempotencyKey: String!) {
      proposeOrderLineSubstitution(orderId: $orderId, lineItemId: $lineItemId, productId: $productId, quantity: $quantity, unitOfMeasure: $unitOfMeasure, reason: $reason, idempotencyKey: $idempotencyKey)
    }
  `, input);
  if (!response.success) return { ok: false, error: response.error || 'Could not send the replacement to the customer' };
  revalidateFulfillment();
  return { ok: true, data: response.data.proposeOrderLineSubstitution };
}
