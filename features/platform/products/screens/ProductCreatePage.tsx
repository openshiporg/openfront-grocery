import { ArrowLeft, Package } from 'lucide-react';
import { PlatformErrorState, PlatformLinkButton, PlatformPage, PlatformSurface } from '@/features/platform/components/PlatformPrimitives';
import { ProductForm } from '../components/ProductForm';
import { loadProductFormOptions } from '../lib/productData';

const PATH = '/dashboard/platform/products';

/** Create a product; it starts as a draft unless published here. */
export async function ProductCreatePage() {
  let options: Awaited<ReturnType<typeof loadProductFormOptions>> | null = null;
  let loadError: string | null = null;
  try { options = await loadProductFormOptions(); } catch (error) { loadError = error instanceof Error ? error.message : 'Departments and suppliers could not be loaded.'; }
  return (
    <PlatformPage title="New product" breadcrumb="New product" actions={<PlatformLinkButton href={PATH} icon={ArrowLeft}>All products</PlatformLinkButton>}>
      {loadError || !options ? <PlatformErrorState description={loadError || 'Departments and suppliers could not be loaded.'} retryHref={`${PATH}/create`} /> : (
        <PlatformSurface icon={Package} title="Product details">
          <ProductForm departments={options.departments} suppliers={options.suppliers} currencyCode={options.currencyCode} />
        </PlatformSurface>
      )}
    </PlatformPage>
  );
}

export default ProductCreatePage;
