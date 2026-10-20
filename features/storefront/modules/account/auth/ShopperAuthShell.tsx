import Link from 'next/link';
import type { ReactNode } from 'react';
import { UrbanContainer, UrbanPageShell } from '../../urban/UrbanPrimitives';

/** Storefront account entry (like E-commerce's account @login): sign in, create account, reset. */
export function ShopperAuthShell({ active, from, title, description, children, embedded = false }: {
  active: 'sign-in' | 'register' | 'reset'; from?: string; title: string; description: ReactNode; children: ReactNode; embedded?: boolean;
}) {
  const query = from && from !== '/account' ? `?from=${encodeURIComponent(from)}` : '';
  const tab = (key: 'sign-in' | 'register', href: string, label: string) => <Link prefetch={false} href={href} aria-current={active === key ? 'page' : undefined} className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors ${active === key ? 'bg-[var(--sf-ink)] text-[var(--sf-paper)]' : 'text-[var(--sf-ink-muted)] hover:text-[var(--sf-ink)]'}`}>{label}</Link>;
  const panel = <div className="mx-auto w-full max-w-md space-y-6">
    <header>
      <h1 className="sf-title">{title}</h1>
      <p className="sf-copy mt-2">{description}</p>
    </header>
    {active !== 'reset' ? <nav aria-label="Account access" className="flex gap-1 rounded-full bg-[var(--sf-paper-2)] p-1">{tab('sign-in', `/account/sign-in${query}`, 'Sign in')}{tab('register', `/account/register${query}`, 'Create account')}</nav> : null}
    <div className="sf-panel p-5 sm:p-7">{children}</div>
    <p className="text-sm text-[var(--sf-ink-muted)]">Prefer not to sign in? You can <Link href="/products" className="font-semibold text-[var(--sf-ink)] underline underline-offset-4">shop and check out as a guest</Link>{' '}or <Link href="/order-access" className="font-semibold text-[var(--sf-ink)] underline underline-offset-4">find a guest order</Link>.</p>
  </div>;
  if (embedded) return panel;
  return <UrbanPageShell><UrbanContainer className="py-8 sm:py-12">{panel}</UrbanContainer></UrbanPageShell>;
}
