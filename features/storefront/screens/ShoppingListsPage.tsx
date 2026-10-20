import type { Metadata } from 'next';
import { ListChecks } from 'lucide-react';
import MarketAccountNav from '../modules/market/MarketAccountNav';

import { getShoppingLists } from '@/features/storefront/lib/data/lists';
import { getUser } from '@/features/storefront/lib/data/user';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import ListManager from '@/features/storefront/modules/lists/list-manager';
import type { ShoppingList } from '@/features/storefront/types';
import { UrbanContainer, UrbanPageHeader, UrbanPageShell, UrbanEmptyState } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return storefrontMetadata({
    title: 'Lists',
    description: 'Create and manage grocery shopping lists.',
  });
}

export async function ShoppingListsPage() {
  const user = await getUser();
  const lists = user ? await getShoppingLists({ throwOnError: true }) : [];
  const typedLists = lists as ShoppingList[];

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-7 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Account', href: '/account' }, { label: 'Shopping lists' }]}
          title="Shopping lists"
          description="Reusable grocery runs: tick things off as you go, then send everything unchecked to your basket."
        />

        <MarketAccountNav active="lists" />
        {user ? (
          <ListManager initialLists={typedLists} />
        ) : (
          <UrbanEmptyState icon={ListChecks} title="Sign in to manage lists" actionHref="/account/sign-in?from=%2Flists" actionLabel="Sign in">
            Save weekly staples and send entire lists into your basket.
          </UrbanEmptyState>
        )}
      </UrbanContainer>
    </UrbanPageShell>
  );
}
