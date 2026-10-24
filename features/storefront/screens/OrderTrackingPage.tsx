import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readGuestOrderById } from '../lib/data/guest-orders';
import { getAvailableParkingSpots, readOrderById } from '../lib/data/orders';
import { getStore } from '../lib/data/store';
import { storefrontMetadata } from '../lib/metadata';
import type { GroceryOrder, GroceryOrderItem } from '../types';
import { OrderAdjustment, OrderAdjustmentReturnNotice } from '../modules/order-adjustment/OrderAdjustment';
import { PickupCheckInPanel } from '../modules/urban/PickupCheckInPanel';
import { SubstitutionDecisions } from '../modules/order-substitution/SubstitutionDecisions';
import { ArrowLeft, Check, Store, Truck } from 'lucide-react';
import { UrbanBadge, UrbanButtonLink, UrbanContainer, UrbanPageShell, formatCents, formatSlotDay, formatSlotRange, formatUnit, orderStatusLabel, statusLabel, timezoneLabel } from '../modules/urban/UrbanPrimitives';

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata(): Promise<Metadata> {
  return storefrontMetadata({ title: 'Your order', description: 'Review your grocery order, picked items, and fulfillment progress.' });
}

const progress: Record<GroceryOrder['status'], number> = { pending: -1, confirmed: 0, processing: 1, picking: 1, ready_for_pickup: 2, out_for_delivery: 2, delivered: 3, cancelled: -1, delivery_failed: -1, delivery_refused: -1, returned: -1 };
const statusCopy: Record<GroceryOrder['status'], string> = {
  pending: 'The shop has your order and will confirm it soon. Payment confirmation may still be in progress.',
  confirmed: 'Your order is confirmed. Check here for updates as the shop prepares your groceries.',
  processing: 'The shop is preparing your groceries.', picking: 'Your groceries are being picked. Any available changes appear in your item details below.',
  ready_for_pickup: 'Your groceries are ready. Check in below when you arrive at the shop.',
  out_for_delivery: 'Your groceries are on their way. Keep your checkout contact details handy for the handoff.',
  delivered: 'Your grocery handoff is complete. Review your order details below.',
  cancelled: 'This order was cancelled. Cancellation alone does not confirm a refund; contact the shop for payment help.',
  delivery_failed: 'The delivery could not be completed. Contact the shop about the next step.',
  delivery_refused: 'The delivery was refused. Contact the shop about your goods and any payment adjustment.',
  returned: 'A return was recorded. A return status alone does not confirm a refund.',
};
function ReceiptLine({ item, requested, currencyCode }: { item: GroceryOrderItem; requested?: GroceryOrderItem; currencyCode?: string }) {
  return <li className="py-3">
    <div className="sf-receipt-row items-start">
      <span className="min-w-0 font-semibold">{item.product?.handle ? <Link className="underline-offset-4 hover:underline" href={`/products/${item.product.handle}`}>{item.title}</Link> : item.title}</span>
      <span className="shrink-0 font-semibold">{formatCents(item.subtotalCents ?? Math.round(item.unit_price * item.quantity), currencyCode)}</span>
    </div>
    <p className="text-[var(--sf-ink-muted)]">{item.quantity} {item.unitOfMeasure ? formatUnit(item.unitOfMeasure) : item.quantity === 1 ? 'item' : 'items'} × {formatCents(item.unit_price, currencyCode)}{item.unitOfMeasure ? ` / ${formatUnit(item.unitOfMeasure)}` : ''}</p>
    {requested ? <p className="text-[var(--sf-ink-muted)]">Requested: {requested.quantity} × {requested.title}</p> : null}
    {item.resolution ? <p className="mt-1 inline-block rounded bg-[var(--sf-paper-2)] px-1.5 font-semibold capitalize">{statusLabel(item.resolution)}</p> : null}
    {item.substitutionPreference ? <p className="text-xs text-[var(--sf-ink-faint)]">If unavailable: {statusLabel(item.substitutionPreference)}</p> : null}
    {item.substitution ? <div className="mt-2 border-l-2 border-[var(--sf-sage)] pl-3 font-[family-name:var(--sf-font-body)] text-sm"><p className="font-semibold">{item.substitution.customerApproved ? 'Replacement approved' : 'Replacement awaiting approval'}</p>{item.substitution.reason ? <p className="text-[var(--sf-ink-muted)]">{item.substitution.reason}</p> : null}{!item.substitution.customerApproved ? <p className="text-[var(--sf-ink-muted)]">Contact the shop to discuss this replacement.</p> : null}</div> : null}
  </li>;
}

