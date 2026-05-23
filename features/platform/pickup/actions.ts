'use server';

import { revalidatePath } from 'next/cache';
import { gql } from 'graphql-request';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export async function updatePickupSlotState(input: {
  slotId: string;
  isAvailable?: boolean;
  maxOrders?: number;
}) {
  const response = await keystoneClient(gql`
    mutation UpdatePickupSlotState($id: ID!, $data: PickupSlotUpdateInput!) {
      updatePickupSlot(where: { id: $id }, data: $data) {
        id
        isAvailable
        maxOrders
        currentOrders
      }
    }
  `, {
    id: input.slotId,
    data: {
      ...(typeof input.isAvailable === 'boolean' ? { isAvailable: input.isAvailable } : {}),
      ...(typeof input.maxOrders === 'number' ? { maxOrders: input.maxOrders } : {}),
    },
  });

  if (!response.success) {
    throw new Error(response.error);
  }

  revalidatePath('/dashboard/platform/pickup');
  return response.data;
}

export async function updateParkingSpotState(input: { spotId: string; isAvailable: boolean }) {
  const response = await keystoneClient(gql`
    mutation UpdateParkingSpotState($id: ID!, $data: ParkingSpotUpdateInput!) {
      updateParkingSpot(where: { id: $id }, data: $data) {
        id
        isAvailable
      }
    }
  `, {
    id: input.spotId,
    data: { isAvailable: input.isAvailable },
  });

  if (!response.success) {
    throw new Error(response.error);
  }

  revalidatePath('/dashboard/platform/pickup');
  return response.data;
}

export async function completePickupOrderHandoff(input: { orderId: string }) {
  const response = await keystoneClient(gql`
    mutation CompletePickupOrderHandoff($orderId: ID!) {
      completeOrderHandoff(orderId: $orderId) {
        success
        orderId
        orderNumber
        status
        message
      }
    }
  `, {
    orderId: input.orderId,
  });

  if (!response.success) {
    throw new Error(response.error);
  }

  revalidatePath('/dashboard/platform/pickup');
  revalidatePath('/dashboard/platform/orders');
  return response.data;
}
