'use server';

import { revalidatePath } from 'next/cache';
import { gql } from 'graphql-request';
import { keystoneClient } from '@/features/platform/lib/platformClient';

export async function advanceOrderStatus(input: {
  orderId: string;
  currentStatus: string;
  fulfillmentMethod?: 'delivery' | 'pickup';
  readyForPickup?: boolean;
}) {
  const target = input.currentStatus === 'pending'
    ? 'picking'
    : input.currentStatus === 'picking'
      ? 'packed'
      : input.currentStatus === 'packed' && input.fulfillmentMethod === 'pickup' && !input.readyForPickup
        ? 'ready_for_pickup'
        : null;
  // Return business errors: production Next.js hides messages thrown from server actions.
  if (!target) return { ok: false as const, error: `No fulfillment transition is available from ${input.currentStatus}` };

  const response = await keystoneClient(gql`
    mutation AdvanceFulfillmentOrder($orderId: ID!, $target: String!) {
      advanceOrderFulfillment(orderId: $orderId, target: $target) {
        orderId
        status
        stage
        reused
      }
    }
  `, { orderId: input.orderId, target });

  if (!response.success) return { ok: false as const, error: response.error || 'This order could not be moved' };

  revalidatePath('/dashboard/platform/fulfillment');
  revalidatePath('/dashboard/platform/orders');

  return { ok: true as const, data: response.data };
}

export async function saveOrderItemSubstitution(input: {
  orderItemId: string;
  substitutedProduct: string;
  reason?: string;
  customerApproved?: boolean;
  idempotencyKey: string;
}) {
  const response = await keystoneClient(gql`
    mutation RecordOrderItemSubstitution(
      $orderItemId: ID!
      $substitutedProduct: String!
      $reason: String
      $customerApproved: Boolean
      $idempotencyKey: String!
    ) {
      recordOrderItemSubstitution(
        orderItemId: $orderItemId
        substitutedProduct: $substitutedProduct
        reason: $reason
        customerApproved: $customerApproved
        idempotencyKey: $idempotencyKey
      ) {
        substitutionId
        orderItemId
        customerApproved
        reused
      }
    }
  `, input);

  if (!response.success) return { ok: false as const, error: response.error || 'Substitution evidence could not be recorded' };

  revalidatePath('/dashboard/platform/fulfillment');
  revalidatePath('/dashboard/platform/orders');
  return { ok: true as const, data: response.data };
}
