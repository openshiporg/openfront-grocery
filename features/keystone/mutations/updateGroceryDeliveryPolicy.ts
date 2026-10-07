import { requireFreshCapability } from '../access';
import { requireSessionStore } from '../lib/storeScope';
import { normalizeDeliveryPolicy } from '../lib/deliveryPolicy';
import { enqueueGroceryOutboxEvent } from '../lib/groceryOutbox';
import { randomUUID } from 'node:crypto';
export async function updateGroceryDeliveryPolicy(_root: unknown, {policy}: {policy: unknown}, context: any) {
  await requireFreshCapability(context,'canManageOnboarding');
  const store = await requireSessionStore(context);
  const normalized = normalizeDeliveryPolicy(policy);
  return context.transaction(async (tc: any)=> {
    await tc.prisma.$queryRawUnsafe('SELECT "id" FROM "StoreSettings" WHERE "store" = $1 FOR UPDATE',store.id);
    const old = await tc.prisma.storeSettings.findUnique({where:{storeId:store.id}});
    if (!old) throw new Error('Store settings are unavailable');
    await tc.prisma.storeSettings.update({where:{storeId:store.id},data:{deliveryPolicy:normalized}});
    await enqueueGroceryOutboxEvent(tc.prisma,{storeId:store.id,eventKey:`delivery.policy:${randomUUID()}`,eventType:'delivery.policy.updated',aggregateType:'Store',aggregateId:store.id,occurredAt:new Date().toISOString(),payload:{before:old.deliveryPolicy,after:normalized,actorId:context.session.itemId}});
    return normalized;
  });
}
