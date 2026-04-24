import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../lib/query-keys';
import { fetchProducts, fetchCart, fetchUser, fetchDepartments } from '../lib/data';
import QueryProvider from '../lib/providers/query-client-provider';

interface StorefrontServerProps {
  children: React.ReactNode;
  prefetchProducts?: {
    departmentId?: string;
    limit?: number;
  };
  prefetchUser?: boolean;
  prefetchCart?: boolean;
  prefetchDepartments?: boolean;
}

export default async function StorefrontServer({
  children,
  prefetchProducts = { limit: 12 },
  prefetchUser = true,
  prefetchCart = true,
  prefetchDepartments = true,
}: StorefrontServerProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute - prevent immediate refetching on client
        gcTime: 10 * 60 * 1000, // 10 minutes
      },
    },
  });

  // Prefetch products
  if (prefetchProducts) {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.products.list(prefetchProducts),
      queryFn: () => fetchProducts(prefetchProducts),
    });
  }

  // Prefetch user data
  if (prefetchUser) {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.user.profile(),
      queryFn: () => fetchUser(),
    });
  }

  // Prefetch cart
  if (prefetchCart) {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.cart.active(),
      queryFn: () => fetchCart(),
    });
  }

  // Prefetch departments (grocery-specific)
  if (prefetchDepartments) {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.departments.list(),
      queryFn: () => fetchDepartments(),
    });
  }

  return (
    <QueryProvider>
      <HydrationBoundary state={dehydrate(queryClient)}>
        {children}
      </HydrationBoundary>
    </QueryProvider>
  );
}
