'use server';
import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
export async function runCatalogImportTask(input: { mode: string; schemaVersion: number; sourceSystem: string; sourceBatchId: string; idempotencyKey: string; csv: string; expectedPayloadHash?: string; expectedReviewHash?: string }) {
  const result = await keystoneClient<any>('mutation($mode:String!,$schemaVersion:Int!,$sourceSystem:String!,$sourceBatchId:String!,$idempotencyKey:String!,$csv:String!,$expectedPayloadHash:String,$expectedReviewHash:String){importGroceryCatalog(mode:$mode,schemaVersion:$schemaVersion,sourceSystem:$sourceSystem,sourceBatchId:$sourceBatchId,idempotencyKey:$idempotencyKey,csv:$csv,expectedPayloadHash:$expectedPayloadHash,expectedReviewHash:$expectedReviewHash)}', input, { cache: 'no-store' });
  if (!result.success) return { ok: false as const, error: result.error || 'Catalog import could not be confirmed; review the same source batch to recover its outcome.' };
  const data = result.data?.importGroceryCatalog;
  if (data?.committed) { revalidatePath('/dashboard/platform/merchandising'); revalidatePath('/dashboard/platform/inventory'); }
  return { ok: true as const, data };
}
