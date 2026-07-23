import * as React from 'react';
import type { AnomalySeverity } from '@/lib/types';

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// ---------------- Button ----------------
type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-blue text-white hover:bg-blue/90 disabled:opacity-50',
    secondary: 'bg-panelAlt text-ink border border-border hover:bg-border/40',
    danger: 'bg-red text-white hover:bg-red/90 disabled:opacity-50',
    ghost: 'text-dim hover:text-ink hover:bg-panelAlt',
  };
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed',
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}

// ---------------- Card / Panel ----------------
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('rounded-lg border border-border bg-panel', className)} {...props} />;
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-border bg-panelAlt px-5 py-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-ink">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-dim">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </Card>
  );
}

// ---------------- Badge ----------------
type BadgeTone = 'neutral' | 'blue' | 'green' | 'amber' | 'violet' | 'red' | 'navy';
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<BadgeTone, string> = {
    neutral: 'bg-panelAlt text-dim border-border',
    blue: 'bg-blue/10 text-blue border-blue/20',
    green: 'bg-green/10 text-green border-green/20',
    amber: 'bg-amber/10 text-amber border-amber/20',
    violet: 'bg-violet/10 text-violet border-violet/20',
    red: 'bg-red/10 text-red border-red/20',
    navy: 'bg-navy/10 text-navy border-navy/20',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function AnomalyBadge({ severity }: { severity: AnomalySeverity | null }) {
  if (!severity || severity === 'normal') return <Badge tone="green">Normal</Badge>;
  if (severity === 'review') return <Badge tone="amber">Review</Badge>;
  return <Badge tone="red">Flagged</Badge>;
}

// ---------------- Field ----------------
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-dim">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-blue focus:ring-2 focus:ring-blue/20',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        'w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-blue focus:ring-2 focus:ring-blue/20',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/20',
        className,
      )}
      {...props}
    />
  );
}

// ---------------- Money ----------------
export function Money({ amount, currency = 'USD' }: { amount: number | null; currency?: string }) {
  if (amount === null || amount === undefined) return <span className="mono text-faint">—</span>;
  return (
    <span className="mono">
      {currency}{' '}
      {amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

// ---------------- SimulatedTag ----------------
// Mocked things must be visibly labelled (spec §18.5).
export function SimulatedTag({ children = 'Simulated' }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-amber/30 bg-amber/10 px-2 py-0.5 text-[11px] font-medium text-amber">
      ⚠ {children}
    </span>
  );
}
