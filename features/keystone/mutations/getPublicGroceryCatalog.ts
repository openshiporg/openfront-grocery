import type { Context } from '.keystone/types';

import { deriveSellableQuantity } from '../lib/sellableInventory';
import { publicStore, requireSessionStore } from '../lib/storeScope';

const PUBLIC_CATALOG_BOUND = 500;
const MAX_PAGE_SIZE = 100;

type CatalogArgs = {
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
  const sellableQuantity = deriveSellableQuantity(product, storeId, now);
  return {
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
    department: product.departmentRef,
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
  const where: any = { storeId: store.id, status: 'published' };
  if (args.ids?.length) where.id = { in: Array.from(new Set(args.ids)).slice(0, MAX_PAGE_SIZE) };
  if (args.department?.trim()) where.departmentRef = { handle: args.department.trim() };
  if (args.search?.trim()) {
    const query = args.search.trim();
    where.OR = [
      { title: { contains: query, mode: 'insensitive' } },
      { sku: { contains: query, mode: 'insensitive' } },
      { handle: { contains: query, mode: 'insensitive' } },
    ];
  }
  if (args.organic === true) where.organicCertified = true;

  const rows = await context.prisma.product.findMany({
    where,
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
    take: PUBLIC_CATALOG_BOUND + 1,
    select: {
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
      inventoryLots: {
        where: { storeId: store.id, quantityRemaining: { gt: 0 }, expirationDate: { gt: now } },
        select: { expirationDate: true, quantityRemaining: true, store: { select: { id: true } } },
      },
    },
  });
  if (rows.length > PUBLIC_CATALOG_BOUND) throw new Error('Public grocery catalog exceeds the bounded launch projection');

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
    products: rows.map((row) => mapCatalogProduct(row, store.id, requestedAlerts, now)),
  };
}

export async function getPublicGroceryProducts(
  _root: unknown,
  args: CatalogArgs,
  context: Context,
) {
  const now = new Date();
  const { products } = await loadCatalog(context, args, now);
  const availability = args.availability || 'in-stock';
  if (!['in-stock', 'all', 'low-stock'].includes(availability)) throw new Error('Unsupported catalog availability filter');
  const filtered = products.filter((product) => {
    if (availability === 'all') return true;
    if (availability === 'low-stock') return product.stockQuantity > 0 && product.stockQuantity < 10;
    return product.inStock;
  }).sort(compareProducts(args.sort));
  const { take, skip } = boundedPage(args);
  return { products: filtered.slice(skip, skip + take), totalCount: filtered.length };
}

export async function getPublicGroceryProduct(
  _root: unknown,
  { handle }: { handle: string },
  context: Context,
) {
  const normalized = handle.trim();
  if (!normalized) return null;
  const { products } = await loadCatalog(context, { search: normalized, availability: 'all' }, new Date());
  return products.find((product) => product.handle === normalized) || null;
}

export async function requestGroceryBackInStockAlert(
  _root: unknown,
  { productId }: { productId: string },
  context: Context,
) {
  if (!context.session?.itemId) throw new Error('Sign in to request a back-in-stock alert');
  const store = await requireSessionStore(context);
  const product = await context.prisma.product.findFirst({
    where: { id: productId, storeId: store.id, status: 'published' },
    select: {
      id: true,
      title: true,
      store: { select: { id: true } },
      inventoryLots: {
        where: { storeId: store.id, quantityRemaining: { gt: 0 }, expirationDate: { gt: new Date() } },
        select: { expirationDate: true, quantityRemaining: true, store: { select: { id: true } } },
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
      message: existing ? 'Back-in-stock alert is already active' : 'Back-in-stock alert requested',
    };
  });
}
