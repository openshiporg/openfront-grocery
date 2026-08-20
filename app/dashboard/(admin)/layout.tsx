export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';

import { getAdminMetaAction, getAuthenticatedUser } from '@/features/dashboard/actions';
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout';

export default async function ListLayout({ children }: { children: React.ReactNode }) {
  // Resolve and authorize the current actor before the independent metadata
  // request. This avoids avoidable pool concurrency and never loads dashboard
  // metadata for an anonymous or revoked session.
  const userResponse = await getAuthenticatedUser();
  const user = userResponse.success ? userResponse.data?.authenticatedItem : null;
  if (!user) redirect('/dashboard/signin');
  if (!user.role?.canAccessDashboard) redirect('/dashboard/no-access');

  const adminMetaResponse = await getAdminMetaAction();
  const adminMeta = adminMetaResponse.success ? adminMetaResponse.data : null;

  return (
    <DashboardLayout adminMeta={adminMeta} authenticatedItem={user}>
      {children}
    </DashboardLayout>
  );
}
