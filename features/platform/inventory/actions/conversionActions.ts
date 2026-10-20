'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/platform/lib/platformClient';
export async function convertInventoryCasesTask(input: { mode: string; sourceInventoryLotId: string; quantityCases: number; reason: string; conditionNote: string; destinationLocation?: string; idempotencyKey: string; expectedReviewHash?: string }) {
  const result = await keystoneClient<any>('mutation($mode:String!,$sourceInventoryLotId:ID!,$quantityCases:Int!,$reason:String!,$conditionNote:String!,$destinationLocation:String,$idempotencyKey:String!,$expectedReviewHash:String){convertInventoryCases(mode:$mode,sourceInventoryLotId:$sourceInventoryLotId,quantityCases:$quantityCases,reason:$reason,conditionNote:$conditionNote,destinationLocation:$destinationLocation,idempotencyKey:$idempotencyKey,expectedReviewHash:$expectedReviewHash)}', input, { cache: 'no-store' });
  if (!result.success) return { ok: false as const, error: result.error || 'Conversion could not be confirmed. Retry the same physical request.' };
  const data = result.data?.convertInventoryCases;
  if (data?.committed) revalidatePath('/dashboard/platform/inventory');
  return { ok: true as const, data };
}
