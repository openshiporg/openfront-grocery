import type { Context } from '.keystone/types';
import seedDefaults from '../../platform/onboarding/lib/seed.json';
import { requireFreshCapability } from '../access';
import { assertValidRollingFulfillmentPolicy, resolveRollingFulfillmentPolicy } from '../lib/rollingFulfillment';
import { requireSessionStore } from '../lib/storeScope';
import { normalizeTaxRateBps } from '../lib/storeMoney';
import { assertValidTimeZone, zonedDateKeyOffset, zonedStartOfDateKey } from '../lib/storeTime';

type GrocerySeed = typeof seedDefaults;
export type GroceryOnboardingFailurePoint = 'after-products';

export function relativeDate(days: number, hour = 12, minute = 0, now = new Date()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour, minute, 0, 0);
  return date;
}

function startOfStoreDay(days: number, timeZone: string, now = new Date()) {
  return zonedStartOfDateKey(zonedDateKeyOffset(now, timeZone, days), timeZone);
}

function assertSeed(seed: GrocerySeed) {
  if (!seed?.storeSettings?.name || !seed.departments?.length || !seed.products?.length) {
    throw new Error('Grocery onboarding requires store settings, departments, and products');
  }
  if (seed.storeSettings.currencyCode !== 'USD') throw new Error('The bounded initial launch supports USD stores only');
  if (seed.storeSettings.isActive !== true) throw new Error('Onboarding cannot initialize an inactive Store');
  assertValidTimeZone(seed.storeSettings.timezone);
  assertValidRollingFulfillmentPolicy(seed.storeSettings.hours);
  const fulfillmentPolicy = resolveRollingFulfillmentPolicy({
    hours: seed.storeSettings.hours,
    deliverySlots: [],
    pickupSlots: [],
  });
  if (!fulfillmentPolicy.deliveryTemplates.length || !fulfillmentPolicy.pickupTemplates.length) {
    throw new Error('Onboarding requires configured rolling delivery and pickup windows');
  }
  normalizeTaxRateBps(seed.storeSettings.taxRateBps);
  const handles = seed.products.map((product) => product.handle);
  if (new Set(handles).size !== handles.length) throw new Error('Product handles must be unique');
  for (const lot of seed.inventoryLots) {
    if (!Number.isInteger(lot.expirationOffsetDays) || lot.expirationOffsetDays < 1) {
      throw new Error(`Inventory lot ${lot.lotNumber} must expire relative to onboarding in the future`);
    }
    if (!Number.isInteger(lot.quantityRemaining) || lot.quantityRemaining < 0 || lot.quantityRemaining > lot.quantity) {
      throw new Error(`Inventory lot ${lot.lotNumber} has an invalid remaining quantity`);
    }
  }
  if (seed.paymentProviders?.length !== 1 || seed.paymentProviders[0]?.code !== 'pp_stripe_default') {
    throw new Error('Onboarding requires exactly the static Stripe adapter registry entry');
  }
}

function providerInstalled(code: string) {
  return code === 'pp_stripe_default'
    && Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

function publicProviderMetadata(metadata: unknown) {
  const source = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(source).filter(([key]) => !/(secret|token|password|credential|key)/i.test(key)));
}

