'use client';

import { useActionState } from 'react';
import { PlatformCheckboxRow, PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformCheckbox, platformInput } from '@/features/platform/components/platformStyles';
import { configureLoyaltyTask, type LoyaltyFormState } from '../actions/recurringTasks';

type Program = { name: string; isActive: boolean; earnPointsPer100Cents: number; redeemPointsPer100Cents: number; minimumRedemptionPoints: number } | null | undefined;

const initial: LoyaltyFormState = { ok: false, error: null, message: null };

export function LoyaltyRulesForm({ program }: { program: Program }) {
  const [state, action, pending] = useActionState(configureLoyaltyTask, initial);
  const value = (key: string, fallback: string) => state.values?.[key] ?? fallback;
  return (
    <form action={action} className="space-y-4 p-4 md:p-5" aria-busy={pending}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <PlatformField label="Program name"><input name="name" required maxLength={120} defaultValue={value('name', program?.name || 'Grocery rewards')} className={platformInput} disabled={pending} /></PlatformField>
        <PlatformField label="Points earned per 1.00 spent" hint="On the final amount paid for goods."><input name="earnPointsPer100Cents" type="number" required min="0" step="1" defaultValue={value('earnPointsPer100Cents', String(program?.earnPointsPer100Cents ?? 1))} className={`${platformInput} tabular-nums`} disabled={pending} /></PlatformField>
        <PlatformField label="Points needed for 1.00 off"><input name="redeemPointsPer100Cents" type="number" required min="1" step="1" defaultValue={value('redeemPointsPer100Cents', String(program?.redeemPointsPer100Cents ?? 100))} className={`${platformInput} tabular-nums`} disabled={pending} /></PlatformField>
        <PlatformField label="Minimum points to redeem"><input name="minimumRedemptionPoints" type="number" required min="1" step="1" defaultValue={value('minimumRedemptionPoints', String(program?.minimumRedemptionPoints ?? 100))} className={`${platformInput} tabular-nums`} disabled={pending} /></PlatformField>
      </div>
      {state.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
      {state.ok && state.message ? <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p> : null}
      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <PlatformCheckboxRow><input name="isActive" type="checkbox" className={platformCheckbox} defaultChecked={state.values ? state.values.isActive === 'on' : program?.isActive ?? false} disabled={pending} />Rewards active</PlatformCheckboxRow>
        <button className={platformButton('primary', 'md')} disabled={pending}>{pending ? 'Saving…' : 'Save loyalty rules'}</button>
        <p className="text-xs text-muted-foreground">Changes apply to future earnings and redemptions.</p>
      </div>
    </form>
  );
}
