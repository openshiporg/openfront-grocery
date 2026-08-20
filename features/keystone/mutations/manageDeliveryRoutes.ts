import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { withSerializableRetry } from '../utils/serializableTransaction';

type CreateDeliveryRouteArgs = {
  deliveryDate: string;
  deliveryTimeWindow: string;
  orderIds: string[];
  driverId: string;
};

type UpdateDeliveryRouteArgs = {
  routeId: string;
  status: 'planning' | 'in_progress' | 'completed';
};

async function assertCanManageDelivery(context: Context) {
  await requireFreshCapability(context, 'canManageDelivery');
}

const DELIVERY_TIME_WINDOWS = new Set([
  'time_8_10',
  'time_10_12',
  'time_12_14',
  'time_14_16',
  'time_16_18',
  'time_18_20',
]);

function deliveryDay(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
}

function assertValidRouteInput(deliveryDate: string, deliveryTimeWindow: string, orderIds: string[]) {
  const parsedDate = new Date(deliveryDate);
  if (!Number.isFinite(parsedDate.getTime())) {
    throw new Error('A valid delivery date is required');
  }
  if (!DELIVERY_TIME_WINDOWS.has(deliveryTimeWindow)) {
    throw new Error('A valid delivery time window is required');
  }
  if (!orderIds.length) {
    throw new Error('Select at least one order for the route');
  }
  if (new Set(orderIds).size !== orderIds.length) {
    throw new Error('Each order can only appear once on a route');
  }
}

async function lockOrders(transactionContext: Context, orderIds: string[]) {
  const placeholders = orderIds.map((_, index) => `$${index + 1}`).join(', ');
  await transactionContext.prisma.$queryRawUnsafe(
    `SELECT "id" FROM "Order" WHERE "id" IN (${placeholders}) ORDER BY "id" FOR UPDATE`,
    ...orderIds
  );
}

async function lockRoute(transactionContext: Context, routeId: string) {
  await transactionContext.prisma.$queryRawUnsafe(
    'SELECT "id" FROM "DeliveryRoute" WHERE "id" = $1 FOR UPDATE',
    routeId
  );
}

async function assertEligibleDriver(transactionContext: Context, sudoContext: Context, driverId: string, storeId: string) {
  await transactionContext.prisma.$queryRawUnsafe(
    'SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE',
    driverId
  );
  const driverRole = await sudoContext.query.User.findOne({
    where: { id: driverId },
    query: 'id role { id }',
  });
  if (driverRole?.role?.id) {
    await transactionContext.prisma.$queryRawUnsafe(
      'SELECT "id" FROM "Role" WHERE "id" = $1 FOR UPDATE',
      driverRole.role.id
    );
  }
  const driver = await sudoContext.query.User.findOne({
    where: { id: driverId },
    query: 'id store { id } role { canManageDelivery }',
  });
  if (driver?.store?.id !== storeId || !driver?.role?.canManageDelivery) {
    throw new Error('Assigned driver must have delivery permission');
  }
}

async function getOrderOrThrow(sudoContext: Context, orderId: string, storeId: string) {
  const order = await sudoContext.query.Order.findOne({
    where: { id: orderId },
    query: 'id displayId status deliveryDate deliveryTimeWindow metadata store { id } deliveryRoute { id }',
  });

  if (order?.store?.id !== storeId) {
    throw new Error(`Order ${orderId} not found in active store`);
  }

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  return order;
}

