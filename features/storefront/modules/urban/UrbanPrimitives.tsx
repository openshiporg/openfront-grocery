import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ArrowRight, Search } from 'lucide-react';

import type { GroceryCart, GroceryDepartment, GroceryProduct } from '@/features/storefront/types';

export const urban = {
  bg: '#121414',
  surfaceLowest: '#0d0f0f',
  surfaceLow: '#1a1c1c',
  surface: '#1e2020',
  surfaceHigh: '#282a2b',
  surfaceHighest: '#333535',
  text: '#e2e2e2',
  muted: '#e2bfb0',
  outline: '#5a4136',
  primary: '#ffb693',
  orange: '#ff6b00',
  ink: '#561f00',
  blue: '#b6c6ed',
};

export const heroImage = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCg3dikWcvGgsXPqRVLQEegtm1_s-slZqihAs1Vm8wdSwlB4LOh_QBdZ4cibDhhBk0OxWMdW6QyjLtW2d281mATQu4yYGYjxpOqRK_82Q8EEqLvb1cfncl5qSBCDYfU1KG6PE6P0Ambb5_cZAZOFvVTQCdmqKeIAc2O3Xl2xcF73v1UUxXEeLdSxtlfYmL7eX-1mmnI-JID-YsWv8BVrh83t_pMPCGZIPhk-WHWlfihTHb7eTIk5kp7WKKabAURq6GAfVtIeWx8wg';
export const fallbackProductImages = [
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDZpShmN2NW3RMT4uaQIY9ZyF0SLwKm7LPWqbHbiP3Dq2D1HiiZjdh5ExpTzFogWV6rUYAME9D5Mk9CUwUFw_NUMDntZa6f4DPGAj5KLXJHfh65_guRGDGHplrQzwOhh9UhsYei9fLtDvxV7CTkaG7f_AVfisyR7BJh8oKKSqGDk1510pdvuw_Z74PYsOVz52kYO7A4p1duGnm0Sc0dsRK6tLE9TvZPRGRNs-4ON0nNmQYGPjFiFBbzpmAmiG6fo06qeJcaAopXSA',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDmMdohnE-FyNLpRPbhYjH2jHvUT2pT1z7OTU_BT4nRP1gGjaaXQsuV2Z6drJOnowff6E5WMQr8BzDbHtyoVQYo4l4t7AH6HfJyPnL8tvCYw2i1uAxzZgGKQGG3SlFHEV36UlfKn1DD6v46pk5IiXKjtQO4pW6w6tRs92-5TJam1JBfaoiUF-RRQ202RElvB2YNKrCzNTH3zbCXO0bjv2y25_KhFKtlZWfIti3kKRtYM64XxUtH-Wc7aotma2ZwrqdNdfo_Mas9ig',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBvi-XSlVHeVJN0NGr3Ch7PHZL9q_lv2VXL1u4M9nwEaar-Ndr-WE5d7BRajYOTZeYnqaYfMK9QGXRbtCZEiPAvD4DtF_1IFWOZjIKNYooaJkFhBPvgeELbacPDaMpiGSfUP6FQ4QjMalU-34OcM3pgwizK2J9L2RCl2OhdcqA_WHyRNMPSC4yOfBGHSh5qZUCMPXkIZRFIwl8lkZjxDix6wM9fXkM5bEDI79eSzvaEtKFl9_UQO0BKaFBKZIPSpce-PCIhD0xpdA',
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBSNuX_oTkwq7RVw7qqDRWQuMT_rhvAXC8FtL7PPKszsmlD3j8UXh0ZLx_09C4QEK7d7tq_nLS38RhW86F-e2YsJDxvZzqCOerPL93iYslmKLyrRAz1zAssTHCpgClzKMwO6XTUcRsTsEwu4RCtbNSyMchPoRGOBVWkok8afsYKepew-H2jC21rIahw_VjGt4QvEZirHNHuKEP2ZXJ-7nRJ3ZP7Ckoc4Cv-fZU2OqWrmTRN4g8KyigIbQ0beNt6XBqWQaLqDKDOPA',
];

export function formatMoney(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '$0.00';
  const amount = Math.abs(value) > 1000 ? value / 100 : value;
  return `$${amount.toFixed(2)}`;
}

export function formatCents(value?: number | null) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '$0.00';
  return `$${(value / 100).toFixed(2)}`;
}

export function formatUnit(unit?: string | null) {
  if (!unit) return 'each';
  return unit.replace(/^unit_/, '').replace(/_/g, ' ');
}

export function productImage(product?: Pick<GroceryProduct, 'imageUrl' | 'thumbnailUrl' | 'id'> | null, index = 0) {
  return product?.imageUrl || product?.thumbnailUrl || fallbackProductImages[index % fallbackProductImages.length] || null;
}

export function departmentHref(department: Pick<GroceryDepartment, 'handle'>) {
  return `/departments/${department.handle}`;
}

export function statusLabel(status?: string | null) {
  return (status || 'pending').replace(/_/g, ' ');
}

export function totalCartLines(cart?: GroceryCart | null) {
  return cart?.items?.reduce((sum, item) => sum + item.quantity, 0) ?? cart?.itemCount ?? 0;
}

export function UrbanPageShell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <main className={`min-h-screen bg-[#121414] text-[#e2e2e2] ${className}`}>{children}</main>;
}

export function UrbanContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

export function UrbanKicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`font-market-label text-xs font-black uppercase tracking-[0.22em] text-[#ffb693] ${className}`}>{children}</p>;
}

