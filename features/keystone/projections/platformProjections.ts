import type { Context } from '.keystone/types';

import { isPaymentProviderConfigured, isPublicPaymentProviderEnabled } from '../../integrations/payment';
import { requireFreshCapability, type Capability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { zonedDateKeyOffset, zonedStartOfDateKey, zonedStartOfDay } from '../lib/storeTime';

function requirePermission(context: Context, capability: Capability, message: string) {
  return requireFreshCapability(context, capability).catch(() => { throw new Error(message); });
}

async function hasFreshCapability(context: Context, capability: Capability) {
  try {
    await requireFreshCapability(context, capability);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === `Missing current capability: ${capability}`) return false;
    throw error;
  }
}

function iso(value: Date | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function number(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

export type ProjectionPageInput = { page?: number; pageSize?: number; search?: string; status?: string };
export function pageArgs(args: ProjectionPageInput | undefined) {
  const page = Number(args?.page ?? 1), pageSize = Number(args?.pageSize ?? 50);
  if (!Number.isInteger(page) || page < 1 || page > 1000000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('Choose a positive page and a page size between 1 and 100');
  }
  return { page, pageSize, skip: (page - 1) * pageSize, search: args?.search?.trim().slice(0, 100) || '', status: args?.status?.trim() || '' };
}
function collectionPage(paging: ReturnType<typeof pageArgs>, counts: Record<string, number>) {
  return { page: paging.page, pageSize: paging.pageSize, collections: Object.fromEntries(Object.entries(counts).map(([key, total]) => [key, { total, totalPages: Math.max(1, Math.ceil(total / paging.pageSize)) }])) };
}
function searchFields(search: string, fields: string[]) {
  return search ? { OR: fields.map(field => ({ [field]: { contains: search, mode: 'insensitive' } })) } : {};
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
    product: line.product || null,
    fulfillment: line.fulfillment || null,
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

export function mapPaymentProviderTruth(provider: any) {
  // Private configuration is consumed only to derive booleans. Never return
  // selectors, credentials, metadata, or idempotency evidence to the projection.
  return {
    id: provider.id,
    name: provider.name,
    code: provider.code,
    isInstalled: provider.isInstalled,
    publicCheckout: isPublicPaymentProviderEnabled(provider),
    runtimeConfigured: isPaymentProviderConfigured(provider),
  };
}

export async function groceryPlatformOrders(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageOrders', 'Orders projection requires order-management permission');
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const now = new Date();
  const today = zonedStartOfDay(now, store.timezone);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const commercialOrderWhere = { storeId: store.id };
  const orderWhere: any = { storeId: store.id, ...searchFields(pagination.search, ['email']), ...(pagination.status ? { status: pagination.status } : {}) };
  const [orders, totalOrders, statuses, todaySales, thirtyDaySales, thirtyDayRefunds] = await Promise.all([
    (context.prisma as any).order.findMany({
      where: orderWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: pagination.skip,
      take: pagination.pageSize,
      select: {
        id: true, displayId: true, email: true, status: true, deliveryDate: true,
        deliveryTimeWindow: true, metadata: true, createdAt: true, currencyCode: true,
        subtotalCents: true, taxCents: true, deliveryFeeCents: true, discountCents: true, totalCents: true,
        lineItems: { select: { product: {select:{id:true,pricingMethod:true,unitOfMeasure:true}}, fulfillment: true, id: true, title: true, sku: true, quantity: true, unitPrice: true, unitPriceCents: true, thumbnail: true, metadata: true } },
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
    context.prisma.order.count({ where: orderWhere }),
    Promise.all(['pending', 'picking', 'packed', 'out_for_delivery', 'delivered', 'delivery_failed', 'delivery_refused', 'returned'].map(async (status) => [
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
    orders: orders.map((order: any) => ({
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
    pagination: collectionPage(pagination, { orders: totalOrders }),
    totalPages: Math.max(1, Math.ceil(totalOrders / pagination.pageSize)),
  };
}

async function ordersByStatus(context: Context, storeId: string, status: string, orderBy: 'createdAt' | 'updatedAt', pagination: ReturnType<typeof pageArgs>) {
  return (context.prisma as any).order.findMany({
    where: { storeId, status: status as any, ...searchFields(pagination.search, ['email']) },
    orderBy: [{ [orderBy]: orderBy === 'createdAt' ? 'asc' : 'desc' }, { id: 'asc' }],
    take: pagination.pageSize, skip: pagination.skip,
    select: {
      id: true, displayId: true, email: true, status: true, deliveryDate: true, deliveryTimeWindow: true,
      createdAt: true, currencyCode: true, subtotalCents: true, taxCents: true, deliveryFeeCents: true,
      discountCents: true, totalCents: true, substitutionPreference: true, metadata: true,
      lineItems: { select: { product: {select:{id:true,pricingMethod:true,unitOfMeasure:true}}, fulfillment: true, id: true, quantity: true, title: true, sku: true, unitPrice: true, unitPriceCents: true, thumbnail: true, metadata: true } },
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

export async function groceryPlatformFulfillment(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageOrders', 'Fulfillment projection requires order-management permission');
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const [pending, picking, packed, counts] = await Promise.all([
    ordersByStatus(context, store.id, 'pending', 'createdAt', pagination),
    ordersByStatus(context, store.id, 'picking', 'createdAt', pagination),
    ordersByStatus(context, store.id, 'packed', 'updatedAt', pagination),
    Promise.all(['pending', 'picking', 'packed'].map(status => context.prisma.order.count({ where: { storeId: store.id, status: status as any, ...searchFields(pagination.search, ['email']) } }))),
  ]);
  const lineIds = [...pending, ...picking, ...packed].flatMap((order: any) => order.lineItems.map((line: any) => line.id));
  const substitutions = lineIds.length ? await context.prisma.orderItemSubstitution.findMany({
    where: { lineItemId: { in: lineIds }, lineItem: { order: { storeId: store.id } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], distinct: ['orderItem'], take: lineIds.length,
    select: { id: true, orderItem: true, originalProduct: true, substitutedProduct: true, reason: true, customerApproved: true, approvedAt: true },
  }) : [];
  const mapOrder = (order: any) => ({ ...order, deliveryDate: iso(order.deliveryDate), createdAt: iso(order.createdAt), lineItems: order.lineItems.map(mapLineItem), payments: order.payments.map(mapPayment) });
  return { pending: pending.map(mapOrder), picking: picking.map(mapOrder), packed: packed.map(mapOrder),
    orderItemSubstitutions: substitutions.map(item => ({ ...item, approvedAt: iso(item.approvedAt) })),
    pagination: collectionPage(pagination, { pending: counts[0], picking: counts[1], packed: counts[2] }),
  };
}

export async function groceryPlatformDelivery(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageDelivery', 'Delivery projection requires delivery-management permission');
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const slotWindowStart = zonedStartOfDateKey(zonedDateKeyOffset(new Date(), store.timezone, -1), store.timezone);
  const routeWhere: any = { storeId: store.id, ...(pagination.status ? { status: pagination.status } : {}) };
  const readyWhere: any = { storeId: store.id, status: 'packed', deliveryRouteId: null, metadata: { path: ['fulfillmentMethod'], equals: 'delivery' }, ...searchFields(pagination.search, ['email']) };
  const driverWhere: any = { storeId: store.id, role: { canManageDelivery: true }, ...searchFields(pagination.search, ['name', 'email']) };
  const slotWhere = { storeId: store.id, date: { gte: slotWindowStart } };
  const [routes, readyCandidates, drivers, slots] = await Promise.all([
    context.prisma.deliveryRoute.findMany({
      where: routeWhere, orderBy: [{ date: 'desc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip,
      select: {
        id: true, date: true, timeWindow: true, status: true, stops: true, startedAt: true, completedAt: true,
        driver: { select: { id: true, name: true, email: true } },
        orders: { select: { id: true, displayId: true, status: true, metadata: true } },
      },
    }),
    (context.prisma as any).order.findMany({
      where: readyWhere, orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip,
      select: {
        id: true, displayId: true, email: true, status: true, deliveryDate: true, deliveryTimeWindow: true,
        createdAt: true, currencyCode: true, subtotalCents: true, taxCents: true, deliveryFeeCents: true,
        discountCents: true, totalCents: true, substitutionPreference: true, metadata: true,
        lineItems: { select: { product: {select:{id:true,pricingMethod:true,unitOfMeasure:true}}, fulfillment: true, id: true, title: true, sku: true, quantity: true, unitPrice: true, unitPriceCents: true, thumbnail: true, metadata: true } },
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
      where: driverWhere, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip,
      select: { id: true, name: true, email: true },
    }),
    context.prisma.deliverySlot.findMany({
      where: slotWhere, orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip,
      select: { id: true, date: true, startTime: true, endTime: true, capacity: true, currentBookings: true, isActive: true, deliveryFee: true },
    }),
  ]);
  const counts = await Promise.all([context.prisma.deliveryRoute.count({ where: routeWhere }), context.prisma.order.count({ where: readyWhere }), context.prisma.user.count({ where: driverWhere }), context.prisma.deliverySlot.count({ where: slotWhere })]);
  const readyOrders = readyCandidates.filter((order: any) => (order.metadata as any)?.fulfillmentMethod === 'delivery');
  return {
    pagination: collectionPage(pagination, { deliveryRoutes: counts[0], readyOrders: counts[1], drivers: counts[2], deliverySlots: counts[3] }),
    deliveryRoutes: routes.map((route) => ({ ...route, date: iso(route.date), status: route.status || 'planning', startedAt: iso(route.startedAt), completedAt: iso(route.completedAt) })),
    readyOrders: readyOrders.map((order: any) => ({
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

export async function groceryPlatformPickup(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageDelivery', 'Pickup projection requires delivery-management permission');
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const slotWindowStart = zonedStartOfDateKey(zonedDateKeyOffset(new Date(), store.timezone, -1), store.timezone);
  const orderWhere: any = { storeId: store.id, status: 'packed', metadata: { path: ['fulfillmentMethod'], equals: 'pickup' }, ...searchFields(pagination.search, ['email']) };
  const slotWhere = { storeId: store.id, date: { gte: slotWindowStart } };
  const parkingWhere: any = { storeId: store.id, ...searchFields(pagination.search, ['spotNumber']) };
  const [slots, parkingSpots, orders] = await Promise.all([
    context.prisma.pickupSlot.findMany({ where: slotWhere, orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, date: true, startTime: true, endTime: true, maxOrders: true, currentOrders: true, isAvailable: true } }),
    context.prisma.parkingSpot.findMany({ where: parkingWhere, orderBy: [{ spotNumber: 'asc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, spotNumber: true, description: true, isAccessible: true, isAvailable: true } }),
    (context.prisma as any).order.findMany({ where: orderWhere, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, displayId: true, email: true, status: true, metadata: true } }),
  ]);
  const counts = await Promise.all([context.prisma.pickupSlot.count({ where: slotWhere }), context.prisma.parkingSpot.count({ where: parkingWhere }), context.prisma.order.count({ where: orderWhere })]);
  const pickupOrders = orders.filter((order: any) => (order.metadata as any)?.fulfillmentMethod === 'pickup');
  return {
    pagination: collectionPage(pagination, { pickupSlots: counts[0], parkingSpots: counts[1], pickupOrders: counts[2] }),
    pickupSlots: slots.map((slot) => ({ ...slot, date: iso(slot.date), currentOrders: slot.currentOrders || 0 })),
    parkingSpots,
    pickupOrders,
  };
}

export async function groceryPlatformInventory(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageInventory', 'Inventory projection requires inventory-management permission');
  const store = await requireSessionStore(context), pagination = pageArgs(args), now = new Date();
  const productWhere: any = { storeId: store.id, ...searchFields(pagination.search, ['title', 'sku']) };
  const lotWhere: any = { storeId: store.id, ...searchFields(pagination.search, ['lotNumber']), ...(pagination.status ? { safetyStatus: pagination.status } : {}) };
  const prisma = context.prisma as any;
  const [products, inventoryLots, productCount, lotCount] = await Promise.all([
    prisma.product.findMany({ where: productWhere, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, title: true, sku: true, stockQuantity: true, lowStockThreshold: true, department: true, supplier: { select: { id: true, name: true } }, _count: { select: { backInStockAlerts: { where: { isActive: true } } } } } }),
    prisma.inventoryLot.findMany({ where: lotWhere, orderBy: [{ expirationDate: 'asc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, lotNumber: true, expirationDate: true, quantity: true, quantityRemaining: true, safetyStatus: true, conditionStatus: true, location: true, productId: true, product: { select: { id: true, title: true } }, supplier: { select: { id: true, name: true } } } }),
    prisma.product.count({ where: productWhere }), prisma.inventoryLot.count({ where: lotWhere }),
  ]);
  // Aggregate every eligible lot for the displayed products, independent of the
  // lot page. A historical lot count cannot truncate the stock authority.
  const balances = products.length ? await prisma.inventoryLot.groupBy({ by: ['productId'],
    where: { storeId: store.id, productId: { in: products.map((product: any) => product.id) }, expirationDate: { gt: now }, quantityRemaining: { gt: 0 },
      safetyStatus: 'available', conditionStatus: 'accepted' },
    _sum: { quantityRemaining: true },
  }) : [];
  const sellableByProduct = new Map(balances.map((row: any) => [row.productId, Number(row._sum.quantityRemaining || 0)]));
  return {
    products: products.map(({ _count, stockQuantity, ...product }: any) => {
      const sellableQuantity = Number(sellableByProduct.get(product.id) || 0);
      return { ...product, stockQuantity: sellableQuantity, recordedStockQuantity: Number(stockQuantity || 0), inStock: sellableQuantity > 0, activeBackInStockAlerts: _count.backInStockAlerts };
    }),
    inventoryLots: inventoryLots.map(({ productId: _productId, ...lot }: any) => ({ ...lot, quantity: Number(lot.quantity), quantityRemaining: Number(lot.quantityRemaining),
      expirationDate: iso(lot.expirationDate), isExpired: lot.expirationDate.getTime() <= now.getTime(),
      isExpiringSoon: lot.expirationDate.getTime() > now.getTime() && lot.expirationDate.getTime() <= now.getTime() + 7 * 86_400_000 })),
    pagination: collectionPage(pagination, { products: productCount, inventoryLots: lotCount }),
  };
}

export async function groceryPlatformSuppliers(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageSuppliers', 'Suppliers projection requires supplier-management permission');
  const store = await requireSessionStore(context), pagination = pageArgs(args);
  const where: any = { storeId: store.id, ...searchFields(pagination.search, ['name', 'email']) };
  const [suppliers, total] = await Promise.all([
    context.prisma.supplier.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip,
      select: { id: true, name: true, contactName: true, email: true, phone: true, paymentTerms: true, deliveryDays: true, minimumOrder: true, minimumOrderCents: true,
        _count: { select: { products: true, purchaseOrders: true } } } }),
    context.prisma.supplier.count({ where }),
  ]);
  const openOrders = await context.prisma.purchaseOrder.groupBy({ by: ['supplierId'], where: { storeId: store.id, supplierId: { in: suppliers.map(supplier => supplier.id) }, status: { in: ['draft', 'sent', 'confirmed'] } }, _count: { _all: true } });
  const openCounts = new Map(openOrders.map(row => [row.supplierId, row._count._all]));
  return { currencyCode: store.currencyCode, suppliers: suppliers.map(({ _count, ...supplier }) => ({ ...supplier, products: [], purchaseOrders: [], openPurchaseOrderCount: openCounts.get(supplier.id) || 0, productCount: _count.products, purchaseOrderCount: _count.purchaseOrders })),
    pagination: collectionPage(pagination, { suppliers: total }) };
}

export async function groceryPurchasingOptions(_root: unknown, args: { kind: string; search: string }, context: Context) {
  await requirePermission(context, 'canManageInventory', 'Purchasing options require inventory-management permission');
  const store = await requireSessionStore(context);
  const search = args.search.trim().slice(0, 100);
  const prisma = context.prisma as any;

  if (args.kind === 'supplier') {
    const suppliers = await prisma.supplier.findMany({
      where: { storeId: store.id, ...searchFields(search, ['name']) },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 50,
      select: { id: true, name: true },
    });
    return suppliers.map((supplier: { id: string; name: string }) => ({ id: supplier.id, name: supplier.name, title: null }));
  }

  if (args.kind === 'product') {
    const products = await prisma.product.findMany({
      where: { storeId: store.id, ...searchFields(search, ['title', 'sku']) },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      take: 50,
      select: { id: true, title: true },
    });
    return products.map((product: { id: string; title: string }) => ({ id: product.id, name: null, title: product.title }));
  }

  throw new Error('Unsupported purchasing lookup');
}

export async function groceryPlatformPurchasing(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageInventory', 'Purchasing projection requires inventory-management permission');
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const dueSoonBoundary = new Date(Date.now() + 3 * 86_400_000);
  const where: any = { storeId: store.id, ...searchFields(pagination.search, ['poNumber']), ...(pagination.status ? { status: pagination.status } : {}) };
  const total = await context.prisma.purchaseOrder.count({ where });
  const purchaseOrders = await context.prisma.purchaseOrder.findMany({
    where, orderBy: [{ orderDate: 'desc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip,
    select: { id: true, poNumber: true, orderDate: true, expectedDeliveryDate: true, status: true, totalAmount: true, totalAmountCents: true, notes: true, supplier: { select: { id: true, name: true } }, items: { select: { id: true, productTitle: true, productSku: true, quantity: true, quantityReceived: true, unitCost: true, unitCostCents: true } } },
  });
  return { currencyCode: store.currencyCode, pagination: collectionPage(pagination, { purchaseOrders: total }), purchaseOrders: purchaseOrders.map((order) => ({ ...order, orderDate: iso(order.orderDate), expectedDeliveryDate: iso(order.expectedDeliveryDate), isDueSoon: Boolean(order.expectedDeliveryDate && order.expectedDeliveryDate <= dueSoonBoundary), totalAmount: Number(order.totalAmountCents || Math.round(Number(order.totalAmount || 0) * 100)) / 100, totalAmountCents: order.totalAmountCents, items: order.items.map((item) => ({ ...item, unitCost: Number(item.unitCostCents || Math.round(Number(item.unitCost || 0) * 100)) / 100, unitCostCents: item.unitCostCents })) })) };
}

export async function groceryPlatformMerchandising(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageProducts', 'Merchandising projection requires product-management permission');
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const departmentWhere: any = { storeId: store.id, ...searchFields(pagination.search, ['name', 'handle']) };
  const couponWhere: any = { storeId: store.id, ...searchFields(pagination.search, ['code']) };
  const [departments, coupons] = await Promise.all([
    context.prisma.department.findMany({ where: departmentWhere, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, name: true, handle: true, sortOrder: true, isActive: true, temperatureZone: true, _count: { select: { products: true } } } }),
    context.prisma.coupon.findMany({ where: couponWhere, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, code: true, discountType: true, discountValue: true, discountValueCents: true, minPurchase: true, minPurchaseCents: true, maxUses: true, currentUses: true, productCategories: true, isActive: true, validFrom: true, validTo: true } }),
  ]);
  const counts = await Promise.all([context.prisma.department.count({ where: departmentWhere }), context.prisma.coupon.count({ where: couponWhere })]);
  return { pagination: collectionPage(pagination, { departments: counts[0], coupons: counts[1] }), currencyCode: store.currencyCode, departments: departments.map(({ _count, ...department }) => ({ ...department, products: [], productCount: _count.products })), coupons: coupons.map((coupon) => ({ ...coupon, discountValue: number(coupon.discountValue), minPurchase: number(coupon.minPurchase), validFrom: iso(coupon.validFrom), validTo: iso(coupon.validTo) })) };
}

export async function groceryPlatformCustomers(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageUsers', 'Customers projection requires user-management permission');
  const store = await requireSessionStore(context), pagination = pageArgs(args);
  const where: any = { storeId: store.id, roleId: null, ...searchFields(pagination.search, ['name', 'email']) };
  const [users, totalCustomers, savedCarts] = await Promise.all([
    context.prisma.user.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, name: true, email: true, onboardingStatus: true, createdAt: true } }),
    context.prisma.user.count({ where }), context.prisma.cart.count({ where: { storeId: store.id, itemCount: { gt: 0 } } }),
  ]);
  const ids = users.map(user => user.id);
  const [orderStats, shoppingListStats, latestOrders] = await Promise.all([
    context.prisma.order.groupBy({ by: ['userId'], where: { storeId: store.id, userId: { in: ids } }, _count: { _all: true } }),
    context.prisma.shoppingList.groupBy({ by: ['userId'], where: { userId: { in: ids }, user: { storeId: store.id } }, _count: { _all: true } }),
    context.prisma.order.findMany({ where: { storeId: store.id, userId: { in: ids } }, distinct: ['userId'], take: pagination.pageSize,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { userId: true, displayId: true, status: true, createdAt: true } }),
  ]);
  const orderCounts = new Map(orderStats.map(row => [row.userId, row._count._all]));
  const listCounts = new Map(shoppingListStats.map(row => [row.userId, row._count._all]));
  const lastOrders = new Map(latestOrders.map(row => [row.userId, row]));
  return { users: users.map(user => {
    const last = lastOrders.get(user.id);
    return { ...user, createdAt: iso(user.createdAt), orderCount: orderCounts.get(user.id) || 0, shoppingListCount: listCounts.get(user.id) || 0,
      lastOrder: last ? { displayId: last.displayId, status: last.status, createdAt: iso(last.createdAt) } : null };
  }), totalCustomers, savedCarts, pagination: collectionPage(pagination, { users: totalCustomers }) };
}

export async function groceryPlatformPayments(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManagePayments', 'Payments projection requires payment-management permission');
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  // Payment facts are Store-scoped; deployment-wide provider configuration is
  // read only for operators holding both current payment and onboarding access.
  const canReadProviderConfiguration = await hasFreshCapability(context, 'canManageOnboarding');
  const paymentWhere: any = { storeId: store.id, ...searchFields(pagination.search, ['providerPaymentId']), ...(pagination.status ? { status: pagination.status } : {}) };
  const [payments, providers, paymentCount, failedCount, processingCount, captured, refunded, recoveryCounts] = await Promise.all([
    context.prisma.payment.findMany({
      where: paymentWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: pagination.pageSize, skip: pagination.skip,
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
    canReadProviderConfiguration
      ? context.prisma.paymentProvider.findMany({
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
          select: { id: true, name: true, code: true, isInstalled: true, publicCheckout: true,
            credentials: true, metadata: true, createPaymentFunction: true, capturePaymentFunction: true,
            refundPaymentFunction: true, getPaymentStatusFunction: true, getRefundStatusFunction: true,
            cancelPaymentFunction: true, generatePaymentLinkFunction: true, handleWebhookFunction: true },
        })
      : Promise.resolve([]),
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
  const filteredCount = await context.prisma.payment.count({ where: paymentWhere });
  return {
    pagination: collectionPage(pagination, { payments: filteredCount }),
    currencyCode: store.currencyCode,
    payments: payments.map((payment) => ({
      ...payment,
      createdAt: iso(payment.createdAt),
      processedAt: iso(payment.processedAt),
      providerCode: payment.paymentProvider?.code || '',
      refunds: payment.refunds.map(mapRefund),
    })),
    providers: providers.map(mapPaymentProviderTruth),
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

export async function groceryPlatformSettings(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageOnboarding', 'Settings projection requires onboarding-management permission');
  const store = await requireSessionStore(context);
  const [settings, counts] = await Promise.all([
    (context.prisma as any).storeSettings.findUnique({
      where: { storeId: store.id },
      select: {
        id: true, name: true, tagline: true, homepageTitle: true, homepageDescription: true,
        contactEmail: true, contactPhone: true, address: true, logoUrl: true, brandHue: true, currencyCode: true,
        deliveryPolicy: true, taxRateBps: true, locale: true, timezone: true, countryCode: true, hours: true, isActive: true,
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
