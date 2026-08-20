import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { verifyGuestOrderToken } from '../utils/guestOrderToken';
import { withSerializableRetry } from '../utils/serializableTransaction';

interface CheckInResult {
  success: boolean;
  orderId: string;
  orderNumber: number;
  status: string;
  parkingSpot: {
    id: string;
    spotNumber: string;
    description?: string;
    isAccessible: boolean;
  } | null;
  estimatedWaitMinutes: number;
  message: string;
}

async function assertCanManageDelivery(context: Context) {
  return requireFreshCapability(context, 'canManageDelivery');
}

type PickupCheckInArgs = {
  orderId: string;
  parkingSpotId?: string;
  vehicleDescription?: string;
};

type PickupOwnership =
  | { kind: 'customer'; userId: string; storeId: string }
  | { kind: 'guest'; sessionId: string; token: string };

async function checkInOwnedPickupOrder(
  args: PickupCheckInArgs,
  ownership: PickupOwnership,
  context: Context,
): Promise<CheckInResult> {
  const vehicleDescription = args.vehicleDescription?.trim() || '';
  if (vehicleDescription.length > 200) throw new Error('Vehicle description must be 200 characters or less');
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', args.orderId);
    const order = await tx.order.findUnique({
      where: { id: args.orderId },
      select: { id: true, displayId: true, status: true, userId: true, storeId: true, metadata: true, createdAt: true, store: { select: { isActive: true } } },
    });
    if (!order?.store?.isActive) throw new Error('Pickup order not found');

    if (ownership.kind === 'customer') {
      if (order.userId !== ownership.userId || order.storeId !== ownership.storeId) throw new Error('Pickup order not found');
    } else {
      const guestSessionId = String((order.metadata as any)?.guestSessionId || '');
      if (
        order.userId ||
        guestSessionId !== ownership.sessionId.trim() ||
        !verifyGuestOrderToken(order.id, ownership.sessionId, ownership.token, undefined, order.createdAt)
      ) throw new Error('Pickup order not found');
    }

    const metadata = (order.metadata as Record<string, any> | null) || {};
    if (metadata.fulfillmentMethod !== 'pickup') throw new Error('Only pickup orders can check in');
    if (!metadata.readyForPickup) throw new Error('This pickup order is not marked ready yet');
    if (order.status !== 'packed') {
      if (order.status === 'delivered') throw new Error('This order has already been picked up');
      if (order.status === 'cancelled') throw new Error('This order has been cancelled');
      throw new Error(`Order cannot be checked in with status: ${order.status}`);
    }

    if (metadata.customerArrived) {
      const existingSpot = metadata.parkingSpotId
        ? await tx.parkingSpot.findUnique({ where: { id: metadata.parkingSpotId } })
        : null;
      return {
        success: true,
        orderId: order.id,
        orderNumber: order.displayId,
        status: 'checked_in',
        parkingSpot: existingSpot ? {
          id: existingSpot.id,
          spotNumber: existingSpot.spotNumber,
          description: existingSpot.description || undefined,
          isAccessible: Boolean(existingSpot.isAccessible),
        } : null,
        estimatedWaitMinutes: Number(metadata.estimatedWaitMinutes || 0),
        message: existingSpot ? `Already checked in at spot ${existingSpot.spotNumber}.` : 'Already checked in.',
      };
    }

    let parkingSpot = null;
    if (args.parkingSpotId) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "ParkingSpot" WHERE "id" = $1 FOR UPDATE', args.parkingSpotId);
      parkingSpot = await tx.parkingSpot.findUnique({ where: { id: args.parkingSpotId } });
      if (!parkingSpot || parkingSpot.storeId !== order.storeId) throw new Error('Parking spot not found');
      if (!parkingSpot.isAvailable) throw new Error('Selected parking spot is not available');
    }

    const checkInTime = new Date().toISOString();
    const waitingOrders = await tx.order.findMany({
      where: { storeId: order.storeId, status: 'packed', id: { not: order.id } },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: { metadata: true },
    });
    const ordersAhead = waitingOrders.filter((waiting) => {
      const waitingMetadata = (waiting.metadata as Record<string, any> | null) || {};
      return Boolean(waitingMetadata.customerArrived && waitingMetadata.checkInTime && new Date(waitingMetadata.checkInTime) < new Date(checkInTime));
    }).length;
    const estimatedWaitMinutes = ordersAhead * 3;

    if (parkingSpot) await tx.parkingSpot.update({ where: { id: parkingSpot.id }, data: { isAvailable: false } });
    await tx.order.update({
      where: { id: order.id },
      data: {
        metadata: {
          ...metadata,
          checkInTime,
          parkingSpotId: parkingSpot?.id || null,
          parkingSpotNumber: parkingSpot?.spotNumber || null,
          vehicleDescription: vehicleDescription || null,
          customerArrived: true,
          pickupCheckedInAt: checkInTime,
          estimatedWaitMinutes,
        },
      },
    });

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.displayId,
      status: 'checked_in',
      parkingSpot: parkingSpot ? {
        id: parkingSpot.id,
        spotNumber: parkingSpot.spotNumber,
        description: parkingSpot.description || undefined,
        isAccessible: Boolean(parkingSpot.isAccessible),
      } : null,
      estimatedWaitMinutes,
      message: parkingSpot
        ? `Checked in at spot ${parkingSpot.spotNumber}. Estimated wait: ${estimatedWaitMinutes} minutes.`
        : `Checked in successfully. Estimated wait: ${estimatedWaitMinutes} minutes.`,
    };
  }, { isolationLevel: 'ReadCommitted' as any });
}

