'use client';

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

export default function StorefrontServer({ children }: StorefrontServerProps) {
  return <QueryProvider>{children}</QueryProvider>;
}
