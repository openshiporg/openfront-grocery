'use client';
import { useState } from 'react';
import Link from 'next/link';
import { UrbanButton } from '../urban/UrbanPrimitives';
export default function MarketCouponCode({ code }: { code: string }) {
  const [message, setMessage] = useState('');
  return <div className="mt-4"><div className="flex flex-wrap items-center gap-3"><code className="rounded border border-dashed border-[var(--sf-rule-strong)] bg-[var(--sf-paper)] px-3 py-2 text-sm font-semibold">{code}</code><UrbanButton type="button" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(code); setMessage('Coupon code copied.'); } catch { setMessage('Copy is unavailable. Select the code above or use the checkout link.'); } }}>Copy code</UrbanButton><Link href={`/checkout?coupon=${encodeURIComponent(code)}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--sf-accent)] underline">Use at checkout</Link></div><p role="status" className="mt-2 text-xs leading-5">{message}</p></div>;
}
