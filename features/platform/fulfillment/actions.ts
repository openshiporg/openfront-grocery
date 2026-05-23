'use server';

import { revalidatePath } from 'next/cache';
import { gql } from 'graphql-request';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

const DELIVERY_STATUS_TRANSITIONS: Record<string, string> = {
  pending: 'picking',
  picking: 'packed',
  packed: 'out_for_delivery',
};

const PICKUP_STATUS_TRANSITIONS: Record<string, string> = {
  pending: 'picking',
  picking: 'packed',
  packed: 'packed',
};

export async function advanceOrderStatus(input: {
  orderId: string;
  currentStatus: string;
  fulfillmentMethod?: 'delivery' | 'pickup';
  metadata?: Record<string, any> | null;
}) {
  const isPickup = input.fulfillmentMethod === 'pickup';
  const nextStatus = (isPickup ? PICKUP_STATUS_TRANSITIONS : DELIVERY_STATUS_TRANSITIONS)[input.currentStatus];

  if (!nextStatus) {
    throw new Error(`No workflow transition configured for status ${input.currentStatus}`);
  }

  const response = await keystoneClient(gql`
    mutation AdvanceFulfillmentOrder($id: ID!, $data: OrderUpdateInput!) {
      updateOrder(where: { id: $id }, data: $data) {
        id
        status
      }
    }
  `, {
    id: input.orderId,
    data: {
      status: nextStatus,
      ...(isPickup && input.currentStatus === 'packed'
        ? {
            metadata: {
              ...(input.metadata || {}),
              fulfillmentMethod: 'pickup',
              pickupReadyAt: new Date().toISOString(),
              readyForPickup: true,
            },
          }
        : {}),
    },
  });

  if (!response.success) {
    throw new Error(response.error);
  }

  revalidatePath('/dashboard/platform/fulfillment');
  revalidatePath('/dashboard/platform/orders');

  return response.data;
}

export async function saveOrderItemSubstitution(input: {
  orderItemId: string;
  originalProduct: string;
  substitutedProduct: string;
  reason?: string;
  customerApproved?: boolean;
}) {
  const existingResponse = await keystoneClient<{
    orderItemSubstitutions: Array<{ id: string }>;
  }>(gql`
    query FindOrderItemSubstitution($orderItemId: String!) {
      orderItemSubstitutions(where: { orderItem: { equals: $orderItemId } }, take: 1) {
        id
      }
    }
  `, {
    orderItemId: input.orderItemId,
  });

  if (!existingResponse.success) {
    throw new Error(existingResponse.error);
  }

  const existingId = existingResponse.data.orderItemSubstitutions?.[0]?.id;
  const payload = {
    orderItem: input.orderItemId,
    originalProduct: input.originalProduct,
    substitutedProduct: input.substitutedProduct,
    reason: input.reason || '',
    customerApproved: Boolean(input.customerApproved),
    approvedAt: input.customerApproved ? new Date().toISOString() : null,
  };

  if (existingId) {
    const updateResponse = await keystoneClient(gql`
      mutation UpdateOrderItemSubstitution($id: ID!, $data: OrderItemSubstitutionUpdateInput!) {
        updateOrderItemSubstitution(where: { id: $id }, data: $data) {
          id
        }
      }
    `, {
      id: existingId,
      data: payload,
    });

    if (!updateResponse.success) {
      throw new Error(updateResponse.error);
    }
  } else {
    const createResponse = await keystoneClient(gql`
      mutation CreateOrderItemSubstitution($data: OrderItemSubstitutionCreateInput!) {
        createOrderItemSubstitution(data: $data) {
          id
        }
      }
    `, {
      data: payload,
    });

    if (!createResponse.success) {
      throw new Error(createResponse.error);
    }
  }

  revalidatePath('/dashboard/platform/fulfillment');
  revalidatePath('/dashboard/platform/orders');
}
