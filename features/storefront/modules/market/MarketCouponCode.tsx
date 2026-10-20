'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy } from 'lucide-react';
import type { GroceryDeal } from '../../types';
import { formatMoney } from '../../lib/marketFormatting';

export default function MarketCouponCode({ code }: { code: string }) {
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  return <div className="mt-4">
    <div className="flex flex-wrap items-center gap-2">
      <code className="inline-flex min-h-10 items-center rounded-[var(--sf-radius-sm)] border-2 border-dashed border-[var(--sf-rule-strong)] bg-[var(--sf-paper)] px-3 font-[family-name:var(--sf-font-mono)] text-sm font-semibold tracking-[0.06em]">{code}</code>
      <button
        type="button"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-semibold ring-1 ring-inset ring-[var(--sf-rule-strong)] transition-shadow hover:ring-[var(--sf-ink)]"
        onClick={async () => {
          try { await navigator.clipboard.writeText(code); setCopied(true); setMessage('Coupon code copied.'); window.setTimeout(() => setCopied(false), 1800); }
          catch { setMessage('Copy is unavailable. Select the code above or use the checkout link.'); }
        }}
      >
        {copied ? <Check className="h-4 w-4 text-[var(--sf-sage)]" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}
      </button>
      <Link href={`/checkout?coupon=${encodeURIComponent(code)}`} className="inline-flex min-h-10 items-center rounded-full px-2 text-[0.8125rem] font-semibold text-[var(--sf-accent)] underline decoration-2 underline-offset-4">Use at checkout</Link>
    </div>
    <p role="status" className="sr-only">{message}</p>
  </div>;
}

function dealHeadline(deal: GroceryDeal) {
  if (deal.discountType === 'percentage') return { big: `${deal.discountValue}%`, small: 'off' };
  if (deal.discountType === 'bogo') return { big: 'BOGO', small: 'buy one, get one' };
  return { big: formatMoney(deal.discountValue).replace(/\.00$/, ''), small: 'off' };
}

/** A coupon rendered as a clipped ticket. Terms come straight from the published coupon. */
export function DealTicket({ deal }: { deal: GroceryDeal }) {
  const headline = dealHeadline(deal);
  return <article className="sf-ticket">
    <div className="sf-ticket-stub">
      <p className="text-[0.6875rem] font-bold">{deal.type === 'coupon' ? 'Coupon' : 'Special'}</p>
      <p className="font-[family-name:var(--sf-font-display)] text-[2.4rem] font-extrabold leading-[0.9] tracking-[-0.05em]">{headline.big}</p>
      <p className="text-sm font-semibold">{headline.small}</p>
    </div>
    <div className="min-w-0 p-5">
      <h3 className="text-lg font-bold leading-snug tracking-[-0.02em]">{deal.description || 'Eligibility is checked against your basket at checkout.'}</h3>
      <dl className="mt-3 grid gap-1 text-[0.8125rem] text-[var(--sf-ink-muted)]">
        <div className="flex gap-1.5"><dt>Minimum basket:</dt><dd className="font-semibold text-[var(--sf-ink)]">{deal.minimumPurchase ? formatMoney(deal.minimumPurchase) : 'none listed'}</dd></div>
        {deal.excludedProductNames?.length ? <div className="flex gap-1.5"><dt>Not valid on:</dt><dd className="font-semibold text-[var(--sf-ink)]">{deal.excludedProductNames.join(', ')}</dd></div> : null}
        <div className="flex gap-1.5"><dt>Valid until:</dt><dd className="font-semibold text-[var(--sf-ink)]">{deal.expiresAt ? new Date(deal.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'no end date listed'}</dd></div>
      </dl>
      {deal.discountCode ? <MarketCouponCode code={deal.discountCode} /> : null}
    </div>
  </article>;
}
