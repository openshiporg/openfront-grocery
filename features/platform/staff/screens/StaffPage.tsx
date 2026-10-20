import { keystoneClient } from '@/features/platform/lib/platformClient';
import { PlatformErrorState, PlatformMetricGrid, PlatformPage } from '@/features/platform/components/PlatformPrimitives';
import { PlatformPager } from '@/features/platform/components/PlatformPageLinks';
import { StaffManager } from '../components/StaffManager';
import { parsePageParam } from '@/features/platform/lib/pageParams';

const PATH = '/dashboard/platform/staff';

export async function StaffPage({ searchParams }: { searchParams?: Promise<Record<string,string | string[] | undefined>> }) {
  const params = (await searchParams) || {}; const page = parsePageParam(params.page);
  const search = typeof params.q === 'string' ? params.q.trim().slice(0, 100) : '';
  const access = typeof params.access === 'string' ? params.access : '';
  const response = await keystoneClient(`query Staff($page:Int!,$pageSize:Int!,$search:String,$access:String){groceryStaffDirectory(page:$page,pageSize:$pageSize,search:$search,access:$access)}`,{page,pageSize:25,search,access:access||null}, { cache: 'no-store' });
  const data = response.success ? response.data.groceryStaffDirectory : null;
  const counts = data?.pagination?.counts || {};
  const activeStaff = (data?.staff || []).filter((user: any) => user.role).length;
  const openPrivacy = (data?.privacyRequests || []).filter((request: any) => !['completed', 'rejected', 'approved'].includes(request.status)).length;

  return (
    <PlatformPage
      title="Staff & privacy"
      description="Manage staff access and privacy requests."
    >
      {!data ? <PlatformErrorState description={response.success ? 'The staff directory is unavailable.' : response.error} retryHref={PATH} /> : <>
        <PlatformMetricGrid metrics={[
          { label: 'Staff accounts', value: data.accessCounts?.all ?? counts.staffCount ?? data.staff.length, note: `${data.accessCounts?.active ?? activeStaff} with access` },
          { label: 'Pending invitations', value: counts.invitationCount ?? data.invitations.length, note: 'Expire after 48 hours' },
          { label: 'Privacy requests', value: counts.privacyCount ?? data.privacyRequests.length, note: `${openPrivacy} awaiting review on this page`, tone: openPrivacy ? 'warning' : 'default' },
          { label: 'Access events', value: counts.eventCount ?? data.events.length, note: 'Audited grants, changes and revocations' },
        ]} />
        <StaffManager data={data} now={Date.now()} />
        <div className="overflow-hidden rounded-xl border bg-card [&>nav]:border-t-0">
          <PlatformPager page={page} totalPages={data.pagination.totalPages} hrefFor={(target) => `${PATH}?${new URLSearchParams({ ...(search ? { q: search } : {}), ...(access ? { access } : {}), page: String(target) })}`} label="Staff directory pages" summary={<>Page {page} of {data.pagination.totalPages} · up to 25 records per section</>} />
        </div>
      </>}
    </PlatformPage>
  );
}
export default StaffPage;
