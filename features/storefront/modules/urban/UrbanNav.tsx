import Link from 'next/link';
import { ShoppingCart, UserCircle } from 'lucide-react';

import { retrieveCart } from '@/features/storefront/lib/data/cart';
import { getStore } from '@/features/storefront/lib/data/store';
import { totalCartLines, UrbanSearchStrip } from './UrbanPrimitives';

const links = [
  ['Departments', '/departments'],
  ['Products', '/products'],
  ['Deals', '/deals'],
  ['Lists', '/lists'],
  ['Orders', '/account'],
];

export default async function UrbanNav() {
  const [cart, store] = await Promise.all([retrieveCart(), getStore()]);
  const count = totalCartLines(cart);

  return (
    <header className="sticky top-0 z-50 border-b-2 border-[#5a4136] bg-[#0d0f0f] text-[#e2e2e2]">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-5">
          <Link href="/" className="font-market-label text-3xl font-black italic uppercase tracking-[-0.08em] text-[#ff6b00] transition hover:text-[#ffb693] sm:text-4xl">
            {store?.name || 'Urban Express'}
          </Link>
          <nav className="hidden items-center gap-4 lg:flex">
            {links.map(([label, href]) => (
              <Link key={href} href={href} className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0] transition hover:text-[#ffb693]">
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="hidden min-w-[280px] flex-1 max-w-xl md:block">
          <UrbanSearchStrip />
        </div>

        <div className="flex items-center gap-2">
          <Link href="/cart" className="relative inline-flex items-center gap-2 border-2 border-transparent px-3 py-2 font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#ffb693] transition hover:border-[#5a4136] hover:bg-[#282a2b]">
            <ShoppingCart className="h-5 w-5" />
            <span className="hidden sm:inline">Cart</span>
            <span className="bg-[#ff6b00] px-1.5 py-0.5 text-[#572000]">{count}</span>
          </Link>
          <Link href="/account" className="hidden p-2 text-[#e2bfb0] transition hover:bg-[#282a2b] hover:text-[#ffb693] sm:inline-flex">
            <UserCircle className="h-6 w-6" />
          </Link>
        </div>
      </div>
      <div className="border-t border-[#5a4136] px-4 py-2 md:hidden">
        <UrbanSearchStrip placeholder="Search..." />
      </div>
    </header>
  );
}
