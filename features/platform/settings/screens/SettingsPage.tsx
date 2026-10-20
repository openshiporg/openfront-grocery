import { StoreLogoControl } from '../components/StoreLogoControl';
import { DeliveryPolicyForm } from '../components/DeliveryPolicyForm';
import { StoreProfileForm } from '../components/StoreProfileForm';
import Link from 'next/link';
import { Building2, CalendarRange, ExternalLink, MapPinned, Palette, Truck, Warehouse } from 'lucide-react';
import {
  PlatformErrorState,
  PlatformFeedback,
  PlatformLinkButton,
  PlatformMetricGrid,
  PlatformPage,
  PlatformStatusBadge,
  PlatformSurface,
  platformButton,
} from '@/features/platform/components/PlatformPrimitives';
import { platformProjections } from '@/features/platform/lib/platformProjections';
import { StorefrontBrandHueControl } from '@/features/platform/settings/components/StorefrontBrandHueControl';
import { isOnboardingPlaceholder } from '@/features/lib/onboarding-placeholders';
import { isDefaultStorefrontLogo } from '@/features/storefront/lib/branding';

const PATH = '/dashboard/platform/settings';

function percentFromBps(value = 0) { return `${(value / 100).toFixed(2).replace(/\.00$/, '')}%`; }
function hasValue(value: unknown) { return value !== null && value !== undefined && value !== '' && !isOnboardingPlaceholder(value); }

