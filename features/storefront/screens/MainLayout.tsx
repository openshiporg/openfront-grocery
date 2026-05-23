import { Metadata } from 'next';
import Link from 'next/link';

import StorefrontServer from './StorefrontServer';
import UrbanFooter from '@/features/storefront/modules/urban/UrbanFooter';
import UrbanNav from '@/features/storefront/modules/urban/UrbanNav';
import { UrbanButtonLink, UrbanPageShell } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <StorefrontServer prefetchUser prefetchCart prefetchDepartments>
      <div className="min-h-screen bg-[#121414] text-[#e2e2e2]">
        <UrbanNav />
        {children}
        <UrbanFooter />
      </div>
    </StorefrontServer>
  );
}

export const MainNotFoundMetadata: Metadata = {
  title: '404 | Urban Express',
  description: 'The requested Urban Express route does not exist.',
};

export function MainNotFound() {
  return (
    <UrbanPageShell className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-xl border border-[#5a4136] bg-[#1e2020] p-8 text-center">
        <p className="font-market-label text-xs font-black uppercase tracking-[0.22em] text-[#ffb693]">Route missing</p>
        <h1 className="mt-3 font-market-label text-5xl font-black uppercase tracking-[-0.06em] text-[#e2e2e2]">Sector not found</h1>
        <p className="mt-3 text-sm leading-6 text-[#e2bfb0]">The page you tried to access is not part of the active Urban Express grid.</p>
        <div className="mt-6"><UrbanButtonLink href="/">Return home</UrbanButtonLink></div>
      </div>
    </UrbanPageShell>
  );
}