function OrderUnavailable({ id }: { id: string }) {
  return <UrbanPageShell><UrbanContainer className="py-10">
    <section role="alert" className="sf-panel mx-auto max-w-xl space-y-4 p-6 text-center sm:p-8">
      <h1 className="sf-subtitle">We couldn’t load this order right now</h1>
      <p className="sf-copy">Your order and its payment are unaffected. Try again in a moment, or contact the store if this keeps happening.</p>
      <div className="flex flex-wrap justify-center gap-3"><UrbanButtonLink href={`/order/${encodeURIComponent(id)}`} variant="dark">Try again</UrbanButtonLink><UrbanButtonLink href="/support" variant="ghost">Contact the store</UrbanButtonLink></div>
    </section>
  </UrbanContainer></UrbanPageShell>;
}

export async function OrderTrackingPage(props: Props) {
  const { id } = await props.params;
  const owned = await readOrderById(id);
  const read = owned.status === 'found' ? owned : await readGuestOrderById(id);
  if (read.status !== 'found') {
    // A failed read is not a missing order: offer a retry instead of a 404.
    if (owned.status === 'unavailable' || read.status === 'unavailable') return <OrderUnavailable id={id} />;
    notFound();
  }
  const order = read.order;
  const pickup = order.fulfillmentMethod === 'pickup';
  // The store identity labels the receipt; pickup also uses its address.
  const store = await getStore().catch(() => null);
  const activeStage = progress[order.status];
  const stages = ['Confirmed', 'Preparing', pickup ? 'Ready for pickup' : 'Out for delivery', pickup ? 'Picked up' : 'Delivered'];
  const exception = ['cancelled', 'delivery_failed', 'delivery_refused', 'returned'].includes(order.status);
  const parkingSpots = pickup && order.status === 'ready_for_pickup' ? await getAvailableParkingSpots() : [];
  const settlementPending = order.finalSale?.status === 'processing';
  const receiptTitle = order.receiptStage === 'final' ? 'Final picked receipt' : settlementPending ? 'Picked goods · settlement pending' : order.receiptStage === 'proposed' ? 'Proposed picked receipt' : 'Your requested groceries';
  const totalTitle = order.receiptStage === 'final' ? 'Final total' : settlementPending ? 'Picked total · pending' : order.receiptStage === 'proposed' ? 'Proposed total' : 'Order estimate';
  const placed = new Date(order.createdAt);
  return <UrbanPageShell><UrbanContainer className="space-y-6 py-7 sm:py-10">
    <Link href="/account/orders" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[var(--sf-ink-muted)] hover:text-[var(--sf-ink)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Your orders</Link>
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="sf-eyebrow">{pickup ? 'Pickup' : 'Delivery'} order · placed {placed.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p><h1 className="sf-title mt-1">Order #{order.orderNumber}</h1></div>
      <UrbanBadge tone={exception ? 'danger' : 'primary'}>{pickup && order.status === 'delivered' ? 'Picked up' : orderStatusLabel(order.status)}</UrbanBadge>
    </header>

    <section aria-labelledby="order-progress" className={`rounded-[28px] p-6 sm:p-8 ${exception ? 'bg-[var(--sf-danger-bg)]' : 'sf-dark'}`}>
      <h2 id="order-progress" className="sf-subtitle">{exception ? 'An update on your order' : pickup && order.status === 'ready_for_pickup' ? 'See you at the shop.' : 'From our shelves to you.'}</h2>
      <p className={`mt-2 max-w-2xl text-[0.9375rem] leading-7 ${exception ? 'text-[var(--sf-ink-muted)]' : 'text-[var(--sf-header-ink-muted)]'}`}>{statusCopy[order.status]}</p>
      {!exception ? (
        <ol aria-label="Order progress" className="mt-7 grid gap-4 sm:grid-cols-4 sm:gap-0">
          {stages.map((stage, index) => {
            const state = index < activeStage ? 'done' : index === activeStage ? 'current' : 'upcoming';
            return <li key={stage} aria-current={index === activeStage ? 'step' : undefined} data-state={state} className="relative flex items-center gap-3 sm:flex-col sm:items-start sm:gap-3">
              {index < stages.length - 1 ? <span aria-hidden="true" className={`absolute left-[0.85rem] top-7 h-[calc(100%-0.25rem)] w-0.5 sm:left-7 sm:right-0 sm:top-[0.8rem] sm:h-0.5 sm:w-auto ${index < activeStage ? 'bg-[var(--sf-tag)]' : 'bg-[var(--sf-header-2)]'}`} /> : null}
              <span className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${state === 'done' ? 'border-[var(--sf-tag)] bg-[var(--sf-tag)] text-[var(--sf-tag-ink)]' : state === 'current' ? 'border-[var(--sf-tag)] bg-[var(--sf-header)] text-[var(--sf-tag)] shadow-[0_0_0_5px_oklch(93%_0.11_97/0.18)]' : 'border-[var(--sf-header-2)] bg-[var(--sf-header)] text-[var(--sf-header-ink-muted)]'}`}>{state === 'done' ? <Check className="h-4 w-4" aria-hidden="true" /> : <span className="h-2 w-2 rounded-full bg-current" />}</span>
              <span><span className="block text-xs text-[var(--sf-header-ink-muted)]">{state === 'done' ? 'Complete' : state === 'current' ? 'Current step' : 'Upcoming'}</span><span className="font-semibold">{stage}</span></span>
            </li>;
          })}
        </ol>
      ) : <UrbanButtonLink href={`/support?order=${encodeURIComponent(order.orderNumber)}#contact-form`} variant="dark" className="mt-5">Get help with this order</UrbanButtonLink>}
      {order.deliveryOutcome ? <p className={`mt-5 text-sm ${exception ? 'text-[var(--sf-ink-muted)]' : 'text-[var(--sf-header-ink-muted)]'}`}>Delivery update: {statusLabel(order.deliveryOutcome.status)}{order.deliveryOutcome.reason ? `. ${order.deliveryOutcome.reason}` : ''}{order.deliveryOutcome.custody ? ` · Goods: ${statusLabel(order.deliveryOutcome.custody)}` : ''}</p> : null}
    </section>

    {order.finalSale?.status === 'requires_customer_authorization' ? <OrderAdjustment orderId={order.id} totalCents={order.finalSale.totalCents} /> : <OrderAdjustmentReturnNotice />}
    <SubstitutionDecisions orderId={order.id} proposals={order.substitutionProposals || []} />
    {settlementPending ? <section className="sf-panel space-y-2 p-5 sm:p-6" role="status"><h2 className="text-lg font-bold">Picked total · payment reconciliation pending</h2><p className="sf-copy">Your picked goods are recorded below. The shop is still confirming the final payment settlement. This is not a finalized receipt or confirmation of a charge or refund. Contact the shop if you need an update; do not submit another payment.</p></section> : null}

    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-10">
      <section aria-labelledby="receipt-heading" className="mx-auto w-full max-w-2xl lg:mx-0">
        <div className="sf-receipt px-5 pb-10 pt-6 sm:px-8">
          <div className="text-center">
            <p className="font-[family-name:var(--sf-font-display)] text-xl font-bold tracking-[-0.02em]">{store?.name || 'Your grocery order'}</p>
            <h2 id="receipt-heading" className="mt-1 font-semibold uppercase tracking-[0.12em]">{receiptTitle}</h2>
            <p className="mt-1 text-[var(--sf-ink-muted)]">#{order.orderNumber} · {placed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <p className="mt-4 font-[family-name:var(--sf-font-body)] text-sm leading-6 text-[var(--sf-ink-muted)]">{order.receiptStage === 'final' ? 'These are the goods and amounts finalized by the shop.' : settlementPending ? 'These are the recorded picked goods and proposed total. Payment processing or reconciliation is still pending; the amount has not been finalized.' : order.receiptStage === 'proposed' ? 'Review the proposed goods and total. They are awaiting payment authorization and have not been finalized.' : 'This is the order estimate. Weighed goods and replacements may change the final amount.'}</p>
          <hr className="sf-receipt-rule" />
          <ul className="divide-y divide-dashed divide-[var(--sf-rule)]">{order.items.map(item => <ReceiptLine currencyCode={order.currencyCode} key={item.id} item={item} requested={order.receiptStage !== 'requested' ? order.requestedItems?.find(requested => requested.id === item.id) : undefined} />)}</ul>
          <hr className="sf-receipt-rule" />
          <dl className="space-y-1">
            <div className="sf-receipt-row"><dt>Groceries</dt><dd>{formatCents(order.subtotal, order.currencyCode)}</dd></div>
            <div className="sf-receipt-row"><dt>Tax</dt><dd>{formatCents(order.tax_total, order.currencyCode)}</dd></div>
            <div className="sf-receipt-row"><dt>Fulfillment fee</dt><dd>{formatCents(order.shipping_total, order.currencyCode)}</dd></div>
            {order.discount_total > 0 ? <div className="sf-receipt-row"><dt>Discount</dt><dd>−{formatCents(order.discount_total, order.currencyCode)}</dd></div> : null}
          </dl>
          <hr className="sf-receipt-rule" />
          <div className="sf-receipt-row text-base font-bold"><span>{totalTitle}</span><span>{formatCents(order.total, order.currencyCode)}</span></div>
          {order.receiptStage === 'final' ? <p role="status" className="mt-3 font-semibold text-[var(--sf-sage)]">{order.total > 0 ? 'Paid at finalization' : 'No payment due'}</p> : null}
          <p className="mt-4 font-[family-name:var(--sf-font-body)] text-xs leading-5 text-[var(--sf-ink-faint)]">Order totals do not show your current bank balance or refund status. For payment or refund questions, contact the shop with this order number.</p>
          {order.receiptStage !== 'requested' && order.requestedItems?.length ? <details className="mt-5 border-t border-dashed border-[var(--sf-rule-strong)] pt-4"><summary className="min-h-11 cursor-pointer py-2 font-semibold">View the original requested basket</summary><ul className="divide-y divide-dashed divide-[var(--sf-rule)]">{order.requestedItems.map(item => <ReceiptLine currencyCode={order.currencyCode} key={item.id} item={item} />)}</ul></details> : null}
        </div>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-[calc(var(--sf-header-offset)+1rem)]">
        <section className="sf-panel p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">{pickup ? <Store className="h-5 w-5 text-[var(--sf-sage)]" aria-hidden="true" /> : <Truck className="h-5 w-5 text-[var(--sf-sage)]" aria-hidden="true" />}{pickup ? 'Pickup details' : 'Delivery details'}</h2>
          <div className="mt-4 space-y-4 text-sm leading-6 text-[var(--sf-ink-muted)]">
            {order.deliverySlot ? <div className="rounded-[var(--sf-radius-md)] bg-[var(--sf-paper-2)] p-4"><p className="text-xs">Your window</p><p className="font-[family-name:var(--sf-font-display)] text-lg font-bold tracking-[-0.02em] text-[var(--sf-ink)]">{formatSlotDay(order.deliverySlot.date)}</p><p className="font-semibold text-[var(--sf-ink)]">{order.deliverySlot.startTime && order.deliverySlot.endTime ? `${formatSlotRange(order.deliverySlot.startTime, order.deliverySlot.endTime)} ${timezoneLabel(store?.timezone)}` : <>Time not recorded on this order. <Link href="/support" className="underline underline-offset-4">Contact the store</Link> to confirm it.</>}</p></div> : <p>No fulfillment window is recorded on this order.</p>}
            {pickup ? <div><p className="font-semibold text-[var(--sf-ink)]">{store?.name || 'Pickup at the shop'}</p>{store?.address ? <address className="not-italic">{store.address}</address> : <p>Contact the shop to confirm your pickup location.</p>}</div> : null}
            {!pickup && order.shippingAddress ? <address className="not-italic">{order.shippingAddress.firstName} {order.shippingAddress.lastName}<br />{order.shippingAddress.address1}{order.shippingAddress.address2 ? <><br />{order.shippingAddress.address2}</> : null}<br />{order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.postalCode}</address> : null}
            {order.deliveryInstructions ? <p><span className="font-semibold text-[var(--sf-ink)]">Your instructions: </span>{order.deliveryInstructions}</p> : null}
            <p className="text-xs">To change this order’s address or time, <Link href={`/support?order=${encodeURIComponent(order.orderNumber)}&topic=order_change#contact-form`} className="font-semibold underline underline-offset-4">send the shop a message</Link>.</p>
          </div>
          {/* The live arrival panel belongs only to a pickup awaiting handoff; afterwards arrival is history. */}
          {pickup && order.status === 'ready_for_pickup' ? <PickupCheckInPanel orderId={order.id} parkingSpots={parkingSpots} checkIn={order.pickupCheckIn} /> : null}
          {pickup && order.status === 'delivered' && order.pickupCheckIn?.customerArrived ? <p className="mt-5 flex items-center gap-2 rounded-[var(--sf-radius-md)] bg-[var(--sf-paper-2)] p-4 text-sm leading-6 text-[var(--sf-ink-muted)]"><Check className="h-4 w-4 shrink-0 text-[var(--sf-sage)]" aria-hidden="true" />You checked in{order.pickupCheckIn.parkingSpotNumber ? ` at bay ${order.pickupCheckIn.parkingSpotNumber}` : ''}. Pickup is complete.</p> : null}
        </section>
        <UrbanButtonLink href={`/support?order=${encodeURIComponent(order.orderNumber)}#contact-form`} variant="ghost" className="w-full">Help with this order</UrbanButtonLink>
      </aside>
    </div>
  </UrbanContainer></UrbanPageShell>;
}