export async function SettingsPage() {
  let data: Awaited<ReturnType<typeof platformProjections.settings>> = null;
  let loadError: string | null = null;
  try { data = await platformProjections.settings(); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load settings.'; }
  const settings = data?.settings;
  const requiredFacts = settings ? [settings.name, settings.contactEmail, settings.currencyCode, settings.locale, settings.timezone, settings.countryCode, settings.address] : [];
  const configuredFacts = requiredFacts.filter(hasValue).length;
  // Library/SVG logos theme the storefront from their colour; only an image logo needs a separate accent.
  const customImageLogo = Boolean(settings && !settings.logoIcon && settings.logoUrl && !isDefaultStorefrontLogo(settings.logoUrl));
  const placeholderFields = settings ? ([['Store name', settings.name], ['Contact email', settings.contactEmail], ['Contact phone', settings.contactPhone], ['Address', settings.address], ['Tagline', settings.tagline], ['Policy notes', settings.policyNotes]] as const).filter(([, value]) => isOnboardingPlaceholder(value)).map(([label]) => label) : [];
  const hours = settings?.hours || {};
  const fulfillmentPolicy = typeof hours.fulfillmentPolicy === 'object' && hours.fulfillmentPolicy ? hours.fulfillmentPolicy as Record<string, unknown> : null;
  const active = Boolean(data?.store.isActive && settings?.isActive);

  return (
    <PlatformPage
      title="Store settings"
      breadcrumb="Settings"
      description="Store details, tax and locale, delivery area, logo and schedule."
      actions={<PlatformLinkButton href="/dashboard/store-settings" icon={ExternalLink}>All settings fields</PlatformLinkButton>}
    >
      {loadError || !data || !settings ? <PlatformErrorState description={loadError || 'No Store Settings record is available for the active Store.'} retryHref={PATH} /> : <>
        <PlatformMetricGrid metrics={[
          { label: 'Store state', value: <PlatformStatusBadge status={active ? 'active' : 'failed'} label={active ? 'Active' : 'Inactive'} />, note: data.store.name, tone: active ? 'positive' : 'critical' },
          { label: 'Business profile', value: `${configuredFacts}/${requiredFacts.length}`, note: 'Core public facts configured', tone: configuredFacts < requiredFacts.length ? 'warning' : 'default' },
          { label: 'Default tax rate', value: percentFromBps(settings.taxRateBps), note: 'Products may override' },
          { label: 'Operational records', value: data.counts.products + data.counts.suppliers, note: `${data.counts.products} products · ${data.counts.suppliers} suppliers` },
        ]} />

        {placeholderFields.length ? <PlatformFeedback tone="warning" title="Replace the setup placeholders">
          {placeholderFields.join(', ')} still {placeholderFields.length === 1 ? 'has' : 'have'} setup placeholder text. Shoppers don&apos;t see placeholders; replace them in Store details below.
        </PlatformFeedback> : null}

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-5">
            <PlatformSurface icon={Building2} title="Store details" description="Name, contact details and policies shown to shoppers, plus tax, locale and opening hours.">
              <StoreProfileForm settings={settings as any} />
            </PlatformSurface>

            <PlatformSurface icon={MapPinned} title="Delivery area & order minimums" description="Only addresses matching a postal prefix can authorize delivery payment. Slot fees add to the area fee.">
              <DeliveryPolicyForm policy={(settings as any).deliveryPolicy} currencyCode={settings.currencyCode || data.store.currencyCode} />
            </PlatformSurface>

            <PlatformSurface icon={Palette} title="Store logo" description="Library or custom SVG with its own saved colour, shared by the header, mobile menu and footer. The logo colour also sets the storefront's buttons, links, focus rings, hero and badges.">
              <StoreLogoControl name={settings.name} logoIcon={settings.logoIcon} logoColor={settings.logoColor} logoUrl={settings.logoUrl} />
            </PlatformSurface>

            {customImageLogo ? <PlatformSurface icon={Palette} title="Storefront accent" description="Your logo is an image, so its colour can't theme the storefront. Choose the accent for buttons, links and highlights.">
              <StorefrontBrandHueControl brandHue={settings.brandHue} />
            </PlatformSurface> : null}
          </div>

          <aside className="min-w-0 space-y-5">
            <PlatformSurface icon={Warehouse} title="Fulfillment" description="Slots and spots set up for this store.">
              <dl className="grid grid-cols-2 gap-px bg-border">
                {[
                  ['Delivery slots', data.counts.deliverySlots], ['Pickup slots', data.counts.pickupSlots], ['Parking spots', data.counts.parkingSpots], ['Suppliers', data.counts.suppliers],
                ].map(([label, value]) => (
                  <div key={String(label)} className="bg-card px-4 py-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </PlatformSurface>

            <PlatformSurface icon={CalendarRange} title="Schedule" description="How far ahead shoppers can book and the order cutoff.">
              {fulfillmentPolicy ? (
                <dl className="divide-y text-sm">
                  {[
                    ['Horizon', hasValue(fulfillmentPolicy.horizonDays) ? `${fulfillmentPolicy.horizonDays} days` : null],
                    ['Selection cutoff', hasValue(fulfillmentPolicy.cutoffMinutes) ? `${fulfillmentPolicy.cutoffMinutes} minutes` : null],
                    ['Blackout dates', Array.isArray(fulfillmentPolicy.blackoutDates) ? fulfillmentPolicy.blackoutDates.length : 0],
                    ['Delivery templates', Array.isArray(fulfillmentPolicy.deliveryWindows) ? fulfillmentPolicy.deliveryWindows.length : Array.isArray(fulfillmentPolicy.delivery) ? fulfillmentPolicy.delivery.length : 'Configured shape'],
                    ['Pickup templates', Array.isArray(fulfillmentPolicy.pickupWindows) ? fulfillmentPolicy.pickupWindows.length : Array.isArray(fulfillmentPolicy.pickup) ? fulfillmentPolicy.pickup.length : 'Configured shape'],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-5">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className={`text-right font-medium tabular-nums ${hasValue(value) ? '' : 'font-normal text-muted-foreground italic'}`}>{hasValue(value) ? String(value) : 'Not configured'}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="px-4 py-4 text-sm text-muted-foreground md:px-5">No booking schedule is set. Shoppers can book the delivery and pickup slots you create.</p>}
            </PlatformSurface>

            <div className="rounded-xl border bg-card p-4 shadow-xs">
              <p className="text-xs font-medium text-muted-foreground">Capacity controls</p>
              <div className="mt-2.5 grid gap-2">
                <Link href="/dashboard/platform/delivery" className={platformButton('secondary', 'md', 'justify-start')}><Truck aria-hidden="true" />Delivery slots &amp; routes</Link>
                <Link href="/dashboard/platform/pickup" className={platformButton('secondary', 'md', 'justify-start')}><MapPinned aria-hidden="true" />Pickup slots &amp; parking</Link>
              </div>
            </div>
          </aside>
        </div>
      </>}
    </PlatformPage>
  );
}


export default SettingsPage;
