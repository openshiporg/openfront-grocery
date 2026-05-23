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

function iconFor(department: GroceryDepartment) {
  const text = `${department.handle} ${department.name}`.toLowerCase();
  return iconMap.find((entry) => entry.match.some((word) => text.includes(word)))?.Icon || Package;
}

export default function UrbanDepartmentCard({ department, index = 0 }: { department: GroceryDepartment; index?: number }) {
  const Icon = iconFor(department);
  const featured = index % 7 === 0;

  return (
    <Link href={departmentHref(department)} className={`group flex min-h-[210px] flex-col justify-between border border-[#5a4136] bg-[#1e2020] p-5 transition hover:border-[#ffb693] ${featured ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <span className="flex h-14 w-14 items-center justify-center border border-[#5a4136] bg-[#282a2b] text-[#ffb693] transition group-hover:bg-[#ffb693] group-hover:text-[#561f00]">
          <Icon className="h-6 w-6" />
        </span>
        <UrbanBadge tone={department.temperatureZone?.toLowerCase().includes('frozen') ? 'blue' : 'muted'}>
          {department.temperatureZone || 'aisle'}
        </UrbanBadge>
      </div>
      <div>
        <h3 className="font-market-label text-4xl font-black uppercase leading-[0.92] tracking-[-0.055em] text-[#e2e2e2] transition group-hover:text-[#ffb693]">{department.name}</h3>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#e2bfb0]">{department.description || 'Fast-moving grocery inventory, picker-ready and organized by mission.'}</p>
        <div className="mt-5 flex items-center justify-between border-t border-[#5a4136] pt-3 font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <span>{department.productsCount || 0} items</span>
          <span className="text-[#ffb693]">Open aisle</span>
        </div>
      </div>
    </Link>
  );
}
