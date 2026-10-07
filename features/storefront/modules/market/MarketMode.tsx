'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';

export const MARKET_MODE_KEY = 'grocery_fulfillment_preference';
export function MarketModeLink() {
  const [mode, setMode] = useState<string | null>(null);
  useEffect(() => {
    const read = () => { try { const value = localStorage.getItem(MARKET_MODE_KEY); setMode(value === 'pickup' || value === 'delivery' ? value : null); } catch { /* The preference is optional. */ } };
    read(); window.addEventListener('marketModeChanged', read);
    return () => window.removeEventListener('marketModeChanged', read);
  }, []);
  return <Link prefetch={false} href="/fulfillment" className="inline-flex min-h-11 items-center gap-1.5 text-xs sm:text-sm"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{mode ? `${mode === 'pickup' ? 'Pickup' : 'Delivery'} · view times` : 'Delivery or pickup'}</Link>;
}

export function MarketModeChoice({ mode }: { mode: 'delivery' | 'pickup' }) {
  const [saved, setSaved] = useState(false);
  return <button type="button" className="min-h-11 rounded-md bg-[var(--sf-header)] px-4 py-2 text-sm font-semibold text-[var(--sf-header-ink)]" onClick={() => {
    try { localStorage.setItem(MARKET_MODE_KEY, mode); window.dispatchEvent(new Event('marketModeChanged')); setSaved(true); } catch { setSaved(false); }
    window.location.assign(`/products?fulfillment=${mode}`);
  }}>{saved ? 'Opening shop…' : `Shop for ${mode}`}</button>;
}
