import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ArrowRight, ChevronRight, Search, ShoppingBasket } from 'lucide-react';

import type { GroceryCart, GroceryDepartment, GroceryProduct } from '@/features/storefront/types';
import { formatMoney } from '../../lib/marketFormatting';

export { formatMoney, formatCents, formatSlotDay, formatSlotRange, timezoneLabel } from '../../lib/marketFormatting';

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
    <main id="storefront-main" tabIndex={-1} className={`min-w-0 flex-1 text-[var(--sf-ink)] outline-none ${className}`}>
      {children}
    </main>
  );
}

export function UrbanContainer({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[84rem] px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}

export function UrbanKicker({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`sf-eyebrow ${className}`}>{children}</p>;
}

export function UrbanHeadline({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h1 className={`sf-title min-w-0 max-w-4xl text-[var(--sf-ink)] [overflow-wrap:anywhere] ${className}`}>{children}</h1>;
}

export function UrbanLead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`max-w-2xl text-base leading-7 text-[var(--sf-ink-muted)] sm:text-[1.0625rem] ${className}`}>{children}</p>;
}

export function UrbanBreadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0 text-[0.8125rem] text-[var(--sf-ink-faint)]">
      <ol className="flex min-w-0 flex-wrap items-center gap-y-1">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex min-w-0 items-center">
            {index > 0 ? <ChevronRight className="mx-1 h-3.5 w-3.5 shrink-0 text-[var(--sf-rule-strong)]" aria-hidden="true" /> : null}
            {item.href ? (
              <Link prefetch={false} href={item.href} className="inline-flex min-h-8 items-center font-medium transition-colors hover:text-[var(--sf-ink)]">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate font-medium text-[var(--sf-ink)]">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function UrbanSectionTitle({
  eyebrow,
  title,
  actionHref,
  actionLabel,
  children,
  id,
}: {
  eyebrow?: string;
  title: string;
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <UrbanKicker className="mb-1.5">{eyebrow}</UrbanKicker> : null}
        <h2 id={id} className="sf-subtitle min-w-0 text-[var(--sf-ink)] [overflow-wrap:anywhere] sm:text-[1.75rem]">{title}</h2>
        {children ? <div className="mt-1.5 max-w-2xl text-sm leading-6 text-[var(--sf-ink-muted)]">{children}</div> : null}
      </div>
      {actionHref && actionLabel ? (
        <Link
          prefetch={false}
          href={actionHref}
          className="group inline-flex min-h-10 shrink-0 items-center gap-1.5 self-start whitespace-nowrap text-sm font-semibold text-[var(--sf-ink)] sm:self-auto"
        >
          <span className="underline decoration-[var(--sf-rule-strong)] decoration-2 underline-offset-[6px] transition-colors group-hover:decoration-[var(--sf-accent)]">{actionLabel}</span>
          <ArrowRight className="h-4 w-4 transition-transform duration-[var(--sf-dur-fast)] ease-[var(--sf-ease-out)] group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

export function UrbanPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`sf-panel ${className}`}>{children}</div>;
}

export function UrbanInset({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`sf-panel-soft ${className}`}>{children}</div>;
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
    <div className="rounded-[var(--sf-radius-md)] bg-[var(--sf-paper-2)] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--sf-ink-muted)]">{label}</p>
        {Icon ? <Icon className="h-4 w-4 text-[var(--sf-sage)]" /> : null}
      </div>
      <p className="mt-2 font-[family-name:var(--sf-font-display)] text-2xl font-bold tracking-[-0.03em] text-[var(--sf-ink)] tabular-nums">{value}</p>
    </div>
  );
}

const badgeTones = {
  primary: 'bg-[var(--sf-sage-light)] text-[var(--sf-sage)]',
  orange: 'bg-[var(--sf-tag)] text-[var(--sf-tag-ink)]',
  blue: 'bg-[var(--sf-info-bg)] text-[var(--sf-info)]',
  muted: 'bg-[var(--sf-paper-2)] text-[var(--sf-ink-muted)] ring-1 ring-inset ring-[var(--sf-rule)]',
  danger: 'bg-[var(--sf-danger-bg)] text-[var(--sf-danger)]',
  accent: 'bg-[var(--sf-accent-soft)] text-[var(--sf-accent-hover)]',
  dark: 'bg-[var(--sf-header)] text-[var(--sf-header-ink)]',
};

