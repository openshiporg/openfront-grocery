'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { gql } from 'graphql-request';
import { keystoneClient } from '@/features/platform/lib/platformClient';

export async function updatePickupSlotState(input: {
  slotId: string;
  isAvailable?: boolean;
  maxOrders?: number;
}) {
  const response = await keystoneClient(gql`
    mutation ConfigurePickupSlot($slotId: ID!, $isAvailable: Boolean, $maxOrders: Int, $idempotencyKey: String!) {
      configurePickupSlot(slotId: $slotId, isAvailable: $isAvailable, maxOrders: $maxOrders, idempotencyKey: $idempotencyKey) { slotId capacity currentBookings isAvailable reused }
    }
  `, { ...input, idempotencyKey: `pickup-slot:${input.slotId}:${input.maxOrders ?? 'same'}:${input.isAvailable ?? 'same'}:${randomUUID()}` });

  // Returned, not thrown: production Next.js hides messages thrown from server actions.
  if (!response.success) return { ok: false as const, error: response.error || 'The pickup update failed' };

  revalidatePath('/dashboard/platform/pickup');
  return { ok: true as const, data: response.data };
}

export async function updateParkingSpotState(input: { spotId: string; isAvailable: boolean }) {
  const response = await keystoneClient(gql`
    mutation ConfigureParkingSpot($spotId: ID!, $isAvailable: Boolean!, $idempotencyKey: String!) {
      configureParkingSpot(spotId: $spotId, isAvailable: $isAvailable, idempotencyKey: $idempotencyKey) { slotId isAvailable reused }
    }
  `, { ...input, idempotencyKey: `parking-spot:${input.spotId}:${input.isAvailable}:${randomUUID()}` });

  // Returned, not thrown: production Next.js hides messages thrown from server actions.
  if (!response.success) return { ok: false as const, error: response.error || 'The pickup update failed' };

  revalidatePath('/dashboard/platform/pickup');
  return { ok: true as const, data: response.data };
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

  // Returned, not thrown: production Next.js hides messages thrown from server actions.
  if (!response.success) return { ok: false as const, error: response.error || 'The pickup update failed' };

  revalidatePath('/dashboard/platform/pickup');
  revalidatePath('/dashboard/platform/orders');
  return { ok: true as const, data: response.data };
}
