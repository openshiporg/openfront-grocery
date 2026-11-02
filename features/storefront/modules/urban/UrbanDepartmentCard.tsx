import Link from 'next/link';
import { Snowflake, Thermometer } from 'lucide-react';
import type { GroceryDepartment } from '../../types';
import { DepartmentIcon } from '../rigel/departmentIcon';

const zones: Record<string, { label: string; Icon: typeof Snowflake }> = {
  refrigerated: { label: 'Chilled', Icon: Thermometer },
  frozen: { label: 'Frozen', Icon: Snowflake },
};

/** Rigel aisle card: a photo tile with the aisle name on a white label. */
export default function UrbanDepartmentCard({ department, size = 'md', loading = 'lazy' }: { department: GroceryDepartment; index?: number; size?: 'md' | 'lg'; loading?: 'lazy' | 'eager' }) {
  const zone = department.temperatureZone ? zones[department.temperatureZone] : undefined;
  return <Link prefetch={false} href={`/departments/${department.handle}`} className={`group relative isolate flex h-full flex-col justify-end overflow-hidden rounded-[var(--sf-radius-lg)] bg-[var(--sf-paper-3)] ${size === 'lg' ? 'aspect-[4/3]' : 'aspect-[13/10]'}`}>
    {department.imageUrl ? (
      <img src={department.imageUrl} alt="" loading={loading} decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-[var(--sf-dur-slow)] ease-[var(--sf-ease-out)] group-hover:scale-[1.04]" />
    ) : (
      <DepartmentIcon department={department} className="absolute left-1/2 top-[38%] -z-10 h-14 w-14 -translate-x-1/2 -translate-y-1/2 text-[var(--sf-ink-faint)]" />
    )}
    {zone ? <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-[var(--sf-card)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--sf-info)]"><zone.Icon className="h-3 w-3" aria-hidden="true" />{zone.label}</span> : null}
    <span className="m-2 flex min-h-11 items-center justify-between gap-2 rounded-[14px] bg-[var(--sf-card)]/95 px-4 py-2 shadow-[var(--sf-shadow-1)] backdrop-blur-sm transition-colors group-hover:bg-[var(--sf-card)] sm:m-2.5">
      <span className="min-w-0">
        <span className={`block truncate font-normal text-[var(--sf-ink)] ${size === 'lg' ? 'text-[1.25rem]' : 'text-[1.0625rem] sm:text-[1.25rem]'}`}>{department.name}</span>
        {size === 'lg' ? <span className="block text-[0.8125rem] text-[var(--sf-ink-muted)]">{typeof department.productsCount === 'number' ? `${department.productsCount} ${department.productsCount === 1 ? 'product' : 'products'}` : 'Browse the aisle'}</span> : null}
      </span>
    </span>
  </Link>;
}
