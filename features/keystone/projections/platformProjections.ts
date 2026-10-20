import type { Context } from '.keystone/types';
import { canAdministerPaymentProviders } from '../lib/providerAuthority';
import { sanitizeStoreLogoSvg } from '../utils/storeLogo';
import { normalizeStoreLogoColor } from '../../lib/store-logo';

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

export type ProjectionPageInput = { page?: number; pageSize?: number; search?: string; status?: string; view?: string; sort?: string };
const WEEKDAY_CODES: Record<string, string> = { monday: 'mon', tuesday: 'tue', wednesday: 'wed', thursday: 'thu', friday: 'fri', saturday: 'sat', sunday: 'sun', mon: 'mon', tue: 'tue', wed: 'wed', thu: 'thu', fri: 'fri', sat: 'sat', sun: 'sun' };
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

import { isPaymentProviderInstalled } from '../../integrations/payment/stripeEnabled';

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
    isInstalled: isPaymentProviderInstalled(provider),
    publicCheckout: isPublicPaymentProviderEnabled(provider),
    runtimeConfigured: isPaymentProviderConfigured(provider),
  };
}

/**
 * Order queue views. One definition drives both the rows and the tab counts:
 * active work, delivery exceptions (failed/refused/returned), payment attention,
 * each single status, and everything.
 */
