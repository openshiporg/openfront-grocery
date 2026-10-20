/**
 * Class recipes shared by every Juniper platform screen. Server and client
 * components import these strings directly so forms, tables and actions keep
 * one visual language on top of the dashboard's shadcn tokens.
 */

export type PlatformButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'success';
export type PlatformButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const buttonBase =
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-wait [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0';

const buttonVariants: Record<PlatformButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
  secondary: 'border bg-background text-foreground shadow-xs hover:bg-muted',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  destructive: 'border border-destructive/40 bg-background text-destructive shadow-xs hover:bg-destructive/10',
  success: 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-600/90 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-500/90',
};

const buttonSizes: Record<PlatformButtonSize, string> = {
  sm: 'h-8 px-2.5 text-xs',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-10 px-4 text-sm',
  icon: 'size-8 p-0',
};

export function platformButton(variant: PlatformButtonVariant = 'secondary', size: PlatformButtonSize = 'md', extra = '') {
  return `${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]}${extra ? ` ${extra}` : ''}`;
}

const control =
  'w-full min-w-0 rounded-md border border-input bg-background text-sm text-foreground shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive';

export const platformInput = `${control} h-9 px-3`;
export const platformSelect = `${control} h-9 px-2.5 pr-8`;
export const platformTextarea = `${control} min-h-20 px-3 py-2 leading-relaxed`;
export const platformCheckbox = 'size-4 shrink-0 rounded border-input accent-primary';
export const platformNumberInput = `${platformInput} tabular-nums`;

export const platformTable = {
  wrap: 'overflow-x-auto rounded-lg border bg-background',
  table: 'w-full text-left text-sm',
  head: 'border-b bg-muted/40 text-xs text-muted-foreground',
  th: 'h-9 whitespace-nowrap px-3 font-medium',
  thNumeric: 'h-9 whitespace-nowrap px-3 text-right font-medium',
  row: 'border-b transition-colors last:border-0 hover:bg-muted/30',
  td: 'px-3 py-2.5 align-top',
  tdNumeric: 'px-3 py-2.5 text-right align-top tabular-nums',
  tdMuted: 'px-3 py-2.5 align-top text-muted-foreground',
  mono: 'font-mono text-xs text-muted-foreground',
};

/** Rows inside a panel share this horizontal rhythm so headers, toolbars and lists line up. */
export const platformInset = 'px-4 md:px-5';
