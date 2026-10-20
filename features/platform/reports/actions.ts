'use server';

import { revalidatePath } from 'next/cache';
import { gql } from 'graphql-request';
import { keystoneClient } from '@/features/platform/lib/platformClient';

export async function getFinancialCloses(page = 1) {
  const result = await keystoneClient(gql`query FinancialCloses($page: Int) { groceryFinancialCloses(page: $page, pageSize: 25) }`, { page });
  if (!result.success) throw new Error(result.error);
  return result.data.groceryFinancialCloses;
}
// Mutations return business errors to the client instead of throwing (production masks thrown messages).
export async function createFinancialClose(input: { startDate: string; endDate: string; timezone: string; note: string; idempotencyKey: string }) {
  const result = await keystoneClient(gql`mutation CloseTradingPeriod($startDate: String!, $endDate: String!, $timezone: String!, $note: String, $idempotencyKey: String!) {
    createGroceryFinancialClose(startDate: $startDate, endDate: $endDate, timezone: $timezone, note: $note, idempotencyKey: $idempotencyKey)
  }`, input);
  if (!result.success) return { ok: false as const, error: result.error || 'The request could not be completed.' };
  revalidatePath('/dashboard/platform/reports'); return { ok: true as const, data: result.data.createGroceryFinancialClose };
}
export async function importSettlementStatement(input: { providerCode: string; statementReference: string; csv: string; idempotencyKey: string }) {
  const result = await keystoneClient(gql`mutation ImportSettlementStatement($providerCode: String!, $statementReference: String!, $csv: String!, $idempotencyKey: String!) {
    importGrocerySettlementStatement(providerCode: $providerCode, statementReference: $statementReference, csv: $csv, idempotencyKey: $idempotencyKey)
  }`, input);
  if (!result.success) return { ok: false as const, error: result.error || 'The request could not be completed.' };
  revalidatePath('/dashboard/platform/reports'); return { ok: true as const, data: result.data.importGrocerySettlementStatement };
}
export async function reviewSettlementEntry(input: { matchId: string; reason: string; idempotencyKey: string }) {
  const result = await keystoneClient(gql`mutation ReviewSettlementEntry($matchId: ID!, $reason: String!, $idempotencyKey: String!) {
    resolveGrocerySettlementMatch(matchId: $matchId, reason: $reason, idempotencyKey: $idempotencyKey)
  }`, input);
  if (!result.success) return { ok: false as const, error: result.error || 'The request could not be completed.' };
  revalidatePath('/dashboard/platform/reports'); return { ok: true as const, data: result.data.resolveGrocerySettlementMatch };
}
export async function exportFinancialClose(closeId: string) {
  const result = await keystoneClient(gql`query ExportFinancialClose($closeId: ID!) { groceryFinancialCloseExport(closeId: $closeId) }`, { closeId });
  if (!result.success) return { ok: false as const, error: result.error || 'The request could not be completed.' };
  return { ok: true as const, data: result.data.groceryFinancialCloseExport };
}
