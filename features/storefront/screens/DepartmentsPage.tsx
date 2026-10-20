import type { Metadata } from 'next';

import { getAllDepartments } from '@/features/storefront/lib/data/departments';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import type { GroceryDepartment } from '@/features/storefront/types';
import UrbanDepartmentCard from '@/features/storefront/modules/urban/UrbanDepartmentCard';
import { UrbanContainer, UrbanEmptyState, UrbanPageHeader, UrbanPageShell, UrbanSearchStrip } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return storefrontMetadata({
    title: 'Departments',
    description: 'Browse grocery departments and aisle groupings.',
  });
}

export async function DepartmentsPage(props: { params: Promise<{ countryCode?: string }> }) {
  await props.params;
  // Every active aisle, not just the first page.
  const { departments, total }: { departments: GroceryDepartment[]; total: number } = await getAllDepartments();


  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-7 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Aisles' }]}
          title="Every aisle"
          description="Walk the store from produce to pantry. Chilled and frozen aisles are marked so you know what travels cold."
          aside={<div className="w-full lg:w-[22rem]"><UrbanSearchStrip placeholder="Search across all aisles" /></div>}
        />

        {!departments.length ? <UrbanEmptyState title="Aisles are being stocked" actionHref="/products" actionLabel="Browse products">Check the catalog for available groceries.</UrbanEmptyState> : (
          <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
            {departments.map((department) => <li key={department.id}><UrbanDepartmentCard department={department} size="lg" /></li>)}
          </ul>
        )}
        {total > departments.length ? <p role="status" className="sf-copy">Showing {departments.length} of {total} aisles. Use search to find products in the rest.</p> : null}
      </UrbanContainer>
    </UrbanPageShell>
  );
}
