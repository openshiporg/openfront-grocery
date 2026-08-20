import type { Metadata } from 'next';
import { CheckSquare2, ClipboardList, ListPlus } from 'lucide-react';

import { getShoppingLists } from '@/features/storefront/lib/data/lists';
import { getUser } from '@/features/storefront/lib/data/user';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import ListManager from '@/features/storefront/modules/lists/list-manager';
import type { ShoppingList } from '@/features/storefront/types';
import { UrbanButtonLink, UrbanContainer, UrbanMetric, UrbanPageHeader, UrbanPageShell, UrbanEmptyState } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return storefrontMetadata({
    title: 'Lists',
    description: 'Create and manage grocery shopping lists.',
  });
}

export async function ShoppingListsPage() {
  const [user, lists] = await Promise.all([getUser(), getShoppingLists()]);
  const typedLists = lists as ShoppingList[];
  const totalItems = typedLists.reduce((sum, list) => sum + list.items.length, 0);

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Lists' }]}
          title="Shopping lists"
          description="Reusable grocery runs you can send straight to your basket."
          aside={
            <div className="space-y-3">
              <UrbanMetric label="Lists" value={typedLists.length} icon={ListPlus} />
              <UrbanMetric label="Items" value={totalItems} icon={CheckSquare2} />
            </div>
          }
        />

        {user ? (
          <ListManager initialLists={typedLists} />
        ) : (
          <UrbanEmptyState title="Sign in to manage lists" actionHref="/dashboard/signin?from=/lists" actionLabel="Sign in">
            Save weekly staples and send entire lists into your basket.
          </UrbanEmptyState>
        )}
      </UrbanContainer>
    </UrbanPageShell>
  );
}
