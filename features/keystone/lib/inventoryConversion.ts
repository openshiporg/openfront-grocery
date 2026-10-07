import { createHash } from 'node:crypto';
import { quantityMilli } from './inventoryMovements';
import { requirePrismaSuccess } from '../utils/serializableTransaction';

export const conversionHash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function splitWholeCaseCost(cases: number, unitsPerCase: number, costPerCaseCents: number) {
  if (![cases, unitsPerCase, costPerCaseCents].every(value => Number.isSafeInteger(value)) || cases < 1 || unitsPerCase < 2 || costPerCaseCents < 0) throw new Error('Conversion requires whole cases, at least two units per case and integer non-negative case cost');
  const units = BigInt(cases) * BigInt(unitsPerCase), cost = BigInt(cases) * BigInt(costPerCaseCents);
  if (units > BigInt(2147483647) || cost > BigInt(2147483647)) throw new Error('Conversion exceeds supported quantity or cost; use smaller batches');
  const floorCost = cost / units, higherUnits = cost % units;
  const lots = [{ quantity: Number(units - higherUnits), costPerUnitCents: Number(floorCost) }, { quantity: Number(higherUnits), costPerUnitCents: Number(floorCost + BigInt(1)) }].filter(lot => lot.quantity > 0);
  return { quantityCases: cases, unitsPerCase, destinationQuantity: Number(units), totalCostCents: Number(cost), lots };
}

/** Conversion and safety scope discovery share this lock before Product → Lot locks. */
export async function lockInventoryConversionScope(tx: any, storeId: string) {
  requirePrismaSuccess(await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('grocery-inventory-conversion'), hashtext($1))", storeId), 'inventory conversion scope lock');
}

/** Caller owns this lot's Product/InventoryLot locks; opened cases cannot return as cases. */
export async function unconvertedLotCapacityMilli(tx: any, storeId: string, lot: { id: string; quantity: unknown }) {
  let converted = 0;
  for (let skip = 0; ; skip += 100) {
    const page = requirePrismaSuccess(await tx.inventoryConversion.findMany({ where: { storeId, sourceInventoryLotId: lot.id }, orderBy: { id: 'asc' }, take: 100, skip }), 'inventory conversion provenance lookup');
    for (const record of page) converted += quantityMilli(record.quantityCases);
    if (page.length < 100) break;
  }
  const capacity = quantityMilli(lot.quantity) - converted;
  if (!Number.isSafeInteger(capacity) || capacity < 0) throw new Error('Conversion provenance exceeds original received lot quantity');
  return capacity;
}

/** Preserve descendant trace and avoid counting transformed cases plus their units twice. */
export async function expandConvertedLotScope(tx: any, storeId: string, initialLotIds: string[]) {
  const known = new Set(initialLotIds), convertedOutMilli = new Map<string, number>(), conversions: any[] = [];
  let frontier = [...known];
  while (frontier.length) {
    const next = new Set<string>();
    for (let offset = 0; offset < frontier.length; offset += 100) {
      const ids = frontier.slice(offset, offset + 100);
      for (let skip = 0; ; skip += 100) {
        const page = requirePrismaSuccess(await tx.inventoryConversion.findMany({ where: { storeId, sourceInventoryLotId: { in: ids } }, orderBy: { id: 'asc' }, take: 100, skip }), 'converted-lot trace lookup');
        for (const conversion of page) {
          conversions.push(conversion);
          convertedOutMilli.set(conversion.sourceInventoryLotId, (convertedOutMilli.get(conversion.sourceInventoryLotId) || 0) + quantityMilli(conversion.quantityCases));
          for (const lot of conversion.destinations || []) {
            if (!lot.lotId) throw new Error('Conversion provenance is incomplete');
            if (!known.has(lot.lotId)) { known.add(lot.lotId); next.add(lot.lotId); }
          }
        }
        if (page.length < 100) break;
      }
    }
    frontier = [...next];
  }
  return { lotIds: [...known].sort(), convertedOutMilli, conversions };
}
