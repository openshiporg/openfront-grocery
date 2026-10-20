import { catalogPageQuery } from '../lib/catalogPage';
import { publicError } from '../lib/publicError';
import { currentNotificationPreference, emailAllowedFor, enableEmailCategory } from '../lib/notificationConsent';
import type { Context } from '.keystone/types';

import { deriveSellableQuantity } from '../lib/sellableInventory';
import { lockCurrentCustomer, publicStore, requireSessionStore } from '../lib/storeScope';

const MAX_PAGE_SIZE = 100;

type CatalogArgs = {
  handle?: string;
  department?: string | null;
  search?: string | null;
  availability?: string | null;
  organic?: boolean | null;
  sort?: string | null;
  take?: number | null;
  skip?: number | null;
  ids?: string[] | null;
};

function boundedPage(args: CatalogArgs) {
  return {
    take: Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(args.take || 24)))),
    skip: Math.max(0, Math.trunc(Number(args.skip || 0))),
  };
}

function mapCatalogProduct(product: any, storeId: string, requestedAlerts: Set<string>, now: Date) {
  const sellableQuantity = product.sellableQuantity ?? deriveSellableQuantity(product, storeId, now);
  return {
    nutrition:product.nutrition,variantLabel:product.variantLabel,variantOf:product.variantOf,packBaseUnitsMilli:product.packBaseUnitsMilli,informationSource:product.informationSource,
    id: product.id,
    title: product.title,
    handle: product.handle,
    description: product.description,
    sku: product.sku,
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    unitOfMeasure: product.unitOfMeasure,
    pricingMethod: product.pricingMethod,
    imageUrl: product.imageUrl,
    thumbnailUrl: product.thumbnailUrl,
    isPerishable: product.isPerishable,
    shelfLife: product.shelfLife,
    organicCertified: product.organicCertified,
    allergens: Array.isArray(product.allergens) ? product.allergens : [],
    // A hidden aisle's details are not published; its products may still be found by search.
    department: product.departmentRef?.isActive ? product.departmentRef : null,
    inStock: sellableQuantity > 0,
    stockQuantity: sellableQuantity,
    backInStockRequested: requestedAlerts.has(product.id),
    createdAt: product.createdAt.toISOString(),
  };
}

function compareProducts(sort: string | null | undefined) {
  return (left: any, right: any) => {
    let result = 0;
    if (sort === 'price-asc') result = Number(left.price || 0) - Number(right.price || 0);
    else if (sort === 'price-desc') result = Number(right.price || 0) - Number(left.price || 0);
    else if (sort === 'newest') result = String(right.createdAt).localeCompare(String(left.createdAt));
    else if (sort === 'low-stock') result = left.stockQuantity - right.stockQuantity;
    else result = String(left.title).localeCompare(String(right.title));
    return result || String(left.title).localeCompare(String(right.title)) || left.id.localeCompare(right.id);
  };
}

async function loadCatalog(context: Context, args: CatalogArgs, now: Date) {
  const store = await publicStore(context);
  const page=catalogPageQuery({...args,storeId:store.id,now});
  const [identities,counts]=await Promise.all([
    context.prisma.$queryRawUnsafe<Array<{id:string;quantity:unknown}>>(page.pageSql,...page.params),
    context.prisma.$queryRawUnsafe<Array<{count:number}>>(page.countSql,...page.countParams),
  ]);
  const quantityById=new Map(identities.map(row=>[row.id,Number(row.quantity)]));
  const rows:any[] = await (context.prisma as any).product.findMany({
    where: {id:{in:identities.map(row=>row.id)},storeId:store.id,status:'published'},
    select: {
      nutrition:true,variantLabel:true,variantOf:{select:{id:true,handle:true,title:true}},packBaseUnitsMilli:true,informationSource:true,
      id: true,
      title: true,
      handle: true,
      description: true,
      sku: true,
      price: true,
      compareAtPrice: true,
      unitOfMeasure: true,
      pricingMethod: true,
      imageUrl: true,
      thumbnailUrl: true,
      isPerishable: true,
      shelfLife: true,
      organicCertified: true,
      allergens: true,
      createdAt: true,
      store: { select: { id: true } },
      departmentRef: { select: { id: true, name: true, handle: true, isActive: true } },
    },
  });
  const rowsById=new Map(rows.map(row=>[row.id,row]));
  const ordered=identities.flatMap(row=>rowsById.has(row.id)?[{...rowsById.get(row.id),sellableQuantity:quantityById.get(row.id)}]:[]);

  const requestedAlerts = new Set<string>();
  if (context.session?.itemId && rows.length) {
    const alerts = await context.prisma.backInStockAlert.findMany({
      where: {
        userId: context.session.itemId,
        productRefId: { in: rows.map((row) => row.id) },
        isActive: true,
        productRef: { storeId: store.id },
      },
      select: { productRefId: true },
    });
    for (const alert of alerts) if (alert.productRefId) requestedAlerts.add(alert.productRefId);
  }

  return {
    store,
    products: ordered.map((row) => mapCatalogProduct(row, store.id, requestedAlerts, now)),
    totalCount: counts[0]?.count || 0,
  };
}

export async function getPublicGroceryProducts(
  _root: unknown,
  args: CatalogArgs,
  context: Context,
) {
  const now = new Date();
  return loadCatalog(context,args,now).then(({products,totalCount})=>({products,totalCount}));
}

