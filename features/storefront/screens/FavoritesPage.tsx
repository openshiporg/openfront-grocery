import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '../lib/data/user';
import { getProductsByIds } from '../lib/data/products';
import { storefrontGraphQL, throwGraphQLErrors } from '../lib/data/graphql';
import { parseCatalogPage } from '../lib/catalogPagination';
import MarketAccountNav from '../modules/market/MarketAccountNav';
import RemoveFavorite from '../modules/market/RemoveFavorite';
import UrbanProductCard from '../modules/urban/UrbanProductCard';
import { UrbanContainer, UrbanEmptyState, UrbanPageHeader, UrbanPageShell } from '../modules/urban/UrbanPrimitives';
export const metadata = { title: 'Favorites', description: 'Revisit your saved grocery favorites.' };
export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = parseCatalogPage((await searchParams).page), user = await getUser();
  const heading = <><UrbanPageHeader title="Your favorites" description="Revisit the products you have saved. Shopping lists are another way to keep your usual groceries together." breadcrumb={[{ label: 'Account', href: '/account' }, { label: 'Favorites' }]} /><MarketAccountNav active="favorites" /></>;
  if (!user) return <UrbanPageShell><UrbanContainer className="space-y-6 py-8">{heading}<UrbanEmptyState title="Sign in to see your favorites" actionHref="/dashboard/signin?from=/favorites" actionLabel="Sign in">Your saved groceries belong to your account.</UrbanEmptyState></UrbanContainer></UrbanPageShell>;
  type Favorite = { id: string; product: string; productRef?: { id: string } | null };
  const result = await storefrontGraphQL<{ favoriteProducts: Favorite[]; favoriteProductsCount: number }>('query Favorites($skip:Int!,$take:Int!){favoriteProducts(skip:$skip,take:$take,orderBy:[{favoritedAt:desc},{id:asc}]){id product productRef{id}} favoriteProductsCount}', { skip: (page - 1) * 20, take: 20 }, { cache: 'no-store' });
  throwGraphQLErrors(result.errors);
  if (!result.data?.favoriteProducts) throw new Error('Favorites could not be loaded.');
  const favorites = result.data.favoriteProducts, pages = Math.max(1, Math.ceil(result.data.favoriteProductsCount / 20));
  if (page > pages) redirect(`/favorites?page=${pages}`);
  const { products } = await getProductsByIds(favorites.flatMap((favorite) => favorite.productRef?.id ? [favorite.productRef.id] : []));
  return <UrbanPageShell><UrbanContainer className="space-y-6 py-8">{heading}
    {favorites.length ? <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-3 lg:grid-cols-4">{favorites.map((favorite) => { const product = products.find((item) => item.id === favorite.productRef?.id); return <div key={favorite.id} className="min-w-0">{product ? <UrbanProductCard product={product} /> : <div className="sf-note"><h2 className="font-semibold">{favorite.product}</h2><p className="mt-2">{favorite.productRef?.id ? 'This saved product is not currently available in the catalog.' : 'This saved product needs matching. Find it in the catalog and save it to a shopping list.'}</p><Link href="/products" className="mt-3 inline-block underline">Find another product</Link></div>}<RemoveFavorite id={favorite.id} name={product?.name || favorite.product} /></div>; })}</div> : <UrbanEmptyState title="No favorites saved yet" actionHref="/lists" actionLabel="Create a shopping list">Keep your usual groceries in a reusable list for your next shop.</UrbanEmptyState>}
    {pages > 1 ? <nav aria-label="Favorite pages" className="flex items-center justify-between gap-3 text-sm">{page > 1 ? <Link href={`/favorites?page=${page - 1}`} className="py-3 underline">Previous</Link> : <span />}<p>Page {page} of {pages}</p>{page < pages ? <Link href={`/favorites?page=${page + 1}`} className="py-3 underline">Next</Link> : <span />}</nav> : null}
  </UrbanContainer></UrbanPageShell>;
}