export async function createDeliveryRouteFromOrders(
  root: unknown,
  { deliveryDate, deliveryTimeWindow, orderIds, driverId }: CreateDeliveryRouteArgs,
  context: Context
) {
  await assertCanManageDelivery(context);
  assertValidRouteInput(deliveryDate, deliveryTimeWindow, orderIds);
  if (!driverId?.trim()) throw new Error('A delivery driver is required before routing orders');

  const store = await requireSessionStore(context);

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const sudoContext = transactionContext.sudo();
    await lockOrders(transactionContext, orderIds);
    await assertEligibleDriver(transactionContext, sudoContext, driverId, store.id);
    const orders = [];
    const existingRouteIds = new Set<string>();

    for (const orderId of orderIds) {
      const order = await getOrderOrThrow(sudoContext, orderId, store.id);
      const metadata = order.metadata || {};
      const existingRouteId = order.deliveryRoute?.id || metadata.deliveryRouteId;

      if (metadata.fulfillmentMethod !== 'delivery') {
        throw new Error(`Order #${order.displayId} is not a delivery order`);
      }

      if (existingRouteId) {
        existingRouteIds.add(existingRouteId);
      } else if (order.status !== 'packed') {
        throw new Error(`Order #${order.displayId} must be packed before routing`);
      }

      if (deliveryDay(order.deliveryDate) !== deliveryDay(deliveryDate)) {
        throw new Error(`Order #${order.displayId} is scheduled for a different delivery date`);
      }

      if (order.deliveryTimeWindow !== deliveryTimeWindow) {
        throw new Error(`Order #${order.displayId} is in a different delivery window`);
      }

      orders.push(order);
    }

    if (existingRouteIds.size > 0) {
      if (existingRouteIds.size === 1 && orders.every((order) => {
        const metadata = order.metadata || {};
        return (order.deliveryRoute?.id || metadata.deliveryRouteId) === Array.from(existingRouteIds)[0];
      })) {
        const existingRouteId = Array.from(existingRouteIds)[0];
        const existingRoute = await sudoContext.query.DeliveryRoute.findOne({
          where: { id: existingRouteId },
          query: 'id status date timeWindow driver { id } orders { id }',
        });
        if (
          existingRoute &&
          existingRoute.timeWindow === deliveryTimeWindow &&
          new Date(existingRoute.date).toISOString() === new Date(deliveryDate).toISOString() &&
          existingRoute.driver?.id === driverId &&
          existingRoute.orders?.length === orders.length
        ) {
          return {
            success: true,
            routeId: existingRoute.id,
            status: existingRoute.status,
            orderCount: orders.length,
            message: `Delivery route already exists with ${orders.length} orders.`,
          };
        }
      }
      throw new Error('One or more orders are already assigned to a route');
    }

    const route = await sudoContext.query.DeliveryRoute.createOne({
      data: {
        store: { connect: { id: store.id } },
        date: new Date(deliveryDate).toISOString(),
        timeWindow: deliveryTimeWindow as any,
        status: 'planning',
        driver: { connect: { id: driverId } },
        stops: orders.map((order, index) => ({
          orderId: order.id,
          displayId: order.displayId,
          sequence: index + 1,
          status: 'planned',
        })),
        orders: {
          connect: orders.map((order) => ({ id: order.id })),
        },
      },
      query: 'id date timeWindow status',
    });

    const routedAt = new Date().toISOString();
    for (const order of orders) {
      await sudoContext.query.Order.updateOne({
        where: { id: order.id },
        data: {
          metadata: {
            ...(order.metadata || {}),
            deliveryRouteId: route.id,
            routedAt,
          },
        },
      });
    }

    return {
      success: true,
      routeId: route.id,
      status: route.status,
      orderCount: orders.length,
      message: `Created delivery route with ${orders.length} orders.`,
    };
  }, { isolationLevel: 'ReadCommitted' as any }));
}

export async function updateDeliveryRouteWorkflow(
  root: unknown,
  { routeId, status }: UpdateDeliveryRouteArgs,
  context: Context
) {
  await assertCanManageDelivery(context);

  if (status !== 'in_progress' && status !== 'completed') {
    throw new Error('Route workflow status must be in_progress or completed');
  }

  const store = await requireSessionStore(context);

  return withSerializableRetry(() => context.transaction(async (transactionContext) => {
    const sudoContext = transactionContext.sudo();
    await lockRoute(transactionContext, routeId);
    const route = await sudoContext.query.DeliveryRoute.findOne({
      where: { id: routeId },
      query: `
        id
        status
        store { id }
        stops
        startedAt
        completedAt
        driver { id }
        orders {
          id
          displayId
          status
          metadata
        }
      `,
    });

    if (!route || route.store?.id !== store.id) {
      throw new Error('Delivery route not found in active store');
    }

    if (route.status === status) {
      return {
        success: true,
        routeId,
        status,
        orderCount: route.orders?.length || 0,
        message: status === 'in_progress' ? 'Route already dispatched.' : 'Route already completed.',
      };
    }

    if (route.status === 'completed') {
      throw new Error('Completed routes cannot be changed');
    }

    if (status === 'in_progress' && route.status !== 'planning') {
      throw new Error('Only planning routes can be dispatched');
    }

    if (status === 'completed' && route.status !== 'in_progress') {
      throw new Error('Only in-progress routes can be completed');
    }

    if (status === 'in_progress') {
      if (!route.driver?.id) throw new Error('Routes require an eligible driver before dispatch');
      await assertEligibleDriver(transactionContext, sudoContext, route.driver.id, store.id);
    }

    for (const order of route.orders || []) {
      const allowedStatuses = status === 'in_progress' ? ['packed', 'out_for_delivery'] : ['out_for_delivery', 'delivered'];
      if (!allowedStatuses.includes(order.status)) {
        throw new Error(`Order #${order.displayId} is not ready for this route transition`);
      }
    }

    const now = new Date().toISOString();
    await sudoContext.query.DeliveryRoute.updateOne({
      where: { id: routeId },
      data: {
        status,
        ...(status === 'in_progress' ? { startedAt: route.startedAt || now } : {}),
        ...(status === 'completed' ? { completedAt: route.completedAt || now } : {}),
        stops: (route.stops || []).map((stop: any) => ({
          ...stop,
          status: status === 'in_progress' ? 'out_for_delivery' : 'delivered',
        })),
      },
    });

    const nextOrderStatus = status === 'in_progress' ? 'out_for_delivery' : 'delivered';
    for (const order of route.orders || []) {
      await sudoContext.query.Order.updateOne({
        where: { id: order.id },
        data: {
          status: nextOrderStatus,
          metadata: {
            ...(order.metadata || {}),
            deliveryRouteId: routeId,
            ...(status === 'in_progress' ? { dispatchedAt: order.metadata?.dispatchedAt || now } : {}),
            ...(status === 'completed' ? { deliveredAt: order.metadata?.deliveredAt || now } : {}),
          },
        },
      });
    }

    return {
      success: true,
      routeId,
      status,
      orderCount: route.orders?.length || 0,
      message: status === 'in_progress' ? 'Route dispatched.' : 'Route completed.',
    };
  }, { isolationLevel: 'ReadCommitted' as any }));
}