export async function customerCheckIn(
  _root: unknown,
  args: PickupCheckInArgs,
  context: Context,
) {
  if (!context.session?.itemId) throw new Error('Sign in to check in for pickup');
  const store = await requireSessionStore(context);
  return checkInOwnedPickupOrder(args, { kind: 'customer', userId: context.session.itemId, storeId: store.id }, context);
}

export async function guestCustomerCheckIn(
  _root: unknown,
  args: PickupCheckInArgs & { sessionId: string; token: string },
  context: Context,
) {
  return checkInOwnedPickupOrder(args, { kind: 'guest', sessionId: args.sessionId, token: args.token }, context);
}

// Get available parking spots
export async function getAvailableParkingSpots(
  root: any,
  { accessibleOnly }: { accessibleOnly?: boolean },
  context: Context
) {
  const { storeId } = await assertCanManageDelivery(context);
  const sudoContext = context.sudo();

  const where: any = {
    AND: [
      { store: { id: { equals: storeId } } },
      { isAvailable: { equals: true } },
    ],
  };

  if (accessibleOnly) {
    where.isAccessible = { equals: true };
  }

  const spots = await sudoContext.query.ParkingSpot.findMany({
    where,
    query: 'id spotNumber description isAccessible isAvailable',
    orderBy: [{ spotNumber: 'asc' }],
  });

  return spots.map((spot: any) => ({
    id: spot.id,
    spotNumber: spot.spotNumber,
    description: spot.description,
    isAccessible: spot.isAccessible,
    isAvailable: spot.isAvailable,
  }));
}

async function completePickupHandoff(context: Context, orderId: string, expectedParkingSpotId?: string) {
  const { storeId } = await assertCanManageDelivery(context);
  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRawUnsafe('SELECT "id" FROM "Order" WHERE "id" = $1 FOR UPDATE', orderId);
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, displayId: true, status: true, metadata: true, storeId: true },
    });
    if (!order || order.storeId !== storeId) throw new Error('Order not found in active store');
    const metadata = (order.metadata as Record<string, any> | null) || {};
    if (metadata.fulfillmentMethod !== 'pickup') throw new Error('Only pickup orders can use counter or curbside handoff');
    if (order.status !== 'packed' && order.status !== 'delivered') throw new Error('Pickup order must be packed before handoff');
    if (metadata.readyForPickup !== true && order.status !== 'delivered') throw new Error('Pickup order must be marked ready before handoff');

    const parkingSpotId = typeof metadata.parkingSpotId === 'string' ? metadata.parkingSpotId : null;
    if (expectedParkingSpotId && parkingSpotId !== expectedParkingSpotId) {
      throw new Error('Parking spot does not belong to this order check-in');
    }
    let spotNumber: string | null = null;
    if (parkingSpotId) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "ParkingSpot" WHERE "id" = $1 FOR UPDATE', parkingSpotId);
      const spot = await tx.parkingSpot.findUnique({ where: { id: parkingSpotId }, select: { storeId: true, spotNumber: true } });
      if (!spot || spot.storeId !== storeId) throw new Error('Parking spot not found in active store');
      spotNumber = spot.spotNumber;
      if (order.status !== 'delivered') await tx.parkingSpot.update({ where: { id: parkingSpotId }, data: { isAvailable: true } });
    }

    if (order.status !== 'delivered') {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'delivered',
          metadata: {
            ...metadata,
            deliveryTime: new Date().toISOString(),
            handoffCompletedBy: context.session?.itemId || 'staff',
            parkingSpotReleased: Boolean(parkingSpotId),
          },
        },
      });
    }
    return { order, parkingSpotId, spotNumber };
  }, { isolationLevel: 'Serializable' as any }));
}

export async function releaseParkingSpot(
  _root: unknown,
  { parkingSpotId, orderId }: { parkingSpotId: string; orderId: string },
  context: Context,
) {
  const result = await completePickupHandoff(context, orderId, parkingSpotId);
  return {
    success: true,
    parkingSpotId,
    spotNumber: result.spotNumber || parkingSpotId,
    orderId,
    message: `Parking spot ${result.spotNumber || parkingSpotId} released. Order marked as delivered.`,
  };
}

export async function completeOrderHandoff(
  _root: unknown,
  { orderId }: { orderId: string },
  context: Context,
) {
  const result = await completePickupHandoff(context, orderId);
  return {
    success: true,
    orderId,
    orderNumber: result.order.displayId,
    status: 'delivered',
    message: `Order #${result.order.displayId} has been handed off successfully.`,
  };
}