export function UrbanHeadline({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h1 className={`font-market-label text-5xl font-black uppercase leading-[0.88] tracking-[-0.065em] text-[#e2e2e2] sm:text-6xl lg:text-7xl ${className}`}>{children}</h1>;
}

export function UrbanSectionTitle({ eyebrow, title, actionHref, actionLabel, children }: { eyebrow?: string; title: string; actionHref?: string; actionLabel?: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 border-b-2 border-[#5a4136] pb-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? <UrbanKicker>{eyebrow}</UrbanKicker> : null}
        <h2 className="mt-1 font-market-label text-3xl font-black uppercase tracking-[-0.035em] text-[#e2e2e2] md:text-4xl">{title}</h2>
        {children ? <div className="mt-2 max-w-2xl text-sm leading-6 text-[#e2bfb0]">{children}</div> : null}
      </div>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="inline-flex items-center gap-2 font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#ffb693] hover:text-[#ff6b00]">
          {actionLabel} <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

export function UrbanPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border border-[#5a4136] bg-[#1e2020] ${className}`}>{children}</div>;
}

export function UrbanMetric({ label, value, icon: Icon }: { label: string; value: string | number; icon?: ComponentType<{ className?: string }> }) {
  return (
    <div className="border border-[#5a4136] bg-[#282a2b] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-market-label text-xs font-black uppercase tracking-[0.16em] text-[#e2bfb0]">{label}</p>
        {Icon ? <Icon className="h-4 w-4 text-[#ffb693]" /> : null}
      </div>
      <p className="mt-4 font-market-label text-3xl font-black uppercase tracking-[-0.04em] text-[#ffb693]">{value}</p>
    </div>
  );
}

export function UrbanBadge({ children, tone = 'primary', className = '' }: { children: ReactNode; tone?: 'primary' | 'orange' | 'blue' | 'muted' | 'danger'; className?: string }) {
  const tones = {
    primary: 'bg-[#ffb693] text-[#561f00]',
    orange: 'bg-[#ff6b00] text-[#572000]',
    blue: 'bg-[#b6c6ed] text-[#20304f]',
    muted: 'border border-[#5a4136] bg-[#282a2b] text-[#e2bfb0]',
    danger: 'bg-[#ffb4ab] text-[#690005]',
  };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 font-market-label text-[0.68rem] font-black uppercase tracking-[0.14em] ${tones[tone]} ${className}`}>{children}</span>;
}

export function UrbanButtonLink({ href, children, variant = 'primary', className = '' }: { href: string; children: ReactNode; variant?: 'primary' | 'ghost'; className?: string }) {
  const classes = variant === 'primary'
    ? 'border-2 border-[#ffb693] bg-[#ffb693] text-[#561f00] hover:bg-transparent hover:text-[#ffb693]'
    : 'border-2 border-[#5a4136] bg-transparent text-[#e2e2e2] hover:border-[#ffb693] hover:text-[#ffb693]';
  return <Link href={href} className={`inline-flex items-center justify-center gap-2 px-5 py-3 font-market-label text-xs font-black uppercase tracking-[0.16em] transition ${classes} ${className}`}>{children}</Link>;
}

export function UrbanButton({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const classes = variant === 'primary'
    ? 'border-2 border-[#ffb693] bg-[#ffb693] text-[#561f00] hover:bg-transparent hover:text-[#ffb693] disabled:border-[#333535] disabled:bg-[#333535] disabled:text-[#e2bfb0]'
    : 'border-2 border-[#5a4136] bg-transparent text-[#e2e2e2] hover:border-[#ffb693] hover:text-[#ffb693] disabled:opacity-50';
  return <button {...props} className={`inline-flex items-center justify-center gap-2 px-5 py-3 font-market-label text-xs font-black uppercase tracking-[0.16em] transition disabled:cursor-not-allowed ${classes} ${className}`}>{children}</button>;
}

export function UrbanTextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full border border-[#5a4136] bg-[#282a2b] px-4 py-3 text-sm text-[#e2e2e2] outline-none placeholder:text-[#e2bfb0] focus:border-[#ffb693] ${props.className || ''}`} />;
}

export function UrbanTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full border border-[#5a4136] bg-[#282a2b] px-4 py-3 text-sm text-[#e2e2e2] outline-none placeholder:text-[#e2bfb0] focus:border-[#ffb693] ${props.className || ''}`} />;
}

export function UrbanSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`w-full border border-[#5a4136] bg-[#282a2b] px-4 py-3 text-sm text-[#e2e2e2] outline-none focus:border-[#ffb693] ${props.className || ''}`} />;
}

export function UrbanSearchStrip({ placeholder = 'Fast Search SKUs...' }: { placeholder?: string }) {
  return (
    <form action="/products" className="relative w-full">
      <input name="search" placeholder={placeholder} className="h-12 w-full border border-[#5a4136] bg-[#282a2b] px-4 pl-11 text-sm text-[#e2e2e2] outline-none placeholder:text-[#e2bfb0] focus:border-[#ffb693]" />
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#e2bfb0]" />
    </form>
  );
}

export function UrbanEmptyState({ title, children, actionHref, actionLabel }: { title: string; children?: ReactNode; actionHref?: string; actionLabel?: string }) {
  return (
    <UrbanPanel className="p-10 text-center">
      <h2 className="font-market-label text-4xl font-black uppercase tracking-[-0.04em] text-[#e2e2e2]">{title}</h2>
      {children ? <div className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#e2bfb0]">{children}</div> : null}
      {actionHref && actionLabel ? <UrbanButtonLink href={actionHref} className="mt-6">{actionLabel}</UrbanButtonLink> : null}
    </UrbanPanel>
  );
}
