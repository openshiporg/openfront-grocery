'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { ChevronDown, Wallet } from 'lucide-react';
import { PlatformFeedback, PlatformField } from '@/features/platform/components/PlatformForm';
import { PlatformStatusBadge } from '@/features/platform/components/PlatformStatus';
import { PlatformTime } from '@/features/platform/components/PlatformTime';
import { platformButton, platformInput, platformSelect } from '@/features/platform/components/platformStyles';
import { formatMoney } from '@/features/platform/lib/format';
import type { GroceryPlatformPayment } from '@/features/platform/lib/platformProjections';
import { cancelOrderTask, refundOrderPaymentTask } from '@/features/platform/lib/taskActions';
import { parseMoneyToCents } from '@/features/lib/moneyInput';

function operationKey(prefix: string) {
  return `${prefix}:${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`}`;
}

type OutcomeKind = 'success' | 'pending' | 'unknown' | 'error';
type Outcome = { kind: OutcomeKind; text: string } | null;
/** A refund whose result is unknown: the exact request is kept and only resubmitted unchanged. */
type UnresolvedRefund = { paymentId: string; amountCents: number; reason: string; idempotencyKey: string };

const outcomeTone: Record<OutcomeKind, 'success' | 'info' | 'warning' | 'error'> = { success: 'success', pending: 'info', unknown: 'warning', error: 'error' };

/**
 * Refunds and whole-order cancellation for one order. `canRefund` and
 * `canCancel` come from the server (the actor's current capabilities); the
 * order is only cancellable here when `payments` is the order's full payment
 * set. The server re-checks every rule.
 */
export function OrderAfterSalesActions({
  orderId,
  orderStatus,
  payments,
  currencyCode,
  canRefund,
  canCancel,
}: {
  orderId: string;
  orderStatus: string;
  payments: GroceryPlatformPayment[];
  currencyCode: string;
  canRefund: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelDisposition, setCancelDisposition] = useState('');
  const [cancelCondition, setCancelCondition] = useState('');
  const [refundReason, setRefundReason] = useState('');
  // undefined = untouched (shows the full refundable balance); '' = explicitly cleared.
  const [refundAmounts, setRefundAmounts] = useState<Record<string, string | undefined>>({});
  const [unresolved, setUnresolved] = useState<UnresolvedRefund | null>(null);
  const cancelKey = useRef(operationKey(`cancel:${orderId}`));
  const cancelFingerprint = useRef('');

  const terminalOrder = ['cancelled', 'delivered'].includes(orderStatus);
  const hasUnrefundedSettlement = payments.some((payment) => payment.amountCents > 0 && ['succeeded', 'partially_refunded'].includes(payment.status));
  const hasLiveAuthorization = payments.some((payment) => ['authorized', 'pending'].includes(payment.status));
  const requiresDisposition = ['packed', 'returned'].includes(orderStatus);
  const cancellable = canCancel && ['pending', 'picking', 'packed', 'returned'].includes(orderStatus) && !hasUnrefundedSettlement && !hasLiveAuthorization;

  function runCancel() {
    setOutcome(null);
    const input = { orderId, reason: cancelReason.trim(), ...(requiresDisposition ? { disposition: cancelDisposition, conditionNote: cancelCondition.trim() } : {}) };
    // The key belongs to this exact request; a changed request gets a new key.
    const fingerprint = JSON.stringify(input);
    if (fingerprint !== cancelFingerprint.current) { cancelKey.current = operationKey(`cancel:${orderId}`); cancelFingerprint.current = fingerprint; }
    startTransition(async () => {
      try {
        const result = await cancelOrderTask({ ...input, idempotencyKey: cancelKey.current });
        if (!result.ok) { setOutcome({ kind: 'error', text: result.error }); return; }
        setOutcome({ kind: 'success', text: 'Order cancelled. The reason is kept on the order.' });
        cancelFingerprint.current = '';
        router.refresh();
      } catch {
        setOutcome({ kind: 'unknown', text: 'We couldn’t confirm the cancellation. Press Cancel order again without changes to check; it won’t be applied twice.' });
      }
    });
  }

  function submitRefund(request: UnresolvedRefund) {
    setOutcome(null);
    startTransition(async () => {
      let response: Awaited<ReturnType<typeof refundOrderPaymentTask>>;
      try { response = await refundOrderPaymentTask(request); }
      catch { response = { ok: false, error: 'The connection was interrupted.', uncertain: true }; }
      if (!response.ok) {
        if (response.uncertain) {
          setUnresolved(request);
          setOutcome({ kind: 'unknown', text: `We couldn’t confirm the ${formatMoney(request.amountCents, currencyCode)} refund. Check it before doing anything else; checking resubmits the same request and can’t refund twice.` });
        } else {
          setUnresolved(null);
          setOutcome({ kind: 'error', text: response.error });
        }
        return;
      }
      setUnresolved(null);
      const status = response.data.status || 'processing';
      const amount = formatMoney(response.data.amountCents ?? request.amountCents, currencyCode);
      setOutcome(status === 'succeeded' ? { kind: 'success', text: `${amount} refunded.` }
        : status === 'failed' ? { kind: 'error', text: response.data.message || `The ${amount} refund failed at the payment provider.` }
        : { kind: 'pending', text: `${amount} refund submitted and waiting for the payment provider to confirm.` });
      setRefundAmounts((current) => ({ ...current, [request.paymentId]: undefined }));
      setRefundReason('');
      router.refresh();
    });
  }

  const refundable = canRefund && payments.some((payment) => payment.amountCents > 0 && ['succeeded', 'partially_refunded'].includes(payment.status));
  const locked = isPending || unresolved !== null;

  return (
    <details className="group/after w-full overflow-hidden rounded-lg border bg-background text-sm shadow-xs" open={Boolean(outcome) || unresolved !== null}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <Wallet className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="font-medium">{canCancel ? 'Payments, refunds & cancellation' : 'Refunds'}</span>
        <span className="ml-auto rounded-full bg-muted px-2 py-px text-xs tabular-nums text-muted-foreground">{payments.length}</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open/after:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-4 border-t px-4 py-4">
        {outcome ? <PlatformFeedback tone={outcomeTone[outcome.kind]}>{outcome.text}</PlatformFeedback> : null}
        {unresolved ? (
          <button type="button" disabled={isPending} onClick={() => submitRefund(unresolved)} className={platformButton('primary', 'md', 'w-full')}>
            {isPending ? 'Checking…' : `Check the ${formatMoney(unresolved.amountCents, currencyCode)} refund`}
          </button>
        ) : null}

        <div className="space-y-2.5">
          {payments.length === 0 ? <p className="text-muted-foreground">No payment is attached to this order.</p> : null}
          {payments.map((payment) => {
            const refundedCents = payment.refunds
              .filter((refund) => refund.status === 'succeeded')
              .reduce((sum, refund) => sum + refund.amountCents, 0);
            // Only captured money is refundable; an authorization that was voided or never captured has none.
            const captured = ['succeeded', 'partially_refunded', 'refunded'].includes(payment.status);
            const remainingCents = captured ? Math.max(0, payment.amountCents - refundedCents) : 0;
            const paymentRefundable = canRefund && ['succeeded', 'partially_refunded'].includes(payment.status) && remainingCents > 0;
            const shown = refundAmounts[payment.id] ?? (remainingCents / 100).toFixed(2);
            const amountCents = parseMoneyToCents(shown);
            const amountValid = amountCents !== null && amountCents > 0 && amountCents <= remainingCents;
            return (
              <div key={payment.id} className="rounded-md border bg-muted/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums">{formatMoney(payment.amountCents, currencyCode)}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">{payment.providerCode}</p>
                  </div>
                  <PlatformStatusBadge status={payment.status} />
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{captured ? <><span className="font-medium text-foreground tabular-nums">{formatMoney(remainingCents, currencyCode)}</span> refundable</> : payment.status === 'authorized' ? 'Authorized, not captured · nothing to refund' : 'Not captured · nothing to refund'}</p>
                {paymentRefundable ? (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-end gap-2">
                      <PlatformField label={`Refund amount (${currencyCode})`} className="flex-1">
                        <input
                          inputMode="decimal"
                          value={shown}
                          disabled={locked}
                          aria-invalid={!amountValid}
                          onChange={(event) => setRefundAmounts((current) => ({ ...current, [payment.id]: event.target.value }))}
                          className={`${platformInput} tabular-nums`}
                        />
                      </PlatformField>
                      <button
                        type="button"
                        disabled={locked || !amountValid || refundReason.trim().length < 3}
                        onClick={() => amountValid && submitRefund({ paymentId: payment.id, amountCents: amountCents!, reason: refundReason.trim(), idempotencyKey: operationKey(`refund:${payment.id}`) })}
                        className={platformButton('secondary', 'md')}
                      >
                        {isPending ? 'Working…' : amountValid ? `Refund ${formatMoney(amountCents!, currencyCode)}` : 'Refund'}
                      </button>
                    </div>
                    {!amountValid ? <p className="text-xs text-destructive">Enter an amount from {formatMoney(1, currencyCode)} to {formatMoney(remainingCents, currencyCode)}.</p> : null}
                  </div>
                ) : null}
                {payment.refunds.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 border-t pt-2.5 text-xs">
                    {payment.refunds.map((refund) => (
                      <li key={refund.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium tabular-nums">{formatMoney(refund.amountCents, currencyCode)}</span>
                        <PlatformStatusBadge status={refund.reconciliationDeadLetterAt ? 'failed' : refund.status} label={refund.reconciliationDeadLetterAt ? 'Needs review' : undefined} />
                        {refund.reason ? <span className="text-muted-foreground">{refund.reason}</span> : null}
                        {refund.reconciliationLastError || refund.failureMessage ? <span className="basis-full text-destructive">{refund.reconciliationLastError || refund.failureMessage}</span> : null}
                        {refund.reconciliationNextAttemptAt && !['succeeded', 'failed', 'cancelled'].includes(refund.status) ? <span className="basis-full text-muted-foreground"><PlatformTime value={refund.reconciliationNextAttemptAt} prefix="Retry" /></span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>

        {refundable ? (
          <PlatformField label="Refund reason" hint="Required for every refund and shown on the refund record.">
            <input
              value={refundReason}
              disabled={locked}
              onChange={(event) => setRefundReason(event.target.value)}
              maxLength={500}
              placeholder="Missing item, quality issue, or service recovery"
              className={platformInput}
            />
          </PlatformField>
        ) : null}
        {!canRefund && hasUnrefundedSettlement ? <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Refunds need payment access. Ask someone who manages payments.</p> : null}

        {cancellable ? (
          <div className="space-y-3 rounded-md border border-destructive/25 bg-destructive/5 p-3">
            <p className="text-xs font-semibold text-destructive">Cancel whole order</p>
            <PlatformField label="Cancellation reason">
              <input value={cancelReason} disabled={isPending} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} placeholder="Customer request or duplicate unpaid order" className={platformInput} />
            </PlatformField>
            {requiresDisposition ? <>
              <PlatformField label="Packed goods">
                <select value={cancelDisposition} disabled={isPending} onChange={(event) => setCancelDisposition(event.target.value)} className={platformSelect}>
                  <option value="">Choose after inspecting goods</option>
                  <option value="return_to_stock">Return safe goods to stock</option>
                  <option value="quarantine">Hold for review</option>
                  <option value="waste">Record as waste</option>
                </select>
              </PlatformField>
              <PlatformField label="Condition and handling">
                <input value={cancelCondition} disabled={isPending} onChange={(event) => setCancelCondition(event.target.value)} maxLength={500} placeholder="Inspection, temperature and who returned the goods" className={platformInput} />
              </PlatformField>
            </> : null}
            <button
              type="button"
              disabled={isPending || cancelReason.trim().length < 3 || (requiresDisposition && (!cancelDisposition || !cancelCondition.trim()))}
              onClick={runCancel}
              className={platformButton('destructive', 'md', 'w-full')}
            >
              {isPending ? 'Working…' : 'Cancel order'}
            </button>
          </div>
        ) : null}

        {canCancel && !cancellable && !terminalOrder ? <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">{hasLiveAuthorization ? 'Void active payment authorizations before cancelling this order.' : hasUnrefundedSettlement ? 'Fully refund every settled payment before cancelling this order.' : 'Return dispatched goods to the store before cancelling.'}</p> : null}
      </div>
    </details>
  );
}
