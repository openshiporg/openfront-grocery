'use server';
import { revalidatePath } from 'next/cache';
import { storefrontGraphQL, throwGraphQLErrors } from '@/features/storefront/lib/data/graphql';

export async function customerRecurringAction(input: { action: string; subscriptionId?: string; productId?: string; quantity?: number; frequency?: string; firstRunAt?: string; pausedUntil?: string; idempotencyKey: string; approveEachOrder?: boolean }) {
  try {
    const result = await storefrontGraphQL<any>(`mutation($action:String!,$subscriptionId:ID,$productId:ID,$quantity:Int,$frequency:String,$firstRunAt:String,$pausedUntil:String,$idempotencyKey:String!,$approveEachOrder:Boolean){manageGrocerySubscription(action:$action,subscriptionId:$subscriptionId,productId:$productId,quantity:$quantity,frequency:$frequency,firstRunAt:$firstRunAt,pausedUntil:$pausedUntil,idempotencyKey:$idempotencyKey,approveEachOrder:$approveEachOrder){success subscriptionId status runId reused}}`, input, { cache: 'no-store' });
    throwGraphQLErrors(result.errors);
    if (!result.data?.manageGrocerySubscription?.success) throw new Error('The recurring basket update was not confirmed.');
    revalidatePath('/subscriptions'); revalidatePath('/cart');
    return { ok: true as const, data: result.data?.manageGrocerySubscription };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'Recurring order could not be updated' }; }
}
export async function customerLoyaltyRedemption(input: { points: number; idempotencyKey: string }) {
  try {
    const result = await storefrontGraphQL<any>(`mutation($points:Int!,$idempotencyKey:String!){redeemGroceryLoyalty(points:$points,idempotencyKey:$idempotencyKey){success redemptionId couponCode points discountCents balance reused}}`, input, { cache: 'no-store' });
    throwGraphQLErrors(result.errors);
    if (!result.data?.redeemGroceryLoyalty?.success) throw new Error('The reward exchange was not confirmed.');
    revalidatePath('/subscriptions');
    return { ok: true as const, data: result.data?.redeemGroceryLoyalty };
  } catch (error) { return { ok: false as const, error: error instanceof Error ? error.message : 'Reward could not be redeemed' }; }
}
