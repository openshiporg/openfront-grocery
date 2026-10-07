import Link from 'next/link';
import { ArrowUpRight, ShoppingBag } from 'lucide-react';
import type { GroceryDepartment } from '../../types';

export default function UrbanDepartmentCard({ department }: { department: GroceryDepartment; index?: number }) {
  return <Link prefetch={false} href={`/departments/${department.handle}`} className="sf-card group block h-full">
    <div className="aspect-[3/2] overflow-hidden bg-[var(--sf-paper-2)]">{department.imageUrl ? <img src={department.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center text-[var(--sf-sage)]"><ShoppingBag className="h-10 w-10" aria-hidden="true" /></div>}</div>
    <div className="flex items-start justify-between gap-2 p-3 sm:p-4"><div><h3 className="font-[family-name:var(--sf-font-display)] text-lg font-semibold leading-tight sm:text-xl">{department.name}</h3><p className="mt-1 text-xs text-[var(--sf-ink-muted)]">{department.productsCount ?? 0} products</p></div><ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-[var(--sf-accent)]" aria-hidden="true" /></div>
  </Link>;
}
