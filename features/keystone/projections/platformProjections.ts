import type { Context } from '.keystone/types';

import { paymentProviderDefinitions } from '../../integrations/payment';
import { requireFreshCapability, type Capability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { zonedDateKeyOffset, zonedStartOfDateKey, zonedStartOfDay } from '../lib/storeTime';

function requirePermission(context: Context, capability: Capability, message: string) {
  return requireFreshCapability(context, capability).catch(() => { throw new Error(message); });
}

function iso(value: Date | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function number(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

const OPERATOR_BOUND = 500;
function assertWithinOperatorBound(rows: unknown[], label: string) {
  if (rows.length > OPERATOR_BOUND) throw new Error(`${label} exceeds the bounded launch view; archive historical records or use the paginated Orders workflow`);
  return rows;
}

function pageArgs(args: { page?: number; pageSize?: number } | undefined) {
  const page = Math.max(1, Math.trunc(Number(args?.page || 1)));
  const pageSize = Math.max(1, Math.min(100, Math.trunc(Number(args?.pageSize || 50))));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function mapLineItem(line: any) {
  const unitPriceCents = Number(line.unitPriceCents || Math.round(Number(line.unitPrice || 0) * 100));
  return {
    id: line.id,
    title: line.title,
    sku: line.sku,
    quantity: line.quantity,
    unitPrice: unitPriceCents / 100,
    unitPriceCents,
    thumbnail: line.thumbnail || '',
    metadata: line.metadata || null,
  };
}

function mapRefund(refund: any) {
  return {
    id: refund.id,
    amountCents: refund.amountCents,
    status: refund.status,
    reason: refund.providerData?.requestReason || '',
    requestedAt: iso(refund.requestedAt),
    processedAt: iso(refund.processedAt),
    failureMessage: refund.failureMessage || null,
    reconciliationAttempts: refund.reconciliationAttempts || 0,
    reconciliationNextAttemptAt: iso(refund.reconciliationNextAttemptAt),
    reconciliationDeadLetterAt: iso(refund.reconciliationDeadLetterAt),
    reconciliationLastError: refund.reconciliationLastError || null,
  };
}

function mapPayment(payment: any) {
  return {
    id: payment.id,
    amountCents: payment.amountCents,
    status: payment.status,
    providerPaymentId: payment.providerPaymentId || null,
    processedAt: iso(payment.processedAt),
    errorMessage: payment.errorMessage || null,
    providerCode: payment.paymentProvider?.code || '',
    refunds: (payment.refunds || []).map(mapRefund),
  };
}

export async function groceryPlatformOrders(_root: unknown, args: { page?: number; pageSize?: number }, context: Context) {
  await requirePermission(context, 'canManageOrders', 'Orders projection requires order-management permission');
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const now = new Date();
  const today = zonedStartOfDay(now, store.timezone);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const commercialOrderWhere = { storeId: store.id };
  const [orders, totalOrders, statuses, todaySales, thirtyDaySales, thirtyDayRefunds] = await Promise.all([
    context.prisma.order.findMany({
      where: { storeId: store.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: pagination.skip,
      take: pagination.pageSize,
      select: {
        id: true, displayId: true, email: true, status: true, deliveryDate: true,
        deliveryTimeWindow: true, metadata: true, createdAt: true, currencyCode: true,
        subtotalCents: true, taxCents: true, deliveryFeeCents: true, discountCents: true, totalCents: true,
        lineItems: { select: { id: true, title: true, sku: true, quantity: true, unitPrice: true, unitPriceCents: true, thumbnail: true, metadata: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
              select: {
            id: true, amountCents: true, status: true, providerPaymentId: true,
            processedAt: true, errorMessage: true,
            paymentProvider: { select: { code: true } },
            refunds: {
              orderBy: { requestedAt: 'desc' },
                      select: {
                id: true, amountCents: true, status: true, providerData: true,
                requestedAt: true, processedAt: true, failureMessage: true,
                reconciliationAttempts: true, reconciliationNextAttemptAt: true,
                reconciliationDeadLetterAt: true, reconciliationLastError: true,
              },
            },
          },
        },
      },
    }),
    context.prisma.order.count({ where: { storeId: store.id } }),
    Promise.all(['pending', 'picking', 'packed', 'out_for_delivery', 'delivered'].map(async (status) => [
      status,
      await context.prisma.order.count({ where: { storeId: store.id, status: status as any } }),
    ] as const)),
    context.prisma.order.aggregate({
      where: { ...commercialOrderWhere, createdAt: { gte: today } },
      _count: { _all: true },
      _sum: { totalCents: true },
    }),
    context.prisma.order.aggregate({
      where: { ...commercialOrderWhere, createdAt: { gte: thirtyDaysAgo } },
      _count: { _all: true },
      _sum: { totalCents: true },
      _avg: { totalCents: true },
    }),
    context.prisma.paymentRefund.aggregate({
      where: { status: 'succeeded', processedAt: { gte: thirtyDaysAgo }, payment: { storeId: store.id } },
      _sum: { amountCents: true },
    }),
  ]);
  const counts = Object.fromEntries(statuses);
  return {
    currencyCode: store.currencyCode,
    orders: orders.map((order) => ({
      ...order,
      deliveryDate: iso(order.deliveryDate),
      createdAt: iso(order.createdAt),
      lineItems: order.lineItems.map(mapLineItem),
      payments: order.payments.map(mapPayment),
    })),
    salesSummary: {
      todayOrders: todaySales._count._all,
      todayGrossCents: todaySales._sum.totalCents || 0,
      thirtyDayOrders: thirtyDaySales._count._all,
      thirtyDayGrossCents: thirtyDaySales._sum.totalCents || 0,
      thirtyDayRefundCents: thirtyDayRefunds._sum.amountCents || 0,
      thirtyDayNetCents: (thirtyDaySales._sum.totalCents || 0) - (thirtyDayRefunds._sum.amountCents || 0),
      averageBasketCents: Math.round(thirtyDaySales._avg.totalCents || 0),
    },
    pending: counts.pending || 0,
    picking: counts.picking || 0,
    packed: counts.packed || 0,
    outForDelivery: counts.out_for_delivery || 0,
    delivered: counts.delivered || 0,
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalOrders,
    totalPages: Math.max(1, Math.ceil(totalOrders / pagination.pageSize)),
  };
}

async function ordersByStatus(context: Context, storeId: string, status: string, orderBy: 'createdAt' | 'updatedAt') {
  return context.prisma.order.findMany({
    where: { storeId, status: status as any },
    orderBy: [{ [orderBy]: orderBy === 'createdAt' ? 'asc' : 'desc' }, { id: 'asc' }],
    take: OPERATOR_BOUND + 1,
    select: {
      id: true, displayId: true, email: true, status: true, deliveryDate: true, deliveryTimeWindow: true,
      createdAt: true, currencyCode: true, subtotalCents: true, taxCents: true, deliveryFeeCents: true,
      discountCents: true, totalCents: true, substitutionPreference: true, metadata: true,
      lineItems: { select: { id: true, quantity: true, title: true, sku: true, unitPrice: true, unitPriceCents: true, thumbnail: true, metadata: true } },
      payments: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, amountCents: true, status: true, providerPaymentId: true, processedAt: true, errorMessage: true,
          paymentProvider: { select: { code: true } },
          refunds: {
            orderBy: { requestedAt: 'desc' },
            select: {
              id: true, amountCents: true, status: true, providerData: true, requestedAt: true, processedAt: true,
              failureMessage: true, reconciliationAttempts: true, reconciliationNextAttemptAt: true,
              reconciliationDeadLetterAt: true, reconciliationLastError: true,
            },
          },
        },
      },
    },
  });
}

export async function groceryPlatformFulfillment(_root: unknown, _args: unknown, context: Context) {
  await requirePermission(context, 'canManageOrders', 'Fulfillment projection requires order-management permission');
  const store = await requireSessionStore(context);
  const [pending, picking, packed, substitutions] = await Promise.all([
    ordersByStatus(context, store.id, 'pending', 'createdAt'),
    ordersByStatus(context, store.id, 'picking', 'createdAt'),
    ordersByStatus(context, store.id, 'packed', 'updatedAt'),
    context.prisma.orderItemSubstitution.findMany({
      where: { lineItem: { order: { storeId: store.id } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: OPERATOR_BOUND + 1,
      select: {
        id: true, orderItem: true, originalProduct: true, substitutedProduct: true,
        reason: true, customerApproved: true, approvedAt: true,
      },
    }),
  ]);
  assertWithinOperatorBound(pending, 'Pending fulfillment orders');
  assertWithinOperatorBound(picking, 'Picking fulfillment orders');
  assertWithinOperatorBound(packed, 'Packed fulfillment orders');
  assertWithinOperatorBound(substitutions, 'Substitution evidence');
  const mapOrder = (order: any) => ({
    ...order,
    deliveryDate: iso(order.deliveryDate),
    createdAt: iso(order.createdAt),
    lineItems: order.lineItems.map(mapLineItem),
    payments: order.payments.map(mapPayment),
  });
  return {
    pending: pending.map(mapOrder),
    picking: picking.map(mapOrder),
    packed: packed.map(mapOrder),
    orderItemSubstitutions: substitutions.map((item) => ({ ...item, approvedAt: iso(item.approvedAt) })),
  };
}

export async function groceryPlatformDelivery(_root: unknown, _args: unknown, context: Context) {
  await requirePermission(context, 'canManageDelivery', 'Delivery projection requires delivery-management permission');
  const store = await requireSessionStore(context);
  const slotWindowStart = zonedStartOfDateKey(zonedDateKeyOffset(new Date(), store.timezone, -1), store.timezone);
  const [routes, readyCandidates, drivers, slots] = await Promise.all([
    context.prisma.deliveryRoute.findMany({
      where: { storeId: store.id }, orderBy: [{ date: 'desc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1,
      select: {
        id: true, date: true, timeWindow: true, status: true, startedAt: true, completedAt: true,
        driver: { select: { id: true, name: true, email: true } },
        orders: { select: { id: true, displayId: true, status: true, metadata: true } },
      },
    }),
    context.prisma.order.findMany({
      where: { storeId: store.id, status: 'packed' }, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1,
      select: {
        id: true, displayId: true, email: true, status: true, deliveryDate: true, deliveryTimeWindow: true,
        createdAt: true, currencyCode: true, subtotalCents: true, taxCents: true, deliveryFeeCents: true,
        discountCents: true, totalCents: true, substitutionPreference: true, metadata: true,
        lineItems: { select: { id: true, title: true, sku: true, quantity: true, unitPrice: true, unitPriceCents: true, thumbnail: true, metadata: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, amountCents: true, status: true, providerPaymentId: true, processedAt: true, errorMessage: true,
            paymentProvider: { select: { code: true } },
            refunds: {
              orderBy: { requestedAt: 'desc' },
              select: {
                id: true, amountCents: true, status: true, providerData: true, requestedAt: true, processedAt: true,
                failureMessage: true, reconciliationAttempts: true, reconciliationNextAttemptAt: true,
                reconciliationDeadLetterAt: true, reconciliationLastError: true,
              },
            },
          },
        },
      },
    }),
    context.prisma.user.findMany({
      where: { storeId: store.id, role: { canManageDelivery: true } }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1,
      select: { id: true, name: true, email: true },
    }),
    context.prisma.deliverySlot.findMany({
      where: { storeId: store.id, date: { gte: slotWindowStart } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1,
      select: { id: true, date: true, startTime: true, endTime: true, capacity: true, currentBookings: true, isActive: true, deliveryFee: true },
    }),
  ]);
  assertWithinOperatorBound(routes, 'Delivery routes');
  assertWithinOperatorBound(readyCandidates, 'Delivery-ready orders');
  assertWithinOperatorBound(drivers, 'Delivery drivers');
  assertWithinOperatorBound(slots, 'Delivery slots');
  const readyOrders = readyCandidates.filter((order) => (order.metadata as any)?.fulfillmentMethod === 'delivery');
  return {
    deliveryRoutes: routes.map((route) => ({ ...route, date: iso(route.date), status: route.status || 'planning', startedAt: iso(route.startedAt), completedAt: iso(route.completedAt) })),
    readyOrders: readyOrders.map((order) => ({
      ...order,
      deliveryDate: iso(order.deliveryDate),
      createdAt: iso(order.createdAt),
      lineItems: order.lineItems.map(mapLineItem),
      payments: order.payments.map(mapPayment),
    })),
    drivers,
    deliverySlots: slots.map((slot) => ({ ...slot, date: iso(slot.date), currentBookings: slot.currentBookings || 0, deliveryFee: slot.deliveryFee || 0 })),
  };
}

export async function groceryPlatformPickup(_root: unknown, _args: unknown, context: Context) {
  await requirePermission(context, 'canManageDelivery', 'Pickup projection requires delivery-management permission');
  const store = await requireSessionStore(context);
  const slotWindowStart = zonedStartOfDateKey(zonedDateKeyOffset(new Date(), store.timezone, -1), store.timezone);
  const [slots, parkingSpots, orders] = await Promise.all([
    context.prisma.pickupSlot.findMany({ where: { storeId: store.id, date: { gte: slotWindowStart } }, orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1, select: { id: true, date: true, startTime: true, endTime: true, maxOrders: true, currentOrders: true, isAvailable: true } }),
    context.prisma.parkingSpot.findMany({ where: { storeId: store.id }, orderBy: [{ spotNumber: 'asc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1, select: { id: true, spotNumber: true, description: true, isAccessible: true, isAvailable: true } }),
    context.prisma.order.findMany({ where: { storeId: store.id, status: 'packed' }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1, select: { id: true, displayId: true, email: true, status: true, metadata: true } }),
  ]);
  assertWithinOperatorBound(slots, 'Pickup slots');
  assertWithinOperatorBound(parkingSpots, 'Parking spots');
  assertWithinOperatorBound(orders, 'Pickup-ready orders');
  const pickupOrders = orders.filter((order) => (order.metadata as any)?.fulfillmentMethod === 'pickup');
  return {
    pickupSlots: slots.map((slot) => ({ ...slot, date: iso(slot.date), currentOrders: slot.currentOrders || 0 })),
    parkingSpots,
    pickupOrders,
  };
}

export async function groceryPlatformInventory(_root: unknown, _args: unknown, context: Context) {
  await requirePermission(context, 'canManageInventory', 'Inventory projection requires inventory-management permission');
  const store = await requireSessionStore(context);
  const now = new Date();
  const [products, inventoryLots] = await Promise.all([
    context.prisma.product.findMany({ where: { storeId: store.id }, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1, select: { id: true, title: true, sku: true, stockQuantity: true, lowStockThreshold: true, department: true, supplier: { select: { id: true, name: true } }, _count: { select: { backInStockAlerts: { where: { isActive: true } } } } } }),
    context.prisma.inventoryLot.findMany({ where: { storeId: store.id }, orderBy: [{ expirationDate: 'asc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1, select: { id: true, lotNumber: true, expirationDate: true, quantity: true, quantityRemaining: true, location: true, productId: true, product: { select: { id: true, title: true } }, supplier: { select: { id: true, name: true } } } }),
  ]);
  assertWithinOperatorBound(products, 'Inventory products');
  assertWithinOperatorBound(inventoryLots, 'Inventory lots');
  const sellableByProduct = new Map<string, number>();
  for (const lot of inventoryLots) {
    if (lot.productId && lot.expirationDate.getTime() > now.getTime() && lot.quantityRemaining > 0) {
      sellableByProduct.set(lot.productId, (sellableByProduct.get(lot.productId) || 0) + lot.quantityRemaining);
    }
  }
  return {
    products: products.map(({ _count, stockQuantity, ...product }) => {
      const sellableQuantity = sellableByProduct.get(product.id) || 0;
      return {
        ...product,
        stockQuantity: sellableQuantity,
        recordedStockQuantity: Number(stockQuantity || 0),
        inStock: sellableQuantity > 0,
        activeBackInStockAlerts: _count.backInStockAlerts,
      };
    }),
    inventoryLots: inventoryLots.map(({ productId: _productId, ...lot }) => ({
      ...lot,
      expirationDate: iso(lot.expirationDate),
      isExpired: lot.expirationDate.getTime() <= now.getTime(),
      isExpiringSoon: lot.expirationDate.getTime() > now.getTime() && lot.expirationDate.getTime() <= now.getTime() + 7 * 86_400_000,
    })),
  };
}

export async function groceryPlatformSuppliers(_root: unknown, _args: unknown, context: Context) {
  await requirePermission(context, 'canManageSuppliers', 'Suppliers projection requires supplier-management permission');
  const store = await requireSessionStore(context);
  const suppliers = await context.prisma.supplier.findMany({
    where: { storeId: store.id }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1,
    select: { id: true, name: true, contactName: true, email: true, phone: true, paymentTerms: true, deliveryDays: true, minimumOrder: true, minimumOrderCents: true, products: { select: { id: true } }, purchaseOrders: { select: { id: true, status: true } } },
  });
  assertWithinOperatorBound(suppliers, 'Suppliers');
  return { currencyCode: store.currencyCode, suppliers };
}

export async function groceryPlatformPurchasing(_root: unknown, _args: unknown, context: Context) {
  await requirePermission(context, 'canManageInventory', 'Purchasing projection requires inventory-management permission');
  const store = await requireSessionStore(context);
  const dueSoonBoundary = new Date(Date.now() + 3 * 86_400_000);
  const purchaseOrders = await context.prisma.purchaseOrder.findMany({
    where: { storeId: store.id }, orderBy: [{ orderDate: 'desc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1,
    select: { id: true, poNumber: true, orderDate: true, expectedDeliveryDate: true, status: true, totalAmount: true, totalAmountCents: true, notes: true, supplier: { select: { id: true, name: true } }, items: { select: { id: true, productTitle: true, productSku: true, quantity: true, quantityReceived: true, unitCost: true, unitCostCents: true } } },
  });
  assertWithinOperatorBound(purchaseOrders, 'Purchase orders');
  return { currencyCode: store.currencyCode, purchaseOrders: purchaseOrders.map((order) => ({ ...order, orderDate: iso(order.orderDate), expectedDeliveryDate: iso(order.expectedDeliveryDate), isDueSoon: Boolean(order.expectedDeliveryDate && order.expectedDeliveryDate <= dueSoonBoundary), totalAmount: Number(order.totalAmountCents || Math.round(Number(order.totalAmount || 0) * 100)) / 100, totalAmountCents: order.totalAmountCents, items: order.items.map((item) => ({ ...item, unitCost: Number(item.unitCostCents || Math.round(Number(item.unitCost || 0) * 100)) / 100, unitCostCents: item.unitCostCents })) })) };
}

export async function groceryPlatformMerchandising(_root: unknown, _args: unknown, context: Context) {
  await requirePermission(context, 'canManageProducts', 'Merchandising projection requires product-management permission');
  const store = await requireSessionStore(context);
  const [departments, coupons] = await Promise.all([
    context.prisma.department.findMany({ where: { storeId: store.id }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1, select: { id: true, name: true, handle: true, sortOrder: true, isActive: true, temperatureZone: true, products: { select: { id: true } } } }),
    context.prisma.coupon.findMany({ where: { storeId: store.id }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1, select: { id: true, code: true, discountType: true, discountValue: true, discountValueCents: true, minPurchase: true, minPurchaseCents: true, maxUses: true, currentUses: true, productCategories: true, isActive: true, validFrom: true, validTo: true } }),
  ]);
  assertWithinOperatorBound(departments, 'Departments');
  assertWithinOperatorBound(coupons, 'Coupons');
  return { currencyCode: store.currencyCode, departments, coupons: coupons.map((coupon) => ({ ...coupon, discountValue: number(coupon.discountValue), minPurchase: number(coupon.minPurchase), validFrom: iso(coupon.validFrom), validTo: iso(coupon.validTo) })) };
}

export async function groceryPlatformCustomers(_root: unknown, _args: unknown, context: Context) {
  await requirePermission(context, 'canManageUsers', 'Customers projection requires user-management permission');
  const store = await requireSessionStore(context);
  const [users, totalCustomers, savedCarts, orderStats, shoppingListStats] = await Promise.all([
    context.prisma.user.findMany({ where: { storeId: store.id, roleId: null }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: OPERATOR_BOUND + 1, select: { id: true, name: true, email: true, onboardingStatus: true, createdAt: true } }),
    context.prisma.user.count({ where: { storeId: store.id, roleId: null } }),
    context.prisma.cart.count({ where: { storeId: store.id, itemCount: { gt: 0 } } }),
    context.prisma.order.groupBy({
      by: ['userId'],
      where: { storeId: store.id, userId: { not: null } },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    context.prisma.shoppingList.groupBy({
      by: ['userId'],
      where: { user: { storeId: store.id } },
      _count: { _all: true },
    }),
  ]);
  assertWithinOperatorBound(users, 'Customers');
  const latestDates = orderStats.flatMap((row) => row._max.createdAt ? [row._max.createdAt] : []);
  const latestOrders = latestDates.length ? await context.prisma.order.findMany({
    where: {
      storeId: store.id,
      userId: { in: orderStats.flatMap((row) => row.userId ? [row.userId] : []) },
      createdAt: { in: latestDates },
    },
    orderBy: [{ createdAt: 'desc' }, { displayId: 'desc' }],
    select: { userId: true, displayId: true, status: true, createdAt: true },
  }) : [];
  const orderCountByUser = new Map(orderStats.flatMap((row) => row.userId ? [[row.userId, Number((row._count as { _all?: number } | undefined)?._all || 0)] as const] : []));
  const shoppingListCountByUser = new Map(shoppingListStats.map((row) => [row.userId, Number((row._count as { _all?: number } | undefined)?._all || 0)] as const));
  const latestOrderByUser = new Map<string, (typeof latestOrders)[number]>();
  for (const order of latestOrders) {
    if (order.userId && !latestOrderByUser.has(order.userId)) latestOrderByUser.set(order.userId, order);
  }
  return {
    users: users.map((user) => {
      const lastOrder = latestOrderByUser.get(user.id);
      return {
        ...user,
        createdAt: iso(user.createdAt),
        orderCount: orderCountByUser.get(user.id) || 0,
        shoppingListCount: shoppingListCountByUser.get(user.id) || 0,
        lastOrder: lastOrder ? { displayId: lastOrder.displayId, status: lastOrder.status, createdAt: iso(lastOrder.createdAt) } : null,
      };
    }),
    totalCustomers,
    savedCarts,
  };
}

export async function groceryPlatformPayments(_root: unknown, _args: unknown, context: Context) {
  await requirePermission(context, 'canManagePayments', 'Payments projection requires payment-management permission');
  const store = await requireSessionStore(context);
  const supportedCodes = Object.keys(paymentProviderDefinitions);
  const [payments, providers, paymentCount, failedCount, processingCount, captured, refunded, recoveryCounts] = await Promise.all([
    context.prisma.payment.findMany({
      where: { storeId: store.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 100,
      select: {
        id: true, amountCents: true, status: true, paymentMethod: true, providerPaymentId: true,
        processedAt: true, createdAt: true, errorMessage: true,
        order: { select: { id: true, displayId: true, status: true } },
        paymentProvider: { select: { code: true } },
        refunds: {
          orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
          select: {
            id: true, amountCents: true, status: true, providerData: true, requestedAt: true,
            processedAt: true, failureMessage: true, reconciliationAttempts: true,
            reconciliationNextAttemptAt: true, reconciliationDeadLetterAt: true, reconciliationLastError: true,
          },
        },
      },
    }),
    context.prisma.paymentProvider.findMany({
      where: { code: { in: supportedCodes } },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, code: true, isInstalled: true },
    }),
    context.prisma.payment.count({ where: { storeId: store.id } }),
    context.prisma.payment.count({ where: { storeId: store.id, status: 'failed' } }),
    context.prisma.payment.count({ where: { storeId: store.id, status: 'processing' } }),
    context.prisma.payment.aggregate({
      where: { storeId: store.id, status: { in: ['succeeded', 'partially_refunded', 'refunded'] } },
      _sum: { amountCents: true },
    }),
    context.prisma.paymentRefund.aggregate({
      where: { payment: { storeId: store.id }, status: 'succeeded' },
      _sum: { amountCents: true },
    }),
    context.prisma.checkoutAttempt.groupBy({
      by: ['status'], where: { storeId: store.id }, _count: { _all: true },
    }),
  ]);
  assertWithinOperatorBound(payments, 'Recent payments');
  return {
    currencyCode: store.currencyCode,
    payments: payments.map((payment) => ({
      ...payment,
      createdAt: iso(payment.createdAt),
      processedAt: iso(payment.processedAt),
      providerCode: payment.paymentProvider?.code || '',
      refunds: payment.refunds.map(mapRefund),
    })),
    providers: providers.map((provider) => {
      const definition = paymentProviderDefinitions[provider.code as keyof typeof paymentProviderDefinitions];
      return {
        ...provider,
        publicCheckout: Boolean(definition?.publicCheckout),
        runtimeConfigured: Boolean(definition) && definition.credentialEnv.every((name) => Boolean(process.env[name])),
      };
    }),
    summary: {
      paymentCount,
      failedCount,
      processingCount,
      capturedCents: captured._sum.amountCents || 0,
      refundedCents: refunded._sum.amountCents || 0,
      netCents: (captured._sum.amountCents || 0) - (refunded._sum.amountCents || 0),
      recovery: Object.fromEntries(recoveryCounts.map((row) => [row.status, row._count._all])),
    },
  };
}

export async function groceryPlatformSettings(_root: unknown, _args: unknown, context: Context) {
  await requirePermission(context, 'canManageOnboarding', 'Settings projection requires onboarding-management permission');
  const store = await requireSessionStore(context);
  const [settings, counts] = await Promise.all([
    context.prisma.storeSettings.findUnique({
      where: { storeId: store.id },
      select: {
        id: true, name: true, tagline: true, homepageTitle: true, homepageDescription: true,
        contactEmail: true, contactPhone: true, address: true, logoUrl: true, brandHue: true, currencyCode: true,
        taxRateBps: true, locale: true, timezone: true, countryCode: true, hours: true, isActive: true,
      },
    }),
    Promise.all([
      context.prisma.product.count({ where: { storeId: store.id } }),
      context.prisma.supplier.count({ where: { storeId: store.id } }),
      context.prisma.deliverySlot.count({ where: { storeId: store.id } }),
      context.prisma.pickupSlot.count({ where: { storeId: store.id } }),
      context.prisma.parkingSpot.count({ where: { storeId: store.id } }),
    ]),
  ]);
  if (!settings) throw new Error('Store settings are not initialized');
  return {
    store: { id: store.id, name: store.name, timezone: store.timezone, currencyCode: store.currencyCode, isActive: store.isActive },
    settings,
    counts: { products: counts[0], suppliers: counts[1], deliverySlots: counts[2], pickupSlots: counts[3], parkingSpots: counts[4] },
  };
}
