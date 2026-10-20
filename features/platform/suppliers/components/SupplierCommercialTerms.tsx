'use client';

import { useActionState } from 'react';
import { PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformInput, platformSelect } from '@/features/platform/components/platformStyles';
import { centsToInput } from '@/features/lib/moneyInput';
import { updateSupplierMinimumAction, updateSupplierTermsAction, type SupplierFieldState } from '../actions';

const initial: SupplierFieldState = { ok: false, error: null, message: null };

function Outcome({ state }: { state: SupplierFieldState }) {
  if (state.error) return <p role="alert" className="text-xs text-destructive">{state.error}</p>;
  if (state.ok && state.message) return <p role="status" className="text-xs text-emerald-700 dark:text-emerald-400">{state.message}</p>;
  return null;
}

/** Payment terms and minimum order, each saved on its own through the authorized supplier mutations. */
export function SupplierCommercialTerms({ supplierId, paymentTerms, minimumOrderCents, currencyCode }: { supplierId: string; paymentTerms?: string | null; minimumOrderCents: number; currencyCode: string }) {
  const [termsState, termsAction, termsPending] = useActionState(updateSupplierTermsAction, initial);
  const [minimumState, minimumAction, minimumPending] = useActionState(updateSupplierMinimumAction, initial);
  return (
    <div className="space-y-3">
      <form action={termsAction} className="space-y-1.5" aria-busy={termsPending}>
        <input type="hidden" name="supplierId" value={supplierId} />
        <PlatformField label="Payment terms">
          <div className="flex gap-2">
            <select name="paymentTerms" className={platformSelect} defaultValue={termsState.value ?? paymentTerms ?? 'net_30'} disabled={termsPending}>
              <option value="net_30">Net 30</option>
              <option value="net_60">Net 60</option>
              <option value="cod">Cash on delivery</option>
            </select>
            <button type="submit" className={platformButton('secondary', 'md')} disabled={termsPending}>{termsPending ? 'Saving…' : 'Save'}</button>
          </div>
        </PlatformField>
        <Outcome state={termsState} />
      </form>
      <form action={minimumAction} className="space-y-1.5" aria-busy={minimumPending}>
        <input type="hidden" name="supplierId" value={supplierId} />
        <input type="hidden" name="currencyCode" value={currencyCode} />
        <PlatformField label="Minimum order">
          <div className="flex gap-2">
            <span className="relative block min-w-0 flex-1">
              <input name="minimumOrder" inputMode="decimal" required className={`${platformInput} pr-12 tabular-nums`} defaultValue={minimumState.value ?? centsToInput(minimumOrderCents)} disabled={minimumPending} />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{currencyCode}</span>
            </span>
            <button type="submit" className={platformButton('secondary', 'md')} disabled={minimumPending}>{minimumPending ? 'Saving…' : 'Save'}</button>
          </div>
        </PlatformField>
        <Outcome state={minimumState} />
      </form>
    </div>
  );
}
