import type { Context } from '.keystone/types';

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

// Customer check-in for curbside pickup
export async function customerCheckIn(
  root: any,
  {
    orderId,
    parkingSpotId,
    vehicleDescription,
  }: {
    orderId: string;
    parkingSpotId?: string;
    vehicleDescription?: string;
  },
  context: Context
): Promise<CheckInResult> {
  const sudoContext = context.sudo();

  // Get the order
  const order = await sudoContext.query.Order.findOne({
    where: { id: orderId },
    query: `
      id
      displayId
      status
      email
      user { id }
      metadata
    `,
  });

  if (!order) {
    throw new Error('Order not found');
  }

  // Verify order ownership if user is logged in
  if (context.session?.itemId && order.user?.id !== context.session.itemId) {
    throw new Error('Not authorized to check in for this order');
  }

  // Validate order status - must be packed or ready for pickup
  const validStatuses = ['packed', 'picking'];
  if (!validStatuses.includes(order.status)) {
    if (order.status === 'delivered') {
      throw new Error('This order has already been picked up');
    }
    if (order.status === 'cancelled') {
      throw new Error('This order has been cancelled');
    }
    if (order.status === 'pending') {
      throw new Error('This order is still being processed and not ready for pickup');
    }
    throw new Error(`Order cannot be checked in with status: ${order.status}`);
  }

  // Get parking spot if specified
  let parkingSpot = null;
  if (parkingSpotId) {
    parkingSpot = await sudoContext.query.ParkingSpot.findOne({
      where: { id: parkingSpotId },
      query: 'id spotNumber description isAccessible isAvailable',
    });

    if (!parkingSpot) {
      throw new Error('Parking spot not found');
    }

    if (!parkingSpot.isAvailable) {
      throw new Error('Selected parking spot is not available');
    }

    // Mark parking spot as occupied
    await sudoContext.query.ParkingSpot.updateOne({
      where: { id: parkingSpotId },
      data: { isAvailable: false },
    });
  }

  // Update order metadata with check-in information
  const metadata = order.metadata || {};
  const checkInTime = new Date().toISOString();

  await sudoContext.query.Order.updateOne({
    where: { id: orderId },
    data: {
      status: 'packed', // Ensure status indicates ready for handoff
      metadata: {
        ...metadata,
        checkInTime,
        parkingSpotId: parkingSpotId || null,
        parkingSpotNumber: parkingSpot?.spotNumber || null,
        vehicleDescription: vehicleDescription || null,
        customerArrived: true,
      },
    },
  });

  // Calculate estimated wait time based on current queue
  // Count orders that checked in before this one that are still waiting
  const waitingOrders = await sudoContext.query.Order.findMany({
    where: {
      AND: [
        { status: { equals: 'packed' } },
        { id: { not: { equals: orderId } } },
      ],
    },
    query: 'id metadata',
  });

  // Count orders that have checked in but not been delivered
  const ordersAhead = waitingOrders.filter((o: any) => {
    const orderMeta = o.metadata || {};
    if (!orderMeta.customerArrived) return false;
    if (!orderMeta.checkInTime) return false;
    return new Date(orderMeta.checkInTime) < new Date(checkInTime);
  }).length;

  // Estimate 3 minutes per order ahead in queue
  const estimatedWaitMinutes = ordersAhead * 3;

  return {
    success: true,
    orderId,
    orderNumber: order.displayId,
    status: 'checked_in',
    parkingSpot: parkingSpot ? {
      id: parkingSpot.id,
      spotNumber: parkingSpot.spotNumber,
      description: parkingSpot.description,
      isAccessible: parkingSpot.isAccessible,
    } : null,
    estimatedWaitMinutes,
    message: parkingSpot
      ? `Checked in at spot ${parkingSpot.spotNumber}. Estimated wait: ${estimatedWaitMinutes} minutes.`
      : `Checked in successfully. Estimated wait: ${estimatedWaitMinutes} minutes.`,
  };
}

// Get available parking spots
export async function getAvailableParkingSpots(
  root: any,
  { accessibleOnly }: { accessibleOnly?: boolean },
  context: Context
) {
  const sudoContext = context.sudo();

  const where: any = {
    isAvailable: { equals: true },
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

// Release parking spot when order is delivered
export async function releaseParkingSpot(
  root: any,
  { parkingSpotId, orderId }: { parkingSpotId: string; orderId: string },
  context: Context
) {
  const sudoContext = context.sudo();

  // Get the parking spot
  const spot = await sudoContext.query.ParkingSpot.findOne({
    where: { id: parkingSpotId },
    query: 'id spotNumber isAvailable',
  });

  if (!spot) {
    throw new Error('Parking spot not found');
  }

  // Mark parking spot as available
  await sudoContext.query.ParkingSpot.updateOne({
    where: { id: parkingSpotId },
    data: { isAvailable: true },
  });

  // Update order to delivered status
  const order = await sudoContext.query.Order.findOne({
    where: { id: orderId },
    query: 'id metadata',
  });

  if (order) {
    const metadata = order.metadata || {};
    await sudoContext.query.Order.updateOne({
      where: { id: orderId },
      data: {
        status: 'delivered',
        metadata: {
          ...metadata,
          deliveryTime: new Date().toISOString(),
          parkingSpotReleased: true,
        },
      },
    });
  }

  return {
    success: true,
    parkingSpotId,
    spotNumber: spot.spotNumber,
    orderId,
    message: `Parking spot ${spot.spotNumber} released. Order marked as delivered.`,
  };
}

// Complete order handoff (for store staff)
export async function completeOrderHandoff(
  root: any,
  { orderId }: { orderId: string },
  context: Context
) {
  const sudoContext = context.sudo();

  // Get the order
  const order = await sudoContext.query.Order.findOne({
    where: { id: orderId },
    query: 'id displayId status metadata',
  });

  if (!order) {
    throw new Error('Order not found');
  }

  if (order.status === 'delivered') {
    throw new Error('Order has already been delivered');
  }

  const metadata = order.metadata || {};
  const parkingSpotId = metadata.parkingSpotId;

  // Release parking spot if one was assigned
  if (parkingSpotId) {
    await sudoContext.query.ParkingSpot.updateOne({
      where: { id: parkingSpotId },
      data: { isAvailable: true },
    });
  }

  // Update order status to delivered
  await sudoContext.query.Order.updateOne({
    where: { id: orderId },
    data: {
      status: 'delivered',
      metadata: {
        ...metadata,
        deliveryTime: new Date().toISOString(),
        handoffCompletedBy: context.session?.itemId || 'staff',
        parkingSpotReleased: !!parkingSpotId,
      },
    },
  });

  return {
    success: true,
    orderId,
    orderNumber: order.displayId,
    status: 'delivered',
    message: `Order #${order.displayId} has been handed off successfully.`,
  };
}
