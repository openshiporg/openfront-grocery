import StorefrontLayout from './(storefront)/layout';
import { MainNotFound } from '@/features/storefront/screens/MainLayout';
import { getStore } from '@/features/storefront/lib/data/store';

// Unmatched paths render here, outside the storefront route group, so this wraps the
// branded storefront 404 in the storefront layout and names the store in its one title.
export default async function NotFound() {
  const store = await getStore();
  return (
    <StorefrontLayout>
      <title>{store.name ? `Page not found | ${store.name}` : 'Page not found'}</title>
      <MainNotFound />
    </StorefrontLayout>
  );
}
