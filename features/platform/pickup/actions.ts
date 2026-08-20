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
    mutation ConfigurePickupSlot($slotId: ID!, $isAvailable: Boolean, $maxOrders: Int, $idempotencyKey: String!) {
      configurePickupSlot(slotId: $slotId, isAvailable: $isAvailable, maxOrders: $maxOrders, idempotencyKey: $idempotencyKey) { slotId capacity currentBookings isAvailable reused }
    }
  `, { ...input, idempotencyKey: `pickup-slot:${input.slotId}:${input.maxOrders ?? 'same'}:${input.isAvailable ?? 'same'}` });

  if (!response.success) {
    throw new Error(response.error);
  }

  revalidatePath('/dashboard/platform/pickup');
  return response.data;
}

export async function updateParkingSpotState(input: { spotId: string; isAvailable: boolean }) {
  const response = await keystoneClient(gql`
    mutation ConfigureParkingSpot($spotId: ID!, $isAvailable: Boolean!, $idempotencyKey: String!) {
      configureParkingSpot(spotId: $spotId, isAvailable: $isAvailable, idempotencyKey: $idempotencyKey) { slotId isAvailable reused }
    }
  `, { ...input, idempotencyKey: `parking-spot:${input.spotId}:${input.isAvailable}` });

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
