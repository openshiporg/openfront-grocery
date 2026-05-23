import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, ClipboardCheck, MapPin, PackageCheck, Truck } from 'lucide-react';
import { notFound } from 'next/navigation';

import { getOrderById } from '@/features/storefront/lib/data/orders';
import type { GroceryOrder } from '@/features/storefront/types';
import { UrbanBadge, UrbanContainer, UrbanHeadline, UrbanMetric, UrbanPageShell, UrbanPanel, formatCents, statusLabel } from '@/features/storefront/modules/urban/UrbanPrimitives';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params;
  return {
    title: `Order #${id} | Urban Express`,
    description: 'Track your Urban Express grocery order status, substitutions, and fulfillment window.',
  };
}

const stages: Array<{ key: GroceryOrder['status']; label: string; Icon: typeof ClipboardCheck }> = [
  { key: 'confirmed', label: 'Confirmed', Icon: ClipboardCheck },
  { key: 'picking', label: 'Picking', Icon: PackageCheck },
  { key: 'out_for_delivery', label: 'Dispatch', Icon: Truck },
  { key: 'delivered', label: 'Delivered', Icon: CheckCircle2 },
];

function stageIndex(status: GroceryOrder['status']) {
  if (status === 'pending') return 0;
  if (status === 'processing') return 1;
  const index = stages.findIndex((stage) => stage.key === status);
  return index >= 0 ? index + 1 : 0;
}

export async function OrderTrackingPage(props: Props) {
  const { id } = await props.params;
  const order: GroceryOrder | null = await getOrderById(id);
  if (!order) notFound();
  const activeStage = stageIndex(order.status);

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8">
        <nav className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <Link href="/" className="hover:text-[#ffb693]">Urban Express</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <Link href="/account" className="hover:text-[#ffb693]">Account</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <span className="text-[#ffb693]">Order #{order.orderNumber}</span>
        </nav>

        <section className="grid gap-3 lg:grid-cols-[1fr_360px]">
          <UrbanPanel className="p-5 sm:p-8">
            <UrbanBadge tone="orange"><Truck className="h-3 w-3" /> Order tracking</UrbanBadge>
            <UrbanHeadline className="mt-5">Order #{order.orderNumber}</UrbanHeadline>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#e2bfb0]">Live fulfillment status, item staging, substitution notes, and delivery or pickup details from Openfront.</p>
          </UrbanPanel>
          <div className="grid gap-3">
            <UrbanMetric label="Status" value={statusLabel(order.status)} icon={Truck} />
            <UrbanMetric label="Items" value={order.items.length} icon={PackageCheck} />
            <UrbanMetric label="Total" value={formatCents(order.total)} icon={CheckCircle2} />
          </div>
        </section>

        <UrbanPanel className="p-5">
          <div className="grid gap-3 md:grid-cols-4">
            {stages.map((stage, index) => {
              const complete = index + 1 <= activeStage;
              const Icon = stage.Icon;
              return (
                <div key={stage.key} className={`border p-4 ${complete ? 'border-[#ffb693] bg-[#282a2b]' : 'border-[#5a4136] bg-[#1e2020]'}`}>
                  <Icon className={`h-6 w-6 ${complete ? 'text-[#ffb693]' : 'text-[#e2bfb0]'}`} />
                  <p className="mt-3 font-market-label text-sm font-black uppercase tracking-[0.14em] text-[#e2e2e2]">{stage.label}</p>
                </div>
              );
            })}
          </div>
        </UrbanPanel>

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <UrbanPanel className="p-5">
            <h2 className="font-market-label text-3xl font-black uppercase tracking-[-0.04em] text-[#e2e2e2]">Items staged</h2>
            <div className="mt-5 space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="grid gap-3 border border-[#5a4136] bg-[#282a2b] p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="font-market-label text-xl font-black uppercase text-[#e2e2e2]">{item.title}</p>
                    <p className="mt-1 text-sm text-[#e2bfb0]">Qty {item.quantity}{item.substitutionPreference ? ` · ${item.substitutionPreference}` : ''}</p>
                    {item.substitution ? <UrbanBadge tone="blue" className="mt-2">Substitution pending</UrbanBadge> : null}
                  </div>
                  <p className="font-market-label text-2xl font-black text-[#ffb693]">{formatCents(item.unit_price * item.quantity)}</p>
                </div>
              ))}
            </div>
          </UrbanPanel>

          <UrbanPanel className="h-max p-5">
            <h2 className="font-market-label text-3xl font-black uppercase tracking-[-0.04em] text-[#e2e2e2]">Handoff</h2>
            <div className="mt-5 space-y-3 text-sm text-[#e2bfb0]">
              <p className="flex gap-2"><MapPin className="h-4 w-4 text-[#ffb693]" /> {order.fulfillmentMethod || 'delivery'}</p>
              {order.deliverySlot ? <p>{new Date(order.deliverySlot.date).toLocaleDateString()} · {order.deliverySlot.startTime}–{order.deliverySlot.endTime}</p> : null}
              {order.shippingAddress ? <p>{order.shippingAddress.address1}, {order.shippingAddress.city}, {order.shippingAddress.province} {order.shippingAddress.postalCode}</p> : null}
              {order.deliveryInstructions ? <p className="border border-[#5a4136] bg-[#282a2b] p-3">{order.deliveryInstructions}</p> : null}
            </div>
            <div className="mt-5 border-t border-[#5a4136] pt-5 text-sm text-[#e2bfb0]">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCents(order.subtotal)}</span></div>
              <div className="mt-2 flex justify-between"><span>Tax</span><span>{formatCents(order.tax_total)}</span></div>
              <div className="mt-2 flex justify-between"><span>Delivery</span><span>{formatCents(order.shipping_total)}</span></div>
              <div className="mt-4 flex justify-between font-market-label text-3xl font-black uppercase text-[#ffb693]"><span>Total</span><span>{formatCents(order.total)}</span></div>
            </div>
          </UrbanPanel>
        </div>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
