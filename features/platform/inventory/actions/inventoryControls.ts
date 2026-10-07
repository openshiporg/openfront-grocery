'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

export async function inventorySafetyTask(input: { action: string; inventoryLotIds?: string[]; productId?: string; recallId?: string; reason: string; idempotencyKey: string; evidence?: Record<string, unknown> }) {
  const result = await keystoneClient<any>(`mutation($action:String!,$inventoryLotIds:[ID!],$productId:ID,$recallId:ID,$reason:String!,$idempotencyKey:String!,$evidence:JSON){manageInventorySafety(action:$action,inventoryLotIds:$inventoryLotIds,productId:$productId,recallId:$recallId,reason:$reason,idempotencyKey:$idempotencyKey,evidence:$evidence)}`, input, { cache: 'no-store' });
  if (!result.success) return { ok: false as const, error: result.error || 'Safety action failed' };
  revalidatePath('/dashboard/platform/inventory');
  return { ok: true as const, data: result.data?.manageInventorySafety };
}

export async function inventoryCountTask(input: { action: string; inventoryLotId?: string; countId?: string; quantity?: number; reason: string; idempotencyKey: string }) {
  const result = await keystoneClient<any>(`mutation($action:String!,$inventoryLotId:ID,$countId:ID,$quantity:Float,$reason:String!,$idempotencyKey:String!){manageInventoryCount(action:$action,inventoryLotId:$inventoryLotId,countId:$countId,quantity:$quantity,reason:$reason,idempotencyKey:$idempotencyKey)}`, input, { cache: 'no-store' });
  if (!result.success) return { ok: false as const, error: result.error || 'Count action failed' };
  revalidatePath('/dashboard/platform/inventory');
  return { ok: true as const, data: result.data?.manageInventoryCount };
}
