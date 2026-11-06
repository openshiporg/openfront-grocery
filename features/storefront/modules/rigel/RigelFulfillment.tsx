'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronDown, CalendarDays, Store, Truck } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import type { DeliveryWindow } from '../../types';
import { formatMoney, formatSlotDay } from '../../lib/marketFormatting';
import { MARKET_MODE_KEY } from '../market/MarketMode';

/** The shopper's preferred window. Checkout re-validates it against live capacity. */
const WINDOW_KEY = 'grocery_preferred_window';

type Mode = 'delivery' | 'pickup';
type FulfillmentState = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  /** Windows for the current mode, as published by the store (null when they could not be read). */
  windows: DeliveryWindow[] | null;
  selected: DeliveryWindow | null;
  select: (windowId: string) => void;
  today: string | null;
  checkoutHref: string;
};

const FulfillmentContext = createContext<FulfillmentState | null>(null);

export function RigelFulfillmentProvider({ delivery, pickup, today, children }: { delivery: DeliveryWindow[] | null; pickup: DeliveryWindow[] | null; today: string | null; children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>('delivery');
  const [windowId, setWindowId] = useState('');
  useEffect(() => {
    const read = () => {
      try {
        const saved = localStorage.getItem(MARKET_MODE_KEY);
        if (saved === 'delivery' || saved === 'pickup') setModeState(saved);
        setWindowId(localStorage.getItem(WINDOW_KEY) || '');
      } catch { /* Preferences are optional. */ }
    };
    read();
    window.addEventListener('marketModeChanged', read);
    return () => window.removeEventListener('marketModeChanged', read);
  }, []);
  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    try { localStorage.setItem(MARKET_MODE_KEY, next); window.dispatchEvent(new Event('marketModeChanged')); } catch { /* optional */ }
  }, []);
  const select = useCallback((id: string) => {
    setWindowId(id);
    try { localStorage.setItem(WINDOW_KEY, id); window.dispatchEvent(new Event('marketModeChanged')); } catch { /* optional */ }
  }, []);
  const windows = mode === 'pickup' ? pickup : delivery;
  const selected = useMemo(() => {
    const open = (windows || []).filter((entry) => entry.available);
    return open.find((entry) => entry.id === windowId) || open[0] || null;
  }, [windows, windowId]);
  const checkoutHref = `/checkout?${new URLSearchParams({ fulfillment: mode, ...(selected ? { window: selected.id } : {}) }).toString()}`;
  const value = { mode, setMode, windows, selected, select, today, checkoutHref };
  return <FulfillmentContext.Provider value={value}>{children}</FulfillmentContext.Provider>;
}

export function useRigelFulfillment() {
  const value = useContext(FulfillmentContext);
  if (!value) throw new Error('Fulfillment controls require RigelFulfillmentProvider');
  return value;
}

function clock(time: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return time;
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]}${hours < 12 ? 'am' : 'pm'}`;
}
export function slotLabel(window: Pick<DeliveryWindow, 'startTime' | 'endTime'>) {
  return `${clock(window.startTime)} - ${clock(window.endTime)}`;
}
export function shortSlotLabel(window: Pick<DeliveryWindow, 'startTime' | 'endTime'>) {
  return `${clock(window.startTime).replace(':00', '')}–${clock(window.endTime).replace(':00', '')}`;
}
export function relativeDay(date: string, today: string | null, long = false) {
  if (today && date === today) return 'Today';
  if (today) {
    const next = new Date(`${today}T12:00:00`);
    next.setDate(next.getDate() + 1);
    const tomorrow = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
    if (date === tomorrow) return long ? `Tomorrow, ${new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Tomorrow';
  }
  return formatSlotDay(date);
}

