import { PlatformPageLinks } from '@/features/platform/components/PlatformPageLinks';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { PlatformErrorState } from '@/features/platform/components/PlatformPrimitives';
import FulfillmentBoardClient from '@/features/platform/fulfillment/components/FulfillmentBoardClient';
import { platformProjections } from '@/features/platform/lib/platformProjections';

export async function FulfillmentPage({searchParams}: {searchParams?: Promise<Record<string,string|string[]|undefined>> | Record<string,string|string[]|undefined>} = {}) {
  const params=searchParams?await searchParams:{};
  let data: Awaited<ReturnType<typeof platformProjections.fulfillment>> = null;
  let loadError: string | null = null;
  try {
    data = await platformProjections.fulfillment(Number(params.page || 1), Number(params.pageSize || 50), String(params.search || params.q || ""), String(params.status || ""));
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Unable to load fulfillment.';
  }

  const safe = data || { pending: [], picking: [], packed: [], orderItemSubstitutions: [] };
  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Fulfillment' },
  ];
  const header = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Pick &amp; pack</h1>
      <p className="mt-1 text-sm text-muted-foreground">Work paid orders through authorized stages and preserve substitution evidence.</p>
    </div>
  );

  return (
    <PageContainer title="Fulfillment" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 pb-8 md:px-6">
        <PlatformPageLinks pagination={data?.pagination} path="/dashboard/platform/fulfillment" searchParams={params} />
        {loadError ? (
          <PlatformErrorState description={loadError} />
        ) : (
          <FulfillmentBoardClient
            lanes={{ pending: safe.pending, picking: safe.picking, packed: safe.packed }}
            substitutions={safe.orderItemSubstitutions}
          />
        )}
      </div>
    </PageContainer>
  );
}

export default FulfillmentPage;
