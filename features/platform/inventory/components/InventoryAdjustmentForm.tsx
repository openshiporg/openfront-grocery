'use client';

import { useActionState } from 'react';
import { PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformInput, platformSelect } from '@/features/platform/components/platformStyles';
import { adjustInventoryFormTask, type InventoryAdjustmentState } from '@/features/platform/lib/taskActions';

const initial: InventoryAdjustmentState = { ok: false, error: null, message: null };

/** Record a counted quantity for one lot; the outcome stays in the form. */
export function InventoryAdjustmentForm({ lotId, quantity, quantityRemaining, unit }: { lotId: string; quantity: number; quantityRemaining: number; unit: string }) {
  const [state, action, pending] = useActionState(adjustInventoryFormTask, initial);
  return (
    <form action={action} className="grid gap-3 rounded-lg border bg-background p-4 shadow-xs sm:grid-cols-2" aria-busy={pending}>
      <p className="text-sm font-semibold sm:col-span-2">Correct counted quantity</p>
      <input type="hidden" name="inventoryLotId" value={lotId} />
      <PlatformField label="Counted quantity" hint={`Up to ${quantity} ${unit}`}>
        <input name="targetQuantityRemaining" required type="number" step="0.001" min={0} max={quantity} disabled={pending}
          defaultValue={state.values?.targetQuantityRemaining ?? quantityRemaining} className={`${platformInput} tabular-nums`} />
      </PlatformField>
      <PlatformField label="Reason">
        <select name="reason" className={platformSelect} disabled={pending} defaultValue={state.values?.reason ?? 'correction'}>
          <option value="damage">Damage</option><option value="spoilage">Spoilage</option><option value="correction">Correction</option>
        </select>
      </PlatformField>
      <PlatformField label="Note" className="sm:col-span-2">
        <input name="note" maxLength={500} placeholder="Observed condition or count note (optional)" disabled={pending} defaultValue={state.values?.note ?? ''} className={platformInput} />
      </PlatformField>
      {state.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:col-span-2">{state.error}</p> : null}
      {state.ok && state.message ? <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 sm:col-span-2 dark:text-emerald-400">{state.message}</p> : null}
      <button type="submit" disabled={pending} className={platformButton('primary', 'md', 'sm:col-span-2')}>{pending ? 'Saving…' : 'Save count'}</button>
    </form>
  );
}
