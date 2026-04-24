import Link from 'next/link';
import type { GroceryDepartment } from '@/features/storefront/types';

interface DepartmentGridProps {
  departments: GroceryDepartment[];
}

const departmentStyles: Record<string, { icon: string; tint: string; accent: string }> = {
  produce: { icon: '🥬', tint: 'from-emerald-50 to-lime-100', accent: 'text-emerald-900' },
  'meat-seafood': { icon: '🐟', tint: 'from-rose-50 to-orange-100', accent: 'text-rose-900' },
  dairy: { icon: '🥛', tint: 'from-sky-50 to-cyan-100', accent: 'text-sky-900' },
  bakery: { icon: '🍞', tint: 'from-amber-50 to-orange-100', accent: 'text-amber-900' },
  frozen: { icon: '🧊', tint: 'from-cyan-50 to-blue-100', accent: 'text-cyan-900' },
  pantry: { icon: '🥫', tint: 'from-yellow-50 to-orange-100', accent: 'text-orange-900' },
};

export default function DepartmentGrid({ departments }: DepartmentGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {departments.map((department) => {
        const style = departmentStyles[department.handle] || {
          icon: '📦',
          tint: 'from-zinc-50 to-zinc-100',
          accent: 'text-zinc-900',
        };

        return (
          <Link
            key={department.id}
            href={`/departments/${department.handle}`}
            className={`group relative overflow-hidden rounded-[1.75rem] border border-emerald-950/10 bg-gradient-to-br ${style.tint} p-5 shadow-[0_24px_45px_-40px_rgba(18,56,34,0.6)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_60px_-36px_rgba(18,56,34,0.72)]`}
          >
            <div className="absolute right-3 top-3 h-20 w-20 rounded-full bg-white/35 blur-2xl" />
            <div className="relative flex h-full flex-col justify-between gap-8">
              <div className="flex items-start justify-between gap-3">
                <div className="text-4xl">{style.icon}</div>
                <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-700">
                  aisle
                </span>
              </div>
              <div>
                <h3 className={`text-lg font-semibold ${style.accent}`}>{department.name}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-700/80">
                  {department.description || 'Browse fresh staples, pantry basics, and fulfillment-ready picks.'}
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
