import type { Metadata } from 'next';
import Link from 'next/link';
import { Boxes, Clock3, Map, PackageSearch, Thermometer } from 'lucide-react';

import { getDepartmentsList } from '@/features/storefront/lib/data/departments';
import type { GroceryDepartment } from '@/features/storefront/types';
import UrbanDepartmentCard from '@/features/storefront/modules/urban/UrbanDepartmentCard';
import { UrbanBadge, UrbanContainer, UrbanHeadline, UrbanMetric, UrbanPageShell, UrbanPanel, UrbanSearchStrip } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Aisles | Openfront Grocery',
    description: 'Browse grocery sectors and departments in the Urban Express storefront.',
  };
}

export async function DepartmentsPage(props: { params: Promise<{ countryCode?: string }> }) {
  await props.params;
  const { departments }: { departments: GroceryDepartment[] } = await getDepartmentsList(0, 24);

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8">
        <nav className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <Link href="/" className="hover:text-[#ffb693]">Urban Express</Link>
          <span className="mx-2 text-[#5a4136]">/</span>
          <span className="text-[#ffb693]">Aisles</span>
        </nav>

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
          <UrbanPanel className="relative overflow-hidden p-5 sm:p-8 lg:p-10">
            <div className="relative z-10 max-w-4xl">
              <UrbanBadge tone="orange"><Map className="h-3 w-3" /> Department grid</UrbanBadge>
              <UrbanHeadline className="mt-5">Shop the store by sector.</UrbanHeadline>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-[#e2bfb0]">Aisles are organized for shoppers and pickers: temperature handling, stock signals, pantry missions, and replenishment routines.</p>
              <div className="mt-8 max-w-2xl"><UrbanSearchStrip placeholder="Search departments, staples, fresh chain..." /></div>
            </div>
          </UrbanPanel>
          <div className="grid gap-3">
            <UrbanMetric label="Active sectors" value={departments.length} icon={Boxes} />
            <UrbanMetric label="Live slot promise" value="15m" icon={Clock3} />
            <UrbanMetric label="Cold-chain aisles" value={departments.filter((d) => /cold|frozen|chilled/i.test(d.temperatureZone || '')).length || 3} icon={Thermometer} />
          </div>
        </section>

        {departments.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {departments.map((department, index) => <UrbanDepartmentCard key={department.id} department={department} index={index} />)}
          </div>
        ) : (
          <UrbanPanel className="flex min-h-[360px] flex-col items-center justify-center p-8 text-center">
            <PackageSearch className="h-10 w-10 text-[#ffb693]" />
            <h2 className="mt-5 font-market-label text-3xl font-black uppercase tracking-[-0.03em] text-[#e2e2e2]">No aisle signal</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-[#e2bfb0]">No departments are currently available.</p>
          </UrbanPanel>
        )}
      </UrbanContainer>
    </UrbanPageShell>
  );
}
