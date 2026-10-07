import Link from 'next/link';
import { PageContainer } from '@/features/dashboard/components/PageContainer';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { StaffManager } from '../components/StaffManager';
export async function StaffPage({ searchParams }: { searchParams?: Promise<Record<string,string>> }) {
  const params = await searchParams; const page = Math.max(1,Number(params?.page || 1));
  const response = await keystoneClient(`query Staff($page:Int!,$pageSize:Int!){groceryStaffDirectory(page:$page,pageSize:$pageSize)}`,{page,pageSize:25});
  if (!response.success) return <PageContainer title="Staff"><p role="alert" className="p-4">{response.error}</p></PageContainer>;
  const data = response.data.groceryStaffDirectory;
  return <PageContainer title="Staff & privacy"><div className="space-y-5 p-4"><h1 className="text-2xl font-semibold">Staff & privacy</h1><StaffManager data={data} /><nav className="flex gap-4" aria-label="Staff directory pages">{page>1?<Link href={`?page=${page-1}`}>Previous</Link>:null}<span>Page {page} of {data.pagination.totalPages}</span>{page<data.pagination.totalPages?<Link href={`?page=${page+1}`}>Next</Link>:null}</nav></div></PageContainer>;
}
export default StaffPage;
