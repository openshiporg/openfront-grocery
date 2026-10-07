'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
export async function prepareDueSubscriptionsTask() {
  const result = await keystoneClient<any>('mutation{processDueGrocerySubscriptions(limit:50){processed results}}', {}, { cache: 'no-store' });
  if (!result.success) return { ok: false as const, error: result.error || 'Due baskets could not be prepared' };
  revalidatePath('/dashboard/platform/subscriptions');
  return { ok: true as const, data: result.data?.processDueGrocerySubscriptions };
}
export async function configureLoyaltyTask(formData: FormData) {
  const input = { name: String(formData.get('name')), earnPointsPer100Cents: Number(formData.get('earnPointsPer100Cents')), redeemPointsPer100Cents: Number(formData.get('redeemPointsPer100Cents')), minimumRedemptionPoints: Number(formData.get('minimumRedemptionPoints')), isActive: formData.get('isActive') === 'on' };
  const result = await keystoneClient<any>('mutation($name:String!,$earnPointsPer100Cents:Int!,$redeemPointsPer100Cents:Int!,$minimumRedemptionPoints:Int!,$isActive:Boolean!){configureGroceryLoyalty(name:$name,earnPointsPer100Cents:$earnPointsPer100Cents,redeemPointsPer100Cents:$redeemPointsPer100Cents,minimumRedemptionPoints:$minimumRedemptionPoints,isActive:$isActive){success programId}}', input, { cache: 'no-store' });
  if (!result.success) throw new Error(result.error || 'Loyalty configuration failed');
  revalidatePath('/dashboard/platform/subscriptions');
}
