import type { Context } from '.keystone/types';

interface PickupSlotResult {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  availableCapacity: number;
  maxOrders: number;
  currentOrders: number;
  isAvailable: boolean;
}

interface GetAvailablePickupSlotsInput {
  days?: number;
  minCapacity?: number;
}

// Query to get available pickup slots for the next X days
export async function getAvailablePickupSlots(
  root: any,
  { days = 7, minCapacity = 1 }: GetAvailablePickupSlotsInput,
  context: Context
): Promise<PickupSlotResult[]> {
  const sudoContext = context.sudo();

  // Calculate date range
  const startDate = new Date();
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);

  // Query pickup slots
  const slots = await sudoContext.query.PickupSlot.findMany({
    where: {
      AND: [
        { date: { gte: startDate.toISOString() } },
        { date: { lt: endDate.toISOString() } },
        { isAvailable: { equals: true } },
      ],
    },
    query: `
      id
      date
      startTime
      endTime
      maxOrders
      currentOrders
      isAvailable
    `,
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });

  // Filter by capacity and format response
  const availableSlots: PickupSlotResult[] = [];

  for (const slot of slots) {
    const availableCapacity = slot.maxOrders - slot.currentOrders;

    if (availableCapacity >= minCapacity) {
      availableSlots.push({
        id: slot.id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        availableCapacity,
        maxOrders: slot.maxOrders,
        currentOrders: slot.currentOrders,
        isAvailable: slot.isAvailable,
      });
    }
  }

  return availableSlots;
}

// Query to get slots grouped by date
export async function getPickupSlotsByDate(
  root: any,
  { days = 7, minCapacity = 1 }: GetAvailablePickupSlotsInput,
  context: Context
) {
  const slots = await getAvailablePickupSlots(root, { days, minCapacity }, context);

  // Group slots by date
  const groupedSlots: Record<string, PickupSlotResult[]> = {};

  for (const slot of slots) {
    const dateKey = new Date(slot.date).toISOString().split('T')[0];

    if (!groupedSlots[dateKey]) {
      groupedSlots[dateKey] = [];
    }

    groupedSlots[dateKey].push(slot);
  }

  // Convert to array format
  return Object.entries(groupedSlots).map(([date, daySlots]) => ({
    date,
    slots: daySlots,
    totalSlots: daySlots.length,
    totalAvailableCapacity: daySlots.reduce((sum, slot) => sum + slot.availableCapacity, 0),
  }));
}

// Reserve a pickup slot for an order
export async function reservePickupSlot(
  root: any,
  { slotId, orderId }: { slotId: string; orderId: string },
  context: Context
) {
  const sudoContext = context.sudo();

  // Get the slot
  const slot = await sudoContext.query.PickupSlot.findOne({
    where: { id: slotId },
    query: 'id maxOrders currentOrders isAvailable date startTime endTime',
  });

  if (!slot) {
    throw new Error('Pickup slot not found');
  }

  if (!slot.isAvailable) {
    throw new Error('Pickup slot is not available');
  }

  const availableCapacity = slot.maxOrders - slot.currentOrders;

  if (availableCapacity <= 0) {
    throw new Error('Pickup slot is fully booked');
  }

  // Increment current orders
  await sudoContext.query.PickupSlot.updateOne({
    where: { id: slotId },
    data: {
      currentOrders: slot.currentOrders + 1,
      // Automatically mark as unavailable if full
      isAvailable: slot.currentOrders + 1 < slot.maxOrders,
    },
  });

  // Update order with pickup slot info (store in metadata)
  const order = await sudoContext.query.Order.findOne({
    where: { id: orderId },
    query: 'id metadata',
  });

  if (order) {
    const metadata = order.metadata || {};
    await sudoContext.query.Order.updateOne({
      where: { id: orderId },
      data: {
        metadata: {
          ...metadata,
          pickupSlotId: slotId,
          pickupDate: slot.date,
          pickupStartTime: slot.startTime,
          pickupEndTime: slot.endTime,
        },
      },
    });
  }

  return {
    success: true,
    slotId,
    orderId,
    pickupDate: slot.date,
    pickupStartTime: slot.startTime,
    pickupEndTime: slot.endTime,
    remainingCapacity: availableCapacity - 1,
  };
}

// Release a pickup slot reservation
export async function releasePickupSlot(
  root: any,
  { slotId, orderId }: { slotId: string; orderId?: string },
  context: Context
) {
  const sudoContext = context.sudo();

  // Get the slot
  const slot = await sudoContext.query.PickupSlot.findOne({
    where: { id: slotId },
    query: 'id maxOrders currentOrders',
  });

  if (!slot) {
    throw new Error('Pickup slot not found');
  }

  if (slot.currentOrders <= 0) {
    throw new Error('No reservations to release');
  }

  // Decrement current orders
  await sudoContext.query.PickupSlot.updateOne({
    where: { id: slotId },
    data: {
      currentOrders: slot.currentOrders - 1,
      isAvailable: true, // Re-enable if it was full
    },
  });

  // Clear pickup slot info from order if provided
  if (orderId) {
    const order = await sudoContext.query.Order.findOne({
      where: { id: orderId },
      query: 'id metadata',
    });

    if (order) {
      const metadata = order.metadata || {};
      delete metadata.pickupSlotId;
      delete metadata.pickupDate;
      delete metadata.pickupStartTime;
      delete metadata.pickupEndTime;

      await sudoContext.query.Order.updateOne({
        where: { id: orderId },
        data: { metadata },
      });
    }
  }

  return {
    success: true,
    slotId,
    remainingCapacity: slot.maxOrders - slot.currentOrders + 1,
  };
}
