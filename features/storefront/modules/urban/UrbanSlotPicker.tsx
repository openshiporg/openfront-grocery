'use client';

import { useMemo, useState } from 'react';
import type { DeliveryWindow } from '../../types';
import { formatMoney, formatSlotDay, formatSlotRange } from '../../lib/marketFormatting';

/**
 * Day strip + time grid for store-published fulfillment windows. The server
 * decides which windows exist, their fee and whether they have capacity; this
 * only groups them by store-local date so one day is scanned at a time.
 */
export function UrbanSlotPicker({
  windows,
  selectedWindowId,
  onSelect,
  method,
}: {
  windows: DeliveryWindow[];
  selectedWindowId: string;
  onSelect: (windowId: string) => void;
  method: 'delivery' | 'pickup';
}) {
  const days = useMemo(() => {
    const grouped = new Map<string, DeliveryWindow[]>();
    for (const window of windows) grouped.set(window.date, [...(grouped.get(window.date) || []), window]);
    return [...grouped.entries()].map(([date, entries]) => ({ date, windows: entries, open: entries.filter((entry) => entry.available).length }));
  }, [windows]);
  const selected = windows.find((window) => window.id === selectedWindowId);
  const [activeDate, setActiveDate] = useState(() => selected?.date || days.find((day) => day.open)?.date || days[0]?.date || '');
  const activeDay = days.find((day) => day.date === activeDate) || days[0];

  if (!days.length) return null;

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Choose a day" className="sf-scroll-row sf-bleed-row gap-2 sm:mx-0 sm:px-0">
        {days.map((day) => {
          const date = new Date(`${day.date}T12:00:00`);
          const current = day.date === activeDay?.date;
          const holdsSelection = selected?.date === day.date;
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={current}
              onClick={() => setActiveDate(day.date)}
              className={`relative flex w-[4.75rem] flex-col items-center rounded-[var(--sf-radius-md)] border px-2 pb-2.5 pt-2 text-center transition-[background-color,border-color,color] duration-[var(--sf-dur-fast)] ease-[var(--sf-ease-out)] ${current ? 'border-[var(--sf-ink)] bg-[var(--sf-ink)] text-[var(--sf-paper)]' : 'border-[var(--sf-rule)] bg-[var(--sf-card)] hover:border-[var(--sf-ink-faint)]'}`}
            >
              <span className={`text-[0.6875rem] font-semibold ${current ? 'text-[var(--sf-header-ink-muted)]' : 'text-[var(--sf-ink-faint)]'}`}>{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
              <span className="font-[family-name:var(--sf-font-display)] text-[1.6rem] font-bold leading-none tabular-nums tracking-[-0.03em]">{date.getDate()}</span>
              <span className={`mt-0.5 text-[0.6875rem] ${current ? 'text-[var(--sf-header-ink-muted)]' : 'text-[var(--sf-ink-faint)]'}`}>{date.toLocaleDateString('en-US', { month: 'short' })}</span>
              <span className={`mt-1.5 rounded-full px-1.5 text-[0.625rem] font-bold ${day.open ? (current ? 'bg-[var(--sf-tag)] text-[var(--sf-tag-ink)]' : 'bg-[var(--sf-sage-light)] text-[var(--sf-sage)]') : current ? 'text-[var(--sf-header-ink-muted)]' : 'text-[var(--sf-ink-faint)]'}`}>{day.open ? `${day.open} open` : 'Full'}</span>
              {holdsSelection && !current ? <span aria-label="Your selected time is on this day" className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-[var(--sf-card)] bg-[var(--sf-accent)]" /> : null}
            </button>
          );
        })}
      </div>

      {activeDay ? (
        <fieldset>
          <legend className="sr-only">{method === 'pickup' ? 'Pickup' : 'Delivery'} times on {formatSlotDay(activeDay.date, 'long')}</legend>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {activeDay.windows.map((window) => {
              const checked = selectedWindowId === window.id;
              return (
                <label
                  key={window.id}
                  className={`relative flex min-h-[4.5rem] cursor-pointer items-center gap-3 rounded-[var(--sf-radius-md)] border p-3.5 transition-[border-color,background-color,box-shadow] duration-[var(--sf-dur-fast)] ease-[var(--sf-ease-out)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--sf-focus)] ${!window.available ? 'cursor-not-allowed border-dashed border-[var(--sf-rule)] bg-[var(--sf-paper-2)] text-[var(--sf-ink-faint)]' : checked ? 'border-[var(--sf-ink)] bg-[var(--sf-card)] shadow-[0_0_0_1px_var(--sf-ink)]' : 'border-[var(--sf-rule)] bg-[var(--sf-card)] hover:border-[var(--sf-ink-faint)]'}`}
                >
                  <input type="radio" name="windowId" value={window.id} checked={checked} disabled={!window.available} onChange={() => onSelect(window.id)} className="sr-only" />
                  <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${checked ? 'border-[var(--sf-accent)]' : 'border-[var(--sf-rule-strong)]'}`}>{checked ? <span className="h-2.5 w-2.5 rounded-full bg-[var(--sf-accent)]" /> : null}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-[family-name:var(--sf-font-display)] text-[1.05rem] font-bold tracking-[-0.02em] ${!window.available ? 'line-through decoration-1' : ''}`}>{formatSlotRange(window.startTime, window.endTime)}</span>
                    <span className="mt-0.5 block text-xs">{!window.available ? 'Fully booked' : window.fee ? `${formatMoney(window.fee)} slot fee` : 'No slot fee'}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <p className="text-sm" aria-live="polite">
        {selected ? <><span className="text-[var(--sf-ink-muted)]">Selected: </span><span className="font-semibold">{formatSlotDay(selected.date, 'long')} · {formatSlotRange(selected.startTime, selected.endTime)}</span></> : <span className="text-[var(--sf-ink-muted)]">No time selected yet.</span>}
      </p>
    </div>
  );
}
