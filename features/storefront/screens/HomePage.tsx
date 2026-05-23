import { Metadata } from 'next';
import Link from 'next/link';
import { Bolt, Boxes, Clock3, History, Package, RadioTower, Route, ShoppingCart, Zap } from 'lucide-react';

import { getDepartmentsList } from '@/features/storefront/lib/data/departments';
import { getProductsList } from '@/features/storefront/lib/data/products';
import { getStore } from '@/features/storefront/lib/data/store';
import type { GroceryDepartment, GroceryProduct } from '@/features/storefront/types';
import UrbanDepartmentCard from '@/features/storefront/modules/urban/UrbanDepartmentCard';
import UrbanProductGrid from '@/features/storefront/modules/urban/UrbanProductGrid';
import {
  UrbanBadge,
  UrbanButtonLink,
  UrbanContainer,
  UrbanHeadline,
  UrbanKicker,
  UrbanMetric,
  UrbanPanel,
  UrbanPageShell,
  UrbanSearchStrip,
  UrbanSectionTitle,
  formatMoney,
  heroImage,
  productImage,
} from '@/features/storefront/modules/urban/UrbanPrimitives';

export async function generateMetadata(): Promise<Metadata> {
  const store = await getStore();
  return {
    title: store?.homepageTitle || 'Openfront Grocery | Urban Express',
    description: store?.homepageDescription || 'Fast urban grocery delivery, pickup, substitutions, saved lists, and order tracking.',
  };
}

