import { updateStorefrontBrandHueAction } from '../actions';
import {
  DEFAULT_STOREFRONT_BRAND_HUE,
  STOREFRONT_BRAND_PRESETS,
  storefrontAccentColor,
} from '@/features/storefront/lib/branding';

export function StorefrontBrandHueControl({ brandHue }: { brandHue: number | null }) {
  return (
    <div className="p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          Persisted value:{' '}
          <span className="font-medium text-foreground">
            {brandHue === null ? `Not set — default ${DEFAULT_STOREFRONT_BRAND_HUE}° applies` : `${brandHue}°`}
          </span>
        </p>
        {brandHue !== null ? (
          <form action={updateStorefrontBrandHueAction}>
            <input type="hidden" name="brandHue" value="unset" />
            <button type="submit" className="min-h-9 rounded-md border px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Use default
            </button>
          </form>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {STOREFRONT_BRAND_PRESETS.map((preset) => {
          const selected = brandHue === preset.hue;
          return (
            <form key={preset.hue} action={updateStorefrontBrandHueAction}>
              <input type="hidden" name="brandHue" value={preset.hue} />
              <button
                type="submit"
                aria-pressed={selected}
                className={`flex min-h-16 w-full items-center gap-3 rounded-lg border p-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-foreground bg-muted/40' : ''}`}
              >
                <span className="h-8 w-8 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: storefrontAccentColor(preset.hue) }} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{preset.label} · {preset.hue}°</span>
                  <span className="block text-xs text-muted-foreground">{preset.description}</span>
                </span>
                {selected ? <span className="ml-auto text-xs font-medium">Active</span> : null}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
