import { isOnboardingPlaceholder } from '../../lib/onboarding-placeholders';
import { resolveRollingFulfillmentPolicy } from './rollingFulfillment';

/**
 * What a Store needs before onboarding may be reported complete, read from the
 * persisted data itself (not from a settings row merely existing): a real
 * name, settings, at least one active aisle, a published product in it,
 * sellable stock, and delivery and pickup windows. Read-only.
 */
export async function assessStoreReadiness(tx: any, storeId: string, now = new Date()) {
  const [settings, store, activeDepartments, publishedProducts, sellableLots, deliverySlots, pickupSlots] = await Promise.all([
    tx.storeSettings.findUnique({ where: { storeId }, select: { name: true, hours: true, timezone: true } }),
    tx.store.findUnique({ where: { id: storeId }, select: { name: true, isActive: true } }),
    tx.department.count({ where: { storeId, isActive: true } }),
    tx.product.count({ where: { storeId, status: 'published', departmentRef: { isActive: true } } }),
    tx.inventoryLot.count({ where: { storeId, quantityRemaining: { gt: 0 }, expirationDate: { gt: now }, safetyStatus: 'available', conditionStatus: 'accepted', product: { status: 'published' } } }),
    tx.deliverySlot.count({ where: { storeId, isActive: true } }),
    tx.pickupSlot.count({ where: { storeId, isActive: true } }),
  ]);
  const missing: string[] = [];
  if (!settings) missing.push('Store settings');
  const name = String(settings?.name || store?.name || '').trim();
  if (!name || isOnboardingPlaceholder(name)) missing.push('A store name');
  if (!store?.isActive) missing.push('An active store');
  if (!activeDepartments) missing.push('At least one active aisle');
  if (!publishedProducts) missing.push('A published product in an active aisle');
  if (!sellableLots) missing.push('Sellable, unexpired stock');
  let rolling = { deliveryTemplates: [] as unknown[], pickupTemplates: [] as unknown[] };
  try { rolling = resolveRollingFulfillmentPolicy({ hours: settings?.hours, deliverySlots: [], pickupSlots: [] }); } catch { /* invalid policy counts as missing below */ }
  if (!deliverySlots && !rolling.deliveryTemplates.length) missing.push('Delivery windows');
  if (!pickupSlots && !rolling.pickupTemplates.length) missing.push('Pickup windows');
  return { ready: missing.length === 0, missing, counts: { activeDepartments, publishedProducts, sellableLots, deliverySlots, pickupSlots } };
}