export async function HomePage(props: { params: Promise<{ countryCode?: string }> }) {
  await props.params;
  const [store, departmentsResult, productsResult] = await Promise.all([
    getStore(),
    getDepartmentsList(0, 8),
    getProductsList({ limit: 8, offset: 0, availability: 'in-stock' as any }),
  ]);

  const departments: GroceryDepartment[] = departmentsResult.departments || [];
  const products: GroceryProduct[] = productsResult.products || [];
  const quickPicks = products.slice(0, 3);

  return (
    <UrbanPageShell>
      <UrbanContainer className="space-y-10">
        <section className="grid gap-3 lg:grid-cols-12">
          <UrbanPanel className="relative min-h-[560px] overflow-hidden p-5 sm:p-8 lg:col-span-8 lg:p-10">
            <div className="absolute inset-0 opacity-40">
              <img src={heroImage} alt="Urban grocery aisle" className="h-full w-full object-cover mix-blend-luminosity" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d0f0f] via-[#121414]/70 to-transparent" />
            </div>
            <div className="relative z-10 flex h-full min-h-[500px] flex-col justify-end">
              <UrbanBadge tone="orange"><Bolt className="h-3 w-3" /> Express Delivery | Under 15 Min</UrbanBadge>
              <UrbanHeadline className="mt-5 max-w-3xl">{store?.homepageTitle || 'Restock the grid. Fast.'}</UrbanHeadline>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#e2bfb0]">{store?.homepageDescription || 'Your essential urban supplies, deployed by aisle, slot, picker, route, and substitution protocol.'}</p>
              <div className="mt-8 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                <UrbanSearchStrip placeholder="Search SKUs, staples, fresh drops..." />
                <UrbanButtonLink href="/products">Deploy essentials <ShoppingCart className="h-4 w-4" /></UrbanButtonLink>
              </div>
            </div>
          </UrbanPanel>

          <UrbanPanel className="flex flex-col gap-3 p-4 lg:col-span-4">
            <div className="flex items-center justify-between border-b border-[#5a4136] pb-3">
              <h2 className="font-market-label text-2xl font-black uppercase tracking-[-0.02em] text-[#ffb693]">Quick Reorder</h2>
              <History className="h-5 w-5 text-[#ffb693]" />
            </div>
            {quickPicks.map((product, index) => (
              <Link key={product.id} href={`/products/${product.handle}`} className="group grid grid-cols-[64px_1fr_auto] items-center gap-3 border border-transparent bg-[#282a2b] p-2 transition hover:border-[#ffb693]">
                <div className="h-16 w-16 bg-[#333535]">
                  {productImage(product, index) ? <img src={productImage(product, index)!} alt={product.name} className="h-full w-full object-cover mix-blend-luminosity transition group-hover:mix-blend-normal" /> : <Package className="m-5 h-6 w-6 text-[#ffb693]" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-market-label text-xs font-black uppercase tracking-[0.12em] text-[#e2e2e2]">{product.name}</p>
                  <p className="mt-1 font-market-label text-2xl font-black text-[#ffb693]">{formatMoney(product.price)}</p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center bg-[#ff6b00] text-[#572000]"><Zap className="h-4 w-4" /></span>
              </Link>
            ))}
            <UrbanButtonLink href="/lists" variant="ghost" className="mt-auto w-full">View full history</UrbanButtonLink>
          </UrbanPanel>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UrbanMetric label="Live aisles" value={departments.length} icon={Boxes} />
          <UrbanMetric label="Inventory signals" value={productsResult.count || products.length} icon={RadioTower} />
          <UrbanMetric label="Delivery window" value="15m" icon={Clock3} />
          <UrbanMetric label="Route mode" value="Active" icon={Route} />
        </section>

        <section>
          <UrbanSectionTitle eyebrow="Active protocols" title="Deals and fast-moving supply" actionHref="/deals" actionLabel="All deals">
            Urban Express treats weekly specials like live operational signals: deal, stock, and add-to-cart stay visible.
          </UrbanSectionTitle>
          <UrbanProductGrid products={products.slice(0, 5)} featuredFirst />
        </section>

        <section>
          <UrbanSectionTitle eyebrow="Aisle map" title="Shop by sector" actionHref="/departments" actionLabel="All departments">
            Move through the store by fresh-chain, pantry, delivery, and household missions.
          </UrbanSectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {departments.map((department, index) => <UrbanDepartmentCard key={department.id} department={department} index={index} />)}
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
          <UrbanPanel className="p-5 sm:p-8">
            <UrbanKicker>Saved list ops</UrbanKicker>
            <h2 className="mt-3 font-market-label text-5xl font-black uppercase leading-[0.9] tracking-[-0.06em] text-[#e2e2e2]">Weekly staples should not require weekly rebuilding.</h2>
            <div className="mt-6 grid gap-3">
              {['Monday essentials', 'School lunch stack', 'Cold-chain reset'].map((name, index) => (
                <div key={name} className="grid gap-3 border border-[#5a4136] bg-[#282a2b] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="font-market-label text-xl font-black uppercase tracking-[-0.02em] text-[#e2e2e2]">{name}</p>
                    <p className="mt-1 text-sm text-[#e2bfb0]">{index === 0 ? 'Oat milk, greens, eggs, sourdough' : index === 1 ? 'Berries, yogurt, turkey, crackers' : 'Frozen fruit, salmon, ice, sparkling water'}</p>
                  </div>
                  <UrbanButtonLink href="/lists" variant="ghost">Reorder</UrbanButtonLink>
                </div>
              ))}
            </div>
          </UrbanPanel>
          <UrbanPanel className="p-5 sm:p-8">
            <UrbanKicker>Fulfillment grid</UrbanKicker>
            <div className="mt-5 space-y-4">
              {['Picker assigned in 3 minutes', 'Cold chain staged separately', 'Substitution rules saved to profile', 'Curbside bay check-in enabled'].map((item) => (
                <div key={item} className="flex items-center gap-3 border-b border-[#5a4136] pb-4 last:border-b-0">
                  <span className="h-3 w-3 bg-[#ff6b00]" />
                  <p className="font-market-label text-sm font-black uppercase tracking-[0.12em] text-[#e2e2e2]">{item}</p>
                </div>
              ))}
            </div>
          </UrbanPanel>
        </section>
      </UrbanContainer>
    </UrbanPageShell>
  );
}
