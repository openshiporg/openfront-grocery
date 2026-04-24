'use client';

import { useState, useEffect } from 'react';
import type { DeliveryWindow } from '@/features/storefront/types';
import { getDeliveryWindows, getAvailableDates } from '@/features/storefront/lib/data/delivery';

interface DeliverySchedulerProps {
  selectedWindow: DeliveryWindow | null;
  onSelectWindow: (window: DeliveryWindow) => void;
}

export default function DeliveryScheduler({
  selectedWindow,
  onSelectWindow,
}: DeliverySchedulerProps) {
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [windows, setWindows] = useState<DeliveryWindow[]>([]);
  const [loading, setLoading] = useState(true);

  // Load available dates on mount
  useEffect(() => {
    async function loadDates() {
      const availableDates = await getAvailableDates();
      setDates(availableDates);
      if (availableDates.length > 0) {
        setSelectedDate(availableDates[0]);
      }
    }
    loadDates();
  }, []);

  // Load windows when date changes
  useEffect(() => {
    if (!selectedDate) return;

    async function loadWindows() {
      setLoading(true);
      const { windows: deliveryWindows } = await getDeliveryWindows(selectedDate);
      setWindows(deliveryWindows);
      setLoading(false);
    }
    loadWindows();
  }, [selectedDate]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (dateStr === today.toISOString().split('T')[0]) {
      return 'Today';
    } else if (dateStr === tomorrow.toISOString().split('T')[0]) {
      return 'Tomorrow';
    }

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Select Delivery Date & Time</h3>

      {/* Date Selection */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {dates.map((date) => (
          <button
            key={date}
            onClick={() => setSelectedDate(date)}
            className={`px-4 py-2 rounded-md text-sm whitespace-nowrap flex-shrink-0 ${
              selectedDate === date
                ? 'bg-primary text-primary-foreground'
                : 'border border-border hover:bg-accent'
            }`}
          >
            {formatDate(date)}
          </button>
        ))}
      </div>

      {/* Time Window Selection */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-muted rounded-md animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {windows.map((window) => (
            <button
              key={window.id}
              onClick={() => window.available && onSelectWindow(window)}
              disabled={!window.available}
              className={`w-full p-3 rounded-md text-left flex justify-between items-center ${
                selectedWindow?.id === window.id
                  ? 'bg-primary/10 border-2 border-primary'
                  : window.available
                  ? 'border border-border hover:bg-accent'
                  : 'border border-border bg-muted opacity-50 cursor-not-allowed'
              }`}
            >
              <div>
                <span className="font-medium">
                  {formatTime(window.startTime)} - {formatTime(window.endTime)}
                </span>
                {!window.available && (
                  <span className="block text-xs text-destructive">Fully booked</span>
                )}
              </div>
              <div className="text-right">
                {window.fee === 0 ? (
                  <span className="text-sm text-green-600 font-medium">FREE</span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    +${window.fee.toFixed(2)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedWindow && (
        <p className="text-sm text-muted-foreground">
          Delivery on {formatDate(selectedWindow.date)} between{' '}
          {formatTime(selectedWindow.startTime)} - {formatTime(selectedWindow.endTime)}
          {selectedWindow.fee > 0 && ` (+ $${selectedWindow.fee.toFixed(2)} delivery fee)`}
        </p>
      )}
    </div>
  );
}
