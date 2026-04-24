import { getAdminMetaAction } from '@/features/dashboard/actions';
import { ListPage } from '@/features/dashboard/screens/ListPage';
import { notFound } from 'next/navigation';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export function createPlatformListPage(targetListKey: string) {
  return async function PlatformListPage(props: { searchParams: SearchParams }) {
    const adminMetaResponse = await getAdminMetaAction();

    if (!adminMetaResponse.success) {
      notFound();
    }

    const list = adminMetaResponse.data?.lists?.find((item: any) => item.key === targetListKey);

    if (!list?.path) {
      notFound();
    }

    return (
      <ListPage
        params={Promise.resolve({ listKey: list.path })}
        searchParams={props.searchParams}
      />
    );
  };
}
