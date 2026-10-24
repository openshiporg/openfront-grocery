import {initialProductInformation} from '../lib/productInformation';
import { normalizeCouponCode } from '../lib/couponLookup';
import type { Context } from '.keystone/types';
import type { Prisma } from '@prisma/client';
import { getPaymentProviderDefinition } from '../../integrations/payment';
import seedDefaults from '../../platform/onboarding/lib/seed.json';
import {
  parseGroceryOnboardingSeed,
  type GroceryOnboardingSeed,
} from '../../platform/onboarding/lib/groceryOnboardingSeed';
import { requireFreshCapability } from '../access';
import { assertValidRollingFulfillmentPolicy, resolveRollingFulfillmentPolicy } from '../lib/rollingFulfillment';
import { requireSessionStore } from '../lib/storeScope';
import { normalizeTaxRateBps } from '../lib/storeMoney';
import { assertValidTimeZone, zonedDateKeyOffset, zonedStartOfDateKey } from '../lib/storeTime';
import { deriveProductSkuIdentity, normalizeProductSku } from '../lib/productSkuIdentity';
import { normalizeDeliveryPolicy } from '../lib/deliveryPolicy';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { appendInventoryMovement } from '../lib/inventoryMovements';
import { assessStoreReadiness } from '../lib/storeReadiness';
import { canAdministerPaymentProviders } from '../lib/providerAuthority';
import { sanitizeStoreLogoSvg } from '../utils/storeLogo';
import { DEFAULT_LIBRARY_LOGO_COLOR, DEFAULT_STORE_LOGO_ICON_ID, normalizeStoreLogoColor, storeLogoSvgFor } from '../../lib/store-logo';

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

function assertSeedPolicy(seed: GroceryOnboardingSeed) {
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
  onboardingStoreSettings(seed);
}

/** The last US ZIP in the store address seeds the delivery area when the seed names none. */
function postalPrefixesFromAddress(address: string) {
  const zips = address.match(/\b\d{5}(?=(?:-\d{4})?\b)/g);
  return zips?.length ? [zips[zips.length - 1]] : [];
}

/**
 * Store Settings exactly as the dashboard would leave them: the logo-library mark and colour
 * (as updateGroceryStoreLogo writes them) and the delivery service area (as
 * updateGroceryDeliveryPolicy validates it), instead of relying on render-time fallbacks.
 */
function onboardingStoreSettings(seed: GroceryOnboardingSeed) {
  const { logoIcon: seedLogoIcon, logoColor: seedLogoColor, deliveryPolicy: seedDeliveryPolicy, ...fields } = seed.storeSettings;
  const logoIcon = sanitizeStoreLogoSvg(storeLogoSvgFor(seedLogoIcon || DEFAULT_STORE_LOGO_ICON_ID));
  if (!logoIcon) throw new Error('Onboarding logo must be a logo-library icon id or a safe SVG document');
  const deliveryPolicy = normalizeDeliveryPolicy(seedDeliveryPolicy ?? { postalPrefixes: postalPrefixesFromAddress(fields.address) });
  return {
    ...fields,
    policyNotes: fields.policyNotes ?? '',
    logoIcon,
    logoColor: normalizeStoreLogoColor(seedLogoColor ?? DEFAULT_LIBRARY_LOGO_COLOR),
    deliveryPolicy: deliveryPolicy as Prisma.InputJsonValue,
    hours: fields.hours as Prisma.InputJsonValue,
  };
}

