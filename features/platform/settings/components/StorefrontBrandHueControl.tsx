'use client';

import { useActionState } from 'react';
import { updateStorefrontBrandHueAction, type SettingsActionState } from '../actions';
import {
  DEFAULT_STOREFRONT_BRAND_HUE,
  STOREFRONT_BRAND_PRESETS,
  storefrontAccentColor,
} from '@/features/storefront/lib/branding';
import { Check } from 'lucide-react';
import { platformButton } from '@/features/platform/components/platformStyles';

const initial: SettingsActionState = { ok: false, error: null, message: null };

export function StorefrontBrandHueControl({ brandHue }: { brandHue: number | null }) {
  const [state, action, pending] = useActionState(updateStorefrontBrandHueAction, initial);
  return (
    <div className="p-4 md:p-5" aria-busy={pending}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
        <p className="text-muted-foreground">
          Current accent:{' '}
          <span className="font-medium text-foreground">
            {brandHue === null ? `Default (${DEFAULT_STOREFRONT_BRAND_HUE}°)` : `${brandHue}°`}
          </span>
        </p>
        {brandHue !== null ? (
          <form action={action}>
            <input type="hidden" name="brandHue" value="unset" />
            <button type="submit" disabled={pending} className={platformButton('secondary', 'sm')}>
              Use default
            </button>
          </form>
        ) : null}
      </div>
      {state.error ? <p role="alert" className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
      {state.ok && state.message ? <p role="status" className="mb-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
        {STOREFRONT_BRAND_PRESETS.map((preset) => {
          const selected = brandHue === preset.hue;
          return (
            <form key={preset.hue} action={action}>
              <input type="hidden" name="brandHue" value={preset.hue} />
              <button
                type="submit"
                disabled={pending}
                aria-pressed={selected}
                className={`flex min-h-16 w-full items-center gap-3 rounded-lg border bg-background p-3 text-left shadow-xs outline-none transition-colors hover:bg-muted/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 ${selected ? 'border-foreground/60 ring-1 ring-foreground/20' : ''}`}
              >
                <span className="size-9 shrink-0 rounded-lg shadow-inner ring-1 ring-black/10 ring-inset" style={{ backgroundColor: storefrontAccentColor(preset.hue) }} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{preset.label} · {preset.hue}°</span>
                  <span className="block text-xs text-muted-foreground">{preset.description}</span>
                </span>
                {selected ? <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-background"><Check className="size-3.5" aria-hidden="true" /><span className="sr-only">Active</span></span> : null}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
