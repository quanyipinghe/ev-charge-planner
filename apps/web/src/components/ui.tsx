import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, ButtonHTMLAttributes } from 'react';

const cx = (...parts: (string | false | undefined)[]): string => parts.filter(Boolean).join(' ');

export function Card({
  title,
  action,
  children,
  className,
  padded = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cx(padded ? 'card' : 'card-flush', className)}>
      {(title || action) && (
        <header
          className={cx(
            'flex items-center justify-between gap-3',
            padded ? 'mb-4' : 'px-4 pt-4 pb-3 sm:px-5',
          )}
        >
          {typeof title === 'string' ? <h2 className="card-title">{title}</h2> : title}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-faint">{hint}</p>}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  block?: boolean;
};

export function Button({ variant = 'secondary', block, className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cx('btn', `btn-${variant}`, block && 'w-full', className)}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('input appearance-none pr-8', className)} {...props} />;
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('input', className)} {...props} />;
}

export function NumberInput({
  value,
  onValueChange,
  suffix,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | '';
  onValueChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        className={cx('input tnum', suffix && 'pr-12', className)}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isNaN(next)) onValueChange(next);
        }}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-faint">
          {suffix}
        </span>
      )}
    </div>
  );
}

/**
 * SOC slider with a live readout. The readout is a real number input too, because
 * dragging to an exact percentage on a phone is fiddly.
 */
export function SocSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  accent,
}: {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  accent?: string;
}) {
  const id = `slider-${String(label).replace(/\s+/g, '-')}`;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-muted" htmlFor={id}>
          {label}
        </label>
        <span className="tnum text-lg font-semibold" style={accent ? { color: accent } : undefined}>
          {value}%
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={`${value}%`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  columns,
}: {
  value: T;
  options: { value: T; label: ReactNode; hint?: string }[];
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <div
      role="radiogroup"
      className="grid gap-1.5 rounded-xl border border-line bg-raised p-1"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cx(
              'rounded-lg px-2 py-2 text-sm font-medium transition-colors',
              active ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-faint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span
          className={cx(
            'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </label>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="stat-label truncate">{label}</div>
      <div className="stat-value truncate" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Chip({
  children,
  color,
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cx('chip', className)}
      style={color ? { color, borderColor: color } : undefined}
    >
      {children}
    </span>
  );
}

export function Notice({
  severity = 'info',
  children,
}: {
  severity?: 'info' | 'warn' | 'critical';
  children: ReactNode;
}) {
  const color =
    severity === 'critical' ? 'var(--danger)' : severity === 'warn' ? 'var(--warn)' : 'var(--flat)';
  return (
    <div
      className="flex gap-2.5 rounded-xl px-3 py-2.5 text-sm"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
      role={severity === 'critical' ? 'alert' : undefined}
    >
      <span aria-hidden="true" className="mt-px shrink-0 font-semibold">
        {severity === 'critical' ? '!' : severity === 'warn' ? '△' : 'i'}
      </span>
      <span className="min-w-0 text-ink/85">{children}</span>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-faint">{children}</p>;
}