export function UrbanBadge({
  children,
  tone = 'primary',
  className = '',
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones;
  className?: string;
}) {
  return (
    <span className={`inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeTones[tone]} ${className}`}>
      {children}
    </span>
  );
}

type ButtonVariant = 'primary' | 'ghost' | 'dark' | 'soft';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--sf-accent)] text-[var(--sf-accent-ink)] hover:bg-[var(--sf-accent-hover)] disabled:bg-[var(--sf-paper-3)] disabled:text-[var(--sf-ink-faint)]',
  dark: 'bg-[var(--sf-ink)] text-[var(--sf-paper)] hover:bg-[var(--sf-header-2)] disabled:bg-[var(--sf-paper-3)] disabled:text-[var(--sf-ink-faint)]',
  ghost: 'bg-[var(--sf-card)] text-[var(--sf-ink)] ring-1 ring-inset ring-[var(--sf-rule-strong)] hover:ring-[var(--sf-ink)] disabled:text-[var(--sf-ink-faint)] disabled:ring-[var(--sf-rule)]',
  soft: 'bg-[var(--sf-paper-2)] text-[var(--sf-ink)] hover:bg-[var(--sf-paper-3)] disabled:text-[var(--sf-ink-faint)]',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3.5 text-[0.8125rem]',
  md: 'min-h-11 px-5 text-sm',
  lg: 'min-h-13 px-6 text-[0.9375rem]',
};

function buttonClasses(variant: ButtonVariant, size: ButtonSize, className: string) {
  return `inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[background-color,color,box-shadow,transform] duration-[var(--sf-dur-fast)] ease-[var(--sf-ease-out)] active:scale-[0.98] disabled:active:scale-100 ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`;
}

export function UrbanButtonLink({
  href,
  children,
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return (
    <Link prefetch={false} href={href} className={buttonClasses(variant, size, className)}>
      {children}
    </Link>
  );
}

export function UrbanButton({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button {...props} className={buttonClasses(variant, size, className)}>
      {children}
    </button>
  );
}

export function UrbanTextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`sf-field ${props.className || ''}`} />;
}

export function UrbanTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`sf-field ${props.className || ''}`} />;
}

export function UrbanSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`sf-field ${props.className || ''}`} />;
}

export function UrbanSearchStrip({
  placeholder = 'Search produce, pantry, dairy, frozen…',
  action = '/products',
  defaultValue,
  size = 'md',
  tone = 'sunken',
  id,
}: {
  placeholder?: string;
  action?: string;
  defaultValue?: string;
  size?: 'md' | 'lg';
  /** sunken sits on paper; raised sits on a tinted panel. */
  tone?: 'sunken' | 'raised';
  id?: string;
}) {
  const tall = size === 'lg';
  return (
    <form action={action} method="get" role="search" className="group relative flex min-w-0 items-center">
      <Search className={`pointer-events-none absolute left-4 h-[1.125rem] w-[1.125rem] text-[var(--sf-ink-faint)] transition-colors group-focus-within:text-[var(--sf-ink)]`} aria-hidden="true" />
      <input
        id={id}
        type="search"
        name="search"
        aria-label="Search products"
        defaultValue={defaultValue}
        placeholder={placeholder}
        enterKeyHint="search"
        className={`w-full min-w-0 rounded-full border border-transparent ${tone === 'raised' ? 'bg-[var(--sf-card)] shadow-[var(--sf-shadow-1)]' : 'bg-[var(--sf-paper-2)]'} pl-11 pr-[5.5rem] text-[0.9375rem] text-[var(--sf-ink)] outline-none transition-[background-color,border-color,box-shadow] duration-[var(--sf-dur-fast)] ease-[var(--sf-ease-out)] placeholder:text-[var(--sf-ink-faint)] hover:border-[var(--sf-rule-strong)] focus:border-[var(--sf-ink)] focus:bg-[var(--sf-card)] focus:shadow-[0_0_0_3px_color-mix(in_oklch,var(--sf-focus)_20%,transparent)] focus-visible:outline-none ${tall ? 'h-14' : 'h-12'}`}
      />
      <button
        type="submit"
        className={`absolute right-1.5 inline-flex items-center justify-center rounded-full bg-[var(--sf-ink)] px-4 text-[0.8125rem] font-semibold text-[var(--sf-paper)] transition-colors hover:bg-[var(--sf-header-2)] ${tall ? 'h-11' : 'h-9'}`}
      >
        Search
      </button>
    </form>
  );
}

