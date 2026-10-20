'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { MapPin, Store, Truck } from 'lucide-react';

export const MARKET_MODE_KEY = 'grocery_fulfillment_preference';

function useMarketMode() {
  const [mode, setMode] = useState<'pickup' | 'delivery' | null>(null);
  useEffect(() => {
    const read = () => { try { const value = localStorage.getItem(MARKET_MODE_KEY); setMode(value === 'pickup' || value === 'delivery' ? value : null); } catch { /* The preference is optional. */ } };
    read(); window.addEventListener('marketModeChanged', read);
    return () => window.removeEventListener('marketModeChanged', read);
  }, []);
  return mode;
}

export function MarketModeLink({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const mode = useMarketMode();
  const Icon = mode === 'pickup' ? Store : mode === 'delivery' ? Truck : MapPin;
  return (
    <Link
      prefetch={false}
      href="/fulfillment"
      className={`inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap font-medium ${tone === 'dark' ? 'text-[var(--sf-header-ink)] hover:underline hover:underline-offset-4' : 'rounded-full px-3 text-sm text-[var(--sf-ink)] hover:bg-[var(--sf-paper-2)]'}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {mode ? `${mode === 'pickup' ? 'Pickup' : 'Delivery'} · see times` : 'Delivery or pickup times'}
    </Link>
  );
}

export function MarketModeChoice({ mode, className = '', variant = 'dark' }: { mode: 'delivery' | 'pickup'; className?: string; variant?: 'dark' | 'light' }) {
  const [saved, setSaved] = useState(false);
  const Icon = mode === 'pickup' ? Store : Truck;
  const tone = variant === 'dark'
    ? 'bg-[var(--sf-ink)] text-[var(--sf-paper)] hover:bg-[var(--sf-header-2)]'
    : 'bg-[var(--sf-card)] text-[var(--sf-ink)] shadow-[var(--sf-shadow-1)] hover:shadow-[var(--sf-shadow-2)]';
  return <button type="button" className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-[background-color,box-shadow] ${tone} ${className}`} onClick={() => {
    try { localStorage.setItem(MARKET_MODE_KEY, mode); window.dispatchEvent(new Event('marketModeChanged')); setSaved(true); } catch { setSaved(false); }
    window.location.assign(`/products?fulfillment=${mode}`);
  }}><Icon className="h-4 w-4" aria-hidden="true" />{saved ? 'Opening the shop…' : `Shop for ${mode}`}</button>;
}
