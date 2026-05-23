import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckSquare2, ClipboardList, ListPlus } from 'lucide-react';

import { getShoppingLists } from '@/features/storefront/lib/data/lists';
import { getUser } from '@/features/storefront/lib/data/user';
import ListManager from '@/features/storefront/modules/lists/list-manager';
import type { ShoppingList } from '@/features/storefront/types';
import { UrbanBadge, UrbanButtonLink, UrbanContainer, UrbanEmptyState, UrbanHeadline, UrbanMetric, UrbanPageShell, UrbanPanel } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Shopping Lists | Urban Express',
    description: 'Create and manage Urban Express grocery shopping lists.',
  };
}

export async function ShoppingListsPage() {
  const [user, lists] = await Promise.all([getUser(), getShoppingLists()]);
  const typedLists = lists as ShoppingList[];
  const totalItems = typedLists.reduce((sum, list) => sum + list.items.length, 0);

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8">
        <nav className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <Link href="/" className="hover:text-[#ffb693]">Urban Express</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <span className="text-[#ffb693]">Lists</span>
        </nav>

        <section className="grid gap-3 lg:grid-cols-[1fr_360px]">
          <UrbanPanel className="p-5 sm:p-8">
            <UrbanBadge tone="orange"><ClipboardList className="h-3 w-3" /> Saved list ops</UrbanBadge>
            <UrbanHeadline className="mt-5">Reorder without rebuilding.</UrbanHeadline>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-[#e2bfb0]">Build reusable household, school, office, and cold-chain grocery runs from live Openfront list data.</p>
          </UrbanPanel>
          <div className="grid gap-3">
            <UrbanMetric label="Saved lists" value={typedLists.length} icon={ListPlus} />
            <UrbanMetric label="List items" value={totalItems} icon={CheckSquare2} />
          </div>
        </section>

        {!user ? (
          <UrbanEmptyState title="Sign in to manage lists" actionHref="/dashboard/signin?from=/lists" actionLabel="Sign in">
            Save weekly staples, build reusable household lists, and send entire lists back into the cart.
          </UrbanEmptyState>
        ) : (
          <ListManager initialLists={typedLists} />
        )}

        {user && typedLists.length === 0 ? <div className="text-center"><UrbanButtonLink href="/products">Find products for a new list</UrbanButtonLink></div> : null}
      </UrbanContainer>
    </UrbanPageShell>
  );
}
