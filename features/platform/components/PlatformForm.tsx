import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Info, TriangleAlert, type LucideIcon } from 'lucide-react';

/**
 * Hook-free building blocks for platform forms and tool panels. They render
 * identically from server screens and client workflows.
 */

export function PlatformField({
  label,
  hint,
  children,
  className = '',
  as = 'label',
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: 'label' | 'div';
}) {
  const Tag = as;
  return (
    <Tag className={`grid min-w-0 content-start gap-1.5 ${className}`}>
      <span className="text-xs font-medium text-foreground/80">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-snug text-muted-foreground">{hint}</span> : null}
    </Tag>
  );
}

export function PlatformFieldset({ legend, hint, children, className = '' }: { legend: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`min-w-0 space-y-2.5 ${className}`}>
      <legend className="text-xs font-medium text-foreground/80">{legend}</legend>
      {hint ? <p className="-mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

export function PlatformCheckboxRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <label className={`flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md border bg-background px-3 py-2 text-sm shadow-xs transition-colors hover:bg-muted/40 has-[:checked]:border-foreground/30 has-[:checked]:bg-muted/50 ${className}`}>{children}</label>;
}

const feedbackTones = {
  info: { icon: Info, className: 'border-border bg-muted/40 text-foreground' },
  success: { icon: CheckCircle2, className: 'border-emerald-600/25 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200' },
  warning: { icon: TriangleAlert, className: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200' },
  error: { icon: AlertCircle, className: 'border-destructive/30 bg-destructive/5 text-destructive' },
} as const;

export type PlatformFeedbackTone = keyof typeof feedbackTones;

export function PlatformFeedback({ tone = 'info', title, children, className = '' }: { tone?: PlatformFeedbackTone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { icon: Icon, className: toneClass } = feedbackTones[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${toneClass} ${className}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5 leading-snug [overflow-wrap:anywhere]">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={title ? 'opacity-85' : ''}>{children}</div> : null}
      </div>
    </div>
  );
}

/** Collapsible tool panel for secondary workflows (imports, recovery, drafts) that should not crowd the primary queue. */
export function PlatformDisclosure({
  title,
  description,
  icon: Icon,
  badge,
  defaultOpen = false,
  children,
  className = '',
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <details id={id} open={defaultOpen} className={`group/tool scroll-mt-20 overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 outline-none transition-colors hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 md:px-5 [&::-webkit-details-marker]:hidden">
        {Icon ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-background text-muted-foreground shadow-xs">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">{title}{badge}</span>
          {description ? <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{description}</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/tool:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t px-4 py-4 md:px-5 md:py-5">{children}</div>
    </details>
  );
}

export function PlatformSubsection({ title, description, action, children, className = '' }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-3 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? <p className="mt-0.5 max-w-2xl text-xs leading-snug text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Bordered inner card used for a single record or sub-form inside a panel body. */
export function PlatformCard({ children, className = '', tone = 'default' }: { children: ReactNode; className?: string; tone?: 'default' | 'muted' | 'warning' | 'danger' }) {
  const toneClass = tone === 'muted' ? 'bg-muted/30' : tone === 'warning' ? 'border-amber-500/30 bg-amber-500/5' : tone === 'danger' ? 'border-destructive/30 bg-destructive/5' : 'bg-background';
  return <div className={`rounded-lg border p-3.5 shadow-xs ${toneClass} ${className}`}>{children}</div>;
}
