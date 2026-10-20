import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '../lib/data/user';
import { getProductsByIds } from '../lib/data/products';
import { storefrontGraphQL, throwGraphQLErrors } from '../lib/data/graphql';
import { parseCatalogPage } from '../lib/catalogPagination';
import MarketAccountNav from '../modules/market/MarketAccountNav';
import RemoveFavorite from '../modules/market/RemoveFavorite';
import UrbanProductCard from '../modules/urban/UrbanProductCard';
import { Heart } from 'lucide-react';
import { UrbanContainer, UrbanEmptyState, UrbanPageHeader, UrbanPageShell, UrbanPager } from '../modules/urban/UrbanPrimitives';
export const metadata = { title: 'Favorites', description: 'Revisit your saved grocery favorites.' };
export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = parseCatalogPage((await searchParams).page), user = await getUser();
  const heading = <><UrbanPageHeader title="Your favorites" description="Revisit the products you have saved. Shopping lists are another way to keep your usual groceries together." breadcrumb={[{ label: 'Account', href: '/account' }, { label: 'Favorites' }]} /><MarketAccountNav active="favorites" /></>;
  if (!user) return <UrbanPageShell><UrbanContainer className="space-y-7 py-8 sm:py-10">{heading}<UrbanEmptyState icon={Heart} title="Sign in to see your favorites" actionHref="/account/sign-in?from=%2Ffavorites" actionLabel="Sign in">Your saved groceries belong to your account.</UrbanEmptyState></UrbanContainer></UrbanPageShell>;
  type Favorite = { id: string; product: string; productRef?: { id: string } | null };
  const result = await storefrontGraphQL<{ favoriteProducts: Favorite[]; favoriteProductsCount: number }>('query Favorites($skip:Int!,$take:Int!){favoriteProducts(skip:$skip,take:$take,orderBy:[{favoritedAt:desc},{id:asc}]){id product productRef{id}} favoriteProductsCount}', { skip: (page - 1) * 20, take: 20 }, { cache: 'no-store' });
  throwGraphQLErrors(result.errors);
  if (!result.data?.favoriteProducts) throw new Error('Favorites could not be loaded.');
  const favorites = result.data.favoriteProducts, pages = Math.max(1, Math.ceil(result.data.favoriteProductsCount / 20));
  if (page > pages) redirect(`/favorites?page=${pages}`);
  const { products } = await getProductsByIds(favorites.flatMap((favorite) => favorite.productRef?.id ? [favorite.productRef.id] : []));
  return <UrbanPageShell><UrbanContainer className="space-y-7 py-8 sm:py-10">{heading}
    {favorites.length ? <ul className="grid grid-cols-2 items-start gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-5">{favorites.map((favorite) => { const product = products.find((item) => item.id === favorite.productRef?.id); return <li key={favorite.id} className="min-w-0">{product ? <UrbanProductCard product={product} /> : <div className="flex aspect-square flex-col justify-between rounded-[var(--sf-radius-lg)] bg-[var(--sf-paper-2)] p-4"><h2 className="text-base font-bold">{favorite.product}</h2><div><p className="text-sm leading-6 text-[var(--sf-ink-muted)]">{favorite.productRef?.id ? 'This saved product is not currently available in the catalog.' : 'This saved product needs matching. Find it in the catalog and save it to a shopping list.'}</p><Link href="/products" className="mt-2 inline-flex min-h-9 items-center text-sm font-semibold underline underline-offset-4">Find another product</Link></div></div>}<RemoveFavorite id={favorite.id} name={product?.name || favorite.product} /></li>; })}</ul> : <UrbanEmptyState icon={Heart} title="No favorites saved yet" actionHref="/products" actionLabel="Browse products">Open any product and choose Save to favorites to keep it here.</UrbanEmptyState>}
    {pages > 1 ? <UrbanPager label="Favorite pages" page={page} totalPages={pages} previousHref={`/favorites?page=${page - 1}`} nextHref={`/favorites?page=${page + 1}`} /> : null}
  </UrbanContainer></UrbanPageShell>;
}
