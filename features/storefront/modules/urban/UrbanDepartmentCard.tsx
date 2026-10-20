import Link from 'next/link';
import { ArrowUpRight, ShoppingBag, Snowflake, Thermometer } from 'lucide-react';
import type { GroceryDepartment } from '../../types';

const zones: Record<string, { label: string; Icon: typeof Snowflake }> = {
  refrigerated: { label: 'Chilled', Icon: Thermometer },
  frozen: { label: 'Frozen', Icon: Snowflake },
};

export default function UrbanDepartmentCard({ department, size = 'md' }: { department: GroceryDepartment; index?: number; size?: 'md' | 'lg' }) {
  const zone = department.temperatureZone ? zones[department.temperatureZone] : undefined;
  return <Link prefetch={false} href={`/departments/${department.handle}`} className={`group relative isolate flex h-full flex-col justify-end overflow-hidden rounded-[var(--sf-radius-lg)] bg-[var(--sf-header)] text-[var(--sf-header-ink)] ${size === 'lg' ? 'min-h-[16rem] sm:min-h-[22rem]' : 'aspect-[4/5] sm:aspect-[5/6]'}`}>
    {department.imageUrl ? (
      <img src={department.imageUrl} alt="" loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-[var(--sf-dur-slow)] ease-[var(--sf-ease-out)] group-hover:scale-[1.04]" />
    ) : (
      <ShoppingBag className="absolute right-5 top-5 -z-10 h-16 w-16 text-[var(--sf-header-2)]" aria-hidden="true" />
    )}
    <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(to_top,oklch(18%_0.035_182/0.88),oklch(18%_0.035_182/0.25)_55%,transparent)]" />
    {zone ? <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--sf-card)]/95 px-2.5 py-1 text-[0.6875rem] font-bold text-[var(--sf-info)]"><zone.Icon className="h-3 w-3" aria-hidden="true" />{zone.label}</span> : null}
    <span aria-hidden="true" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-[var(--sf-card)] text-[var(--sf-ink)] opacity-0 transition-[opacity,transform] duration-[var(--sf-dur-normal)] ease-[var(--sf-ease-out)] group-hover:opacity-100 group-focus-visible:opacity-100"><ArrowUpRight className="h-4 w-4" /></span>
    <div className="p-4 sm:p-5">
      <h3 className={`font-bold leading-[1.02] tracking-[-0.035em] ${size === 'lg' ? 'text-[clamp(1.75rem,1.2rem+2vw,2.6rem)]' : 'text-[1.2rem] sm:text-[1.45rem]'}`}>{department.name}</h3>
      <p className="mt-1 text-xs font-medium text-[var(--sf-header-ink-muted)] sm:text-[0.8125rem]">{typeof department.productsCount === 'number' ? `${department.productsCount} ${department.productsCount === 1 ? 'product' : 'products'}` : 'Browse the aisle'}</p>
      {size === 'lg' && department.description ? <p className="mt-2 line-clamp-2 max-w-sm text-sm leading-6 text-[var(--sf-header-ink-muted)]">{department.description}</p> : null}
    </div>
  </Link>;
}
