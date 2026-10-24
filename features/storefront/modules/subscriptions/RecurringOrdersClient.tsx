'use client';
import Link from 'next/link';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useMarketBasket } from '../market/MarketBasket';
import { customerLoyaltyRedemption, customerRecurringAction } from './actions';

const field = 'sf-field';
const action = 'inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--sf-ink)] px-5 text-sm font-semibold text-[var(--sf-paper)] transition-colors hover:bg-[var(--sf-header-2)] disabled:bg-[var(--sf-paper-3)] disabled:text-[var(--sf-ink-faint)]';
export function RecurringOrdersClient({ subscriptions, runs, products, loyalty, currencyCode }: { subscriptions: any[]; runs: any[]; products: any[]; loyalty: any; currencyCode: string }) {
  const basket = useMarketBasket();
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition(), [message, setMessage] = useState('');
  const keys = useRef(new Map<string, string>()), router = useRouter();
  const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(cents / 100);
  function submit(event: FormEvent<HTMLFormElement>, loyaltyAction = false) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const raw = Object.fromEntries(data.entries()); const fingerprint = JSON.stringify(raw), key = keys.current.get(fingerprint) || crypto.randomUUID(); keys.current.set(fingerprint, key);
    setMessage(''); setError('');
    startTransition(async () => {
      try {
      await basket.runExclusive(async () => {
      const result = loyaltyAction ? await customerLoyaltyRedemption({ points: Number(raw.points), idempotencyKey: key }) : await customerRecurringAction({ action: String(raw.action), subscriptionId: raw.subscriptionId ? String(raw.subscriptionId) : undefined, productId: raw.productId ? String(raw.productId) : undefined, quantity: raw.quantity ? Number(raw.quantity) : undefined, frequency: raw.frequency ? String(raw.frequency) : undefined, firstRunAt: raw.firstRunAt ? new Date(String(raw.firstRunAt)).toISOString() : undefined, pausedUntil: raw.pausedUntil ? new Date(String(raw.pausedUntil)).toISOString() : undefined, approveEachOrder: raw.approveEachOrder === 'on', idempotencyKey: key });
      if (!result.ok) throw new Error(result.error);
      setMessage(loyaltyAction ? `Reward ready: ${result.data.couponCode}` : `Recurring basket ${result.data.status.replaceAll('_', ' ')}.`);
      if (result.ok) { keys.current.delete(fingerprint); router.refresh(); }
      });
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'The request could not be completed. Please try again.'); }
    });
  }
  return <div className="space-y-10" aria-busy={pending || basket.busy}>
    {error ? <p role="alert" className="sf-note">{error}</p> : null}
    {message ? <p role="status" className="rounded-[var(--sf-radius-md)] bg-[var(--sf-sage-light)] px-4 py-3 text-sm font-medium text-[var(--sf-sage)]">{message}</p> : null}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <section aria-labelledby="rewards-title" className="sf-dark space-y-4 rounded-[28px] p-6 sm:p-8">
        <h2 id="rewards-title" className="text-lg font-bold">Rewards</h2>
        <p><span className="block font-[family-name:var(--sf-font-display)] text-[3.5rem] font-extrabold leading-none tracking-[-0.05em] tabular-nums">{loyalty?.redeemablePoints || 0}</span><span className="text-sm text-[var(--sf-header-ink-muted)]">available points</span></p>
        {loyalty?.refundDebt ? <p className="text-sm text-[var(--sf-header-ink-muted)]">{loyalty.refundDebt} points from returned purchases will offset future earnings.</p> : null}
        {loyalty?.program ? <>
          <p className="text-sm leading-6 text-[var(--sf-header-ink-muted)]">Earn {loyalty.program.earnPointsPer100Cents} points per {money(100)} of final paid goods. Exchange {loyalty.program.redeemPointsPer100Cents} points for {money(100)}. Refunds reverse earned points.</p>
          <form onSubmit={event => submit(event, true)} className="flex flex-wrap gap-2"><input name="points" required type="number" min={loyalty.program.minimumRedemptionPoints} max={loyalty.redeemablePoints} step="1" aria-label="Points to exchange" placeholder={`${loyalty.program.minimumRedemptionPoints}+ points`} className={`${field} max-w-[10rem]`} /><button disabled={pending || basket.busy || loyalty.redeemablePoints < loyalty.program.minimumRedemptionPoints} className="inline-flex min-h-12 items-center rounded-full bg-[var(--sf-tag)] px-5 text-sm font-semibold text-[var(--sf-tag-ink)] disabled:bg-[var(--sf-header-2)] disabled:text-[var(--sf-header-ink-muted)]">Exchange for a reward</button></form>
        </> : <p className="text-sm text-[var(--sf-header-ink-muted)]">Rewards are not active for this store.</p>}
        {(loyalty?.rewards || []).length ? <ul className="space-y-2 border-t border-[var(--sf-header-2)] pt-4">{(loyalty?.rewards || []).map((reward: any) => <li key={reward.id} className="flex flex-wrap items-center gap-2 text-sm"><code className="rounded border border-dashed border-[var(--sf-header-ink-muted)] px-2 py-1 font-[family-name:var(--sf-font-mono)] font-semibold">{reward.couponCode}</code><span className="text-[var(--sf-header-ink-muted)]">{money(reward.discountCents)} off a basket of at least {money(reward.discountCents)} · one use on your account</span></li>)}</ul> : null}
      </section>
      <section aria-labelledby="create-recurring-title" className="sf-panel space-y-4 p-6 sm:p-8">
        <div><h2 id="create-recurring-title" className="sf-subtitle">Create a recurring basket</h2><p className="mt-1.5 text-sm leading-6 text-[var(--sf-ink-muted)]">On each scheduled date, we prepare your item in an empty basket. Review current prices, choose pickup or delivery, and approve payment at checkout.</p></div>
        <form onSubmit={event => submit(event)} className="grid gap-4 sm:grid-cols-2"><input type="hidden" name="action" value="create" />
          <label className="sf-label sm:col-span-2">Product to repeat<select disabled={pending || basket.busy} name="productId" required className={field}><option value="">Choose a product</option>{products.map(product => <option key={product.id} value={product.id}>{product.name || product.title}{product.inStock === false ? ' (sold out)' : ''}</option>)}</select></label>
          <label className="sf-label">Quantity each time<input name="quantity" type="number" required min="1" step="1" defaultValue="1" className={field} /></label>
          <label className="sf-label">Repeat<select disabled={pending || basket.busy} name="frequency" className={field}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option></select></label>
          <label className="sf-label sm:col-span-2">First basket preparation <span className="sf-hint">Your local time</span><input name="firstRunAt" type="datetime-local" required className={field} /></label>
          <label className="flex items-start gap-3 rounded-[var(--sf-radius-md)] bg-[var(--sf-paper-2)] p-3 text-sm sm:col-span-2"><input name="approveEachOrder" type="checkbox" required className="sf-check mt-0.5" />Prepare this recurring basket; I will approve each checkout and payment.</label>
          <button disabled={pending || basket.busy} className={`${action} sm:col-span-2 sm:justify-self-start`}>Start recurring basket</button>
        </form>
      </section>
    </div>
    <section aria-labelledby="recurring-list-title" className="space-y-4"><h2 id="recurring-list-title" className="sf-subtitle">Your recurring baskets</h2>{subscriptions.length ? <ul className="grid gap-3 md:grid-cols-2">{subscriptions.map(subscription => <li key={subscription.id} className="sf-panel space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="text-lg font-bold tracking-[-0.02em]">{subscription.productRef?.title || subscription.product} <span className="text-[var(--sf-ink-faint)]">× {subscription.quantity}</span></h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${subscription.status === 'active' ? 'bg-[var(--sf-sage-light)] text-[var(--sf-sage)]' : 'bg-[var(--sf-paper-2)] text-[var(--sf-ink-muted)]'}`}>{String(subscription.status).replaceAll('_', ' ')}</span></div>
      <p className="text-sm text-[var(--sf-ink-muted)]"><span className="capitalize">{subscription.frequency}</span> · next {new Date(subscription.nextDeliveryDate).toLocaleString('en-US', { timeZone: subscription.scheduleTimezone || 'UTC' })} ({subscription.scheduleTimezone || 'UTC'})</p>
      {subscription.status !== 'cancelled' ? <form onSubmit={event => submit(event)} className="grid gap-2 border-t border-[var(--sf-rule)] pt-4 sm:grid-cols-2"><input type="hidden" name="subscriptionId" value={subscription.id} /><select aria-label={`Action for ${subscription.productRef?.title || subscription.product}`} disabled={pending || basket.busy} name="action" className={field}><option value="prepare">Prepare due basket / retry</option><option value="pause">Pause</option><option value="resume">Resume</option><option value="skip">Skip this occurrence</option><option value="cancel">Cancel recurrence</option></select><input name="pausedUntil" type="datetime-local" aria-label="Optional pause end" className={field} /><button disabled={pending || basket.busy} className={`${action} sm:col-span-2`}>Update recurrence</button></form> : null}
    </li>)}</ul> : <p className="sf-note">No recurring baskets yet.</p>}</section>
    <section aria-labelledby="recurring-history-title" className="space-y-4"><h2 id="recurring-history-title" className="sf-subtitle">Preparation history</h2>{!runs.length ? <p className="sf-note">No scheduled baskets have been prepared yet.</p> : <ul className="divide-y divide-[var(--sf-rule)] rounded-[var(--sf-radius-lg)] border border-[var(--sf-rule)] bg-[var(--sf-card)]">{runs.map(run=><li key={run.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm"><p><span className="font-semibold">{run.productTitle}</span> <span className="text-[var(--sf-ink-muted)]">· {new Date(run.dueAt).toLocaleDateString()} · {run.status.replaceAll('_',' ')}{run.failureReason?` · ${run.failureReason}`:''}</span></p>{run.status==='awaiting_checkout'?<Link className="font-semibold underline underline-offset-4" href="/checkout">Review basket and choose a slot</Link>:run.order?.id?<Link className="font-semibold underline underline-offset-4" href={`/order/${run.order.id}`}>View resulting order</Link>:null}</li>)}</ul>}</section>
  </div>;
}
