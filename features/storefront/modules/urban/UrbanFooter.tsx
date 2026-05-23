import Link from 'next/link';
import { Clock3, MapPin, RadioTower } from 'lucide-react';

export default function UrbanFooter() {
  return (
    <footer className="border-t-2 border-[#5a4136] bg-[#0d0f0f] text-[#e2e2e2]">
      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-[1fr_1fr_1fr] lg:px-8">
        <div>
          <div className="font-market-label text-4xl font-black italic uppercase tracking-[-0.08em] text-[#ff6b00]">Urban Express</div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[#e2bfb0]">High-speed grocery supply for dense city routes, cold-chain handoff, substitution control, pickup, and delivery.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">
          <Link href="/departments" className="hover:text-[#ffb693]">Departments</Link>
          <Link href="/products" className="hover:text-[#ffb693]">Inventory</Link>
          <Link href="/deals" className="hover:text-[#ffb693]">Deals</Link>
          <Link href="/lists" className="hover:text-[#ffb693]">Lists</Link>
          <Link href="/cart" className="hover:text-[#ffb693]">Cart</Link>
          <Link href="/checkout" className="hover:text-[#ffb693]">Checkout</Link>
        </div>
        <div className="grid gap-2 text-sm text-[#e2bfb0]">
          <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#ffb693]" /> Delivery windows updated live</div>
          <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#ffb693]" /> Pickup bay and route tracking</div>
          <div className="flex items-center gap-2"><RadioTower className="h-4 w-4 text-[#ffb693]" /> Inventory signals from Openfront</div>
        </div>
      </div>
    </footer>
  );
}
