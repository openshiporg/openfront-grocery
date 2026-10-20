import Link from 'next/link';
import { Package, Plus } from 'lucide-react';
import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import {
  PlatformCellLabel,
  PlatformEmptyState,
  PlatformErrorState,
  PlatformList,
  PlatformListHeader,
  PlatformLinkButton,
  PlatformPage,
  PlatformSearchParams,
  PlatformStatusBadge,
  PlatformSurface,
  PlatformTabs,
  PlatformToolbar,
  queryValue,
} from '@/features/platform/components/PlatformPrimitives';
import { formatDate, formatMoney } from '@/features/platform/lib/format';
import { keystoneClient } from '@/features/platform/lib/platformClient';
import { parsePageParam } from '@/features/platform/lib/pageParams';
import { platformProjections } from '@/features/platform/lib/platformProjections';

const PATH = '/dashboard/platform/products';
const PAGE_SIZE = 50;
const rowGrid = 'md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_7rem_7rem_7rem] md:items-center md:gap-3';
const STATUSES = ['draft', 'published', 'archived'];

/** The store's catalog: search, status tabs and sort run on the server across every product. */
export async function ProductsPage({ searchParams }: { searchParams?: Promise<PlatformSearchParams> | PlatformSearchParams } = {}) {
  const params = searchParams ? await searchParams : {};
  const q = queryValue(params, 'q').trim().slice(0, 100);
  const filter = queryValue(params, 'filter') || 'all';
  const sort = queryValue(params, 'sort') || 'updated';
  const page = parsePageParam(params.page);
  const search = q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { handle: { contains: q, mode: 'insensitive' } }] } : {};
  const where = { AND: [search, STATUSES.includes(filter) ? { status: { equals: filter } } : {}] };
  const orderBy = sort === 'title' ? [{ title: 'asc' }, { id: 'asc' }] : [{ updatedAt: 'desc' }, { id: 'asc' }];
  const [response, merchandising] = await Promise.all([
    keystoneClient<any>(`query($where:ProductWhereInput!,$search:ProductWhereInput!,$take:Int!,$skip:Int!,$orderBy:[ProductOrderByInput!]!){
      products(where:$where,take:$take,skip:$skip,orderBy:$orderBy){ id title sku status priceCents unitOfMeasure updatedAt departmentRef { name } }
      total: productsCount(where:$where)
      all: productsCount(where:$search)
      draft: productsCount(where:{AND:[$search,{status:{equals:draft}}]})
      published: productsCount(where:{AND:[$search,{status:{equals:published}}]})
      archived: productsCount(where:{AND:[$search,{status:{equals:archived}}]})
    }`, { where, search, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE, orderBy }, { cache: 'no-store' }),
    platformProjections.merchandising(1, 1).catch(() => null),
  ]);
  const currencyCode = merchandising?.currencyCode || 'USD';
  const data = response.success ? response.data : null;
  const products: any[] = data?.products || [];
  const total = Number(data?.total || 0);

  return (
    <PlatformPage title="Products" description="Create products, set prices and units, and publish them to the shop." actions={<PlatformLinkButton href={`${PATH}/create`} icon={Plus}>New product</PlatformLinkButton>}>
      {!data ? <PlatformErrorState description={response.error || 'Products could not be loaded.'} retryHref={PATH} /> : (
        <PlatformSurface icon={Package} title="Catalog" description="Open a product to edit it."
          tabs={<PlatformTabs path={PATH} params={params} active={filter} label="Product status" tabs={[
            { value: 'all', label: 'All', count: data.all },
            { value: 'draft', label: 'Drafts', count: data.draft, tone: 'attention' },
            { value: 'published', label: 'Published', count: data.published },
            { value: 'archived', label: 'Archived', count: data.archived },
          ]} />}>
          <PlatformToolbar path={PATH} search={q} searchPlaceholder="Name, SKU or handle" preserve={{ filter }} sort={sort}
            sortOptions={[{ value: 'updated', label: 'Recently updated' }, { value: 'title', label: 'Name A–Z' }]} resultCount={total} />
          {products.length === 0 ? (
            <PlatformEmptyState icon={Package} title={q || filter !== 'all' ? 'No matching products' : 'No products yet'} description={q || filter !== 'all' ? 'Reset the filters or search for something else.' : 'Create a product or import a catalog from Merchandising.'}
              action={<Link href={`${PATH}/create`} className="text-sm font-medium underline underline-offset-4">New product</Link>} />
          ) : (
            <>
              <PlatformListHeader static className={rowGrid}><span>Product</span><span>Department</span><span>Status</span><span className="text-right">Price</span><span className="text-right">Updated</span></PlatformListHeader>
              <PlatformList>
                {products.map((product) => (
                  <Link key={product.id} href={`${PATH}/${encodeURIComponent(product.id)}`} className={`grid gap-1 px-4 py-3 transition-colors hover:bg-muted/40 md:px-5 ${rowGrid}`}>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{product.title}</span><span className="block truncate font-mono text-xs text-muted-foreground">{product.sku || 'No SKU'}</span></span>
                    <span className="truncate text-sm text-muted-foreground"><PlatformCellLabel>Department</PlatformCellLabel>{product.departmentRef?.name || 'No department'}</span>
                    <span><PlatformCellLabel>Status</PlatformCellLabel><PlatformStatusBadge status={product.status === 'published' ? 'active' : product.status === 'archived' ? 'inactive' : 'pending'} label={product.status === 'published' ? 'Published' : product.status === 'archived' ? 'Archived' : 'Draft'} /></span>
                    <span className="text-sm tabular-nums md:text-right"><PlatformCellLabel>Price</PlatformCellLabel>{formatMoney(product.priceCents, currencyCode)}<span className="text-xs text-muted-foreground"> / {product.unitOfMeasure || 'each'}</span></span>
                    <span className="text-xs text-muted-foreground md:text-right"><PlatformCellLabel>Updated</PlatformCellLabel>{formatDate(product.updatedAt)}</span>
                  </Link>
                ))}
              </PlatformList>
            </>
          )}
          <PlatformPageLinks pagination={{ page, pageSize: PAGE_SIZE, collections: { products: { total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) } } }} path={PATH} searchParams={params} />
        </PlatformSurface>
      )}
    </PlatformPage>
  );
}

export default ProductsPage;
