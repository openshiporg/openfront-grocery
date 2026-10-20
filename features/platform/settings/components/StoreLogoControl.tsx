'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LogoPicker } from './LogoPicker';
import { updateStoreLogoAction } from '../actions';
import { DEFAULT_STORE_LOGO_ICON, DEFAULT_LIBRARY_LOGO_COLOR, normalizeStoreLogoColor } from '@/features/lib/store-logo';
import { sanitizeStoreLogoSvg } from '@/features/lib/sanitize-store-logo';
import { UrbanStoreLogo } from '@/features/storefront/modules/urban/UrbanStoreLogo';
import { isDefaultStorefrontLogo } from '@/features/storefront/lib/branding';
import { platformButton } from '@/features/platform/components/platformStyles';

export function StoreLogoControl({ name, logoIcon, logoColor, logoUrl }: {
  name: string; logoIcon: string | null; logoColor: string; logoUrl: string;
}) {
  const router = useRouter();
  const [icon, setIcon] = useState(() => sanitizeStoreLogoSvg(logoIcon || ''));
  const usesLibraryDefault = !logoUrl || isDefaultStorefrontLogo(logoUrl);
  const [hue, setHue] = useState(() => !logoIcon && usesLibraryDefault ? DEFAULT_LIBRARY_LOGO_COLOR : normalizeStoreLogoColor(logoColor));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  return (
    <form className="space-y-4 p-4 md:p-5" onSubmit={(event) => {
      event.preventDefault();
      setError('');
      setMessage('');
      const formData = new FormData();
      formData.set('logoIcon', icon);
      formData.set('logoColor', hue);
      startTransition(async () => {
        try {
          const result = await updateStoreLogoAction(formData);
          if (!result.ok) { setError(result.error); return; }
          const saved = result.data;
          setIcon(saved.logoIcon || '');
          setHue(!saved.logoIcon && usesLibraryDefault ? DEFAULT_LIBRARY_LOGO_COLOR : saved.logoColor);
          setMessage('Store logo saved.');
          router.refresh();
        } catch {
          setError('We couldn’t confirm the logo was saved. Reload the page to check before trying again.');
        }
      });
    }}>
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4">
          <div className="grid size-16 place-items-center rounded-md border bg-background" aria-label="Store logo preview">
            <UrbanStoreLogo name={name} logoIcon={icon} logoColor={hue} logoUrl={logoUrl} />
          </div>
          <LogoPicker value={icon || (usesLibraryDefault ? DEFAULT_STORE_LOGO_ICON : '')} hue={hue} onChange={(value) => {
            setIcon(value);
            setMessage('');
          }} />
        </div>
        <p className="text-xs text-muted-foreground">
          Choose from the full 42-logo library or apply a safe custom SVG, then save.
          A custom logo path keeps your original artwork; the default path uses the Juniper mark (Capsule). The logo colour also themes the storefront accents.
        </p>
        <div>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="store-logo-hue" className="text-sm font-medium">Logo colour</label>
            <span className="font-mono text-xs text-muted-foreground">{hue}°</span>
          </div>
          <input id="store-logo-hue" type="range" min="0" max="359" value={hue}
            onChange={(event) => { if (!icon && usesLibraryDefault) setIcon(DEFAULT_STORE_LOGO_ICON); setHue(event.target.value); setMessage(''); }}
            className="mt-3 w-full accent-primary" aria-label="Logo hue rotation" />
        </div>
        <button type="submit" className={platformButton('primary', 'md')}>
          {pending ? 'Saving…' : 'Save store logo'}
        </button>
      </fieldset>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  );
}
