import Link from 'next/link';
import { ChevronDown, Clock, Mail, MapPin, Navigation, Phone } from 'lucide-react';
import { getStore } from '../lib/data/store';
import { getUser } from '../lib/data/user';
import { ContactForm } from '../modules/contact/ContactForm';
import { UrbanButtonLink, UrbanContainer, UrbanPageHeader, UrbanPageShell, formatSlotRange, timezoneLabel } from '../modules/urban/UrbanPrimitives';

const DAY_LABELS: Record<string, string> = { monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday' };
export const metadata = { title: 'Help & contact', description: 'Contact the store and find help with your grocery order.' };
export default async function SupportPage({ searchParams }: { searchParams?: Promise<{ order?: string; topic?: string }> }) {
  const [store, user, params] = await Promise.all([getStore(), getUser(), searchParams ? searchParams : Promise.resolve({} as { order?: string; topic?: string })]);
  const orderNumber = typeof params?.order === 'string' && /^\d{1,10}$/.test(params.order) ? params.order : undefined;
  const hours = (store.openingHours || []).filter((entry) => DAY_LABELS[entry.day]);
  const directions = store.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}` : null;
  const questions = [
    { title: 'An item is missing, different, or not right', text: 'Compare the requested and picked goods on your order page, then send the store a message with the order number and affected item so the team can review it.', href: '#contact-form', label: 'Send a message' },
    { title: 'I need to change an order or time', text: 'Send the store a message with your order number and the change you need. Confirmed delivery addresses and times stay with the order until the store updates them.', href: '#contact-form', label: 'Send a message' },
    { title: 'I need help signing in', text: 'Reset your password from the sign-in page. If you checked out as a guest, find your order from the browser you used, or send the store a message with your order number.', href: '/account/reset', label: 'Reset your password' },
    { title: 'I want to manage my personal information', text: 'Your privacy page provides account export and erasure requests. Notification preferences are available from your account profile.', href: '/account/privacy', label: 'Open privacy controls' },
  ];
  return <UrbanPageShell><UrbanContainer className="space-y-10 py-8 sm:py-10">
    <UrbanPageHeader title="How can we help?" description="Find your order, check its details, or get in touch with the store." breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Help & contact' }]} />
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section aria-labelledby="contact-title" className="sf-dark space-y-5 rounded-[28px] p-6 sm:p-8">
        <h2 id="contact-title" className="sf-subtitle">Contact {store.name}</h2>
        <address className="grid gap-3 not-italic">
          {store.contactPhone ? <a className="flex min-h-14 items-center gap-3 rounded-[var(--sf-radius-md)] bg-[var(--sf-header-2)] px-4 hover:bg-[color-mix(in_oklch,var(--sf-header-2)_80%,white)]" href={`tel:${store.contactPhone}`}><Phone className="h-5 w-5 shrink-0" aria-hidden="true" /><span><span className="block text-xs text-[var(--sf-header-ink-muted)]">Phone</span><span className="font-semibold">{store.contactPhone}</span></span></a> : null}
          {store.contactEmail ? <a className="flex min-h-14 items-center gap-3 rounded-[var(--sf-radius-md)] bg-[var(--sf-header-2)] px-4 hover:bg-[color-mix(in_oklch,var(--sf-header-2)_80%,white)]" href={`mailto:${store.contactEmail}`}><Mail className="h-5 w-5 shrink-0" aria-hidden="true" /><span className="min-w-0"><span className="block text-xs text-[var(--sf-header-ink-muted)]">Email</span><span className="block truncate font-semibold">{store.contactEmail}</span></span></a> : null}
          {store.address ? <p className="flex items-start gap-3 px-1 py-2"><MapPin className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /><span><span className="block text-xs text-[var(--sf-header-ink-muted)]">Store address</span>{store.address}{directions ? <a href={directions} target="_blank" rel="noopener noreferrer" className="mt-1 flex min-h-10 items-center gap-1.5 font-semibold underline underline-offset-4"><Navigation className="h-4 w-4" aria-hidden="true" />Get directions</a> : null}</span></p> : null}
        </address>
        {hours.length ? <div className="space-y-2 px-1">
          <p className="flex items-center gap-2 text-xs text-[var(--sf-header-ink-muted)]"><Clock className="h-4 w-4" aria-hidden="true" />Opening hours · {timezoneLabel(store.timezone)}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">{hours.map((entry) => <div key={entry.day} className="contents"><dt className="text-[var(--sf-header-ink-muted)]">{DAY_LABELS[entry.day]}</dt><dd className="font-semibold">{entry.ranges.length ? entry.ranges.map((range) => formatSlotRange(range.start, range.end)).join(', ') : 'Closed'}</dd></div>)}</dl>
        </div> : null}
        {!store.contactEmail && !store.contactPhone ? <p className="text-sm leading-6 text-[var(--sf-header-ink-muted)]">An online contact method has not been listed. {store.address ? 'Please contact the store at the address above.' : 'Use the contact information on your order confirmation or receipt.'}</p> : null}
        <p className="text-sm leading-6 text-[var(--sf-header-ink-muted)]">For order help, include your order number and the item or delivery issue. Share payment details only through the secure payment form.</p>
      </section>
      <div className="space-y-5">
        <div id="contact-form" className="scroll-mt-28"><ContactForm defaults={{ name: user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : undefined, email: user?.email, orderNumber, topic: typeof params?.topic === 'string' ? params.topic : undefined }} /></div>
        <section aria-labelledby="order-start-title" className="sf-panel space-y-4 p-6 sm:p-8">
          <h2 id="order-start-title" className="sf-subtitle">Start with your order</h2>
          <p className="sf-copy">Your order page shows its current progress, requested and picked goods when available, and pickup check-in when the order is ready.</p>
          <div className="flex flex-wrap gap-3"><UrbanButtonLink href="/account/orders" variant="dark">View my orders</UrbanButtonLink><UrbanButtonLink href="/order-access" variant="ghost">Find a guest order</UrbanButtonLink></div>
          <p className="text-sm leading-6 text-[var(--sf-ink-muted)]">If a payment is still processing or an authorization needs attention, return to the same checkout or order page before trying another payment.</p>
        </section>
        <section aria-labelledby="faq-title">
          <h2 id="faq-title" className="sf-subtitle mb-3">Common questions</h2>
          <div className="divide-y divide-[var(--sf-rule)] rounded-[var(--sf-radius-lg)] border border-[var(--sf-rule)] bg-[var(--sf-card)]">{questions.map((item) => <details key={item.title} className="group px-5">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">{item.title}<ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-[var(--sf-dur-fast)] group-open:rotate-180" aria-hidden="true" /></summary>
            <div className="pb-5"><p className="text-sm leading-7 text-[var(--sf-ink-muted)]">{item.text}</p><Link className="mt-2 inline-flex min-h-10 items-center text-sm font-semibold underline underline-offset-4" href={item.href}>{item.label}</Link></div>
          </details>)}</div>
        </section>
      </div>
    </div>
  </UrbanContainer></UrbanPageShell>;
}
