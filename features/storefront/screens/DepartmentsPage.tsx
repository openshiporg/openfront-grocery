import type { Metadata } from 'next';
import { Boxes, Map } from 'lucide-react';

import { getDepartmentsList } from '@/features/storefront/lib/data/departments';
import { storefrontMetadata } from '@/features/storefront/lib/metadata';
import type { GroceryDepartment } from '@/features/storefront/types';
import UrbanDepartmentCard from '@/features/storefront/modules/urban/UrbanDepartmentCard';
import { UrbanContainer, UrbanMetric, UrbanPageHeader, UrbanPageShell, UrbanSearchStrip } from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  return storefrontMetadata({
    title: 'Departments',
    description: 'Browse grocery departments and aisle groupings.',
  });
}

export async function DepartmentsPage(props: { params: Promise<{ countryCode?: string }> }) {
  await props.params;
  const { departments }: { departments: GroceryDepartment[] } = await getDepartmentsList(0, 24);
  const coldAisles = departments.filter((d) => /cold|frozen|chilled/i.test(d.temperatureZone || '')).length;

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-8 py-8 sm:py-10">
        <UrbanPageHeader
          breadcrumb={[{ label: 'Home', href: '/' }, { label: 'Departments' }]}
          title="Shop by aisle"
          description="Move through produce, dairy, pantry, frozen, and household sections."
          aside={
            <div className="space-y-3">
              <UrbanMetric label="Active aisles" value={departments.length} icon={Map} />
              <UrbanMetric label="Cold-chain" value={coldAisles} icon={Boxes} />
            </div>
          }
        />

        <div className="max-w-2xl">
          <UrbanSearchStrip placeholder="Search products across all aisles" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((department, index) => <UrbanDepartmentCard key={department.id} department={department} index={index} />)}
        </div>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
