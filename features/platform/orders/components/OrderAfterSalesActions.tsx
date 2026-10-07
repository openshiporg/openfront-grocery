'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { GroceryPlatformPayment } from '@/features/platform/lib/platformProjections';
import { cancelOrderTask, refundOrderPaymentTask } from '@/features/platform/lib/taskActions';

function operationKey(prefix: string) {
  return `${prefix}:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}

function formatMoney(cents: number, currencyCode: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode || 'USD' }).format(cents / 100);
}

function parseAmountCents(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function OrderAfterSalesActions({
  orderId,
  orderStatus,
  payments,
  currencyCode,
}: {
  orderId: string;
  orderStatus: string;
  payments: GroceryPlatformPayment[];
  currencyCode: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelDisposition, setCancelDisposition] = useState('');
  const [cancelCondition, setCancelCondition] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundAmounts, setRefundAmounts] = useState<Record<string, string>>({});
  const cancelKey = useRef(operationKey(`cancel:${orderId}`));
  const refundKeys = useRef<Record<string, string>>({});

  const terminalOrder = ['cancelled', 'delivered'].includes(orderStatus);
  // The server additionally verifies zero-charge provenance under payment locks.
  const hasUnrefundedSettlement = payments.some((payment) => payment.amountCents > 0 && ['succeeded', 'partially_refunded'].includes(payment.status));
  const hasLiveAuthorization = payments.some((payment) => ['authorized', 'pending'].includes(payment.status));
  const requiresDisposition = ['packed', 'returned'].includes(orderStatus);
  const canCancel = ['pending', 'picking', 'packed', 'returned'].includes(orderStatus) && !hasUnrefundedSettlement && !hasLiveAuthorization;

  function runCancel() {
    setMessage(null);
    startTransition(async () => {
      try {
        await cancelOrderTask({ orderId, reason: cancelReason, idempotencyKey: cancelKey.current, ...(requiresDisposition ? { disposition: cancelDisposition, conditionNote: cancelCondition } : {}) });
        setMessage('Order cancelled. The reason and operator are retained in order evidence.');
        cancelKey.current = operationKey(`cancel:${orderId}`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Cancellation failed');
      }
    });
  }

  function runRefund(payment: GroceryPlatformPayment, remainingCents: number) {
    const amountCents = parseAmountCents(refundAmounts[payment.id] || (remainingCents / 100).toFixed(2));
    setMessage(null);
    if (!amountCents || amountCents > remainingCents) {
      setMessage(`Enter a refund from ${formatMoney(1, currencyCode)} to ${formatMoney(remainingCents, currencyCode)}.`);
      return;
    }
    if (!refundKeys.current[payment.id]) refundKeys.current[payment.id] = operationKey(`refund:${payment.id}`);
    startTransition(async () => {
      try {
        const response = await refundOrderPaymentTask({
          paymentId: payment.id,
          amountCents,
          reason: refundReason,
          idempotencyKey: refundKeys.current[payment.id],
        });
        const result = response?.refundPayment;
        setMessage(result?.message || `Refund ${result?.status || 'submitted'}.`);
        delete refundKeys.current[payment.id];
        setRefundAmounts((current) => ({ ...current, [payment.id]: '' }));
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Refund failed');
      }
    });
  }

  return (
    <details className="w-full rounded-lg border bg-muted/20 p-3 text-sm">
      <summary className="cursor-pointer font-medium">Cancellation, payments &amp; refunds</summary>
      <div className="mt-4 space-y-4">
        {message ? <p role="status" className="rounded-md border bg-background px-3 py-2 text-sm">{message}</p> : null}

        <div className="space-y-3">
          {payments.length === 0 ? <p className="text-muted-foreground">No payment evidence is attached to this order.</p> : null}
          {payments.map((payment) => {
            const refundedCents = payment.refunds
              .filter((refund) => refund.status === 'succeeded')
              .reduce((sum, refund) => sum + refund.amountCents, 0);
            const remainingCents = Math.max(0, payment.amountCents - refundedCents);
            const canRefund = ['succeeded', 'partially_refunded'].includes(payment.status) && remainingCents > 0;
            return (
              <div key={payment.id} className="rounded-md border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{formatMoney(payment.amountCents, currencyCode)} · {payment.providerCode}</p>
                    <p className="text-xs text-muted-foreground">Payment {payment.status.replaceAll('_', ' ')} · {formatMoney(remainingCents, currencyCode)} refundable</p>
                  </div>
                  {canRefund ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="grid gap-1 text-xs">
                        Amount
                        <input
                          inputMode="decimal"
                          value={refundAmounts[payment.id] ?? (remainingCents / 100).toFixed(2)}
                          onChange={(event) => setRefundAmounts((current) => ({ ...current, [payment.id]: event.target.value }))}
                          className="w-28 rounded-md border bg-background px-2 py-1.5 text-sm"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={isPending || refundReason.trim().length < 3}
                        onClick={() => runRefund(payment, remainingCents)}
                        className="rounded-md border px-3 py-1.5 font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {isPending ? 'Working…' : 'Refund'}
                      </button>
                    </div>
                  ) : null}
                </div>
                {payment.refunds.length > 0 ? (
                  <ul className="mt-3 space-y-2 border-t pt-3 text-xs text-muted-foreground">
                    {payment.refunds.map((refund) => (
                      <li key={refund.id}>
                        {formatMoney(refund.amountCents, currencyCode)} · {refund.status.replaceAll('_', ' ')}
                        {refund.reason ? ` · ${refund.reason}` : ''}
                        {refund.reconciliationDeadLetterAt ? ' · attention required (dead letter)' : ''}
                        {refund.reconciliationLastError || refund.failureMessage ? ` · ${refund.reconciliationLastError || refund.failureMessage}` : ''}
                        {refund.reconciliationNextAttemptAt ? ` · retry ${new Date(refund.reconciliationNextAttemptAt).toLocaleString()}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>

        {payments.some((payment) => payment.amountCents > 0 && ['succeeded', 'partially_refunded'].includes(payment.status)) ? (
          <label className="grid gap-1 text-xs">
            Refund reason
            <input
              value={refundReason}
              onChange={(event) => {
                setRefundReason(event.target.value);
                refundKeys.current = {};
              }}
              maxLength={500}
              placeholder="Missing item, quality issue, or service recovery"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </label>
        ) : null}

        {canCancel ? (
          <div className="space-y-2 border-t pt-4">
            <label className="grid gap-1 text-xs">
              Cancellation reason
              <input
                value={cancelReason}
                onChange={(event) => {
                  setCancelReason(event.target.value);
                  cancelKey.current = operationKey(`cancel:${orderId}`);
                }}
                maxLength={500}
                placeholder="Customer request or duplicate unpaid order"
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
            </label>
            {requiresDisposition ? <>
              <label className="grid gap-1 text-xs">
                Packed goods disposition
                <select value={cancelDisposition} onChange={(event) => { setCancelDisposition(event.target.value); cancelKey.current = operationKey(`cancel:${orderId}`); }} className="rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="">Choose after inspecting goods</option>
                  <option value="return_to_stock">Return safe goods to stock</option>
                  <option value="quarantine">Quarantine for review</option>
                  <option value="waste">Record waste</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs">
                Condition and custody evidence
                <input value={cancelCondition} onChange={(event) => { setCancelCondition(event.target.value); cancelKey.current = operationKey(`cancel:${orderId}`); }} maxLength={500} placeholder="Inspection, temperature and return custody" className="rounded-md border bg-background px-3 py-2 text-sm" />
              </label>
            </> : null}
            <button
              type="button"
              disabled={isPending || cancelReason.trim().length < 3 || (requiresDisposition && (!cancelDisposition || !cancelCondition.trim()))}
              onClick={runCancel}
              className="rounded-md border border-destructive/50 px-3 py-1.5 font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"
            >
              {isPending ? 'Working…' : 'Cancel order'}
            </button>
          </div>
        ) : null}

        {!canCancel && !terminalOrder ? <p className="text-xs text-muted-foreground">{hasLiveAuthorization ? 'Void active payment authorizations before cancelling this order.' : hasUnrefundedSettlement ? 'Fully refund every settled payment before cancelling this order.' : 'Return dispatched goods to store custody before cancelling.'}</p> : null}
      </div>
    </details>
  );
}
