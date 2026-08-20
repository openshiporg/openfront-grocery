import Link from 'next/link';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { PlatformErrorState, PlatformMetricGrid, PlatformStatusBadge, PlatformSurface, PlatformTruthNotice } from '@/features/platform/components/PlatformPrimitives';
import { platformProjections } from '@/features/platform/lib/platformProjections';
import { StorefrontBrandHueControl } from '@/features/platform/settings/components/StorefrontBrandHueControl';

function percentFromBps(value = 0) { return `${(value / 100).toFixed(2).replace(/\.00$/, '')}%`; }
function hasValue(value: unknown) { return value !== null && value !== undefined && value !== ''; }

export async function SettingsPage() {
  let data: Awaited<ReturnType<typeof platformProjections.settings>> = null;
  let loadError: string | null = null;
  try { data = await platformProjections.settings(); } catch (error) { loadError = error instanceof Error ? error.message : 'Unable to load settings.'; }
  const settings = data?.settings;
  const requiredFacts = settings ? [settings.name, settings.contactEmail, settings.currencyCode, settings.locale, settings.timezone, settings.countryCode, settings.address] : [];
  const configuredFacts = requiredFacts.filter(hasValue).length;
  const hours = settings?.hours || {};
  const fulfillmentPolicy = typeof hours.fulfillmentPolicy === 'object' && hours.fulfillmentPolicy ? hours.fulfillmentPolicy as Record<string, unknown> : null;
  const breadcrumbs = [{ type: 'link' as const, label: 'Dashboard', href: '/dashboard' }, { type: 'page' as const, label: 'Platform' }, { type: 'page' as const, label: 'Settings' }];
  const header = <div><h1 className="text-2xl font-semibold tracking-tight">Store settings</h1><p className="mt-1 text-sm text-muted-foreground">Read the active Store policy, public business profile, and fulfillment configuration from one truthful surface.</p></div>;

  return <PageContainer title="Settings" header={header} breadcrumbs={breadcrumbs}><div className="space-y-5 px-4 pb-8 md:px-6">
    {loadError || !data || !settings ? <PlatformErrorState description={loadError || 'No Store Settings record is available for the active Store.'} /> : <>
      <PlatformMetricGrid metrics={[{ label: 'Store state', value: <PlatformStatusBadge status={data.store.isActive && settings.isActive ? 'active' : 'failed'} label={data.store.isActive && settings.isActive ? 'Active' : 'Inactive'} />, note: data.store.name }, { label: 'Business profile', value: `${configuredFacts}/${requiredFacts.length}`, note: 'Core public facts configured' }, { label: 'Tax policy', value: percentFromBps(settings.taxRateBps), note: 'Store-wide bounded launch rate' }, { label: 'Operational records', value: data.counts.products + data.counts.suppliers, note: `${data.counts.products} products · ${data.counts.suppliers} suppliers` }]} />
      <PlatformTruthNotice title="Policy boundary">These values are configuration facts, not legal or regulatory certification. The Store-wide tax rate is not a tax engine; hours/capacity are not labor, cold-chain, or multidimensional fulfillment planning.</PlatformTruthNotice>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,.9fr)]">
        <div className="space-y-5">
          <PlatformSurface title="Business profile" description="Public identity and contact facts used by the Storefront.">
            <dl className="grid gap-px bg-border sm:grid-cols-2"><Setting label="Store name" value={settings.name} /><Setting label="Tagline" value={settings.tagline} /><Setting label="Homepage title" value={settings.homepageTitle} /><Setting label="Contact email" value={settings.contactEmail} /><Setting label="Contact phone" value={settings.contactPhone} /><Setting label="Address" value={settings.address} /><Setting label="Logo path" value={settings.logoUrl} /><Setting label="Country" value={settings.countryCode} /></dl>
          </PlatformSurface>
          <PlatformSurface title="Storefront brand" description="Choose a constrained hue preset for storefront accents and installed-app theme color. Unset uses the explicit 35° default without persisting an invented value.">
            <StorefrontBrandHueControl brandHue={settings.brandHue} />
          </PlatformSurface>
          <PlatformSurface title="Commerce policy" description="Server-owned locale, currency, timezone, and tax facts.">
            <dl className="grid gap-px bg-border sm:grid-cols-2"><Setting label="Currency" value={settings.currencyCode} /><Setting label="Locale" value={settings.locale} /><Setting label="Timezone" value={settings.timezone} /><Setting label="Tax rate" value={`${settings.taxRateBps} bps · ${percentFromBps(settings.taxRateBps)}`} /></dl>
          </PlatformSurface>
        </div>
        <div className="space-y-5">
          <PlatformSurface title="Fulfillment footprint" description="Current relational configuration counts—not available capacity.">
            <dl className="grid grid-cols-2 gap-px bg-border"><Setting label="Delivery occurrences" value={data.counts.deliverySlots} /><Setting label="Pickup occurrences" value={data.counts.pickupSlots} /><Setting label="Parking spots" value={data.counts.parkingSpots} /><Setting label="Suppliers" value={data.counts.suppliers} /></dl>
          </PlatformSurface>
          <PlatformSurface title="Rolling fulfillment policy" description="The active policy shape is shown without claiming availability; live rows still win.">
            {fulfillmentPolicy ? <dl className="grid gap-px bg-border"><Setting label="Horizon" value={hasValue(fulfillmentPolicy.horizonDays) ? `${fulfillmentPolicy.horizonDays} days` : 'Not configured'} /><Setting label="Selection cutoff" value={hasValue(fulfillmentPolicy.cutoffMinutes) ? `${fulfillmentPolicy.cutoffMinutes} minutes` : 'Not configured'} /><Setting label="Blackout dates" value={Array.isArray(fulfillmentPolicy.blackoutDates) ? fulfillmentPolicy.blackoutDates.length : 0} /><Setting label="Delivery templates" value={Array.isArray(fulfillmentPolicy.deliveryWindows) ? fulfillmentPolicy.deliveryWindows.length : Array.isArray(fulfillmentPolicy.delivery) ? fulfillmentPolicy.delivery.length : 'Configured shape'} /><Setting label="Pickup templates" value={Array.isArray(fulfillmentPolicy.pickupWindows) ? fulfillmentPolicy.pickupWindows.length : Array.isArray(fulfillmentPolicy.pickup) ? fulfillmentPolicy.pickup.length : 'Configured shape'} /></dl> : <div className="p-4 text-sm text-muted-foreground">No explicit rolling policy key is present. The backend may use its bounded legacy-slot compatibility policy.</div>}
          </PlatformSurface>
          <div className="flex flex-wrap gap-2"><Link href="/dashboard/store-settings" className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open Store Settings model</Link><Link href="/dashboard/platform/delivery" className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Delivery capacity</Link><Link href="/dashboard/platform/pickup" className="inline-flex min-h-10 items-center rounded-md border px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Pickup capacity</Link></div>
        </div>
      </div>
    </>}
  </div></PageContainer>;
}

function Setting({ label, value }: { label: string; value: unknown }) {
  return <div className="min-w-0 bg-background p-4"><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{hasValue(value) ? String(value) : 'Not configured'}</dd></div>;
}

export default SettingsPage;