export async function runGroceryOnboardingTransaction(
  seed: GrocerySeed,
  context: Context,
  failurePoint?: GroceryOnboardingFailurePoint
) {
  const userId = context.session?.itemId;
  if (!userId) throw new Error('You must be signed in to run grocery onboarding');
  assertSeed(seed);
  const store = await requireSessionStore(context);
  const launchCounts = {
    departments: seed.departments.length,
    suppliers: seed.suppliers.length,
    products: seed.products.length,
    inventoryLots: seed.inventoryLots.length,
    deliverySlots: seed.deliverySlots.length,
    pickupSlots: seed.pickupSlots.length,
    parkingSpots: seed.parkingSpots.length,
    paymentProviders: seed.paymentProviders.length,
    coupons: seed.coupons.length,
    loyaltyPrograms: 0,
    customers: 0,
    orders: 0,
  };

  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRaw`
      WITH onboarding_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended('openfront-grocery-onboarding', 0))
      )
      SELECT true AS locked FROM onboarding_lock
    `;

    const [actor, existingSettings] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { storeId: true, onboardingStatus: true } }),
      tx.storeSettings.findUnique({ where: { storeId: store.id }, select: { id: true } }),
    ]);
    if (!actor || actor.storeId !== store.id) throw new Error('Onboarding actor is not owned by the active Store');
    // Initialization belongs to the Store, not one actor. Once a Store has its
    // settings row, any later manager replay preserves live operator data.
    if (existingSettings) {
      if (actor.onboardingStatus !== 'completed') {
        await tx.user.update({ where: { id: userId }, data: { onboardingStatus: 'completed' } });
      }
      const [departments, suppliers, products, inventoryLots, deliverySlots, pickupSlots, parkingSpots, paymentProviders, coupons] = await Promise.all([
        tx.department.count({ where: { storeId: store.id } }),
        tx.supplier.count({ where: { storeId: store.id } }),
        tx.product.count({ where: { storeId: store.id } }),
        tx.inventoryLot.count({ where: { storeId: store.id } }),
        tx.deliverySlot.count({ where: { storeId: store.id } }),
        tx.pickupSlot.count({ where: { storeId: store.id } }),
        tx.parkingSpot.count({ where: { storeId: store.id } }),
        tx.paymentProvider.count(),
        tx.coupon.count({ where: { storeId: store.id } }),
      ]);
      return { completed: true, reused: true, counts: { ...launchCounts, departments, suppliers, products, inventoryLots, deliverySlots, pickupSlots, parkingSpots, paymentProviders, coupons } };
    }

    await tx.store.update({
      where: { id: store.id },
      data: {
        name: seed.storeSettings.name,
        timezone: seed.storeSettings.timezone,
        currencyCode: seed.storeSettings.currencyCode,
        isActive: seed.storeSettings.isActive,
      },
    });
    await tx.storeSettings.upsert({
      where: { storeId: store.id },
      update: seed.storeSettings,
      create: { ...seed.storeSettings, storeId: store.id },
    });

    const departmentIds = new Map<string, string>();
    for (const department of seed.departments) {
      const conflict = await tx.department.findFirst({ where: { handle: department.handle }, select: { id: true, storeId: true } });
      if (conflict && conflict.storeId !== store.id) throw new Error(`Department handle ${department.handle} belongs to another store`);
      const existing = conflict;
      const row = existing
        ? await tx.department.update({ where: { id: existing.id }, data: {
          storeId: store.id,
          name: department.name,
          description: department.description,
          imageUrl: department.imageUrl,
          sortOrder: department.sortOrder,
          temperatureZone: department.temperatureZone as any,
          requiredLicenses: department.requiredLicenses,
          isActive: true,
        }, select: { id: true } })
        : await tx.department.create({
          data: { ...department, storeId: store.id, temperatureZone: department.temperatureZone as any, isActive: true },
          select: { id: true },
        });
      departmentIds.set(department.handle, row.id);
    }

    const supplierIds = new Map<string, string>();
    for (const supplier of seed.suppliers) {
      const conflict = await tx.supplier.findFirst({ where: { email: supplier.email }, select: { id: true, storeId: true } });
      if (conflict && conflict.storeId !== store.id) throw new Error(`Supplier ${supplier.email} belongs to another store`);
      const existing = conflict;
      const data = {
        name: supplier.name,
        contactName: supplier.contactName,
        email: supplier.email,
        phone: supplier.phone,
        paymentTerms: supplier.paymentTerms as any,
        deliveryDays: supplier.deliveryDays,
        minimumOrder: supplier.minimumOrder,
        minimumOrderCents: Math.round(supplier.minimumOrder * 100),
        storeId: store.id,
      };
      const row = existing
        ? await tx.supplier.update({ where: { id: existing.id }, data, select: { id: true } })
        : await tx.supplier.create({ data, select: { id: true } });
      supplierIds.set(supplier.email, row.id);
    }

    const productIds = new Map<string, string>();
    for (const product of seed.products) {
      const common = {
        title: product.title,
        sku: product.sku,
        status: product.status as any,
        price: product.price,
        priceCents: Math.round(product.price * 100),
        compareAtPrice: product.compareAtPrice,
        costPrice: product.costPrice,
        costPriceCents: Math.round(product.costPrice * 100),
        lowStockThreshold: product.lowStockThreshold,
        imageUrl: product.imageUrl,
        thumbnailUrl: product.thumbnailUrl,
        department: product.departmentCode as any,
        isPerishable: product.isPerishable,
        shelfLife: product.shelfLife,
        pricingMethod: product.pricingMethod as any,
        unitOfMeasure: product.unitOfMeasure as any,
        organicCertified: product.organicCertified,
        allergens: product.allergens,
        supplierId: supplierIds.get(product.supplierEmail),
        departmentRefId: departmentIds.get(product.departmentHandle),
        storeId: store.id,
      };
      const conflict = await tx.product.findFirst({ where: { handle: product.handle }, select: { id: true, storeId: true } });
      if (conflict && conflict.storeId !== store.id) throw new Error(`Product handle ${product.handle} belongs to another store`);
      const existing = conflict;
      const row = existing
        ? await tx.product.update({ where: { id: existing.id }, data: common, select: { id: true } })
        : await tx.product.create({ data: {
          ...common,
          handle: product.handle,
          inStock: product.inStock,
          stockQuantity: product.stockQuantity,
        }, select: { id: true } });
      productIds.set(product.handle, row.id);
    }

    if (failurePoint === 'after-products') throw new Error('Injected onboarding failure after products');

    for (const lot of seed.inventoryLots) {
      const common = {
        expirationDate: relativeDate(lot.expirationOffsetDays),
        receivedDate: relativeDate(lot.receivedOffsetDays, 9),
        quantity: lot.quantity,
        quantityRemaining: lot.quantityRemaining,
        costPerUnit: lot.costPerUnit,
        costPerUnitCents: Math.round(lot.costPerUnit * 100),
        location: lot.location,
        productId: productIds.get(lot.productHandle),
        supplierId: supplierIds.get(lot.supplierEmail),
        storeId: store.id,
      };
      const existing = await tx.inventoryLot.findFirst({ where: { lotNumber: lot.lotNumber, storeId: store.id }, select: { id: true } });
      if (existing) await tx.inventoryLot.update({ where: { id: existing.id }, data: common });
      else await tx.inventoryLot.create({ data: { ...common, lotNumber: lot.lotNumber } });
    }

    const seededSellableByProduct = new Map<string, number>();
    for (const lot of seed.inventoryLots) {
      const productId = productIds.get(lot.productHandle);
      if (productId) seededSellableByProduct.set(productId, (seededSellableByProduct.get(productId) || 0) + lot.quantityRemaining);
    }
    for (const productId of productIds.values()) {
      const sellableQuantity = seededSellableByProduct.get(productId) || 0;
      await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: sellableQuantity, inStock: sellableQuantity > 0 },
      });
    }

    for (const slot of seed.deliverySlots) {
      const date = startOfStoreDay(slot.dayOffset, seed.storeSettings.timezone);
      const existing = await tx.deliverySlot.findFirst({
        where: { date, startTime: slot.startTime, endTime: slot.endTime, storeId: store.id },
        select: { id: true },
      });
      const common = {
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        capacity: slot.capacity,
        deliveryFee: slot.deliveryFee,
        storeId: store.id,
      };
      if (existing) await tx.deliverySlot.update({ where: { id: existing.id }, data: common });
      else await tx.deliverySlot.create({ data: { ...common, currentBookings: 0, isActive: slot.isActive } });
    }
    for (const slot of seed.pickupSlots) {
      const date = startOfStoreDay(slot.dayOffset, seed.storeSettings.timezone);
      const existing = await tx.pickupSlot.findFirst({
        where: { date, startTime: slot.startTime, endTime: slot.endTime, storeId: store.id },
        select: { id: true },
      });
      const common = { date, startTime: slot.startTime, endTime: slot.endTime, maxOrders: slot.maxOrders, isActive: slot.isAvailable, storeId: store.id };
      if (existing) await tx.pickupSlot.update({ where: { id: existing.id }, data: { ...common, isAvailable: slot.isAvailable } });
      else await tx.pickupSlot.create({ data: { ...common, currentOrders: 0, isAvailable: slot.isAvailable } });
    }
    for (const spot of seed.parkingSpots) {
      const conflict = await tx.parkingSpot.findFirst({ where: { spotNumber: spot.spotNumber }, select: { id: true, storeId: true } });
      if (conflict && conflict.storeId !== store.id) throw new Error(`Parking spot ${spot.spotNumber} belongs to another store`);
      const existing = conflict;
      if (existing) await tx.parkingSpot.update({ where: { id: existing.id }, data: { ...spot, storeId: store.id } });
      else await tx.parkingSpot.create({ data: { ...spot, storeId: store.id } });
    }

    for (const provider of seed.paymentProviders) {
      await tx.paymentProvider.upsert({
        where: { code: provider.code },
        update: { name: provider.name, isInstalled: providerInstalled(provider.code), metadata: publicProviderMetadata(provider.metadata) as any },
        create: { ...provider, isInstalled: providerInstalled(provider.code), metadata: publicProviderMetadata(provider.metadata) as any },
      });
    }

    for (const coupon of seed.coupons) {
      const common = {
        discountType: coupon.discountType as any,
        discountValue: coupon.discountValue,
        discountValueCents: Math.round(coupon.discountValue * 100),
        minPurchase: coupon.minPurchase,
        minPurchaseCents: Math.round(coupon.minPurchase * 100),
        maxUses: coupon.maxUses,
        validFrom: relativeDate(coupon.validFromOffsetDays, 0),
        validTo: relativeDate(coupon.validToOffsetDays, 23, 59),
        productCategories: coupon.productCategories,
        excludedProducts: coupon.excludedProducts,
        isActive: coupon.isActive,
        storeId: store.id,
      };
      const conflict = await tx.coupon.findFirst({ where: { code: coupon.code }, select: { id: true, storeId: true } });
      if (conflict && conflict.storeId !== store.id) throw new Error(`Coupon ${coupon.code} belongs to another store`);
      const existing = conflict;
      if (existing) await tx.coupon.update({ where: { id: existing.id }, data: common });
      else await tx.coupon.create({ data: { ...common, code: coupon.code, currentUses: coupon.currentUses } });
    }
    await tx.user.update({ where: { id: userId }, data: { onboardingStatus: 'completed' } });
    return { completed: true, reused: false, counts: launchCounts };
  }, { timeout: 120_000, isolationLevel: 'Serializable' as any });
}

export async function runGroceryOnboarding(
  _root: unknown,
  args: { seed?: GrocerySeed | null },
  context: Context
) {
  await requireFreshCapability(context, 'canManageOnboarding');
  return runGroceryOnboardingTransaction(args.seed || seedDefaults, context);
}
