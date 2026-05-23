'use server';

import { revalidatePath } from 'next/cache';
import { gql } from 'graphql-request';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export async function updateDeliverySlotState(input: {
  slotId: string;
  isActive?: boolean;
  capacity?: number;
  deliveryFee?: number;
}) {
  const response = await keystoneClient(gql`
    mutation UpdateDeliverySlotState($id: ID!, $data: DeliverySlotUpdateInput!) {
      updateDeliverySlot(where: { id: $id }, data: $data) {
        id
        isActive
        capacity
        currentBookings
        deliveryFee
      }
    }
  `, {
    id: input.slotId,
    data: {
      ...(typeof input.isActive === 'boolean' ? { isActive: input.isActive } : {}),
      ...(typeof input.capacity === 'number' ? { capacity: input.capacity } : {}),
      ...(typeof input.deliveryFee === 'number' ? { deliveryFee: input.deliveryFee } : {}),
    },
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
  driverId?: string;
}) {
  const response = await keystoneClient<{ createDeliveryRouteFromOrders: { routeId: string; message: string } }>(gql`
    mutation CreateDeliveryRouteFromOrders(
      $deliveryDate: String!
      $deliveryTimeWindow: String!
      $orderIds: [ID!]!
      $driverId: ID
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
