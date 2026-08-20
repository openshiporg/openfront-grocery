import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ArrowRight, Search } from 'lucide-react';

import type { GroceryCart, GroceryDepartment, GroceryProduct } from '@/features/storefront/types';

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

export function productImage(product?: Pick<GroceryProduct, 'imageUrl' | 'thumbnailUrl'> | null) {
  return product?.imageUrl || product?.thumbnailUrl || null;
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
  return (
    <main className={`min-h-screen bg-[var(--sf-paper)] text-[var(--sf-ink)] ${className}`}>
      {children}
    </main>
  );
}

export function UrbanContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

export function UrbanKicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[var(--sf-ink-faint)] ${className}`}>
      {children}
    </p>
  );
}

export function UrbanHeadline({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h1
      className={`max-w-4xl font-[family-name:var(--sf-font-display)] text-[length:var(--sf-text-display)] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--sf-ink)] [overflow-wrap:anywhere] min-w-0 ${className}`}
    >
      {children}
    </h1>
  );
}

export function UrbanLead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`max-w-2xl text-base leading-7 text-[var(--sf-ink-muted)] sm:text-[1.05rem] ${className}`}>{children}</p>;
}

export function UrbanBreadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-[var(--sf-ink-faint)]">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`}>
          {index > 0 ? <span className="mx-2 text-[var(--sf-rule-strong)]">/</span> : null}
          {item.href ? (
            <Link href={item.href} className="transition-colors hover:text-[var(--sf-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-focus)]">
              {item.label}
            </Link>
          ) : (
            <span className="text-[var(--sf-ink)]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function UrbanSectionTitle({
  eyebrow,
  title,
  actionHref,
  actionLabel,
  children,
}: {
  eyebrow?: string;
  title: string;
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-[var(--sf-rule)] pb-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow ? <UrbanKicker>{eyebrow}</UrbanKicker> : null}
        <h2 className="mt-1 font-[family-name:var(--sf-font-display)] text-[length:var(--sf-text-title)] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--sf-ink)] [overflow-wrap:anywhere] min-w-0">
          {title}
        </h2>
        {children ? <div className="mt-2 max-w-2xl text-sm leading-6 text-[var(--sf-ink-muted)]">{children}</div> : null}
      </div>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap border border-[var(--sf-rule-strong)] bg-[var(--sf-paper)] px-4 py-2.5 text-sm font-medium text-[var(--sf-ink)] transition hover:border-[var(--sf-accent)] hover:text-[var(--sf-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-focus)]"
        >
          {actionLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

export function UrbanPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border border-[var(--sf-rule)] bg-[var(--sf-paper)] ${className}`}>
      {children}
    </div>
  );
}

export function UrbanInset({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border border-[var(--sf-rule)] bg-[var(--sf-paper-2)] ${className}`}>{children}</div>;
}

export function UrbanMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="border-t border-[var(--sf-rule)] pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--sf-ink-muted)]">{label}</p>
        {Icon ? <Icon className="h-4 w-4 text-[var(--sf-sage)]" /> : null}
      </div>
      <p className="mt-2 font-[family-name:var(--sf-font-display)] text-2xl font-semibold tracking-[-0.02em] text-[var(--sf-ink)]">{value}</p>
    </div>
  );
}

export function UrbanBadge({
  children,
  tone = 'primary',
  className = '',
}: {
  children: ReactNode;
  tone?: 'primary' | 'orange' | 'blue' | 'muted' | 'danger';
  className?: string;
}) {
  const tones = {
    primary: 'border-[var(--sf-sage-light)] bg-[var(--sf-sage-light)] text-[var(--sf-sage)]',
    orange: 'border-[var(--sf-warn-bg)] bg-[var(--sf-warn-bg)] text-[var(--sf-warn)]',
    blue: 'border-[var(--sf-info-bg)] bg-[var(--sf-info-bg)] text-[var(--sf-info)]',
    muted: 'border-[var(--sf-rule)] bg-[var(--sf-paper-2)] text-[var(--sf-ink-muted)]',
    danger: 'border-[var(--sf-danger-bg)] bg-[var(--sf-danger-bg)] text-[var(--sf-danger)]',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.08em] whitespace-nowrap ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function UrbanButtonLink({
  href,
  children,
  variant = 'primary',
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: 'primary' | 'ghost';
  className?: string;
}) {
  const classes =
    variant === 'primary'
      ? 'border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white hover:bg-[var(--sf-accent-hover)] hover:border-[var(--sf-accent-hover)]'
      : 'border-[var(--sf-rule-strong)] bg-transparent text-[var(--sf-ink)] hover:border-[var(--sf-accent)] hover:text-[var(--sf-accent)]';

  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap border px-5 py-2.5 text-sm font-semibold transition duration-[var(--sf-dur-fast)] ease-[var(--sf-ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-focus)] ${classes} ${className}`}
    >
      {children}
    </Link>
  );
}

export function UrbanButton({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const classes =
    variant === 'primary'
      ? 'border-[var(--sf-accent)] bg-[var(--sf-accent)] text-white hover:bg-[var(--sf-accent-hover)] hover:border-[var(--sf-accent-hover)] disabled:border-[var(--sf-rule)] disabled:bg-[var(--sf-paper-3)] disabled:text-[var(--sf-ink-faint)]'
      : 'border-[var(--sf-rule-strong)] bg-transparent text-[var(--sf-ink)] hover:border-[var(--sf-accent)] hover:text-[var(--sf-accent)] disabled:text-[var(--sf-ink-faint)]';

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap border px-5 py-2.5 text-sm font-semibold transition duration-[var(--sf-dur-fast)] ease-[var(--sf-ease-out)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sf-focus)] disabled:cursor-not-allowed ${classes} ${className}`}
    >
      {children}
    </button>
  );
}

