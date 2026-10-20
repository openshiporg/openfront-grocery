'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/platform/lib/platformClient';
export async function prepareDueSubscriptionsTask() {
  const result = await keystoneClient<any>('mutation{processDueGrocerySubscriptions(limit:50){processed results}}', {}, { cache: 'no-store' });
  if (!result.success) return { ok: false as const, error: result.error || 'Due baskets could not be prepared' };
  revalidatePath('/dashboard/platform/subscriptions');
  return { ok: true as const, data: result.data?.processDueGrocerySubscriptions };
}
export type LoyaltyFormState = { ok: boolean; error: string | null; message: string | null; values?: Record<string, string> };

/** Loyalty rules report validation and save errors back to the form, keeping what was entered. */
export async function configureLoyaltyTask(_previous: LoyaltyFormState, formData: FormData): Promise<LoyaltyFormState> {
  const values = Object.fromEntries(['name', 'earnPointsPer100Cents', 'redeemPointsPer100Cents', 'minimumRedemptionPoints'].map((key) => [key, String(formData.get(key) ?? '').trim()]));
  values.isActive = formData.get('isActive') === 'on' ? 'on' : '';
  const whole = (value: string, min: number) => /^\d{1,9}$/.test(value) && Number(value) >= min;
  if (!values.name || values.name.length > 120) return { ok: false, error: 'Enter a program name of up to 120 characters.', message: null, values };
  if (!whole(values.earnPointsPer100Cents, 0)) return { ok: false, error: 'Points earned per 1.00 is a whole number of 0 or more.', message: null, values };
  if (!whole(values.redeemPointsPer100Cents, 1) || !whole(values.minimumRedemptionPoints, 1)) return { ok: false, error: 'Redemption points are whole numbers of at least 1.', message: null, values };
  const input = { name: values.name, earnPointsPer100Cents: Number(values.earnPointsPer100Cents), redeemPointsPer100Cents: Number(values.redeemPointsPer100Cents), minimumRedemptionPoints: Number(values.minimumRedemptionPoints), isActive: values.isActive === 'on' };
  const result = await keystoneClient<any>('mutation($name:String!,$earnPointsPer100Cents:Int!,$redeemPointsPer100Cents:Int!,$minimumRedemptionPoints:Int!,$isActive:Boolean!){configureGroceryLoyalty(name:$name,earnPointsPer100Cents:$earnPointsPer100Cents,redeemPointsPer100Cents:$redeemPointsPer100Cents,minimumRedemptionPoints:$minimumRedemptionPoints,isActive:$isActive){success programId}}', input, { cache: 'no-store' });
  if (!result.success) return { ok: false, error: result.error || 'Loyalty rules could not be saved.', message: null, values };
  revalidatePath('/dashboard/platform/subscriptions');
  return { ok: true, error: null, message: 'Loyalty rules saved. They apply to future earnings and redemptions.', values };
}
