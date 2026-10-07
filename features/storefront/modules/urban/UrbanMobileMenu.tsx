'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

type NavLink = { href: string; label: string };
export default function UrbanMobileMenu({ departments }: { departments: NavLink[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  function close() { dialog.current?.close(); }
  return <>
    <button type="button" aria-label="Open shopping menu" aria-expanded={open} aria-haspopup="dialog" aria-controls="market-menu" onClick={() => { dialog.current?.showModal(); setOpen(true); }} className="inline-flex min-h-11 min-w-11 items-center justify-center lg:hidden"><Menu className="h-5 w-5" aria-hidden="true" /></button>
    <dialog ref={dialog} id="market-menu" aria-labelledby="market-menu-title" onClose={() => setOpen(false)} className="rounded-lg">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--sf-rule)] pb-3"><h2 id="market-menu-title" className="font-[family-name:var(--sf-font-display)] text-2xl">Your neighborhood shop</h2><button type="button" onClick={close} autoFocus aria-label="Close shopping menu" className="flex min-h-11 min-w-11 items-center justify-center"><X className="h-5 w-5" /></button></div>
      <nav aria-label="Shopping menu" className="mt-3 grid grid-cols-2 gap-x-4">
        {[{ href: '/products', label: 'Shop all' }, { href: '/deals', label: 'Specials' }, { href: '/departments', label: 'All aisles' }, ...departments, { href: '/fulfillment', label: 'Delivery & pickup' }, { href: '/lists', label: 'Shopping lists' }, { href: '/favorites', label: 'Favorites' }, { href: '/account/orders', label: 'Your orders' }, { href: '/account', label: 'Your account' }, { href: '/order-access', label: 'Find a guest order' }, { href: '/support', label: 'Help & contact' }].map((item) => <Link prefetch={false} key={item.href} href={item.href} onClick={close} className="flex min-h-11 items-center border-b border-[var(--sf-rule)] py-2 text-sm">{item.label}</Link>)}
      </nav>
    </dialog>
  </>;
}
