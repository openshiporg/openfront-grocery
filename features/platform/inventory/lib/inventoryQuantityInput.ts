import { quantityMilli } from '@/features/keystone/lib/inventoryMovements';

/** Parse operator-entered stock in the same three-decimal units used by the inventory ledger. */
export function parseInventoryQuantityInput(value: unknown): number {
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'string' && value.trim() === '')) {
    throw new Error('A target stock quantity is required');
  }

  const milli = quantityMilli(value);
  if (milli < 0) throw new Error('Target stock quantity must be non-negative');
  return milli / 1000;
}

export function parseInventoryAdjustmentForm(formData: { get(name: string): unknown }) {
  const inventoryLotId = String(formData.get('inventoryLotId') || '').trim();
  if (!inventoryLotId) throw new Error('A lot is required');
  return {
    inventoryLotId,
    targetQuantityRemaining: parseInventoryQuantityInput(formData.get('targetQuantityRemaining')),
    reason: String(formData.get('reason') || 'correction'),
    note: String(formData.get('note') || ''),
  };
}