export function UrbanTextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-11 w-full border border-[var(--sf-rule-strong)] bg-[var(--sf-paper)] px-3 text-sm text-[var(--sf-ink)] outline-none placeholder:text-[var(--sf-ink-faint)] focus:border-[var(--sf-accent)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--sf-focus)] ${props.className || ''}`}
    />
  );
}

export function UrbanTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full border border-[var(--sf-rule-strong)] bg-[var(--sf-paper)] px-3 py-2.5 text-sm text-[var(--sf-ink)] outline-none placeholder:text-[var(--sf-ink-faint)] focus:border-[var(--sf-accent)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--sf-focus)] ${props.className || ''}`}
    />
  );
}

export function UrbanSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-11 w-full border border-[var(--sf-rule-strong)] bg-[var(--sf-paper)] px-3 text-sm text-[var(--sf-ink)] outline-none focus:border-[var(--sf-accent)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--sf-focus)] ${props.className || ''}`}
    />
  );
}

export function UrbanSearchStrip({
  placeholder = 'Search produce, pantry, dairy, frozen…',
  action = '/products',
  defaultValue,
}: {
  placeholder?: string;
  action?: string;
  defaultValue?: string;
}) {
  return (
    <form action={action} method="get" role="search" className="flex min-w-0 items-stretch gap-0 border border-[var(--sf-rule-strong)]">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sf-ink-faint)]" />
        <UrbanTextInput type="search" name="search" aria-label="Search products" defaultValue={defaultValue} placeholder={placeholder} className="h-12 border-0 pl-10 focus-visible:outline-none" />
      </div>
      <UrbanButton type="submit" className="shrink-0 rounded-none border-0 border-l border-[var(--sf-rule-strong)]">
        Search
      </UrbanButton>
    </form>
  );
}

export function UrbanEmptyState({
  title,
  children,
  actionHref,
  actionLabel,
}: {
  title: string;
  children?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <UrbanInset className="p-8 text-center sm:p-10">
      <h2 className="mx-auto max-w-xl font-[family-name:var(--sf-font-display)] text-[length:var(--sf-text-subtitle)] font-semibold tracking-[-0.02em] text-[var(--sf-ink)]">
        {title}
      </h2>
      {children ? <div className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--sf-ink-muted)]">{children}</div> : null}
      {actionHref && actionLabel ? <UrbanButtonLink href={actionHref} className="mt-6">{actionLabel}</UrbanButtonLink> : null}
    </UrbanInset>
  );
}

export function UrbanProductArtwork({
  product,
  className = '',
  priorityLabel,
}: {
  product?: Pick<GroceryProduct, 'name' | 'department' | 'imageUrl' | 'thumbnailUrl'> | null;
  className?: string;
  priorityLabel?: string;
}) {
  const image = productImage(product);

  if (image) {
    return <img src={image} alt={product?.name || 'Product image'} className={`h-full w-full object-cover ${className}`} />;
  }

  const name = product?.name || 'Grocery item';
  const department = product?.department?.name || priorityLabel || 'Market pick';

  return (
    <div
      className={`flex h-full w-full flex-col justify-between bg-[linear-gradient(160deg,var(--sf-paper-2),var(--sf-paper-3))] p-4 text-[var(--sf-ink)] ${className}`}
    >
      <UrbanBadge tone="muted" className="self-start">
        {department}
      </UrbanBadge>
      <div>
        <p className="max-w-[12ch] font-[family-name:var(--sf-font-display)] text-xl font-semibold leading-[1.05] tracking-[-0.02em]">{name}</p>
        <p className="mt-1 text-xs text-[var(--sf-ink-muted)]">From today&apos;s catalog</p>
      </div>
    </div>
  );
}

export function UrbanPageHeader({
  title,
  description,
  breadcrumb,
  aside,
}: {
  title: string;
  description?: string;
  breadcrumb?: Array<{ label: string; href?: string }>;
  aside?: ReactNode;
}) {
  return (
    <header className="border-b border-[var(--sf-rule)] pb-6">
      {breadcrumb ? <UrbanBreadcrumb items={breadcrumb} /> : null}
      <div className={`grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end ${breadcrumb ? 'mt-4' : ''}`}>
        <div className="min-w-0">
          <UrbanHeadline>{title}</UrbanHeadline>
          {description ? <UrbanLead className="mt-3">{description}</UrbanLead> : null}
        </div>
        {aside ? <div className="min-w-0 lg:max-w-xs">{aside}</div> : null}
      </div>
    </header>
  );
}
