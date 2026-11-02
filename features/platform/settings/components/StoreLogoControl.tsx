'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Code } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { HUE_PRESETS, LOGO_ICONS } from '../lib/icon-registry';
import { StoreSettingsSaveBar } from './StoreSettingsSaveBar';
import { updateStoreLogoAction } from '../actions';
import { DEFAULT_STORE_LOGO_ICON, DEFAULT_LIBRARY_LOGO_COLOR, normalizeStoreLogoColor } from '@/features/lib/store-logo';
import { sanitizeStoreLogoSvg } from '@/features/lib/sanitize-store-logo';
import { isDefaultStorefrontLogo } from '@/features/storefront/lib/branding';
import { platformButton } from '@/features/platform/components/platformStyles';

export function StoreLogoControl({ logoIcon: savedLogoIcon, logoColor: savedLogoColor, logoUrl }: {
  name: string; logoIcon: string | null; logoColor: string; logoUrl: string;
}) {
  const router = useRouter();
  const [icon, setIcon] = useState(() => sanitizeStoreLogoSvg(savedLogoIcon || ''));
  const usesLibraryDefault = !logoUrl || isDefaultStorefrontLogo(logoUrl);
  const [hue, setHue] = useState(() => !savedLogoIcon && usesLibraryDefault ? DEFAULT_LIBRARY_LOGO_COLOR : normalizeStoreLogoColor(savedLogoColor));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  // Same names as the E-commerce logo block, over this page's form state.
  const logoIcon = icon || (usesLibraryDefault ? DEFAULT_STORE_LOGO_ICON : '')
  const logoColor = hue
  const setLogoIcon = (value: string) => { setIcon(value); setMessage(''); }
  const setLogoColor = (value: string) => { if (!icon && usesLibraryDefault) setIcon(DEFAULT_STORE_LOGO_ICON); setHue(value); setMessage(''); }
  // Find matching preset icon, but don't default to first icon if not found
  const selectedIcon = LOGO_ICONS.find((icon) => icon.lightSvg === logoIcon)

  return (
    <form className="space-y-4 p-4 pb-24 md:p-5" onSubmit={(event) => {
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
        <div className="space-y-6">
      {/* Logo Icon Selector */}
      <div>
        <Label>Logo Icon</Label>
        <div className="mt-2 flex items-center gap-2">
          <Select
            value={selectedIcon?.id || ''}
            onValueChange={(id) => {
              const icon = LOGO_ICONS.find((i) => i.id === id);
              if (icon) setLogoIcon(icon.lightSvg);
            }}
          >
            <SelectPrimitive.Trigger
              className={cn(
                'flex h-12 w-12 shrink-0 rounded-lg border border-input bg-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 p-0 overflow-hidden items-center justify-center'
              )}
            >
              <div
                dangerouslySetInnerHTML={{ __html: logoIcon }}
                style={{ filter: `hue-rotate(${logoColor}deg)` }}
                className="[&>svg]:w-6 [&>svg]:h-6"
              />
            </SelectPrimitive.Trigger>
            <SelectContent className="border-border dark:border-blue-700">
              {LOGO_ICONS.map((icon) => (
                <SelectItem key={icon.id} value={icon.id}>
                  <span className="flex items-center gap-3">
                    <div
                      dangerouslySetInnerHTML={{ __html: icon.lightSvg }}
                      style={{ filter: `hue-rotate(${logoColor}deg)` }}
                      className="[&>svg]:w-6 [&>svg]:h-6"
                    />
                    <span>
                      <span className="block font-medium text-gray-900 dark:text-gray-100">
                        {icon.name}
                      </span>
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* SVG Code Editor Popover */}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12 shrink-0"
                type="button"
              >
                <Code className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(500px,calc(100vw-2rem))]" align="start">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Edit SVG Code</h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Edit the SVG code directly. Changes will be reflected in the icon preview.
                  </p>
                </div>
                <Textarea
                  value={logoIcon}
                  onChange={(e) => setLogoIcon(e.target.value)}
                  className="font-mono text-xs min-h-[300px]"
                  placeholder="<svg>...</svg>"
                />
                <div className="flex items-center gap-2">
                  <div className="text-sm text-muted-foreground">Preview:</div>
                  <div
                    dangerouslySetInnerHTML={{ __html: logoIcon }}
                    style={{ filter: `hue-rotate(${logoColor}deg)` }}
                    className="[&>svg]:w-8 [&>svg]:h-8 flex items-center justify-center p-2 border rounded"
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Logo Color Selector */}
      <div>
        <Label>Logo Color</Label>
        <div className="mt-2">
          <Select
            value={logoColor}
            onValueChange={(value) => setLogoColor(value)}
          >
            <SelectPrimitive.Trigger
              className={cn(
                'flex h-12 w-12 shrink-0 rounded-lg border border-input bg-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 p-0 overflow-hidden items-center justify-center'
              )}
            >
              <SelectValue>
                <div
                  className="w-6 h-6 rounded-full"
                  style={{
                    background: `hsl(${(240 + parseInt(logoColor)) % 360}, 70%, 50%)`
                  }}
                />
              </SelectValue>
            </SelectPrimitive.Trigger>
            <SelectContent className="border-border dark:border-blue-700">
              <div className="grid grid-cols-4 gap-2 p-2">
                {HUE_PRESETS.map((preset) => (
                  <SelectItem
                    key={preset.value}
                    value={preset.value.toString()}
                    className="cursor-pointer p-0 h-12 w-12 flex items-center justify-center [&>span:first-child]:hidden"
                  >
                    <div
                      className="w-6 h-6 rounded-full"
                      style={{
                        background: `hsl(${(240 + preset.value) % 360}, 70%, 50%)`
                      }}
                    />
                  </SelectItem>
                ))}
              </div>
            </SelectContent>
          </Select>
        </div>
      </div>
        </div>
        <StoreSettingsSaveBar
          isSaving={pending}
          button={
            <button type="submit" className={platformButton('primary', 'md')}>
              {pending ? 'Saving…' : 'Save store logo'}
            </button>
          }
        />
      </fieldset>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
    </form>
  );
}