export async function getPublicGroceryProduct(
  _root: unknown,
  { handle }: { handle: string },
  context: Context,
) {
  const normalized = handle.trim();
  if (!normalized) return null;
  const { products } = await loadCatalog(context, { handle: normalized, availability: 'all', take: 1 }, new Date());
  return products.find((product) => product.handle === normalized) || null;
}

export async function requestGroceryBackInStockAlert(
  _root: unknown,
  { productId, enableEmail }: { productId: string; enableEmail?: boolean | null },
  context: Context,
) {
  if (!context.session?.itemId) throw new Error('Sign in to request a back-in-stock alert');
  const store = await requireSessionStore(context);
  const product = await (context.prisma as any).product.findFirst({
    where: { id: productId, storeId: store.id, status: 'published' },
    select: {
      id: true,
      title: true,
      store: { select: { id: true } },
      inventoryLots: {
        where: { storeId: store.id, quantityRemaining: { gt: 0 }, expirationDate: { gt: new Date() } },
        select: { safetyStatus: true, conditionStatus: true, expirationDate: true, quantityRemaining: true, store: { select: { id: true } } },
      },
    },
  });
  if (!product) throw new Error('Product is not available in the active store');
  const sellableQuantity = deriveSellableQuantity(product, store.id);
  if (sellableQuantity > 0) {
    return { requested: false, reused: false, productId: product.id, message: `${product.title} is currently available` };
  }

  return context.transaction(async (transactionContext) => {
    await transactionContext.prisma.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('grocery-back-in-stock'), hashtext($1))",
      `${context.session?.itemId}:${product.id}`,
    );
    await lockCurrentCustomer(transactionContext);
    const userId = context.session!.itemId;
    // An alert is a promise to email; only accept it when email for stock alerts
    // is on, or when the customer explicitly turns it on for this request.
    const preference = await currentNotificationPreference(transactionContext.prisma, userId);
    if (!emailAllowedFor('product.back_in_stock', preference)) {
      if (!enableEmail) {
        return {
          requested: false,
          reused: false,
          productId: product.id,
          emailDisabled: true,
          message: 'Back-in-stock emails are turned off in your email preferences, so no alert was set.',
        };
      }
      await enableEmailCategory(transactionContext.prisma, userId, 'backInStock');
    }
    const existing = await transactionContext.prisma.backInStockAlert.findFirst({
      where: { userId: context.session?.itemId, productRefId: product.id, isActive: true },
      select: { id: true },
    });
    if (!existing) {
      await transactionContext.prisma.backInStockAlert.create({
        data: {
          userId: context.session?.itemId as string,
          productRefId: product.id,
          product: product.title,
          isActive: true,
        },
      });
    }
    return {
      requested: true,
      reused: Boolean(existing),
      productId: product.id,
      emailDisabled: false,
      message: existing ? 'Back-in-stock alert is already active' : 'Back-in-stock alert requested. We’ll email you when it’s back.',
    };
  });
}

/**
 * Ask to be emailed when a product's price drops to a target. The product must
 * be published in this Store and the target below today's price; email for
 * price drops must be on, or explicitly turned on for this request. One active
 * alert per product: asking again updates its target.
 */
export async function requestGroceryPriceAlert(
  _root: unknown,
  { productId, targetPrice, enableEmail }: { productId: string; targetPrice: string; enableEmail?: boolean | null },
  context: Context,
) {
  if (!context.session?.itemId) throw new Error('Sign in to request a price alert');
  const store = await requireSessionStore(context);
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(String(targetPrice || '').trim().replace(/^\$/, ''));
  if (!match) throw publicError('Enter a target price like 3.49.');
  const targetCents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  const product = await context.prisma.product.findFirst({ where: { id: productId, storeId: store.id, status: 'published' }, select: { id: true, title: true, priceCents: true } });
  if (!product) throw publicError('This product is not available.');
  if (targetCents <= 0 || targetCents >= Number(product.priceCents)) throw publicError('Choose a target below the current price.');
  return context.transaction(async (transactionContext) => {
    const userId = context.session!.itemId;
    await transactionContext.prisma.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-price-alert'), hashtext($1))", `${userId}:${product.id}`);
    await lockCurrentCustomer(transactionContext);
    const preference = await currentNotificationPreference(transactionContext.prisma, userId);
    if (!emailAllowedFor('product.price_drop', preference)) {
      if (!enableEmail) return { requested: false, emailDisabled: true, message: 'Price-drop emails are turned off in your email preferences, so no alert was set.' };
      await enableEmailCategory(transactionContext.prisma, userId, 'priceDrops');
    }
    const existing = await transactionContext.prisma.priceAlert.findFirst({ where: { userId, productRefId: product.id, isTriggered: false }, select: { id: true } });
    const targetPriceText = (targetCents / 100).toFixed(2);
    if (existing) await transactionContext.prisma.priceAlert.update({ where: { id: existing.id }, data: { targetPrice: targetPriceText } });
    else await transactionContext.prisma.priceAlert.create({ data: { userId, productRefId: product.id, product: product.title, targetPrice: targetPriceText, currentPrice: (Number(product.priceCents) / 100).toFixed(2) } });
    return { requested: true, emailDisabled: false, message: `We’ll email you if ${product.title} drops to ${targetPriceText} or less.` };
  });
}
