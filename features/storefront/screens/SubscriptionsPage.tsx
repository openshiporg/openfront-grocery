import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getStore } from '../lib/data/store';
import { getUser } from '../lib/data/user';
import { getProductsList } from '../lib/data/products';
import { parseCatalogPage } from '../lib/catalogPagination';
import { storefrontGraphQL, throwGraphQLErrors } from '../lib/data/graphql';
import { UrbanButton, UrbanContainer, UrbanEmptyState, UrbanPageHeader, UrbanPageShell, UrbanTextInput } from '../modules/urban/UrbanPrimitives';
import { RecurringOrdersClient } from '../modules/subscriptions/RecurringOrdersClient';
import MarketAccountNav from '../modules/market/MarketAccountNav';
export function generateMetadata() { return { title: 'Recurring baskets & rewards', description: 'Manage regular groceries and account rewards.' }; }
export async function SubscriptionsPage({ searchParams }: { searchParams?: Promise<{ page?: string; q?: string }> } = {}) {
  const params = await searchParams || {}, page = parseCatalogPage(params.page), search = (params.q || '').slice(0, 100);
  const [user, store] = await Promise.all([getUser(), getStore()]);
  const header = <><UrbanPageHeader title="Your regular groceries" description="Prepare familiar groceries on a schedule, then approve each checkout. Manage your store rewards here, too." breadcrumb={[{ label: 'Account', href: '/account' }, { label: 'Recurring & rewards' }]} /><MarketAccountNav active="subscriptions" /></>;
  if (!user) return <UrbanPageShell><UrbanContainer className="space-y-6 py-8">{header}<UrbanEmptyState title="Sign in for recurring baskets & rewards" actionHref="/dashboard/signin?from=/subscriptions" actionLabel="Sign in">See your schedules, review prepared baskets, and exchange available points.</UrbanEmptyState></UrbanContainer></UrbanPageShell>;
  const [overview, loyaltyResult, catalog] = await Promise.all([
    storefrontGraphQL<any>('query($page:Int){groceryRecurringOverview(page:$page,customerOnly:true)}', { page }, { cache: 'no-store' }),
    storefrontGraphQL<any>('query{getGroceryLoyalty}', {}, { cache: 'no-store' }),
    getProductsList({ limit: 50, search, availability: 'all' }),
  ]);
  throwGraphQLErrors(overview.errors); throwGraphQLErrors(loyaltyResult.errors);
  if (!overview.data?.groceryRecurringOverview) throw new Error('Recurring baskets could not be loaded.');
  const { subscriptions, runs, pagination } = overview.data.groceryRecurringOverview;
  const pages = Math.max(1, ...Object.values(pagination.collections).map((entry: any) => entry.totalPages));
  const href = (next: number) => `/subscriptions?${new URLSearchParams({ page: String(next), ...(search ? { q: search } : {}) })}`;
  if (page > pages) redirect(href(pages));
  return <UrbanPageShell><UrbanContainer className="space-y-6 py-8">{header}
    <form action="/subscriptions" className="sf-panel flex flex-wrap items-end gap-3 p-4"><label className="sf-label min-w-0 flex-1">Find a product to repeat<UrbanTextInput type="search" name="q" defaultValue={search} maxLength={100} placeholder="Search your usual groceries" /></label><UrbanButton type="submit" variant="ghost">Find products</UrbanButton><p className="w-full text-xs leading-6 text-[var(--sf-ink-muted)]">Showing {catalog.products.length} of {catalog.count} matching products. Refine your search to find another item.</p></form>
    <RecurringOrdersClient subscriptions={subscriptions} runs={runs} products={catalog.products} loyalty={loyaltyResult.data?.getGroceryLoyalty} currencyCode={store.currencyCode || 'USD'} />
    {pages > 1 ? <nav className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--sf-rule)] pt-4 text-sm" aria-label="Recurring history pages">{page > 1 ? <Link className="inline-flex min-h-11 items-center underline" href={href(page - 1)}>Previous</Link> : <span />}<p>Page {page} of {pages}</p>{page < pages ? <Link className="inline-flex min-h-11 items-center underline" href={href(page + 1)}>Next</Link> : <span />}</nav> : null}
  </UrbanContainer></UrbanPageShell>;
}
export default SubscriptionsPage;
