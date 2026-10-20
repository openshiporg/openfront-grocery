'use client';

import { useActionState, useState } from 'react';
import { updateDeliveryPolicyAction, type SettingsActionState } from '../actions';
import { PlatformField } from '@/features/platform/components/PlatformForm';
import { PlatformChip } from '@/features/platform/components/PlatformPrimitives';
import { platformButton, platformInput } from '@/features/platform/components/platformStyles';
import { bpsToInput, centsToInput } from '@/features/lib/moneyInput';

const amountFields = [
  ['pickupMinimum', 'pickupMinimumCents', 'Pickup minimum', 'money', 'Smallest pickup basket'],
  ['deliveryMinimum', 'deliveryMinimumCents', 'Delivery minimum', 'money', 'Smallest delivery basket'],
  ['deliveryFee', 'deliveryFeeCents', 'Area delivery fee', 'money', 'Slot fees add to this'],
  ['feeTaxRate', 'feeTaxRateBasisPoints', 'Fee tax', 'percent', 'Applied to delivery fees'],
] as const;

function parsePrefixes(value: string) {
  return Array.from(new Set(value.split(',').map((prefix) => prefix.trim()).filter(Boolean)));
}

const initial: SettingsActionState = { ok: false, error: null, message: null };

/** Amounts are entered in currency units and percent; the server stores exact cents and basis points. */
export function DeliveryPolicyForm({ policy, currencyCode = 'USD' }: { policy: any; currencyCode?: string }) {
  const [state, action, pending] = useActionState(updateDeliveryPolicyAction, initial);
  const [prefixText, setPrefixText] = useState(state.values?.postalPrefixes ?? ((policy?.postalPrefixes || []) as string[]).join(', '));
  const prefixes = parsePrefixes(prefixText);

  return <form action={action} className="space-y-4 p-4 md:p-5" aria-busy={pending}>
    <PlatformField label="Delivery postal prefixes" hint="Comma separated. An address delivers only when its postal code starts with one of these.">
      <input name="postalPrefixes" value={prefixText} onChange={(event) => setPrefixText(event.target.value)} className={`${platformInput} font-mono`} required placeholder="94107, 94110" disabled={pending} />
    </PlatformField>
    {prefixes.length ? (
      <div className="-mt-1 flex flex-wrap items-center gap-1.5" aria-label="Accepted prefixes">
        {prefixes.slice(0, 24).map((prefix) => <PlatformChip key={prefix} className="font-mono">{prefix}</PlatformChip>)}
        {prefixes.length > 24 ? <span className="text-xs text-muted-foreground">+{prefixes.length - 24} more</span> : null}
        <span className="text-xs text-muted-foreground tabular-nums">· {prefixes.length} {prefixes.length === 1 ? 'prefix' : 'prefixes'}</span>
      </div>
    ) : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {amountFields.map(([name, stored, label, kind, hint]) => (
        <PlatformField key={name} label={label} hint={hint}>
          <span className="relative block">
            <input className={`${platformInput} pr-12 tabular-nums`} inputMode="decimal" name={name} required disabled={pending}
              defaultValue={state.values?.[name] ?? (kind === 'percent' ? bpsToInput(policy?.[stored]) : centsToInput(policy?.[stored]))} />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted-foreground">{kind === 'percent' ? '%' : currencyCode}</span>
          </span>
        </PlatformField>
      ))}
    </div>
    {state.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
    {state.ok && state.message ? <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p> : null}
    <div className="flex flex-wrap items-center gap-3 border-t pt-4">
      <button className={platformButton('primary', 'md')} type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save service area and minimums'}</button>
    </div>
  </form>;
}
