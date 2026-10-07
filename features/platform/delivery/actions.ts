'use server';

import { revalidatePath } from 'next/cache';
import { gql } from 'graphql-request';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import type { DeliveryStopInput } from '@/features/keystone/lib/deliveryStops';

export async function updateDeliverySlotState(input: {
  slotId: string;
  isActive?: boolean;
  capacity?: number;
  deliveryFee?: number;
}) {
  const response = await keystoneClient(gql`
    mutation ConfigureDeliverySlot($slotId: ID!, $isActive: Boolean, $capacity: Int, $deliveryFee: Int, $idempotencyKey: String!) {
      configureDeliverySlot(slotId: $slotId, isActive: $isActive, capacity: $capacity, deliveryFee: $deliveryFee, idempotencyKey: $idempotencyKey) { slotId capacity currentBookings isAvailable fee reused }
    }
  `, {
    ...input,
    idempotencyKey: `delivery-slot:${input.slotId}:${input.capacity ?? 'same'}:${input.deliveryFee ?? 'same'}:${input.isActive ?? 'same'}`,
  });

  if (!response.success) {
    throw new Error(response.error);
  }

  revalidatePath('/dashboard/platform/delivery');
  return response.data;
}

export async function createDeliveryRouteFromReadyOrders(input: {
  deliveryDate: string;
  deliveryTimeWindow: string;
  orderIds: string[];
  driverId: string;
}) {
  const response = await keystoneClient<{ createDeliveryRouteFromOrders: { routeId: string; message: string } }>(gql`
    mutation CreateDeliveryRouteFromOrders(
      $deliveryDate: String!
      $deliveryTimeWindow: String!
      $orderIds: [ID!]!
      $driverId: ID!
    ) {
      createDeliveryRouteFromOrders(
        deliveryDate: $deliveryDate
        deliveryTimeWindow: $deliveryTimeWindow
        orderIds: $orderIds
        driverId: $driverId
      ) {
        success
        routeId
        orderCount
        message
      }
    }
  `, input);

  if (!response.success) {
    throw new Error(response.error);
  }

  revalidatePath('/dashboard/platform/delivery');
  revalidatePath('/dashboard/platform/orders');
  return response.data.createDeliveryRouteFromOrders;
}

export async function updateDeliveryRouteStatus(input: {
  routeId: string;
  status: 'planning' | 'in_progress' | 'completed';
}) {
  const response = await keystoneClient(gql`
    mutation UpdateDeliveryRouteWorkflow($routeId: ID!, $status: String!) {
      updateDeliveryRouteWorkflow(routeId: $routeId, status: $status) {
        success
        routeId
        status
        orderCount
        message
      }
    }
  `, input);

  if (!response.success) {
    throw new Error(response.error);
  }

  revalidatePath('/dashboard/platform/delivery');
  revalidatePath('/dashboard/platform/orders');
  return response.data;
}

export async function recordDeliveryStopOutcome(input: DeliveryStopInput) {
  const response = await keystoneClient(gql`
    mutation ResolveDeliveryStop($routeId: ID!, $orderId: ID!, $status: String!, $recipient: String,
      $proofReference: String, $reason: String, $custody: String!, $conditionEvidence: String!,
      $retryAt: String, $approvalEvidence: String, $idempotencyKey: String!) {
      resolveDeliveryStop(routeId: $routeId, orderId: $orderId, status: $status, recipient: $recipient,
        proofReference: $proofReference, reason: $reason, custody: $custody, conditionEvidence: $conditionEvidence,
        retryAt: $retryAt, approvalEvidence: $approvalEvidence, idempotencyKey: $idempotencyKey)
    }
  `, input);
  if (!response.success) throw new Error(response.error);
  revalidatePath('/dashboard/platform/delivery');
  revalidatePath('/dashboard/platform/orders');
  return response.data.resolveDeliveryStop;
}

export async function getReturnedDeliveryRescheduleSlots(orderId: string) {
  const response = await keystoneClient(gql`query LaterDeliverySlots($orderId: ID!) { groceryDeliveryRescheduleSlots(orderId: $orderId) }`, { orderId });
  if (!response.success) throw new Error(response.error);
  return response.data.groceryDeliveryRescheduleSlots;
}
export async function rescheduleReturnedDelivery(input: { orderId: string; deliverySlotId: string; customerApproval: string; conditionEvidence: string; idempotencyKey: string }) {
  const response = await keystoneClient(gql`mutation RescheduleReturnedDelivery($orderId: ID!, $deliverySlotId: ID!, $customerApproval: String!, $conditionEvidence: String!, $idempotencyKey: String!) {
    rescheduleReturnedGroceryDelivery(orderId: $orderId, deliverySlotId: $deliverySlotId, customerApproval: $customerApproval, conditionEvidence: $conditionEvidence, idempotencyKey: $idempotencyKey)
  }`, input);
  if (!response.success) throw new Error(response.error);
  revalidatePath('/dashboard/platform/delivery'); revalidatePath('/dashboard/platform/orders'); revalidatePath(`/order/${input.orderId}`);
  return response.data.rescheduleReturnedGroceryDelivery;
}