export function RigelModeToggle({ variant = 'sidebar' }: { variant?: 'sidebar' | 'rail' | 'phone' }) {
  const { mode, setMode } = useRigelFulfillment();
  const tone = variant === 'rail' ? 'rg-toggle rg-toggle-solid' : variant === 'phone' ? 'rg-toggle rg-toggle-phone' : 'rg-toggle';
  return (
    <div role="group" aria-label="Delivery or pickup" className={tone}>
      {(['delivery', 'pickup'] as const).map((value) => {
        const Icon = value === 'delivery' ? Truck : Store;
        const active = mode === value;
        return (
          <button key={value} type="button" aria-pressed={active} onClick={() => setMode(value)}>
            {variant === 'phone' ? null : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            {value === 'delivery' ? 'Delivery' : 'Pickup'}
            {variant === 'phone' ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            {variant === 'rail' && active ? <span className="grid h-4 w-4 place-items-center rounded-full bg-[var(--sf-accent-ink)] text-[var(--sf-accent)]"><Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" /></span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** The next few open windows for the chosen mode; picking one carries it to checkout. */
export function RigelSlotList({ name, limit = 3, compact = false }: { name: string; limit?: number; compact?: boolean }) {
  const { windows, selected, select, today, mode } = useRigelFulfillment();
  if (!windows) return <p className="text-[0.8125rem] leading-5 text-[var(--sf-ink-muted)]">Times couldn’t be loaded right now. You’ll choose one at checkout.</p>;
  const open = windows.filter((entry) => entry.available).slice(0, limit);
  if (!open.length) return <p className="text-[0.8125rem] leading-5 text-[var(--sf-ink-muted)]">No open {mode} times this week.</p>;
  return (
    <fieldset className={compact ? 'grid gap-1.5' : 'grid gap-2'}>
      <legend className="sr-only">{mode === 'pickup' ? 'Pickup time' : 'Delivery time'}</legend>
      {open.map((entry) => {
        const day = relativeDay(entry.date, today);
        const fee = mode === 'pickup' ? 'No fee' : entry.fee ? `${formatMoney(entry.fee)} fee` : 'Free';
        const remaining = typeof entry.remainingCapacity === 'number' && entry.remainingCapacity <= 3 ? ` · ${entry.remainingCapacity} left` : '';
        return (
          <label key={entry.id} className="rg-slot">
            <input type="radio" name={name} checked={selected?.id === entry.id} onChange={() => select(entry.id)} />
            <span className="min-w-0">
              <span className="block text-[0.875rem] font-medium leading-5 tabular-nums">{slotLabel(entry)}</span>
              <span className="block text-xs leading-4 text-[var(--sf-ink-muted)]">{day} · {fee}{remaining}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function RigelSlotHeading() {
  const { selected, mode, today } = useRigelFulfillment();
  const label = mode === 'pickup' ? 'Pickup' : 'Delivery';
  return (
    <p className="text-[0.9375rem] font-medium leading-5">
      {selected ? `${label} by ${clock(selected.endTime)}` : `${label} times`}
      {selected ? <span className="block text-[0.75rem] font-normal text-[var(--sf-ink-muted)]">{relativeDay(selected.date, today)}</span> : null}
    </p>
  );
}

/** One pill that opens a popover list (not a native select), rendered inline so storefront tokens apply. */
function RigelPillPopover({ label, value, icon, options, current, onPick, accent = false }: { label: string; value: string; icon?: ReactNode; options: Array<{ id: string; label: string }>; current: string; onPick: (id: string) => void; accent?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger type="button" aria-label={`${label}: ${value}`} className={`rg-pill-select text-left ${icon ? '' : 'pl-4'}`}>
        {icon}
        <span className={`min-w-0 flex-1 truncate pr-5 text-[0.8125rem] ${accent ? 'font-medium text-[var(--sf-accent-hover)]' : ''}`}>{value}</span>
        <ChevronDown className={`h-4 w-4 text-[var(--sf-ink-faint)] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Content align="start" sideOffset={6} collisionPadding={12} className="rg-popover z-50 max-h-[min(20rem,var(--radix-popover-content-available-height))] min-w-[var(--radix-popover-trigger-width)] overflow-y-auto">
        <div role="listbox" aria-label={label}>
          {options.map((option) => {
            const chosen = option.id === current;
            return (
              <button key={option.id} type="button" role="option" aria-selected={chosen} onClick={() => { onPick(option.id); setOpen(false); }} className="rg-popover-option">
                <span className="truncate">{option.label}</span>
                {chosen ? <Check className="h-4 w-4 shrink-0 text-[var(--sf-accent-hover)]" aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

/** Phone: a day picker and a time picker over the same published windows. */
export function RigelPhonePickers() {
  const { windows, selected, select, today, mode } = useRigelFulfillment();
  const open = (windows || []).filter((entry) => entry.available);
  const days = [...new Set(open.map((entry) => entry.date))];
  const day = selected?.date || days[0] || '';
  const times = open.filter((entry) => entry.date === day);
  const time = selected && selected.date === day ? selected : times[0];
  if (!windows || !open.length) return <p className="text-sm text-[var(--sf-ink-muted)]">{windows ? `No open ${mode} times this week.` : 'Times couldn’t be loaded right now.'}</p>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
      <RigelPillPopover
        label={mode === 'pickup' ? 'Pickup day' : 'Delivery day'}
        value={relativeDay(day, today, true)}
        icon={<span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--sf-accent)] text-[var(--sf-accent-ink)]"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" /></span>}
        options={days.map((date) => ({ id: date, label: relativeDay(date, today, true) }))}
        current={day}
        onPick={(date) => { const first = open.find((entry) => entry.date === date); if (first) select(first.id); }}
      />
      <RigelPillPopover
        label={mode === 'pickup' ? 'Pickup time' : 'Delivery time'}
        value={time ? shortSlotLabel(time) : ''}
        options={times.map((entry) => ({ id: entry.id, label: shortSlotLabel(entry) }))}
        current={time?.id || ''}
        onPick={select}
        accent
      />
    </div>
  );
}