function providerInstalled(code: string) {
  return code === 'pp_stripe_default'
    && Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

function publicProviderMetadata(metadata: GroceryOnboardingSeed['paymentProviders'][number]['metadata']): Prisma.InputJsonValue {
  return { provider: metadata.provider, configuration: metadata.configuration };
}

/** Durable, once-per-Store record that setup was verified complete (and how). */
async function recordInitializationReceipt(tx: any, storeId: string, actorId: string, basis: 'seeded' | 'verified_existing', counts: Record<string, number>) {
  // The first verified completion is the receipt; later replays keep it as is.
  if (await tx.groceryOutboxEvent.findUnique({ where: { eventKey: `store.initialized:${storeId}:v1` }, select: { id: true } })) return;
  await enqueueGroceryOutboxEvent(tx, {
    storeId, eventKey: `store.initialized:${storeId}:v1`, eventType: 'store.initialized',
    aggregateType: 'Store', aggregateId: storeId, occurredAt: new Date().toISOString(),
    payload: { version: 1, basis, actorId, counts },
  });
}

export async function runGroceryOnboardingTransaction(
  input: unknown,
  context: Context,
  failurePoint?: GroceryOnboardingFailurePoint
) {
  const userId = context.session?.itemId;
  if (!userId) throw new Error('You must be signed in to run grocery onboarding');
  const seed = parseGroceryOnboardingSeed(input);
  assertSeedPolicy(seed);
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

  const providerAdministrator = await canAdministerPaymentProviders({ session: context.session, context });
  return context.transaction(async (transactionContext) => {
    const tx = transactionContext.prisma;
    await tx.$queryRaw`
      WITH onboarding_lock AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended('openfront-grocery-onboarding', 0))
      )
      SELECT true AS locked FROM onboarding_lock
    `;

    // Authority is checked against the state the writes will use: after the
    // onboarding lock, the Store and actor rows are locked in the same order staff
    // administration uses, so a capability revoked while this request waited is seen.
    await tx.$queryRawUnsafe('SELECT "id" FROM "Store" WHERE "id" = $1 FOR UPDATE', store.id);
    await tx.$queryRawUnsafe('SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE', userId);
    const [actor, existingSettings] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { storeId: true, onboardingStatus: true, privacyErasedAt: true, store: { select: { isActive: true } }, role: { select: { canManageOnboarding: true } } } }),
      tx.storeSettings.findUnique({ where: { storeId: store.id }, select: { id: true } }),
    ]);
    if (!actor || actor.storeId !== store.id) throw new Error('Onboarding actor is not owned by the active Store');
    if (actor.privacyErasedAt || !actor.store?.isActive || !actor.role?.canManageOnboarding) throw new Error('Missing current capability: canManageOnboarding');
    // Initialization belongs to the Store, not one actor. Once a Store has its
    // settings row, a later replay never reseeds it: it reports what the
    // persisted Store still needs and only records completion when it is ready.
    if (existingSettings) {
      const readiness = await assessStoreReadiness(tx, store.id);
      if (readiness.ready && actor.onboardingStatus !== 'completed') {
        await tx.user.update({ where: { id: userId }, data: { onboardingStatus: 'completed' } });
      }
      if (readiness.ready) await recordInitializationReceipt(tx, store.id, userId, 'verified_existing', readiness.counts);
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
      return { completed: readiness.ready, reused: true, missing: readiness.missing, counts: { ...launchCounts, departments, suppliers, products, inventoryLots, deliverySlots, pickupSlots, parkingSpots, paymentProviders, coupons } };
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
    const storeSettingsData = onboardingStoreSettings(seed);
    await tx.storeSettings.upsert({
      where: { storeId: store.id },
      update: storeSettingsData,
      create: { ...storeSettingsData, storeId: store.id },
    });
    // Same audit event the delivery settings screen records for a service-area change.
    await enqueueGroceryOutboxEvent(tx, {
      storeId: store.id, eventKey: `delivery.policy:onboarding:${store.id}`, eventType: 'delivery.policy.updated',
      aggregateType: 'Store', aggregateId: store.id, occurredAt: new Date().toISOString(),
      payload: { before: null, after: storeSettingsData.deliveryPolicy, actorId: userId },
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
        sku: normalizeProductSku(product.sku),
        skuIdentity: deriveProductSkuIdentity(store.id, product.sku),
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
        ...(product.description ? { description: [{ type: 'paragraph', children: [{ text: product.description }] }] } : {}),
        ...(product.nutrition ? { nutrition: product.nutrition } : {}),
        ...(product.taxRateBasisPoints !== undefined ? { taxRateBasisPoints: product.taxRateBasisPoints } : {}),
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
          // Source-added field; generated Prisma artifacts remain intentionally preserved until the schema transition.
          ...{initialInformation:initialProductInformation(product,context.session!.itemId,'grocery_onboarding_seed')},
          handle: product.handle,
          inStock: product.inStock,
          stockQuantity: product.stockQuantity,
        }, select: { id: true } });
      productIds.set(product.handle, row.id);
    }

    if (failurePoint === 'after-products') throw new Error('Injected onboarding failure after products');

    const openingLots: Array<{ lotId: string; productId: string; quantity: number }> = [];
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
      // Stock is a physical fact: an existing lot is never overwritten by the seed.
      const existing = await tx.inventoryLot.findFirst({ where: { lotNumber: lot.lotNumber, storeId: store.id }, select: { id: true } });
      if (existing) continue;
      const created = await tx.inventoryLot.create({ data: { ...common, lotNumber: lot.lotNumber }, select: { id: true } });
      openingLots.push({ lotId: created.id, productId: common.productId as string, quantity: lot.quantityRemaining });
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
    // One opening-balance journal entry per new lot: the actual stock the store
    // starts with, sourced to this onboarding and actor. No purchase, invoice or
    // payment is implied. Replays find the same idempotency keys.
    const runningProductStock = new Map<string, number>();
    for (const opening of openingLots) {
      const before = runningProductStock.get(opening.productId) || 0;
      const after = Math.round((before + opening.quantity) * 1000) / 1000;
      await appendInventoryMovement(tx, {
        storeId: store.id, productId: opening.productId, inventoryLotId: opening.lotId,
        sourceType: 'onboarding_opening_balance', sourceId: `onboarding:${store.id}`, idempotencyKey: `opening:${opening.lotId}`,
        actorId: userId, reason: 'Opening stock recorded at store setup',
        quantityBefore: 0, quantityAfter: opening.quantity, productStockBefore: before, productStockAfter: after,
        metadata: { kind: 'opening_balance' },
      });
      runningProductStock.set(opening.productId, after);
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
      const definition = getPaymentProviderDefinition(provider.code);
      const adapterSelectors = {
        createPaymentFunction: definition.adapterKey,
        capturePaymentFunction: definition.adapterKey,
        refundPaymentFunction: definition.adapterKey,
        getPaymentStatusFunction: definition.adapterKey,
        getRefundStatusFunction: definition.adapterKey,
        cancelPaymentFunction: definition.adapterKey,
        generatePaymentLinkFunction: definition.adapterKey,
        handleWebhookFunction: definition.adapterKey,
      };
      await tx.paymentProvider.upsert({
        where: { code: provider.code },
        // Provider records are deployment-wide: a Store's onboarding may create a
        // missing one, but only a deployment provider administrator may change it.
        update: providerAdministrator ? { name: provider.name, isInstalled: providerInstalled(provider.code), metadata: publicProviderMetadata(provider.metadata) } : {},
        create: {
          ...provider,
          isInstalled: providerInstalled(provider.code),
          publicCheckout: definition.publicCheckout,
          supportsIdempotentCapture: definition.supportsIdempotentCapture,
          ...adapterSelectors,
          metadata: publicProviderMetadata(provider.metadata),
        },
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
      const code = normalizeCouponCode(coupon.code);
      const conflicts = await tx.coupon.findMany({ where: { code: { equals: code, mode: 'insensitive' } }, select: { id: true, storeId: true }, take: 2 });
      if (conflicts.length > 1) throw new Error(`Coupon ${code} matches more than one existing offer`);
      const conflict = conflicts[0];
      if (conflict && conflict.storeId !== store.id) throw new Error(`Coupon ${code} belongs to another store`);
      const existing = conflict;
      if (existing) await tx.coupon.update({ where: { id: existing.id }, data: common });
      else await tx.coupon.create({ data: { ...common, code, currentUses: coupon.currentUses } });
    }
    const readiness = await assessStoreReadiness(tx, store.id);
    if (readiness.ready) {
      await tx.user.update({ where: { id: userId }, data: { onboardingStatus: 'completed' } });
      await recordInitializationReceipt(tx, store.id, userId, 'seeded', readiness.counts);
    }
    return { completed: readiness.ready, reused: false, missing: readiness.missing, counts: launchCounts };
  }, { timeout: 120_000, isolationLevel: 'Serializable' as any });
}

export async function runGroceryOnboarding(
  _root: unknown,
  args: { seed?: unknown },
  context: Context
) {
  await requireFreshCapability(context, 'canManageOnboarding');
  return runGroceryOnboardingTransaction(args.seed ?? seedDefaults, context);
}
