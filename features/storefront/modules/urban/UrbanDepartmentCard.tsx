import Link from 'next/link';
import { Apple, Beef, CupSoda, Milk, Package, Sandwich, Snowflake, Soup } from 'lucide-react';

import type { GroceryDepartment } from '@/features/storefront/types';
import { departmentHref, UrbanBadge } from './UrbanPrimitives';

const iconMap = [
  { match: ['produce', 'fruit', 'vegetable'], Icon: Apple },
  { match: ['meat', 'seafood', 'fish'], Icon: Beef },
  { match: ['dairy', 'egg'], Icon: Milk },
  { match: ['bakery', 'bread'], Icon: Sandwich },
  { match: ['frozen'], Icon: Snowflake },
  { match: ['beverage', 'drink'], Icon: CupSoda },
  { match: ['pantry'], Icon: Soup },
];

function renderDepartmentIcon(department: GroceryDepartment) {
  const text = `${department.handle} ${department.name}`.toLowerCase();
  const DepartmentIcon = iconMap.find((entry) => entry.match.some((word) => text.includes(word)))?.Icon || Package;
  return <DepartmentIcon className="h-5 w-5" />;
}

export default function UrbanDepartmentCard({ department, index = 0 }: { department: GroceryDepartment; index?: number }) {
  return (
    <Link href={departmentHref(department)} className="group block h-full border border-[var(--sf-rule)] bg-[var(--sf-paper)] transition hover:border-[var(--sf-accent)] hover:bg-[var(--sf-paper-2)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--sf-rule)] p-4">
        <span className="font-[family-name:var(--sf-font-display)] text-lg text-[var(--sf-ink-faint)]">{String(index + 1).padStart(2, '0')}</span>
        <span className="flex h-10 w-10 items-center justify-center border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] text-[var(--sf-sage)]">
          {renderDepartmentIcon(department)}
        </span>
      </div>
      {department.imageUrl ? (
        <div className="aspect-[16/9] overflow-hidden border-b border-[var(--sf-rule)] bg-[var(--sf-paper-3)]">
          <img
            src={department.imageUrl}
            alt={`${department.name} department`}
            className="h-full w-full object-cover transition duration-[var(--sf-dur-normal)] group-hover:scale-[1.02]"
          />
        </div>
      ) : null}
      <div className="flex min-h-[180px] flex-col justify-between p-4">
        <div>
          <h3 className="font-[family-name:var(--sf-font-display)] text-xl font-semibold leading-[1.1] tracking-[-0.02em] text-[var(--sf-ink)] transition group-hover:text-[var(--sf-accent)]">
            {department.name}
          </h3>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--sf-ink-muted)]">
            {department.description || 'Browse live inventory from this aisle.'}
          </p>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2 text-sm">
          <UrbanBadge tone="muted">{department.temperatureZone || 'Standard'}</UrbanBadge>
          <span className="font-medium text-[var(--sf-accent)]">{department.productsCount || 0} items →</span>
        </div>
      </div>
    </Link>
  );
}
