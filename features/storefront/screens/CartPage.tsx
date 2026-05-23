import { Metadata } from 'next';
import Link from 'next/link';
import { ShoppingCart, Truck, Zap } from 'lucide-react';

import { retrieveCart } from '@/features/storefront/lib/data/cart';
import { getUser } from '@/features/storefront/lib/data/user';
import UrbanCart from '@/features/storefront/modules/urban/UrbanCart';
import { UrbanBadge, UrbanContainer, UrbanHeadline, UrbanMetric, UrbanPageShell, UrbanPanel } from '@/features/storefront/modules/urban/UrbanPrimitives';

export const metadata: Metadata = {
  title: 'Cart | Urban Express',
  description: 'Review your Urban Express grocery cart.',
};

export async function CartPage() {
  const [cart, user] = await Promise.all([retrieveCart(), getUser()]);

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8">
        <nav className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <Link href="/" className="hover:text-[#ffb693]">Urban Express</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <span className="text-[#ffb693]">Cart</span>
        </nav>
        <section className="grid gap-3 lg:grid-cols-[1fr_360px]">
          <UrbanPanel className="p-5 sm:p-8">
            <UrbanBadge tone="orange"><ShoppingCart className="h-3 w-3" /> Basket staging</UrbanBadge>
            <UrbanHeadline className="mt-5">Cart dispatch.</UrbanHeadline>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#e2bfb0]">Confirm quantities, substitution protocol, cold-chain handling, and delivery readiness before checkout.</p>
          </UrbanPanel>
          <div className="grid gap-3">
            <UrbanMetric label="Express promise" value="15m" icon={Zap} />
            <UrbanMetric label="Handoff" value="Delivery" icon={Truck} />
          </div>
        </section>
        <UrbanCart cart={cart} user={user} />
      </UrbanContainer>
    </UrbanPageShell>
  );
}

export function CartLoading() {
  return <UrbanPageShell><UrbanContainer><UrbanPanel className="p-8 text-[#e2bfb0]">Loading cart signal…</UrbanPanel></UrbanContainer></UrbanPageShell>;
}

export function CartNotFound() {
  return <UrbanPageShell><UrbanContainer><UrbanPanel className="p-8 text-center"><h1 className="font-market-label text-4xl font-black uppercase text-[#e2e2e2]">Cart missing</h1><Link href="/" className="mt-4 inline-block text-[#ffb693]">Go to frontpage</Link></UrbanPanel></UrbanContainer></UrbanPageShell>;
}
