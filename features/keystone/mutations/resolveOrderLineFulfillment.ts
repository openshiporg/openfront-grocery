import type { Context } from '.keystone/types';
import { requireFreshCapability } from '../access';
import { resolveActualInTransaction, type FulfillmentActualInput } from '../lib/fulfillmentActuals';
import { withSerializableRetry } from '../utils/serializableTransaction';

export async function resolveOrderLineFulfillment(_root: unknown, input: FulfillmentActualInput, context: Context) {
  const { storeId } = await requireFreshCapability(context, 'canManageOrders');
  if (!storeId || !context.session?.itemId) throw new Error('An active staff store is required');
  return withSerializableRetry(() => context.transaction(async tx => {
    const actual = await resolveActualInTransaction(tx, { storeId, userId: context.session!.itemId }, input);
    return { success: true, fulfillmentId: actual.id, lineItemId: input.lineItemId, resolution: actual.resolution,
      quantityMilli: actual.quantityMilli, subtotalCents: actual.subtotalCents, reused: actual.reused };
  }, { isolationLevel: 'ReadCommitted' as any }));
}