const ORDER_ACTIVE_STATUSES = ['pending', 'picking', 'packed', 'out_for_delivery'];
const ORDER_EXCEPTION_STATUSES = ['delivery_failed', 'delivery_refused', 'returned'];
const ORDER_SINGLE_STATUSES = ['pending', 'picking', 'packed', 'out_for_delivery', 'delivered', 'cancelled', ...ORDER_EXCEPTION_STATUSES];
function orderViewWhere(view: string): Record<string, unknown> {
  if (view === 'active') return { status: { in: ORDER_ACTIVE_STATUSES } };
  if (view === 'exceptions') return { status: { in: ORDER_EXCEPTION_STATUSES } };
  if (view === 'attention') return { payments: { some: { OR: [{ status: 'failed' }, { refunds: { some: { reconciliationDeadLetterAt: { not: null } } } }] } } };
  if (ORDER_SINGLE_STATUSES.includes(view)) return { status: view };
  return {};
}
function orderSearchWhere(search: string): Record<string, unknown> {
  if (!search) return {};
  const number = /^#?(\d{1,9})$/.exec(search);
  return { OR: [
    ...(number ? [{ displayId: Number(number[1]) }] : []),
    { email: { contains: search, mode: 'insensitive' } },
    { id: { equals: search } },
    { lineItems: { some: { OR: [{ id: { equals: search } }, { title: { contains: search, mode: 'insensitive' } }, { sku: { contains: search, mode: 'insensitive' } }] } } },
  ] };
}
const ORDER_SORTS: Record<string, any[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'asc' }],
  oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
  value: [{ totalCents: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
  status: [{ status: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
};

export async function groceryPlatformOrders(_root: unknown, args: ProjectionPageInput & { view?: string; sort?: string; orderId?: string }, context: Context) {
  await requirePermission(context, 'canManageOrders', 'Orders projection requires order-management permission');
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const now = new Date();
  const today = zonedStartOfDay(now, store.timezone);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const commercialOrderWhere = { storeId: store.id };
  const view = args.view || (pagination.status || 'all');
  // An exact order link (e.g. from a message or recall) finds the order in any status.
  const orderWhere: any = args.orderId
    ? { storeId: store.id, id: args.orderId }
    : { storeId: store.id, AND: [orderViewWhere(view), orderSearchWhere(pagination.search)] };
  const viewCount = (name: string) => context.prisma.order.count({ where: { storeId: store.id, AND: [orderViewWhere(name), orderSearchWhere(pagination.search)] } as any });
  const viewNames = ['active', 'exceptions', 'attention', 'all', ...ORDER_SINGLE_STATUSES];
  const [orders, totalOrders, statuses, todaySales, thirtyDaySales, thirtyDayRefunds, viewCountRows] = await Promise.all([
    (context.prisma as any).order.findMany({
      where: orderWhere,
      orderBy: ORDER_SORTS[args.sort || 'newest'] || ORDER_SORTS.newest,
      skip: pagination.skip,
      take: pagination.pageSize,
      select: {
        id: true, displayId: true, email: true, status: true, deliveryDate: true, substitutionPreference: true,
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
    Promise.all(viewNames.map(async (name) => [name, await viewCount(name)] as const)),
  ]);
  const counts = Object.fromEntries(statuses);
  const viewCounts = Object.fromEntries(viewCountRows);
  return {
    currencyCode: store.currencyCode,
    timezone: store.timezone,
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
    view,
    viewCounts,
    actorCanRefund: await hasFreshCapability(context, 'canManagePayments'),
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

async function ordersByStatus(context: Context, where: any, orderBy: any[], pagination: ReturnType<typeof pageArgs>) {
  return (context.prisma as any).order.findMany({
    where,
    orderBy,
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
  // Search, view and sort run here, before each lane is paged: order number,
  // customer email, product title or SKU; pickup, delivery or substitution work.
  const orderNumber = /^#?(\d{1,9})$/.exec(pagination.search);
  const search: any = pagination.search ? { OR: [
    { email: { contains: pagination.search, mode: 'insensitive' } },
    ...(orderNumber ? [{ displayId: Number(orderNumber[1]) }] : []),
    { lineItems: { some: { OR: [{ title: { contains: pagination.search, mode: 'insensitive' } }, { sku: { contains: pagination.search, mode: 'insensitive' } }] } } },
  ] } : {};
  const views: Record<string, any> = {
    pickup: { metadata: { path: ['fulfillmentMethod'], equals: 'pickup' } },
    delivery: { metadata: { path: ['fulfillmentMethod'], equals: 'delivery' } },
    substitutions: { lineItems: { some: { substitutions: { some: {} } } } },
  };
  const view = views[args.view || ''] ? args.view! : 'all';
  const laneWhere = (status: string): any => ({ storeId: store.id, status, AND: [search, views[view] || {}] });
  const orderBy: any[] = args.sort === 'newest' ? [{ createdAt: 'desc' }, { id: 'asc' }] : args.sort === 'items' ? [{ lineItems: { _count: 'desc' } }, { createdAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'asc' }, { id: 'asc' }];
  const [pending, picking, packed, counts, reviewCount, pickupNotReady] = await Promise.all([
    ordersByStatus(context, laneWhere('pending'), orderBy, pagination),
    ordersByStatus(context, laneWhere('picking'), orderBy, pagination),
    ordersByStatus(context, laneWhere('packed'), orderBy, pagination),
    Promise.all(['pending', 'picking', 'packed'].map(status => context.prisma.order.count({ where: laneWhere(status) }))),
    // Store-wide work, independent of search and paging.
    context.prisma.orderItemSubstitution.count({ where: { customerApproved: false, lineItem: { order: { storeId: store.id, status: { in: ['pending', 'picking', 'packed'] } } } } }),
    context.prisma.order.count({ where: { storeId: store.id, status: 'packed', metadata: { path: ['fulfillmentMethod'], equals: 'pickup' }, NOT: { metadata: { path: ['readyForPickup'], equals: true } } } }),
  ]);
  const lineIds = [...pending, ...picking, ...packed].flatMap((order: any) => order.lineItems.map((line: any) => line.id));
  const substitutions = lineIds.length ? await context.prisma.orderItemSubstitution.findMany({
    where: { lineItemId: { in: lineIds }, lineItem: { order: { storeId: store.id } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], distinct: ['orderItem'], take: lineIds.length,
    select: { id: true, orderItem: true, originalProduct: true, substitutedProduct: true, reason: true, customerApproved: true, approvedAt: true },
  }) : [];
  const mapOrder = (order: any) => ({ ...order, deliveryDate: iso(order.deliveryDate), createdAt: iso(order.createdAt), lineItems: order.lineItems.map(mapLineItem), payments: order.payments.map(mapPayment) });
  return { timezone: store.timezone, view, pending: pending.map(mapOrder), picking: picking.map(mapOrder), packed: packed.map(mapOrder),
    orderItemSubstitutions: substitutions.map(item => ({ ...item, approvedAt: iso(item.approvedAt) })),
    summary: { pending: counts[0], picking: counts[1], packed: counts[2], substitutionsToReview: reviewCount, pickupNotReady },
    pagination: collectionPage(pagination, { pending: counts[0], picking: counts[1], packed: counts[2] }),
  };
}

type DeliveryProjectionInput = ProjectionPageInput & { routeView?: string; routePage?: number; readyPage?: number; slotPage?: number; slotView?: string; slotSort?: string };

/**
 * Delivery work: routes, packed orders awaiting a route and upcoming slots each
 * page, search and count independently, so one queue's page never hides
 * another's work. Drivers are a separate option list, independent of any page.
 */
export async function groceryPlatformDelivery(_root: unknown, args: DeliveryProjectionInput, context: Context) {
  await requirePermission(context, 'canManageDelivery', 'Delivery projection requires delivery-management permission');
  const store = await requireSessionStore(context);
  const base = pageArgs(args);
  const routePaging = pageArgs({ ...args, page: args.routePage ?? args.page ?? 1 });
  const readyPaging = pageArgs({ ...args, page: args.readyPage ?? 1 });
  const slotPaging = pageArgs({ ...args, page: args.slotPage ?? 1 });
  const search = base.search;
  const orderNumber = /^#?(\d{1,9})$/.exec(search);
  const slotWindowStart = zonedStartOfDateKey(zonedDateKeyOffset(new Date(), store.timezone, -1), store.timezone);

  const routeSearch: any = search ? { OR: [
    { driver: { OR: [{ name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } },
    ...(orderNumber ? [{ orders: { some: { displayId: Number(orderNumber[1]) } } }] : []),
  ] } : {};
  const routeViews: Record<string, any> = {
    open: { OR: [{ status: { in: ['planning', 'in_progress'] } }, { status: null }] },
    planning: { OR: [{ status: 'planning' }, { status: null }] },
    in_progress: { status: 'in_progress' },
    completed: { status: 'completed' },
  };
  const routeView = args.routeView && (routeViews[args.routeView] || args.routeView === 'all') ? args.routeView : 'open';
  const routeScope = (view: string): any => ({ storeId: store.id, AND: [routeSearch, routeViews[view] || {}] });
  const routeWhere = routeScope(routeView);

  const readyBase: any = { storeId: store.id, status: 'packed', deliveryRouteId: null, metadata: { path: ['fulfillmentMethod'], equals: 'delivery' } };
  const readyWhere: any = { ...readyBase, AND: [search ? { OR: [{ email: { contains: search, mode: 'insensitive' } }, ...(orderNumber ? [{ displayId: Number(orderNumber[1]) }] : [])] } : {}] };
  const driverWhere: any = { storeId: store.id, role: { canManageDelivery: true } };

  // Slot filters and sorts compare booked against capacity, so they run in SQL.
  const slotView = ['open', 'closed', 'pressure'].includes(args.slotView || '') ? args.slotView! : 'all';
  const slotSort = ['pressure', 'capacity'].includes(args.slotSort || '') ? args.slotSort! : 'date';
  const slotParams: unknown[] = [store.id, slotWindowStart];
  const slotConditions = ['"store" = $1', '"date" >= $2'];
  if (slotView === 'open') slotConditions.push('"isActive" = true');
  if (slotView === 'closed') slotConditions.push('"isActive" = false');
  if (slotView === 'pressure') slotConditions.push('"capacity" > 0 AND COALESCE("currentBookings", 0) * 5 >= "capacity" * 4');
  if (search) { slotParams.push(`%${search.replace(/[%_\\]/g, (char) => `\\${char}`)}%`); slotConditions.push(`("startTime" ILIKE $${slotParams.length} OR "endTime" ILIKE $${slotParams.length} OR to_char("date", 'YYYY-MM-DD') ILIKE $${slotParams.length})`); }
  const slotOrder = slotSort === 'pressure' ? '(COALESCE("currentBookings", 0)::float / NULLIF("capacity", 0)) DESC NULLS LAST, "date" ASC, "startTime" ASC, "id" ASC'
    : slotSort === 'capacity' ? '("capacity" - COALESCE("currentBookings", 0)) ASC, "date" ASC, "startTime" ASC, "id" ASC'
    : '"date" ASC, "startTime" ASC, "id" ASC';
  const slotWhereSql = slotConditions.join(' AND ');

  const prisma = context.prisma as any;
  const [routes, readyOrders, drivers, slotIdRows, slotCountRows, routeCountRows, readyCount, driverCount, capacityRows] = await Promise.all([
    context.prisma.deliveryRoute.findMany({
      where: routeWhere, orderBy: [{ date: 'desc' }, { id: 'asc' }], take: routePaging.pageSize, skip: routePaging.skip,
      select: {
        id: true, date: true, timeWindow: true, status: true, stops: true, startedAt: true, completedAt: true,
        driver: { select: { id: true, name: true, email: true } },
        orders: { select: { id: true, displayId: true, status: true, metadata: true } },
      },
    }),
    prisma.order.findMany({
      where: readyWhere, orderBy: [{ deliveryDate: 'asc' }, { deliveryTimeWindow: 'asc' }, { id: 'asc' }], take: readyPaging.pageSize, skip: readyPaging.skip,
      select: { id: true, displayId: true, email: true, status: true, deliveryDate: true, deliveryTimeWindow: true, metadata: true, lineItems: { select: { id: true, quantity: true } } },
    }),
    context.prisma.user.findMany({ where: driverWhere, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: 200, select: { id: true, name: true, email: true } }),
    context.prisma.$queryRawUnsafe<Array<{ id: string }>>(`SELECT "id" FROM "DeliverySlot" WHERE ${slotWhereSql} ORDER BY ${slotOrder} LIMIT ${slotPaging.pageSize} OFFSET ${slotPaging.skip}`, ...slotParams),
    context.prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*) AS count FROM "DeliverySlot" WHERE ${slotWhereSql}`, ...slotParams),
    Promise.all(['open', 'planning', 'in_progress', 'completed', 'all'].map(async (view) => [view, await context.prisma.deliveryRoute.count({ where: routeScope(view) })] as const)),
    prisma.order.count({ where: readyWhere }),
    context.prisma.user.count({ where: driverWhere }),
    context.prisma.$queryRawUnsafe<Array<{ open_capacity: bigint | null; high_pressure: bigint }>>(
      `SELECT COALESCE(SUM(GREATEST("capacity" - COALESCE("currentBookings", 0), 0)) FILTER (WHERE "isActive"), 0) AS open_capacity,
              COUNT(*) FILTER (WHERE "capacity" > 0 AND COALESCE("currentBookings", 0) * 5 >= "capacity" * 4) AS high_pressure
         FROM "DeliverySlot" WHERE "store" = $1 AND "date" >= $2`, store.id, slotWindowStart),
  ]);
  const slotIds = slotIdRows.map((row) => row.id);
  const slotRecords = slotIds.length ? await context.prisma.deliverySlot.findMany({ where: { id: { in: slotIds } }, select: { id: true, date: true, startTime: true, endTime: true, capacity: true, currentBookings: true, isActive: true, deliveryFee: true } }) : [];
  const slotsById = new Map(slotRecords.map((slot) => [slot.id, slot]));
  const slots = slotIds.flatMap((id) => slotsById.get(id) ? [slotsById.get(id)!] : []);
  const routeCounts = Object.fromEntries(routeCountRows);
  const slotTotal = Number(slotCountRows[0]?.count || 0);
  const [readyStoreWide, openRoutes, inProgress] = await Promise.all([
    prisma.order.count({ where: readyBase }),
    context.prisma.deliveryRoute.count({ where: { storeId: store.id, ...routeViews.open } }),
    context.prisma.deliveryRoute.count({ where: { storeId: store.id, status: 'in_progress' } }),
  ]);
  const paged = (paging: ReturnType<typeof pageArgs>, name: string, total: number) => collectionPage(paging, { [name]: total });
  return {
    timezone: store.timezone,
    routeView,
    routeViewCounts: routeCounts,
    slotView,
    slotSort,
    pagination: paged(routePaging, 'deliveryRoutes', routeCounts[routeView] ?? 0),
    readyPagination: paged(readyPaging, 'readyOrders', readyCount),
    slotPagination: paged(slotPaging, 'deliverySlots', slotTotal),
    summary: {
      readyToRoute: readyStoreWide, openRoutes, inProgress, drivers: driverCount,
      openCapacity: Number(capacityRows[0]?.open_capacity || 0), highPressureSlots: Number(capacityRows[0]?.high_pressure || 0),
    },
    deliveryRoutes: routes.map((route) => ({ ...route, date: iso(route.date), status: route.status || 'planning', startedAt: iso(route.startedAt), completedAt: iso(route.completedAt) })),
    readyOrders: readyOrders.map((order: any) => ({ ...order, deliveryDate: iso(order.deliveryDate) })),
    drivers,
    driversTruncated: driverCount > drivers.length,
    deliverySlots: slots.map((slot) => ({ ...slot, date: iso(slot.date), currentBookings: slot.currentBookings || 0, deliveryFee: slot.deliveryFee || 0 })),
  };
}

type PickupProjectionInput = ProjectionPageInput & { arrivalPage?: number; stagedPage?: number; slotPage?: number; slotView?: string; slotSort?: string };

function likePattern(search: string) {
  return `%${search.replace(/[%_\\]/g, (char) => `\\${char}`)}%`;
}

/**
 * Curbside work: arrived customers (longest wait first), staged orders and
 * upcoming slots each page, search and count on their own, so a waiting
 * customer is never hidden behind staged orders on another page.
 */
export async function groceryPlatformPickup(_root: unknown, args: PickupProjectionInput, context: Context) {
  await requirePermission(context, 'canManageDelivery', 'Pickup projection requires delivery-management permission');
  const store = await requireSessionStore(context);
  const base = pageArgs(args);
  const arrivalPaging = pageArgs({ ...args, page: args.arrivalPage ?? 1 });
  const stagedPaging = pageArgs({ ...args, page: args.stagedPage ?? 1 });
  const slotPaging = pageArgs({ ...args, page: args.slotPage ?? 1 });
  const search = base.search;
  const orderNumber = /^#?(\d{1,9})$/.exec(search);
  const slotWindowStart = zonedStartOfDateKey(zonedDateKeyOffset(new Date(), store.timezone, -1), store.timezone);

  // Queue predicates on the order's pickup state, in SQL so arrivals can be ordered by check-in time.
  const queueParams: unknown[] = [store.id];
  const pickupBase = `"store" = $1 AND "status" = 'packed' AND "metadata"->>'fulfillmentMethod' = 'pickup'`;
  let searchSql = '';
  if (search) {
    queueParams.push(likePattern(search));
    const like = `$${queueParams.length}`;
    searchSql = ` AND ("email" ILIKE ${like} OR "metadata"->>'parkingSpotNumber' ILIKE ${like} OR "metadata"->>'vehicleDescription' ILIKE ${like}${orderNumber ? ` OR "displayId" = ${Number(orderNumber[1])}` : ''})`;
  }
  const arrivedSql = `${pickupBase} AND "metadata"->'customerArrived' = 'true'::jsonb`;
  const stagedSql = `${pickupBase} AND "metadata"->'readyForPickup' = 'true'::jsonb AND "metadata"->'customerArrived' IS DISTINCT FROM 'true'::jsonb`;

  const slotView = ['open', 'closed', 'pressure'].includes(args.slotView || '') ? args.slotView! : 'all';
  const slotSort = ['pressure', 'capacity'].includes(args.slotSort || '') ? args.slotSort! : 'date';
  const slotParams: unknown[] = [store.id, slotWindowStart];
  const slotConditions = ['"store" = $1', '"date" >= $2'];
  if (slotView === 'open') slotConditions.push('"isAvailable" = true');
  if (slotView === 'closed') slotConditions.push('"isAvailable" = false');
  if (slotView === 'pressure') slotConditions.push('"maxOrders" > 0 AND COALESCE("currentOrders", 0) * 5 >= "maxOrders" * 4');
  if (search) { slotParams.push(likePattern(search)); slotConditions.push(`("startTime" ILIKE $${slotParams.length} OR "endTime" ILIKE $${slotParams.length} OR to_char("date", 'YYYY-MM-DD') ILIKE $${slotParams.length})`); }
  const slotOrder = slotSort === 'pressure' ? '(COALESCE("currentOrders", 0)::float / NULLIF("maxOrders", 0)) DESC NULLS LAST, "date" ASC, "startTime" ASC, "id" ASC'
    : slotSort === 'capacity' ? '("maxOrders" - COALESCE("currentOrders", 0)) ASC, "date" ASC, "startTime" ASC, "id" ASC'
    : '"date" ASC, "startTime" ASC, "id" ASC';
  const slotWhereSql = slotConditions.join(' AND ');

  const raw = <T,>(sql: string, params: unknown[]) => context.prisma.$queryRawUnsafe<T[]>(sql, ...params);
  const [arrivalIds, stagedIds, arrivalCount, stagedCount, slotIdRows, slotCountRows, parkingSpots, occupiedRows, summaryRows] = await Promise.all([
    raw<{ id: string }>(`SELECT "id" FROM "Order" WHERE ${arrivedSql}${searchSql} ORDER BY "metadata"->>'checkInTime' ASC NULLS LAST, "id" ASC LIMIT ${arrivalPaging.pageSize} OFFSET ${arrivalPaging.skip}`, queueParams),
    raw<{ id: string }>(`SELECT "id" FROM "Order" WHERE ${stagedSql}${searchSql} ORDER BY "metadata"->>'pickupReadyAt' ASC NULLS LAST, "id" ASC LIMIT ${stagedPaging.pageSize} OFFSET ${stagedPaging.skip}`, queueParams),
    raw<{ count: bigint }>(`SELECT COUNT(*) AS count FROM "Order" WHERE ${arrivedSql}${searchSql}`, queueParams),
    raw<{ count: bigint }>(`SELECT COUNT(*) AS count FROM "Order" WHERE ${stagedSql}${searchSql}`, queueParams),
    raw<{ id: string }>(`SELECT "id" FROM "PickupSlot" WHERE ${slotWhereSql} ORDER BY ${slotOrder} LIMIT ${slotPaging.pageSize} OFFSET ${slotPaging.skip}`, slotParams),
    raw<{ count: bigint }>(`SELECT COUNT(*) AS count FROM "PickupSlot" WHERE ${slotWhereSql}`, slotParams),
    context.prisma.parkingSpot.findMany({ where: { storeId: store.id }, orderBy: [{ spotNumber: 'asc' }, { id: 'asc' }], take: 200, select: { id: true, spotNumber: true, description: true, isAccessible: true, isAvailable: true } }),
    // A bay is occupied while any arrived, unfinished pickup order holds it — across every page.
    raw<{ spot: string }>(`SELECT DISTINCT "metadata"->>'parkingSpotId' AS spot FROM "Order" WHERE ${arrivedSql} AND "metadata"->>'parkingSpotId' IS NOT NULL`, [store.id]),
    raw<{ waiting: bigint; staged: bigint; open_capacity: bigint | null; high_pressure: bigint }>(
      `SELECT (SELECT COUNT(*) FROM "Order" WHERE ${arrivedSql}) AS waiting,
              (SELECT COUNT(*) FROM "Order" WHERE ${stagedSql}) AS staged,
              (SELECT COALESCE(SUM(GREATEST("maxOrders" - COALESCE("currentOrders", 0), 0)) FILTER (WHERE "isAvailable"), 0) FROM "PickupSlot" WHERE "store" = $1 AND "date" >= $2) AS open_capacity,
              (SELECT COUNT(*) FROM "PickupSlot" WHERE "store" = $1 AND "date" >= $2 AND "maxOrders" > 0 AND COALESCE("currentOrders", 0) * 5 >= "maxOrders" * 4) AS high_pressure`, [store.id, slotWindowStart]),
  ]);
  const orderSelect = { id: true, displayId: true, email: true, status: true, metadata: true };
  const byIds = async (rows: Array<{ id: string }>) => {
    if (!rows.length) return [];
    const found = await context.prisma.order.findMany({ where: { id: { in: rows.map((row) => row.id) }, storeId: store.id }, select: orderSelect });
    const map = new Map(found.map((order) => [order.id, order]));
    return rows.flatMap((row) => map.get(row.id) ? [map.get(row.id)!] : []);
  };
  const [arrivals, staged, slotRecords] = await Promise.all([
    byIds(arrivalIds), byIds(stagedIds),
    slotIdRows.length ? context.prisma.pickupSlot.findMany({ where: { id: { in: slotIdRows.map((row) => row.id) } }, select: { id: true, date: true, startTime: true, endTime: true, maxOrders: true, currentOrders: true, isAvailable: true } }) : Promise.resolve([]),
  ]);
  const slotsById = new Map(slotRecords.map((slot) => [slot.id, slot]));
  const slots = slotIdRows.flatMap((row) => slotsById.get(row.id) ? [slotsById.get(row.id)!] : []);
  const occupiedSpotIds = occupiedRows.map((row) => row.spot).filter(Boolean);
  const summary = summaryRows[0];
  return {
    slotView, slotSort,
    pagination: collectionPage(arrivalPaging, { arrivals: Number(arrivalCount[0]?.count || 0) }),
    stagedPagination: collectionPage(stagedPaging, { staged: Number(stagedCount[0]?.count || 0) }),
    slotPagination: collectionPage(slotPaging, { pickupSlots: Number(slotCountRows[0]?.count || 0) }),
    summary: {
      waiting: Number(summary?.waiting || 0), staged: Number(summary?.staged || 0),
      openCapacity: Number(summary?.open_capacity || 0), highPressureSlots: Number(summary?.high_pressure || 0),
      parkingSpots: parkingSpots.length, parkingInUse: parkingSpots.filter((spot) => !spot.isAvailable).length,
    },
    pickupSlots: slots.map((slot) => ({ ...slot, date: iso(slot.date), currentOrders: slot.currentOrders || 0 })),
    parkingSpots,
    occupiedSpotIds,
    arrivals,
    stagedOrders: staged,
  };
}

export async function groceryPlatformInventory(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageInventory', 'Inventory projection requires inventory-management permission');
  const store = await requireSessionStore(context), pagination = pageArgs(args), now = new Date();
  const productWhere: any = { storeId: store.id, ...searchFields(pagination.search, ['title', 'sku']) };
  // Lot search covers what the screen offers: lot number, location, product and supplier.
  const soon = new Date(now.getTime() + 7 * 86_400_000);
  const lotViews: Record<string, any> = {
    attention: { OR: [{ expirationDate: { lte: soon } }, { quantityRemaining: 0 }] },
    expired: { expirationDate: { lte: now } },
    expiring: { expirationDate: { gt: now, lte: soon } },
    empty: { quantityRemaining: 0 },
  };
  const lotSearch = pagination.search ? { OR: [
    { lotNumber: { contains: pagination.search, mode: 'insensitive' } }, { location: { contains: pagination.search, mode: 'insensitive' } },
    { product: { OR: [{ title: { contains: pagination.search, mode: 'insensitive' } }, { sku: { contains: pagination.search, mode: 'insensitive' } }] } },
    { supplier: { name: { contains: pagination.search, mode: 'insensitive' } } },
  ] } : {};
  const lotScope = (view: string) => ({ storeId: store.id, AND: [lotSearch, lotViews[view] || {}, pagination.status ? { safetyStatus: pagination.status } : {}] });
  const lotWhere: any = lotScope(args.view || '');
  const lotOrder: any[] = args.sort === 'product' ? [{ product: { title: 'asc' } }, { id: 'asc' }] : args.sort === 'quantity' ? [{ quantityRemaining: 'asc' }, { id: 'asc' }] : [{ expirationDate: 'asc' }, { id: 'asc' }];
  const prisma = context.prisma as any;
  const countedViews = ['attention', 'expiring', 'expired', 'empty', 'all'];
  const [products, inventoryLots, productCount, lotCount, viewCountRows] = await Promise.all([
    prisma.product.findMany({ where: productWhere, orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], take: pagination.pageSize, skip: pagination.skip, select: { id: true, title: true, sku: true, stockQuantity: true, lowStockThreshold: true, department: true, unitOfMeasure: true, supplier: { select: { id: true, name: true } }, _count: { select: { backInStockAlerts: { where: { isActive: true } } } } } }),
    prisma.inventoryLot.findMany({ where: lotWhere, orderBy: lotOrder, take: pagination.pageSize, skip: pagination.skip, select: { id: true, lotNumber: true, expirationDate: true, quantity: true, quantityRemaining: true, safetyStatus: true, conditionStatus: true, location: true, productId: true, product: { select: { id: true, title: true, unitOfMeasure: true } }, supplier: { select: { id: true, name: true } } } }),
    prisma.product.count({ where: productWhere }), prisma.inventoryLot.count({ where: lotWhere }),
    // Tab counts use the same search and view predicates as the lot list.
    Promise.all(countedViews.map(async (view) => [view, await prisma.inventoryLot.count({ where: lotScope(view) })] as const)),
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
    lotViewCounts: Object.fromEntries(viewCountRows),
    pagination: collectionPage(pagination, { products: productCount, inventoryLots: lotCount }),
  };
}

export async function groceryPlatformSuppliers(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageSuppliers', 'Suppliers projection requires supplier-management permission');
  const store = await requireSessionStore(context), pagination = pageArgs(args);
  // Search covers every advertised field; weekday names match the stored day codes.
  const weekday = WEEKDAY_CODES[pagination.search.toLowerCase()];
  const supplierSearch = pagination.search ? { OR: [
    ...['name', 'contactName', 'email', 'phone'].map((field) => ({ [field]: { contains: pagination.search, mode: 'insensitive' } })),
    ...(weekday ? [{ deliveryDays: { array_contains: [weekday] } }] : []),
  ] } : {};
  const supplierViews: Record<string, any> = {
    open_po: { purchaseOrders: { some: { status: { in: ['draft', 'sent', 'confirmed'] } } } },
    no_products: { products: { none: {} } },
    cod: { paymentTerms: 'cod' }, net_30: { paymentTerms: 'net_30' }, net_60: { paymentTerms: 'net_60' },
  };
  const scoped = (view: string): any => ({ storeId: store.id, AND: [supplierSearch, supplierViews[view] || {}] });
  const where: any = scoped(args.view || '');
  const supplierOrder: any[] = args.sort === 'minimum' ? [{ minimumOrderCents: 'desc' }, { id: 'asc' }] : args.sort === 'products' ? [{ products: { _count: 'desc' } }, { id: 'asc' }] : [{ name: 'asc' }, { id: 'asc' }];
  const countedViews = ['all', 'open_po', 'no_products', 'cod', 'net_30', 'net_60'];
  const [suppliers, total, viewCountRows, openPurchaseOrders] = await Promise.all([
    context.prisma.supplier.findMany({ where, orderBy: supplierOrder, take: pagination.pageSize, skip: pagination.skip,
      select: { id: true, name: true, contactName: true, email: true, phone: true, paymentTerms: true, deliveryDays: true, minimumOrder: true, minimumOrderCents: true,
        _count: { select: { products: true, purchaseOrders: true } } } }),
    context.prisma.supplier.count({ where }),
    // Tab counts share the list's search and view predicates.
    Promise.all(countedViews.map(async (view) => [view, await context.prisma.supplier.count({ where: scoped(view) })] as const)),
    context.prisma.purchaseOrder.count({ where: { storeId: store.id, status: { in: ['draft', 'sent', 'confirmed'] } } }),
  ]);
  const openOrders = await context.prisma.purchaseOrder.groupBy({ by: ['supplierId'], where: { storeId: store.id, supplierId: { in: suppliers.map(supplier => supplier.id) }, status: { in: ['draft', 'sent', 'confirmed'] } }, _count: { _all: true } });
  const openCounts = new Map(openOrders.map(row => [row.supplierId, row._count._all]));
  return { currencyCode: store.currencyCode, suppliers: suppliers.map(({ _count, ...supplier }) => ({ ...supplier, products: [], purchaseOrders: [], openPurchaseOrderCount: openCounts.get(supplier.id) || 0, productCount: _count.products, purchaseOrderCount: _count.purchaseOrders })),
    viewCounts: Object.fromEntries(viewCountRows), openPurchaseOrders, pagination: collectionPage(pagination, { suppliers: total }) };
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
  // PO number, supplier and item title/SKU are all searched; a supplier link uses its exact id.
  const purchaseSearch: any = pagination.search ? { OR: [
    { poNumber: { contains: pagination.search, mode: 'insensitive' } }, { supplierName: { contains: pagination.search, mode: 'insensitive' } },
    { supplier: { name: { contains: pagination.search, mode: 'insensitive' } } },
    { items: { some: { OR: [{ productTitle: { contains: pagination.search, mode: 'insensitive' } }, { productSku: { contains: pagination.search, mode: 'insensitive' } }] } } },
  ] } : {};
  const view = args.view || pagination.status || 'open';
  const purchaseView = view === 'all' ? {} : view === 'open' ? { status: { notIn: ['received', 'cancelled'] } } : { status: view };
  const supplierFilter = (args as any).supplierId ? { supplierId: String((args as any).supplierId) } : {};
  const where: any = { storeId: store.id, AND: [purchaseSearch, purchaseView, supplierFilter] };
  const purchaseOrder: any[] = args.sort === 'oldest' ? [{ orderDate: 'asc' }, { id: 'asc' }] : args.sort === 'eta' ? [{ expectedDeliveryDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }] : args.sort === 'value' ? [{ totalAmountCents: 'desc' }, { id: 'asc' }] : [{ orderDate: 'desc' }, { id: 'asc' }];
  const total = await context.prisma.purchaseOrder.count({ where });
  // Tab counts share the list's search and supplier filter; "open" is every status not yet received or cancelled.
  const statusCounts = Object.fromEntries(await Promise.all(['draft', 'sent', 'confirmed', 'received', 'cancelled'].map(async (status) => [status, await context.prisma.purchaseOrder.count({ where: { storeId: store.id, AND: [purchaseSearch, supplierFilter, { status: status as any }] } })] as const)));
  statusCounts.open = statusCounts.draft + statusCounts.sent + statusCounts.confirmed;
  statusCounts.all = statusCounts.open + statusCounts.received + statusCounts.cancelled;
  const openWhere: any = { storeId: store.id, AND: [purchaseSearch, supplierFilter, { status: { in: ['draft', 'sent', 'confirmed'] } }] };
  const [dueSoonCount, openValue] = await Promise.all([
    context.prisma.purchaseOrder.count({ where: { ...openWhere, expectedDeliveryDate: { lte: dueSoonBoundary } } }),
    context.prisma.purchaseOrder.aggregate({ where: openWhere, _sum: { totalAmountCents: true } }),
  ]);
  const purchaseOrders = await context.prisma.purchaseOrder.findMany({
    where, orderBy: purchaseOrder, take: pagination.pageSize, skip: pagination.skip,
    select: { id: true, poNumber: true, orderDate: true, expectedDeliveryDate: true, status: true, totalAmount: true, totalAmountCents: true, notes: true, supplier: { select: { id: true, name: true } }, items: { select: { id: true, productTitle: true, productSku: true, quantity: true, quantityReceived: true, unitCost: true, unitCostCents: true } } },
  });
  return { currencyCode: store.currencyCode, statusCounts, dueSoonCount, openCommittedCents: Number(openValue._sum.totalAmountCents || 0), pagination: collectionPage(pagination, { purchaseOrders: total }), purchaseOrders: purchaseOrders.map((order) => ({ ...order, orderDate: iso(order.orderDate), expectedDeliveryDate: iso(order.expectedDeliveryDate), isDueSoon: Boolean(order.expectedDeliveryDate && order.expectedDeliveryDate <= dueSoonBoundary), totalAmount: Number(order.totalAmountCents || Math.round(Number(order.totalAmount || 0) * 100)) / 100, totalAmountCents: order.totalAmountCents, items: order.items.map((item) => ({ ...item, unitCost: Number(item.unitCostCents || Math.round(Number(item.unitCost || 0) * 100)) / 100, unitCostCents: item.unitCostCents })) })) };
}

export async function groceryPlatformMerchandising(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageProducts', 'Merchandising projection requires product-management permission');
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  const now = new Date();
  const view = args.view || 'all';
  const departmentBase: any = { storeId: store.id, ...searchFields(pagination.search, ['name', 'handle']) };
  const departmentWhere: any = { ...departmentBase, ...(view === 'departments_inactive' ? { isActive: false } : {}) };
  // Coupon search matches its code or a department it applies to; views use the same
  // "usable now" definition shoppers get.
  const couponSearch = pagination.search ? { OR: [{ code: { contains: pagination.search, mode: 'insensitive' } }, { productCategories: { array_contains: [pagination.search.toLowerCase()] } }] } : {};
  const exhausted = { maxUses: { gt: 0 }, currentUses: { gte: context.prisma.coupon.fields.maxUses } };
  const usable = { isActive: true, AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validTo: null }, { validTo: { gte: now } }] }], NOT: exhausted };
  const couponViews: Record<string, any> = { active: usable, exhausted, inactive: { NOT: usable } };
  const couponScope = (name: string): any => ({ storeId: store.id, AND: [couponSearch, couponViews[name] || {}] });
  const couponWhere: any = couponScope(view);
  const departmentOrder: any[] = args.sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }] : args.sort === 'products' ? [{ products: { _count: 'desc' } }, { id: 'asc' }] : [{ sortOrder: 'asc' }, { id: 'asc' }];
  const couponOrder: any[] = args.sort === 'usage' ? [{ currentUses: 'desc' }, { id: 'asc' }] : args.sort === 'expiry' ? [{ validTo: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }] : [{ code: 'asc' }, { id: 'asc' }];
  const [departments, coupons] = await Promise.all([
    context.prisma.department.findMany({ where: departmentWhere, orderBy: departmentOrder, take: pagination.pageSize, skip: pagination.skip, select: { id: true, name: true, handle: true, description: true, imageUrl: true, sortOrder: true, isActive: true, temperatureZone: true, requiredLicenses: true, _count: { select: { products: true } } } }),
    context.prisma.coupon.findMany({ where: couponWhere, orderBy: couponOrder, take: pagination.pageSize, skip: pagination.skip, select: { id: true, code: true, discountType: true, discountValue: true, discountValueCents: true, minPurchase: true, minPurchaseCents: true, maxUses: true, currentUses: true, productCategories: true, isActive: true, validFrom: true, validTo: true } }),
  ]);
  const counts = await Promise.all([context.prisma.department.count({ where: departmentWhere }), context.prisma.coupon.count({ where: couponWhere })]);
  // Tab counts share the search predicate with the lists.
  const [allDepartments, inactiveDepartments, allCoupons, activeCoupons, inactiveCoupons, exhaustedCoupons] = await Promise.all([
    context.prisma.department.count({ where: departmentBase }), context.prisma.department.count({ where: { ...departmentBase, isActive: false } }),
    context.prisma.coupon.count({ where: couponScope('') }), context.prisma.coupon.count({ where: couponScope('active') }),
    context.prisma.coupon.count({ where: couponScope('inactive') }), context.prisma.coupon.count({ where: couponScope('exhausted') }),
  ]);
  return { pagination: collectionPage(pagination, { departments: counts[0], coupons: counts[1] }), currencyCode: store.currencyCode,
    viewCounts: { departments: allDepartments, departments_inactive: inactiveDepartments, coupons: allCoupons, active: activeCoupons, inactive: inactiveCoupons, exhausted: exhaustedCoupons },
    departments: departments.map(({ _count, requiredLicenses, ...department }) => ({ ...department, requiredLicenses: Array.isArray(requiredLicenses) ? requiredLicenses : [], products: [], productCount: _count.products })),
    coupons: coupons.map(({ productCategories, ...coupon }) => {
      // A restriction must be a list of department handles; anything else is reported, never read as "all departments".
      const categories = productCategories === null || productCategories === undefined ? null : Array.isArray(productCategories) && productCategories.every((entry) => typeof entry === 'string') ? productCategories as string[] : undefined;
      return { ...coupon, productCategories: categories ?? null, categoryRestrictionValid: categories !== undefined, discountValue: number(coupon.discountValue), minPurchase: number(coupon.minPurchase), validFrom: iso(coupon.validFrom), validTo: iso(coupon.validTo) };
    }) };
}

export async function groceryPlatformCustomers(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManageUsers', 'Customers projection requires user-management permission');
  const store = await requireSessionStore(context), pagination = pageArgs(args);
  // Customers are accounts with no staff role and no staff history (a revoked employee is still staff).
  const base: any = { storeId: store.id, roleId: null, staffAccessEvents: { none: {} } };
  const customerViews: Record<string, any> = { with_orders: { orders: { some: { storeId: store.id } } }, without_orders: { orders: { none: { storeId: store.id } } } };
  const where: any = { ...base, AND: [searchFields(pagination.search, ['name', 'email']), customerViews[args.view || ''] || {}] };
  const customerOrder: any[] = args.sort === 'name' ? [{ name: 'asc' }, { id: 'asc' }] : args.sort === 'oldest' ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }];
  const [users, totalCustomers, savedCarts, customersWithOrders, allCustomers] = await Promise.all([
    context.prisma.user.findMany({ where, orderBy: customerOrder, take: pagination.pageSize, skip: pagination.skip, select: { id: true, name: true, email: true, onboardingStatus: true, createdAt: true } }),
    context.prisma.user.count({ where }), context.prisma.cart.count({ where: { storeId: store.id, itemCount: { gt: 0 } } }),
    context.prisma.user.count({ where: { ...base, ...customerViews.with_orders } }), context.prisma.user.count({ where: base }),
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
  }), totalCustomers, allCustomers, customersWithOrders, savedCarts, pagination: collectionPage(pagination, { users: totalCustomers }) };
}

export async function groceryPlatformPayments(_root: unknown, args: ProjectionPageInput, context: Context) {
  await requirePermission(context, 'canManagePayments', 'Payments projection requires payment-management permission');
  const store = await requireSessionStore(context);
  const pagination = pageArgs(args);
  // Payment facts are Store-scoped; deployment-wide provider configuration is
  // read only for operators holding both current payment and onboarding access.
  const canReadProviderConfiguration = await hasFreshCapability(context, 'canManageOnboarding');
  const canEditProviderConfiguration = await canAdministerPaymentProviders({ session: context.session, context });
  // Every advertised identifier is searchable: payment id, provider payment id,
  // provider code and the order number. Views share one attention definition.
  const orderNumber = /^#?(\d{1,9})$/.exec(pagination.search);
  const paymentSearch = pagination.search ? { OR: [
    { id: { equals: pagination.search } }, { providerPaymentId: { contains: pagination.search, mode: 'insensitive' } },
    { paymentProvider: { code: { contains: pagination.search, mode: 'insensitive' } } },
    ...(orderNumber ? [{ order: { displayId: Number(orderNumber[1]) } }] : []),
  ] } : {};
  const attention = { OR: [{ status: { in: ['failed', 'processing'] } }, { refunds: { some: { OR: [{ status: 'failed' }, { reconciliationDeadLetterAt: { not: null } }] } } }] };
  const paymentView = args.view || pagination.status || 'all';
  const paymentViews: Record<string, any> = { attention, refunds: { refunds: { some: {} } } };
  const paymentWhere: any = { storeId: store.id, AND: [paymentSearch, paymentView === 'all' ? {} : paymentViews[paymentView] || { status: paymentView }] };
  const paymentOrder: any[] = args.sort === 'amount' ? [{ amountCents: 'desc' }, { id: 'asc' }] : args.sort === 'oldest' ? [{ createdAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'asc' }];
  const attentionCount = await context.prisma.payment.count({ where: { storeId: store.id, ...attention } as any });
  const [payments, providers, paymentCount, failedCount, processingCount, captured, refunded, recoveryCounts] = await Promise.all([
    context.prisma.payment.findMany({
      where: paymentWhere,
      orderBy: paymentOrder,
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
  // Tab counts share the search predicate (and the attention definition) with the list.
  const searchScope: any = { storeId: store.id, AND: [paymentSearch] };
  const [statusRows, searchAll, searchAttention, searchWithRefunds] = await Promise.all([
    context.prisma.payment.groupBy({ by: ['status'], where: searchScope, _count: { _all: true } }),
    context.prisma.payment.count({ where: searchScope }),
    context.prisma.payment.count({ where: { storeId: store.id, AND: [paymentSearch, attention] } as any }),
    context.prisma.payment.count({ where: { storeId: store.id, AND: [paymentSearch, paymentViews.refunds] } as any }),
  ]);
  const viewCounts: Record<string, number> = { all: searchAll, attention: searchAttention, refunds: searchWithRefunds };
  for (const row of statusRows) if (row.status) viewCounts[row.status] = row._count._all;
  // Mirrors voidGroceryPaymentAuthorization: active authorizations, or a captured payment whose
  // revised sale still awaits the customer's authorization.
  const orderIds = payments.flatMap((payment) => payment.order?.id ? [payment.order.id] : []);
  const unresolvedSaleOrders = new Set(orderIds.length ? (await context.prisma.orderSettlement.findMany({
    where: { orderId: { in: orderIds }, status: 'requires_customer_authorization' }, select: { orderId: true },
  })).map((settlement) => settlement.orderId) : []);
  return {
    pagination: collectionPage(pagination, { payments: filteredCount }),
    currencyCode: store.currencyCode,
    payments: payments.map((payment) => ({
      ...payment,
      createdAt: iso(payment.createdAt),
      processedAt: iso(payment.processedAt),
      providerCode: payment.paymentProvider?.code || '',
      refunds: payment.refunds.map(mapRefund),
      voidable: ['authorized', 'pending'].includes(payment.status)
        || (['succeeded', 'partially_refunded', 'refunded'].includes(payment.status) && unresolvedSaleOrders.has(payment.order?.id)),
      // A captured payment whose revised sale awaits the customer's new authorization.
      awaitingRevisedAuthorization: ['succeeded', 'partially_refunded', 'refunded'].includes(payment.status) && unresolvedSaleOrders.has(payment.order?.id),
    })),
    providers: providers.map(mapPaymentProviderTruth),
    viewCounts,
    actorCanManageOrders: await hasFreshCapability(context, 'canManageOrders'),
    // Restricted is not "no providers": the actor simply cannot see deployment configuration.
    providerConfiguration: canReadProviderConfiguration ? 'visible' : 'restricted',
    providerConfigurationEditable: canEditProviderConfiguration,
    summary: {
      attentionCount,
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
        contactEmail: true, contactPhone: true, address: true, policyNotes: true, logoUrl: true, logoIcon: true, logoColor: true, brandHue: true, currencyCode: true,
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
    settings: { ...settings, logoIcon: sanitizeStoreLogoSvg(settings.logoIcon || '') || null, logoColor: normalizeStoreLogoColor(settings.logoColor) },
    counts: { products: counts[0], suppliers: counts[1], deliverySlots: counts[2], pickupSlots: counts[3], parkingSpots: counts[4] },
  };
}

/**
 * One shopper's account and order activity for staff with user management in
 * the same Store. Staff accounts (current or revoked) are not customers and are
 * not returned; raw User access stays limited to the user themselves.
 */
export async function groceryPlatformCustomer(_root: unknown, args: { id: string }, context: Context) {
  await requirePermission(context, 'canManageUsers', 'Customer details require user-management permission');
  const store = await requireSessionStore(context);
  const user = await context.prisma.user.findFirst({
    where: { id: args.id, storeId: store.id, roleId: null, staffAccessEvents: { none: {} } },
    select: { id: true, name: true, email: true, createdAt: true, privacyErasedAt: true },
  });
  if (!user) return null;
  const [orderCount, shoppingListCount, addressCount, recentOrders] = await Promise.all([
    context.prisma.order.count({ where: { storeId: store.id, userId: user.id } }),
    context.prisma.shoppingList.count({ where: { userId: user.id } }),
    context.prisma.address.count({ where: { userId: user.id, isSaved: true } as any }),
    context.prisma.order.findMany({ where: { storeId: store.id, userId: user.id }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 20,
      select: { id: true, displayId: true, status: true, totalCents: true, currencyCode: true, createdAt: true } }),
  ]);
  return { ...user, createdAt: iso(user.createdAt), privacyErasedAt: iso(user.privacyErasedAt), orderCount, shoppingListCount, addressCount,
    recentOrders: recentOrders.map((order) => ({ ...order, createdAt: iso(order.createdAt) })) };
}
