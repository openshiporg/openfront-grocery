import type { Context } from '.keystone/types';

type CreateDeliveryRouteArgs = {
  deliveryDate: string;
  deliveryTimeWindow: string;
  orderIds: string[];
  driverId?: string | null;
};

type UpdateDeliveryRouteArgs = {
  routeId: string;
  status: 'planning' | 'in_progress' | 'completed';
};

async function getOrderOrThrow(sudoContext: Context, orderId: string) {
  const order = await sudoContext.query.Order.findOne({
    where: { id: orderId },
    query: 'id displayId status deliveryDate deliveryTimeWindow metadata deliveryRoute { id }',
  });

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
  if (!orderIds.length) {
    throw new Error('Select at least one order for the route');
  }

  const sudoContext = context.sudo();
  const orders = [];

  for (const orderId of orderIds) {
    const order = await getOrderOrThrow(sudoContext, orderId);
    const metadata = order.metadata || {};

    if (metadata.fulfillmentMethod !== 'delivery') {
      throw new Error(`Order #${order.displayId} is not a delivery order`);
    }

    if (order.status !== 'packed') {
      throw new Error(`Order #${order.displayId} must be packed before routing`);
    }

    if (order.deliveryTimeWindow !== deliveryTimeWindow) {
      throw new Error(`Order #${order.displayId} is in a different delivery window`);
    }

    if (order.deliveryRoute?.id || metadata.deliveryRouteId) {
      throw new Error(`Order #${order.displayId} is already assigned to a route`);
    }

    orders.push(order);
  }

  const route = await sudoContext.query.DeliveryRoute.createOne({
    data: {
      date: new Date(deliveryDate).toISOString(),
      timeWindow: deliveryTimeWindow as any,
      status: 'planning',
      ...(driverId ? { driver: { connect: { id: driverId } } } : {}),
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
}

export async function updateDeliveryRouteWorkflow(
  root: unknown,
  { routeId, status }: UpdateDeliveryRouteArgs,
  context: Context
) {
  const sudoContext = context.sudo();

  const route = await sudoContext.query.DeliveryRoute.findOne({
    where: { id: routeId },
    query: `
      id
      status
      stops
      orders {
        id
        displayId
        status
        metadata
      }
    `,
  });

  if (!route) {
    throw new Error('Delivery route not found');
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

  const now = new Date().toISOString();
  const routeData: Record<string, any> = { status };

  if (status === 'in_progress') {
    routeData.startedAt = now;
  }

  if (status === 'completed') {
    routeData.completedAt = now;
  }

  await sudoContext.query.DeliveryRoute.updateOne({
    where: { id: routeId },
    data: {
      ...routeData,
      stops: (route.stops || []).map((stop: any) => ({
        ...stop,
        status: status === 'in_progress' ? 'out_for_delivery' : status === 'completed' ? 'delivered' : stop.status,
      })),
    },
  });

  const nextOrderStatus = status === 'in_progress' ? 'out_for_delivery' : status === 'completed' ? 'delivered' : null;

  if (nextOrderStatus) {
    for (const order of route.orders || []) {
      await sudoContext.query.Order.updateOne({
        where: { id: order.id },
        data: {
          status: nextOrderStatus,
          metadata: {
            ...(order.metadata || {}),
            deliveryRouteId: routeId,
            ...(status === 'in_progress' ? { dispatchedAt: now } : {}),
            ...(status === 'completed' ? { deliveredAt: now } : {}),
          },
        },
      });
    }
  }

  return {
    success: true,
    routeId,
    status,
    orderCount: route.orders?.length || 0,
    message: status === 'in_progress' ? 'Route dispatched.' : status === 'completed' ? 'Route completed.' : 'Route updated.',
  };
}
