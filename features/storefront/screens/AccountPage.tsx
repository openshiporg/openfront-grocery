import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, Package, Target, UserRound } from 'lucide-react';

import { getUser } from '@/features/storefront/lib/data/user';
import { getOrdersByUser, reorderFromOrder } from '@/features/storefront/lib/data/orders';
import { getShoppingLists } from '@/features/storefront/lib/data/lists';
import { UrbanBadge, UrbanButtonLink, UrbanContainer, UrbanEmptyState, UrbanHeadline, UrbanMetric, UrbanPageShell, UrbanPanel, formatCents, statusLabel } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Account | Urban Express',
    description: 'Manage Urban Express orders, lists, and grocery preferences.',
  };
}

export async function AccountPage() {
  const [user, recentOrders, savedLists] = await Promise.all([getUser(), getOrdersByUser(), getShoppingLists()]);

  if (!user) {
    return (
      <UrbanPageShell>
        <UrbanContainer>
          <UrbanEmptyState title="Sign in for account grid" actionHref="/dashboard/signin?from=/account" actionLabel="Sign in">
            Your orders, lists, pickup check-ins, and grocery preferences will appear here once you sign in.
          </UrbanEmptyState>
        </UrbanContainer>
      </UrbanPageShell>
    );
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8">
        <nav className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <Link href="/" className="hover:text-[#ffb693]">Urban Express</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <span className="text-[#ffb693]">Account</span>
        </nav>

        <section className="grid gap-3 lg:grid-cols-[1fr_360px]">
          <UrbanPanel className="p-5 sm:p-8">
            <UrbanBadge tone="orange"><UserRound className="h-3 w-3" /> Account terminal</UrbanBadge>
            <UrbanHeadline className="mt-5">Welcome back, {displayName}.</UrbanHeadline>
            <p className="mt-5 text-sm leading-7 text-[#e2bfb0]">{user.email}</p>
          </UrbanPanel>
          <div className="grid gap-3">
            <UrbanMetric label="Orders" value={recentOrders.length} icon={Package} />
            <UrbanMetric label="Saved lists" value={savedLists.length} icon={ClipboardList} />
            <UrbanMetric label="Deal signal" value="Live" icon={Target} />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <UrbanPanel className="h-max p-5">
            <h2 className="font-market-label text-3xl font-black uppercase tracking-[-0.04em] text-[#e2e2e2]">Quick actions</h2>
            <div className="mt-5 grid gap-3">
              <UrbanButtonLink href="/lists" variant="ghost" className="justify-start">Shopping lists ({savedLists.length})</UrbanButtonLink>
              <UrbanButtonLink href="/deals" variant="ghost" className="justify-start">Weekly deals</UrbanButtonLink>
              <UrbanButtonLink href={recentOrders[0] ? `/order/${recentOrders[0].id}` : '/products'} variant="ghost" className="justify-start">Track latest order</UrbanButtonLink>
            </div>
          </UrbanPanel>

          <UrbanPanel className="p-5">
            <div className="mb-5 flex items-center justify-between border-b border-[#5a4136] pb-3">
              <h2 className="font-market-label text-3xl font-black uppercase tracking-[-0.04em] text-[#e2e2e2]">Recent orders</h2>
              <UrbanBadge tone="muted">{recentOrders.length} total</UrbanBadge>
            </div>
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div key={order.id} className="border border-[#5a4136] bg-[#282a2b] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-market-label text-xl font-black uppercase text-[#e2e2e2]">Order #{order.orderNumber}</p>
                      <p className="mt-1 text-sm text-[#e2bfb0]">{new Date(order.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-market-label text-2xl font-black text-[#ffb693]">{formatCents(order.total)}</p>
                      <UrbanBadge tone="blue">{statusLabel(order.status)}</UrbanBadge>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#5a4136] pt-3 text-sm text-[#e2bfb0]">
                    <span>{order.items.length} items</span>
                    <div className="flex gap-3">
                      <Link href={`/order/${order.id}`} className="font-market-label text-xs font-black uppercase tracking-[0.14em] text-[#ffb693]">View details</Link>
                      <form action={async () => { 'use server'; await reorderFromOrder(order.id); }}>
                        <button type="submit" className="font-market-label text-xs font-black uppercase tracking-[0.14em] text-[#b6c6ed]">Reorder</button>
                      </form>
                    </div>
                  </div>
                </div>
              ))}
              {recentOrders.length === 0 ? <UrbanEmptyState title="No orders yet" actionHref="/products" actionLabel="Start shopping">Start shopping to see order history here.</UrbanEmptyState> : null}
            </div>
          </UrbanPanel>
        </div>

        <UrbanPanel className="p-5">
          <div className="mb-5 flex items-center justify-between border-b border-[#5a4136] pb-3">
            <h2 className="font-market-label text-3xl font-black uppercase tracking-[-0.04em] text-[#e2e2e2]">Shopping lists</h2>
            <Link href="/lists" className="font-market-label text-xs font-black uppercase tracking-[0.14em] text-[#ffb693]">Manage lists</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {savedLists.map((list) => (
              <div key={list.id} className="border border-[#5a4136] bg-[#282a2b] p-4">
                <ClipboardList className="h-5 w-5 text-[#ffb693]" />
                <h3 className="mt-3 font-market-label text-xl font-black uppercase text-[#e2e2e2]">{list.name}</h3>
                <p className="mt-1 text-sm text-[#e2bfb0]">{list.items.length} items</p>
              </div>
            ))}
          </div>
        </UrbanPanel>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
