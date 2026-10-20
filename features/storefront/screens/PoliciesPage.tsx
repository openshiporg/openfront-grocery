import Link from 'next/link';
import { CalendarClock, CreditCard, MessageCircleWarning, Receipt, Repeat, Shuffle } from 'lucide-react';
import { getStore } from '../lib/data/store';
import { UrbanContainer, UrbanPageHeader, UrbanPageShell } from '../modules/urban/UrbanPrimitives';
export const metadata = { title: 'Order information', description: 'How grocery estimates, picking, payment and order help work.' };
const sections = [
  { Icon: Receipt, title: 'Prices & estimates', text: 'Your basket is an estimate. Checkout checks current prices, your coupon, delivery eligibility and fees before you confirm. Products sold by weight or volume are finalized using the amount actually picked.' },
  { Icon: Shuffle, title: 'Substitutions & unavailable items', text: 'Set preferences for individual items in your basket and choose a checkout preference. If an item cannot be supplied, your order can show it as short or substituted. When the store proposes a replacement, approve or decline it on your order page.' },
  { Icon: CreditCard, title: 'Authorization & final payment', text: 'Payment authorization and the final charge are separate steps. The store finalizes the picked goods before capture. If the total increases beyond the original authorization, you must approve another authorization. A pending update is not confirmation of a charge or refund.' },
  { Icon: CalendarClock, title: 'Delivery & pickup', text: 'Choose an available time at checkout. Your accepted order keeps its confirmed address and time. Check the order page for progress and pickup instructions; contact the store to request changes or report a delivery issue.' },
  { Icon: MessageCircleWarning, title: 'Problems with an order', text: 'If something is missing, incorrect or unsuitable, contact the store with the order number and affected item. The store reviews return and refund requests. A cancelled or returned status alone does not confirm that a refund has completed.' },
  { Icon: Repeat, title: 'Recurring baskets & rewards', text: 'Recurring baskets prepare your regular groceries for review. Each checkout requires your approval of current prices, fulfillment and payment. When rewards are active, your account shows the points available and the current exchange terms.' },
];
export default async function PoliciesPage() {
  const store = await getStore().catch(() => null);
  const notes = store?.policyNotes?.trim();
  return <UrbanPageShell><UrbanContainer className="space-y-10 py-8 sm:py-10">
    <UrbanPageHeader title="Know what to expect." description="How your basket becomes an order: estimates, picking, payment and help." breadcrumb={[{ label: 'Help', href: '/support' }, { label: 'Order information' }]} />
    {notes ? <section aria-labelledby="store-policy-title" className="sf-panel space-y-3 p-6 sm:p-8">
      <h2 id="store-policy-title" className="sf-subtitle">{store?.name ? `${store.name} policies` : 'Store policies'}</h2>
      <div className="space-y-3 text-[0.9375rem] leading-7 text-[var(--sf-ink-muted)]">{notes.split(/\n{2,}/).map((paragraph, index) => <p key={index} className="whitespace-pre-line">{paragraph}</p>)}</div>
    </section> : null}
    <ol className="grid gap-x-10 gap-y-2 md:grid-cols-2">{sections.map(({ Icon, title, text }) => <li key={title} className="flex gap-4 border-t border-[var(--sf-rule)] py-6">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--sf-paper-2)] text-[var(--sf-sage)]"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <div><h2 className="text-lg font-bold tracking-[-0.02em]">{title}</h2><p className="mt-2 text-[0.9375rem] leading-7 text-[var(--sf-ink-muted)]">{text}</p></div>
    </li>)}</ol>
    <nav aria-label="More help" className="flex flex-wrap gap-2"><Link href="/support" className="sf-chip">Contact the store</Link><Link href="/account/privacy" className="sf-chip">Privacy controls</Link><Link href="/fulfillment" className="sf-chip">Delivery & pickup times</Link></nav>
  </UrbanContainer></UrbanPageShell>;
}