export function UrbanEmptyState({
  title,
  children,
  actionHref,
  actionLabel,
  icon: Icon = ShoppingBasket,
  className = '',
}: {
  title: string;
  children?: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  className?: string;
}) {
  return (
    <div className={`sf-panel-soft flex flex-col items-center px-6 py-12 text-center sm:py-16 ${className}`}>
      <span className="mb-5 grid h-14 w-14 place-items-center rounded-full bg-[var(--sf-card)] text-[var(--sf-sage)] shadow-[var(--sf-shadow-1)]">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </span>
      <h2 className="sf-subtitle mx-auto max-w-xl text-[var(--sf-ink)]">{title}</h2>
      {children ? <div className="mx-auto mt-2.5 max-w-md text-sm leading-6 text-[var(--sf-ink-muted)]">{children}</div> : null}
      {actionHref && actionLabel ? <UrbanButtonLink href={actionHref} variant="dark" className="mt-6">{actionLabel}</UrbanButtonLink> : null}
    </div>
  );
}

export function UrbanProductArtwork({
  product,
  className = '',
  priorityLabel,
  eager = false,
}: {
  product?: Pick<GroceryProduct, 'name' | 'department' | 'imageUrl' | 'thumbnailUrl'> | null;
  className?: string;
  priorityLabel?: string;
  eager?: boolean;
}) {
  const image = productImage(product);

  if (image) {
    return (
      <img
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        src={image}
        alt={product?.name || 'Product image'}
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }

  const name = product?.name || 'Grocery item';
  const department = product?.department?.name || priorityLabel || 'Groceries';

  return (
    <div
      role="img"
      aria-label={`${name} — image not provided`}
      className={`flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--sf-paper-3)] p-3 text-center text-[var(--sf-ink-muted)] ${className}`}
    >
      <span aria-hidden="true" className="font-[family-name:var(--sf-font-display)] text-4xl font-bold leading-none tracking-[-0.04em] text-[var(--sf-ink-faint)]">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span aria-hidden="true" className="text-[0.6875rem] font-semibold">{department}</span>
    </div>
  );
}

/** Shelf-edge price: whole units large, cents raised — read at a glance like a store label. */
export function UrbanPrice({ value, className = '' }: { value?: number | null; className?: string }) {
  const formatted = formatMoney(value);
  const match = /^\$(\d+)\.(\d{2})$/.exec(formatted);
  if (!match) return <span className={`sf-price ${className}`}>{formatted}</span>;
  return (
    <span className={`sf-price ${className}`} aria-label={formatted}>
      <span aria-hidden="true" className="sf-price-symbol">$</span>
      <span aria-hidden="true">{match[1]}</span>
      <span aria-hidden="true" className="sf-price-cents">{match[2]}</span>
    </span>
  );
}

export function UrbanPageHeader({
  title,
  description,
  breadcrumb,
  aside,
  className = '',
}: {
  title: string;
  description?: ReactNode;
  breadcrumb?: Array<{ label: string; href?: string }>;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <header className={className}>
      {breadcrumb ? <UrbanBreadcrumb items={breadcrumb} /> : null}
      <div className={`grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end ${breadcrumb ? 'mt-3' : ''}`}>
        <div className="min-w-0">
          <UrbanHeadline>{title}</UrbanHeadline>
          {description ? <UrbanLead className="mt-3">{description}</UrbanLead> : null}
        </div>
        {aside ? <div className="min-w-0 lg:max-w-sm">{aside}</div> : null}
      </div>
    </header>
  );
}

/** Previous / next pagination shared by catalog, history and favorites pages. */
export function UrbanPager({
  label,
  page,
  totalPages,
  previousHref,
  nextHref,
}: {
  label: string;
  page: number;
  totalPages: number;
  previousHref?: string;
  nextHref?: string;
}) {
  const link = 'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 ring-inset ring-[var(--sf-rule-strong)] transition-shadow hover:ring-[var(--sf-ink)]';
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 pt-4">
      {previousHref && page > 1 ? <Link prefetch={false} href={previousHref} className={link}><span aria-hidden="true">←</span> Previous</Link> : <span className={`${link} pointer-events-none opacity-40`} aria-hidden="true">← Previous</span>}
      <p className="text-sm tabular-nums text-[var(--sf-ink-muted)]">Page {page} of {totalPages}</p>
      {nextHref && page < totalPages ? <Link prefetch={false} href={nextHref} className={link}>Next <span aria-hidden="true">→</span></Link> : <span className={`${link} pointer-events-none opacity-40`} aria-hidden="true">Next →</span>}
    </nav>
  );
}
