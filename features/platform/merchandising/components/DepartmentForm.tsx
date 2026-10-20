'use client';

import { useActionState } from 'react';
import { PlatformCheckboxRow, PlatformField } from '@/features/platform/components/PlatformForm';
import { platformButton, platformCheckbox, platformInput, platformSelect, platformTextarea } from '@/features/platform/components/platformStyles';
import { saveDepartmentAction, type DepartmentActionState } from '../departmentActions';

type Department = { id: string; name: string; handle: string; description?: string | null; imageUrl?: string | null; sortOrder?: number | null; isActive: boolean; temperatureZone?: string | null };

const initial: DepartmentActionState = { ok: false, error: null, message: null };

/** Create (no `department`) or edit a department; the outcome stays in the form. */
export function DepartmentForm({ department }: { department?: Department }) {
  const [state, action, pending] = useActionState(saveDepartmentAction, initial);
  const values = state.values;
  // A successful create clears the form for the next department.
  const formKey = !department && state.ok ? state.message : 'form';
  return (
    <form key={formKey} action={action} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-busy={pending}>
      {department ? <input type="hidden" name="id" value={department.id} /> : null}
      <PlatformField label="Name" className="lg:col-span-2"><input name="name" required maxLength={120} className={platformInput} defaultValue={values?.name ?? department?.name ?? ''} disabled={pending} /></PlatformField>
      <PlatformField label="Handle" hint="Used in the aisle's web address."><input name="handle" required maxLength={80} className={`${platformInput} font-mono`} defaultValue={values?.handle ?? department?.handle ?? ''} disabled={pending} /></PlatformField>
      <PlatformField label="Display order" hint="Lower numbers show first."><input name="sortOrder" inputMode="numeric" className={`${platformInput} tabular-nums`} defaultValue={values?.sortOrder ?? String(department?.sortOrder ?? 0)} disabled={pending} /></PlatformField>
      <PlatformField label="Storage"><select name="temperatureZone" className={platformSelect} defaultValue={values?.temperatureZone ?? department?.temperatureZone ?? 'ambient'} disabled={pending}><option value="ambient">Ambient</option><option value="refrigerated">Refrigerated</option><option value="frozen">Frozen</option></select></PlatformField>
      <PlatformField label="Image address" className="sm:col-span-1 lg:col-span-3"><input name="imageUrl" type="url" maxLength={2048} placeholder="https://" className={platformInput} defaultValue={values?.imageUrl ?? department?.imageUrl ?? ''} disabled={pending} /></PlatformField>
      <PlatformField label="Description" className="sm:col-span-2 lg:col-span-4"><textarea name="description" maxLength={1000} className={`${platformTextarea} min-h-16`} defaultValue={values?.description ?? department?.description ?? ''} disabled={pending} /></PlatformField>
      <PlatformCheckboxRow className="sm:col-span-2 lg:col-span-4"><input type="checkbox" name="isActive" className={platformCheckbox} defaultChecked={values?.isActive ?? department?.isActive ?? true} disabled={pending} /><span>Show this department in the shop</span></PlatformCheckboxRow>
      {state.error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:col-span-2 lg:col-span-4">{state.error}</p> : null}
      {state.ok && state.message ? <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 sm:col-span-2 lg:col-span-4 dark:text-emerald-400">{state.message}</p> : null}
      <div className="sm:col-span-2 lg:col-span-4"><button type="submit" className={platformButton('primary', 'md')} disabled={pending}>{pending ? 'Saving…' : department ? 'Save department' : 'Create department'}</button></div>
    </form>
  );
}
