import { Metadata } from 'next';

import FeaturedProducts from '@/features/storefront/modules/home/components/featured-products';
import Hero from '@/features/storefront/modules/home/components/hero';
import DepartmentGrid from '@/features/storefront/modules/home/components/department-grid';
import { getDepartmentsList } from '@/features/storefront/lib/data/departments';
import { getStore } from '@/features/storefront/lib/data/store';
import type { GroceryDepartment } from '@/features/storefront/types';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStore();

  return {
    title: store?.homepageTitle || 'Openfront Grocery',
    description:
      store?.homepageDescription ||
      'Fresh groceries delivered to your door. Shop produce, meat, dairy, frozen, and more.',
  };
}

export async function HomePage(props: {
  params: Promise<{ countryCode?: string }>;
}) {
  await props.params;

  const store = await getStore();
  const { departments }: { departments: GroceryDepartment[] } = await getDepartmentsList(0, 8);

  if (!departments) {
    return null;
  }

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 py-6 sm:px-6 lg:gap-14 lg:py-8">
      <Hero
        title={store?.homepageTitle || 'Fresh groceries delivered with less chaos'}
        description={
          store?.homepageDescription ||
          'A grocery storefront designed around departments, substitutions, pickup timing, and the realities of fulfillment.'
        }
      />

      <section className="rounded-[1.75rem] border border-amber-900/10 bg-[linear-gradient(90deg,rgba(255,244,213,0.9),rgba(255,251,235,0.92),rgba(238,247,236,0.92))] p-5 shadow-[0_20px_45px_-40px_rgba(18,56,34,0.6)] sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-amber-950/70">Weekly deals</p>
            <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Plan the basket around what is genuinely moving this week.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-700">
              Featured offers are surfaced with the same fulfillment-aware catalog your team uses, so customers see deals that are actually shoppable.
            </p>
          </div>
          <a
            href="/deals"
            className="inline-flex items-center justify-center rounded-full bg-amber-400 px-5 py-3 text-sm font-semibold text-amber-950 transition-colors hover:bg-amber-300"
          >
            Browse deals
          </a>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-emerald-700/80">Departments</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Shop the store the way a grocer actually merchandises it.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-zinc-600">
            Browse by aisle, not by a generic marketplace taxonomy. That makes the storefront feel closer to pickup and picking reality.
          </p>
        </div>
        <DepartmentGrid departments={departments} />
      </section>

      <section className="space-y-6 rounded-[2rem] border border-emerald-950/8 bg-[linear-gradient(180deg,rgba(247,251,245,0.95),rgba(252,249,243,0.92))] p-6 shadow-[0_24px_55px_-45px_rgba(18,56,34,0.65)] sm:p-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.22em] text-emerald-700/80">Featured this week</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">Popular picks with real stock behind them.</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-zinc-600">
            Highlighting in-stock grocery items makes the homepage feel alive and keeps merchandising aligned with actual operations.
          </p>
        </div>
        <FeaturedProducts />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          {
            title: 'Shop by department',
            description: 'Build the basket fast with familiar grocery aisles and product units that make sense.',
            emoji: '🛒',
          },
          {
            title: 'Choose the right handoff',
            description: 'Reserve a delivery or curbside window that matches the run your household is already making.',
            emoji: '📍',
          },
          {
            title: 'Keep substitutions clear',
            description: 'Tell the picking team whether to swap, call, or remove before your order reaches the floor.',
            emoji: '🥬',
          },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-[1.6rem] border border-emerald-950/8 bg-white/90 p-6 shadow-[0_24px_45px_-40px_rgba(18,56,34,0.55)]"
          >
            <div className="text-3xl">{item.emoji}</div>
            <h3 className="mt-4 text-xl font-semibold text-zinc-950">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{item.description}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
