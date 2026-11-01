import type { Context } from '.keystone/types';
import { requirePrismaSuccess } from '../utils/serializableTransaction';

export const DEFAULT_TAX_RATE_BPS = 875;

export function normalizeTaxRateBps(value: unknown) {
  const rate = Number(value);
  if (!Number.isInteger(rate) || rate < 0 || rate > 10_000) {
    throw new Error('Store tax rate must be an integer between 0 and 10000 basis points');
  }
  return rate;
}

export async function getStoreTaxRateBps(context: Context, storeId: string) {
  // A failed read (such as an expired transaction) arrives as an error value;
  // report it as the database failure it is, not as a bad tax rate.
  const settings = requirePrismaSuccess(await context.prisma.storeSettings.findUnique({
    where: { storeId },
    select: { taxRateBps: true },
  }), 'StoreSettings.findUnique');
  if (!settings) throw new Error('Store tax settings are unavailable');
  return normalizeTaxRateBps(settings.taxRateBps);
}

export function calculateTaxCents(subtotalCents: number, taxRateBps: number) {
  return Math.round(subtotalCents * normalizeTaxRateBps(taxRateBps) / 10_000);
}
