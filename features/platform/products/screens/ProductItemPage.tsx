import { notFound } from 'next/navigation';
import { Apple, ArrowLeft, Package } from 'lucide-react';
import { PlatformErrorState, PlatformFacts, PlatformFeedback, PlatformLinkButton, PlatformPage, PlatformSurface } from '@/features/platform/components/PlatformPrimitives';
import { keystoneClient } from '@/features/platform/lib/platformClient';
import { ProductForm, type EditableProduct } from '../components/ProductForm';
import { loadProductFormOptions, PRODUCT_FIELDS } from '../lib/productData';

const PATH = '/dashboard/platform/products';

/** Edit one product's catalog identity, placement, price and unit. */
export async function ProductItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const [response, options] = await Promise.all([
    keystoneClient<any>(`query($id:ID!){ product(where:{id:$id}){ ${PRODUCT_FIELDS} } }`, { id }, { cache: 'no-store' }),
    loadProductFormOptions().catch((error: unknown) => error instanceof Error ? error : new Error('Options could not be loaded.')),
  ]);
  const retryHref = `${PATH}/${encodeURIComponent(id)}`;
  if (!response.success) return <PlatformPage title="Product" breadcrumb="Product"><PlatformErrorState description={response.error || 'This product could not be loaded.'} retryHref={retryHref} /></PlatformPage>;
  const product = response.data?.product as (EditableProduct & { informationSource?: string | null; variantLabel?: string | null }) | null;
  if (!product) notFound();
  return (
    <PlatformPage title={product.title} breadcrumb="Product" description={product.sku ? `SKU ${product.sku}` : undefined}
      actions={<PlatformLinkButton href={PATH} icon={ArrowLeft}>All products</PlatformLinkButton>}>
      {query.created ? <PlatformFeedback tone="success">Product created as a draft. Set its status to Published when it is ready for the shop.</PlatformFeedback> : null}
      {options instanceof Error ? <PlatformErrorState description={options.message} retryHref={retryHref} /> : (
        <PlatformSurface icon={Package} title="Product details">
          <ProductForm product={product} departments={options.departments} suppliers={options.suppliers} currencyCode={options.currencyCode} />
        </PlatformSurface>
      )}
      <PlatformSurface icon={Apple} title="Nutrition, allergens and pack" description="Recorded as versions from a supplier source in Merchandising.">
        <div className="space-y-3 p-4 md:p-5">
          <PlatformFacts columns={2} items={[
            { label: 'Information source', value: product.informationSource || 'Not recorded' },
            { label: 'Pack label', value: product.variantLabel || 'None' },
          ]} />
          <PlatformLinkButton href="/dashboard/platform/merchandising" size="sm">Edit in Merchandising</PlatformLinkButton>
        </div>
      </PlatformSurface>
    </PlatformPage>
  );
}

export default ProductItemPage;
