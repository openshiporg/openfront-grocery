import { gql } from 'graphql-request';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import FulfillmentBoardClient from '@/features/platform/fulfillment/components/FulfillmentBoardClient';

const FULFILLMENT_QUERY = gql`
  query GroceryFulfillmentBoard {
    picking: orders(where: { status: { equals: picking } }, orderBy: { createdAt: asc }, take: 20) {
      id
      displayId
      email
      status
      deliveryTimeWindow
      substitutionPreference
      metadata
      lineItems { id quantity title sku }
    }
    packed: orders(where: { status: { equals: packed } }, orderBy: { updatedAt: desc }, take: 20) {
      id
      displayId
      email
      status
      deliveryTimeWindow
      substitutionPreference
      metadata
      lineItems { id quantity title sku }
    }
    pending: orders(where: { status: { equals: pending } }, orderBy: { createdAt: asc }, take: 20) {
      id
      displayId
      email
      status
      deliveryTimeWindow
      substitutionPreference
      metadata
      lineItems { id quantity title sku }
    }
    orderItemSubstitutions(orderBy: { createdAt: desc }, take: 200) {
      id
      orderItem
      originalProduct
      substitutedProduct
      reason
      customerApproved
      approvedAt
    }
  }
`;

export async function FulfillmentPage() {
  const response = await keystoneClient<any>(FULFILLMENT_QUERY);
  const data = response.success ? response.data : { pending: [], picking: [], packed: [], orderItemSubstitutions: [] };

  const columns = [
    { title: 'Pending', items: data.pending || [] },
    { title: 'Picking', items: data.picking || [] },
    { title: 'Packed', items: data.packed || [] },
  ];

  const substitutionCount = (data.orderItemSubstitutions || []).length;
  const waitingApprovalCount = (data.orderItemSubstitutions || []).filter((entry: any) => !entry.customerApproved).length;

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '/dashboard' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Fulfillment' },
  ];

  const header = (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fulfillment Board</h1>
        <p className="text-sm text-muted-foreground">Picker-focused workflow for starting orders, capturing substitutions, and sending packed orders onward.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full border px-2.5 py-1 bg-background">Substitutions logged: {substitutionCount}</span>
        <span className="rounded-full border px-2.5 py-1 bg-background">Waiting customer approval: {waitingApprovalCount}</span>
      </div>
    </div>
  );

  return (
    <PageContainer title="Fulfillment" header={header} breadcrumbs={breadcrumbs}>
      <div className="px-4 md:px-6 pb-6">
        <FulfillmentBoardClient columns={columns} substitutions={data.orderItemSubstitutions || []} />
      </div>
    </PageContainer>
  );
}

export default FulfillmentPage;
