import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, ClipboardCheck, MapPin, PackageCheck, Truck } from 'lucide-react';
import { notFound } from 'next/navigation';

import { getGuestOrderById } from '@/features/storefront/lib/data/guest-orders';
import { getAvailableParkingSpots, getOrderById } from '@/features/storefront/lib/data/orders';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import type { GroceryOrder } from '@/features/storefront/types';
import { PickupCheckInPanel } from '@/features/storefront/modules/urban/PickupCheckInPanel';
import { UrbanBadge, UrbanContainer, UrbanInset, UrbanMetric, UrbanPageHeader, UrbanPageShell, formatCents, statusLabel } from '@/features/storefront/modules/urban/UrbanPrimitives';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params;
  return storefrontMetadata({
    title: `Order #${id}`,
    description: 'Track order status, substitutions, and fulfillment details.',
  });
}

const deliveryStages: Array<{ key: GroceryOrder['status']; label: string; Icon: typeof ClipboardCheck }> = [
  { key: 'confirmed', label: 'Confirmed', Icon: ClipboardCheck },
  { key: 'picking', label: 'Picking', Icon: PackageCheck },
  { key: 'out_for_delivery', label: 'Out for delivery', Icon: Truck },
  { key: 'delivered', label: 'Delivered', Icon: CheckCircle2 },
];

const pickupStages: typeof deliveryStages = [
  { key: 'confirmed', label: 'Confirmed', Icon: ClipboardCheck },
  { key: 'picking', label: 'Picking', Icon: PackageCheck },
  { key: 'ready_for_pickup', label: 'Ready for pickup', Icon: MapPin },
  { key: 'delivered', label: 'Picked up', Icon: CheckCircle2 },
];

function stageIndex(status: GroceryOrder['status'], stages: typeof deliveryStages) {
  if (status === 'pending') return 0;
  if (status === 'processing') return 1;
  const index = stages.findIndex((stage) => stage.key === status);
  return index >= 0 ? index + 1 : 0;
}

export async function OrderTrackingPage(props: Props) {
  const { id } = await props.params;
  const order: GroceryOrder | null = (await getOrderById(id)) || (await getGuestOrderById(id));
  if (!order) notFound();
  const stages = order.fulfillmentMethod === 'pickup' ? pickupStages : deliveryStages;
  const activeStage = stageIndex(order.status, stages);
  const parkingSpots = order.fulfillmentMethod === 'pickup' && order.status === 'ready_for_pickup'
    ? await getAvailableParkingSpots()
    : [];

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[
            { label: 'Home', href: '/' },
            { label: 'Account', href: '/account' },
            { label: `Order #${order.orderNumber}` },
          ]}
          title={`Order #${order.orderNumber}`}
          description="Fulfillment progress, substitutions, and handoff details."
          aside={
            <div className="space-y-3">
              <UrbanMetric label="Status" value={statusLabel(order.status)} icon={Truck} />
              <UrbanMetric label="Items" value={order.items.length} icon={PackageCheck} />
              <UrbanMetric label="Total" value={formatCents(order.total)} icon={CheckCircle2} />
            </div>
          }
        />

        <section>
          <div className="grid gap-px border border-[var(--sf-rule)] bg-[var(--sf-rule)] sm:grid-cols-2 lg:grid-cols-4">
            {stages.map((stage, index) => {
              const complete = index + 1 <= activeStage;
              const Icon = stage.Icon;
              return (
                <div key={stage.key} className={`p-4 ${complete ? 'bg-[var(--sf-sage-light)]' : 'bg-[var(--sf-paper)]'}`}>
                  <Icon className={`h-5 w-5 ${complete ? 'text-[var(--sf-sage)]' : 'text-[var(--sf-ink-faint)]'}`} />
                  <p className="mt-2 text-sm font-medium text-[var(--sf-ink)]">{stage.label}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section>
            <h2 className="border-b border-[var(--sf-rule)] pb-2 font-[family-name:var(--sf-font-display)] text-xl font-semibold text-[var(--sf-ink)]">Items</h2>
            <div className="mt-4 space-y-2">
              {order.items.map((item) => (
                <UrbanInset key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--sf-ink)]">{item.title}</p>
                    <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">Qty {item.quantity}{item.substitutionPreference ? ` · ${item.substitutionPreference}` : ''}</p>
                    {item.substitution ? <UrbanBadge tone="blue" className="mt-2">Substitution pending</UrbanBadge> : null}
                  </div>
                  <p className="font-[family-name:var(--sf-font-display)] text-lg font-semibold">{formatCents(item.unit_price * item.quantity)}</p>
                </UrbanInset>
              ))}
            </div>
          </section>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="border border-[var(--sf-rule-strong)] p-5">
              <h2 className="font-[family-name:var(--sf-font-display)] text-lg font-semibold text-[var(--sf-ink)]">Handoff</h2>
              <div className="mt-4 space-y-2 text-sm leading-6 text-[var(--sf-ink-muted)]">
                <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sf-sage)]" /> {order.fulfillmentMethod || 'delivery'}</p>
                {order.deliverySlot ? <p>{new Date(order.deliverySlot.date).toLocaleDateString()} · {order.deliverySlot.startTime}–{order.deliverySlot.endTime}</p> : null}
                {order.shippingAddress ? <p>{order.shippingAddress.address1}, {order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.postalCode}</p> : null}
                {order.deliveryInstructions ? <UrbanInset className="p-3 text-[var(--sf-ink)]">{order.deliveryInstructions}</UrbanInset> : null}
              </div>
              <dl className="mt-5 space-y-2 border-t border-[var(--sf-rule)] pt-4 text-sm text-[var(--sf-ink-muted)]">
                <div className="flex justify-between"><dt>Subtotal</dt><dd>{formatCents(order.subtotal)}</dd></div>
                <div className="flex justify-between"><dt>Tax</dt><dd>{formatCents(order.tax_total)}</dd></div>
                <div className="flex justify-between"><dt>Delivery</dt><dd>{formatCents(order.shipping_total)}</dd></div>
                {order.discount_total > 0 ? <div className="flex justify-between text-[var(--sf-sage)]"><dt>Discount</dt><dd>−{formatCents(order.discount_total)}</dd></div> : null}
                <div className="flex justify-between pt-2 font-[family-name:var(--sf-font-display)] text-lg font-semibold text-[var(--sf-ink)]"><dt>Total</dt><dd>{formatCents(order.total)}</dd></div>
              </dl>
              {order.fulfillmentMethod === 'pickup' && (order.status === 'ready_for_pickup' || order.pickupCheckIn?.customerArrived) ? (
                <PickupCheckInPanel orderId={order.id} parkingSpots={parkingSpots} checkIn={order.pickupCheckIn} />
              ) : null}
              <Link href="/account" className="mt-4 inline-block text-sm font-medium text-[var(--sf-accent)]">Back to account</Link>
            </div>
          </aside>
        </div>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
