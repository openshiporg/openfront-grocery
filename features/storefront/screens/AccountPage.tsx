import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, Package } from 'lucide-react';

import { getUser } from '@/features/storefront/lib/data/user';
import { getOrdersByUser, reorderFromOrder } from '@/features/storefront/lib/data/orders';
import { getShoppingLists } from '@/features/storefront/lib/data/lists';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import { UrbanBadge, UrbanButtonLink, UrbanContainer, UrbanEmptyState, UrbanMetric, UrbanPageHeader, UrbanPageShell, formatCents, statusLabel } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return storefrontMetadata({
    title: 'Account',
    description: 'Manage grocery orders, lists, and preferences.',
  });
}

export async function AccountPage() {
  const [user, recentOrders, savedLists] = await Promise.all([getUser(), getOrdersByUser(), getShoppingLists()]);

  if (!user) {
    return (
      <UrbanPageShell>
        <UrbanContainer className="py-8">
          <UrbanEmptyState title="Sign in to your account" actionHref="/dashboard/signin?from=/account" actionLabel="Sign in">
            Orders and saved lists appear here once you are signed in.
          </UrbanEmptyState>
        </UrbanContainer>
      </UrbanPageShell>
    );
  }

  const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Account' }]}
          title={`Welcome, ${displayName}`}
          description="Recent orders, saved lists, and quick links to your grocery flows."
          aside={
            <div className="space-y-3">
              <UrbanMetric label="Orders" value={recentOrders.length} icon={Package} />
              <UrbanMetric label="Lists" value={savedLists.length} icon={ClipboardList} />
            </div>
          }
        />

        <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--sf-ink-faint)]">Quick links</p>
            <div className="mt-3 grid gap-2">
              <UrbanButtonLink href="/lists" variant="ghost" className="justify-start">Lists ({savedLists.length})</UrbanButtonLink>
              <UrbanButtonLink href={recentOrders[0] ? `/order/${recentOrders[0].id}` : '/products'} variant="ghost" className="justify-start">Latest order</UrbanButtonLink>
            </div>
          </aside>

          <section>
            <h2 className="border-b border-[var(--sf-rule)] pb-2 font-[family-name:var(--sf-font-display)] text-xl font-semibold text-[var(--sf-ink)]">Recent orders</h2>
            {recentOrders.length === 0 ? (
              <UrbanEmptyState title="No orders yet" actionHref="/products" actionLabel="Start shopping">Your order history will show up here.</UrbanEmptyState>
            ) : (
              <div>
                {recentOrders.map((order) => (
                  <article key={order.id} className="grid gap-4 border-b border-[var(--sf-rule)] py-5 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="font-[family-name:var(--sf-font-display)] text-lg font-semibold text-[var(--sf-ink)]">Order #{order.orderNumber}</p>
                      <p className="mt-1 text-sm text-[var(--sf-ink-muted)]">{new Date(order.createdAt).toLocaleDateString()} · {order.items.length} items</p>
                    </div>
                    <UrbanBadge tone="blue">{statusLabel(order.status)}</UrbanBadge>
                    <div className="sm:text-right">
                      <p className="font-[family-name:var(--sf-font-display)] text-xl font-semibold">{formatCents(order.total)}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm sm:justify-end">
                        <Link href={`/order/${order.id}`} className="font-medium text-[var(--sf-accent)]">Details</Link>
                        <form action={async () => { 'use server'; await reorderFromOrder(order.id); }}>
                          <button type="submit" className="font-medium text-[var(--sf-info)]">Reorder</button>
                        </form>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <section>
          <div className="mb-4 flex items-center justify-between border-b border-[var(--sf-rule)] pb-2">
            <h2 className="font-[family-name:var(--sf-font-display)] text-xl font-semibold text-[var(--sf-ink)]">Shopping lists</h2>
            <Link href="/lists" className="text-sm font-medium text-[var(--sf-accent)]">Manage</Link>
          </div>
          {savedLists.length === 0 ? (
            <UrbanEmptyState title="No saved lists" actionHref="/lists" actionLabel="Create a list">Build reusable weekly runs for staples and refills.</UrbanEmptyState>
          ) : (
            <div>
              {savedLists.map((list) => (
                <div key={list.id} className="flex flex-col gap-2 border-b border-[var(--sf-rule)] py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <ClipboardList className="h-4 w-4 shrink-0 text-[var(--sf-sage)]" />
                    <div>
                      <h3 className="font-medium text-[var(--sf-ink)]">{list.name}</h3>
                      <p className="text-sm text-[var(--sf-ink-muted)]">{list.items.length} items</p>
                    </div>
                  </div>
                  <Link href="/lists" className="text-sm font-medium text-[var(--sf-accent)]">Open</Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
