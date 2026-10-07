import type { Metadata } from 'next';

import { getDepartmentsList } from '@/features/storefront/lib/data/departments';
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
  const { departments }: { departments: GroceryDepartment[] } = await getDepartmentsList(0, 24);


  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Departments' }]}
          title="Shop by aisle"
          description="Move through produce, dairy, pantry, frozen, and household sections."

        />

        <div className="max-w-2xl">
          <UrbanSearchStrip placeholder="Search products across all aisles" />
        </div>

        {!departments.length ? <UrbanEmptyState title="Aisles are being stocked" actionHref="/products" actionLabel="Browse products">Check the catalog for available groceries.</UrbanEmptyState> : null}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {departments.map((department, index) => <UrbanDepartmentCard key={department.id} department={department} index={index} />)}
        </div>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
