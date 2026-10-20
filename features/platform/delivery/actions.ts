'use server';

import { revalidatePath } from 'next/cache';
import { gql } from 'graphql-request';
import { keystoneClient } from '@/features/platform/lib/platformClient';
import type { DeliveryStopInput } from '@/features/keystone/lib/deliveryStops';

/**
 * Business errors are returned rather than thrown (production Next.js masks thrown
 * messages). `uncertain` marks a transport failure, where the outcome is unknown.
 */
export type DeliveryActionResult<T> = { ok: true; data: T } | { ok: false; error: string; uncertain: boolean };

async function run<T>(query: string, variables: Record<string, unknown>, pick: (data: any) => T, paths: string[]): Promise<DeliveryActionResult<T>> {
  const response = await keystoneClient<any>(query, variables, { cache: 'no-store' });
  if (!response.success) return { ok: false, error: response.error || 'The request could not be completed.', uncertain: !response.errors?.length };
  for (const path of paths) revalidatePath(path);
  return { ok: true, data: pick(response.data) };
}

const DELIVERY = '/dashboard/platform/delivery';
const ORDERS = '/dashboard/platform/orders';

export async function updateDeliverySlotState(input: { slotId: string; isActive?: boolean; capacity?: number; deliveryFee?: number }) {
  return run(gql`
    mutation ConfigureDeliverySlot($slotId: ID!, $isActive: Boolean, $capacity: Int, $deliveryFee: Int, $idempotencyKey: String!) {
      configureDeliverySlot(slotId: $slotId, isActive: $isActive, capacity: $capacity, deliveryFee: $deliveryFee, idempotencyKey: $idempotencyKey) { slotId capacity currentBookings isAvailable fee reused }
    }
  `, { ...input, idempotencyKey: `delivery-slot:${input.slotId}:${input.capacity ?? 'same'}:${input.deliveryFee ?? 'same'}:${input.isActive ?? 'same'}` }, (data) => data.configureDeliverySlot, [DELIVERY]);
}

export async function createDeliveryRouteFromReadyOrders(input: { deliveryDate: string; deliveryTimeWindow: string; orderIds: string[]; driverId: string }) {
  return run<{ routeId: string; orderCount: number; message: string }>(gql`
    mutation CreateDeliveryRouteFromOrders($deliveryDate: String!, $deliveryTimeWindow: String!, $orderIds: [ID!]!, $driverId: ID!) {
      createDeliveryRouteFromOrders(deliveryDate: $deliveryDate, deliveryTimeWindow: $deliveryTimeWindow, orderIds: $orderIds, driverId: $driverId) { success routeId orderCount message }
    }
  `, input, (data) => data.createDeliveryRouteFromOrders, [DELIVERY, ORDERS]);
}

export async function updateDeliveryRouteStatus(input: { routeId: string; status: 'planning' | 'in_progress' | 'completed' }) {
  return run(gql`
    mutation UpdateDeliveryRouteWorkflow($routeId: ID!, $status: String!) {
      updateDeliveryRouteWorkflow(routeId: $routeId, status: $status) { success routeId status orderCount message }
    }
  `, input, (data) => data.updateDeliveryRouteWorkflow, [DELIVERY, ORDERS]);
}

/** `retryLocalTime` is Store wall-clock time ("YYYY-MM-DDTHH:mm"); the server converts it in the Store timezone. */
export async function recordDeliveryStopOutcome(input: Omit<DeliveryStopInput, 'retryAt'> & { retryLocalTime?: string }) {
  return run<{ status: string }>(gql`
    mutation ResolveDeliveryStop($routeId: ID!, $orderId: ID!, $status: String!, $recipient: String,
      $proofReference: String, $reason: String, $custody: String!, $conditionEvidence: String!,
      $retryLocalTime: String, $approvalEvidence: String, $idempotencyKey: String!) {
      resolveDeliveryStop(routeId: $routeId, orderId: $orderId, status: $status, recipient: $recipient,
        proofReference: $proofReference, reason: $reason, custody: $custody, conditionEvidence: $conditionEvidence,
        retryLocalTime: $retryLocalTime, approvalEvidence: $approvalEvidence, idempotencyKey: $idempotencyKey)
    }
  `, { ...input, retryLocalTime: input.retryLocalTime || null }, (data) => data.resolveDeliveryStop, [DELIVERY, ORDERS]);
}

export async function getReturnedDeliveryRescheduleSlots(orderId: string) {
  return run<{ slots: any[]; timezone: string; message: string }>(gql`query LaterDeliverySlots($orderId: ID!) { groceryDeliveryRescheduleSlots(orderId: $orderId) }`, { orderId }, (data) => data.groceryDeliveryRescheduleSlots, []);
}

export async function rescheduleReturnedDelivery(input: { orderId: string; deliverySlotId: string; customerApproval: string; conditionEvidence: string; idempotencyKey: string }) {
  return run(gql`mutation RescheduleReturnedDelivery($orderId: ID!, $deliverySlotId: ID!, $customerApproval: String!, $conditionEvidence: String!, $idempotencyKey: String!) {
    rescheduleReturnedGroceryDelivery(orderId: $orderId, deliverySlotId: $deliverySlotId, customerApproval: $customerApproval, conditionEvidence: $conditionEvidence, idempotencyKey: $idempotencyKey)
  }`, input, (data) => data.rescheduleReturnedGroceryDelivery, [DELIVERY, ORDERS, `/order/${input.orderId}`]);
}
