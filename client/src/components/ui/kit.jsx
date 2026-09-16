/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import { Search, SlidersHorizontal, X, Loader2, ChevronDown, Inbox } from 'lucide-react';

/**
 * Nebula UI kit — the shared building blocks every workspace page and detail view
 * is composed from, so the whole console reads as one system.
 */

export const cx = (...classes) => classes.filter(Boolean).join(' ');

const display = { fontFamily: 'var(--font-display)' };

// ─── Tones ────────────────────────────────────────────────────────────────────
export const TONE = {
    brand:   'bg-(--brand-primary)/10 text-(--brand-primary) border-(--brand-primary)/25',
    cyan:    'bg-cyan-500/10 text-cyan-500 border-cyan-500/25',
    green:   'bg-emerald-500/10 text-emerald-500 border-emerald-500/25',
    amber:   'bg-amber-500/10 text-amber-500 border-amber-500/25',
    rose:    'bg-rose-500/10 text-rose-500 border-rose-500/25',
    fuchsia: 'bg-fuchsia-500/10 text-fuchsia-500 border-fuchsia-500/25',
    sky:     'bg-sky-500/10 text-sky-500 border-sky-500/25',
    slate:   'bg-(--text-muted)/10 text-(--text-muted) border-(--border-subtle)',
};

export const Chip = ({ tone = 'slate', icon: Icon, children, className }) => (
    <span className={cx('inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', TONE[tone] || TONE.slate, className)}>
        {Icon && <Icon size={11} className="shrink-0" />}
        <span className="truncate">{children}</span>
    </span>
);

// ─── Buttons ──────────────────────────────────────────────────────────────────
const BTN = {
    primary: 'text-white hover:brightness-110',
    ghost:   'border border-(--border-subtle) bg-(--bg-surface)/80 text-(--text-main) hover:border-(--brand-primary)/45',
    success: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20',
    danger:  'border border-rose-500/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20',
    warn:    'border border-amber-500/30 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20',
    subtle:  'text-(--text-muted) hover:bg-(--text-main)/5 hover:text-(--text-main)',
};

export const Btn = ({ variant = 'ghost', icon: Icon, size = 'md', className, children, style, ...rest }) => (
    <button
        type="button"
        {...rest}
        className={cx(
            'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-semibold outline-none transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
            size === 'sm' ? 'h-8 px-3 text-xs' : size === 'icon' ? 'h-9 w-9' : 'h-10 px-4 text-sm',
            BTN[variant] || BTN.ghost,
            className,
        )}
        style={variant === 'primary' ? { background: 'var(--brand-gradient)', boxShadow: '0 12px 28px -12px var(--brand-glow)', ...style } : style}
    >
        {Icon && <Icon size={size === 'sm' ? 13 : 15} />}
        {children}
    </button>
);

// ─── Page scaffolding ─────────────────────────────────────────────────────────
export const PageHero = ({ icon: Icon, eyebrow, title, description, actions, children }) => (
    <section
        className="relative overflow-hidden rounded-[24px] border border-(--border-subtle) px-4 py-4 sm:px-6 sm:py-5"
        style={{ background: 'linear-gradient(125deg, color-mix(in srgb, var(--brand-primary) 13%, var(--bg-surface)) 0%, var(--bg-surface) 52%, color-mix(in srgb, var(--brand-secondary) 10%, var(--bg-surface)) 100%)' }}
    >
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full border border-(--brand-primary)/15" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-4 -top-14 h-44 w-44 rounded-full border border-(--brand-secondary)/20" />
        <div aria-hidden="true" className="pointer-events-none absolute right-12 top-4 h-28 w-28 rounded-full blur-3xl" style={{ background: 'var(--brand-glow)' }} />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
                {Icon && (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-white" style={{ background: 'var(--brand-gradient)', boxShadow: '0 14px 30px -12px var(--brand-glow)' }}>
                        <Icon size={19} />
                    </span>
                )}
                <div className="min-w-0">
                    {eyebrow && <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-(--brand-primary)">{eyebrow}</p>}
                    <h1 className="mt-0.5 text-xl font-semibold text-(--text-main) sm:text-2xl">{title}</h1>
                    {description && <p className="mt-1.5 max-w-2xl text-sm text-(--text-muted)">{description}</p>}
                </div>
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {children && <div className="relative mt-4">{children}</div>}
    </section>
);

/** Horizontal rail of stat tiles. Tiles with onClick act as filters. */
export const StatRail = ({ children }) => (
    <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">{children}</div>
);

export const StatTile = ({ label, value, hint, icon: Icon, active = false, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className={cx(
            'group relative flex min-w-[118px] flex-1 flex-col items-start gap-0.5 overflow-hidden rounded-[16px] border px-3 py-2 text-left outline-none transition-all duration-300 disabled:cursor-default',
            active ? 'border-transparent' : 'border-(--border-subtle) bg-(--bg-surface)/80 backdrop-blur enabled:hover:-translate-y-0.5 enabled:hover:border-(--brand-primary)/40',
        )}
        style={active ? { background: 'var(--brand-gradient)', boxShadow: '0 16px 34px -16px var(--brand-glow)' } : undefined}
    >
        <span className={cx('flex items-center gap-1.5 text-xs font-medium', active ? 'text-white/85' : 'text-(--text-muted)')}>
            {Icon && <Icon size={13} />}
            {label}
        </span>
        <span className={cx('text-lg font-semibold', active ? 'text-white' : 'text-(--text-main)')} style={display}>{value}</span>
        {hint && <span className={cx('text-[11px]', active ? 'text-white/75' : 'text-(--text-muted)')}>{hint}</span>}
    </button>
);

/** Two-column work area: a filter dock on the left, results on the right. */
export const Workbench = ({ dock, children }) => (
    <div className="grid gap-4 lg:grid-cols-[212px_minmax(0,1fr)] xl:grid-cols-[236px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-0 lg:self-start">{dock}</aside>
        <div className="min-w-0 space-y-4">{children}</div>
    </div>
);

export const FilterDock = ({ title = 'Refine', activeCount = 0, onReset, children }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="rounded-[18px] border border-(--border-subtle) bg-(--bg-surface)/85 backdrop-blur">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left outline-none lg:cursor-default"
            >
                <span className="flex items-center gap-2 text-sm font-semibold text-(--text-main)">
                    <SlidersHorizontal size={15} className="text-(--brand-primary)" />
                    {title}
                    {activeCount > 0 && (
                        <span className="rounded-full px-2 text-[11px] leading-5 text-white" style={{ background: 'var(--brand-gradient)' }}>{activeCount}</span>
                    )}
                </span>
                <ChevronDown size={16} className={cx('text-(--text-muted) transition-transform lg:hidden', open && 'rotate-180')} />
            </button>
            <div className={cx('space-y-4 border-t border-(--border-subtle) px-4 py-4', open ? 'block' : 'hidden', 'lg:block')}>
                {children}
                {onReset && activeCount > 0 && (
                    <button
                        type="button"
                        onClick={onReset}
                        className="flex w-full items-center justify-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 py-2 text-xs font-semibold text-rose-500 outline-none"
                    >
                        <X size={13} /> Clear filters
                    </button>
                )}
            </div>
        </div>
    );
};

export const DockField = ({ label, children }) => (
    <div className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-(--text-muted)">{label}</p>
        {children}
    </div>
);

/** Vertical single-choice list with optional counts (used for status filters). */
export const DockOptions = ({ value, onChange, options }) => (
    <div className="space-y-1">
        {options.map((o) => {
            const on = value === o.value;
            return (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(o.value)}
                    className={cx(
                        'flex w-full items-center justify-between gap-2 rounded-[12px] px-3 py-2 text-left text-sm outline-none transition-colors',
                        on ? 'bg-(--brand-primary)/12 font-semibold text-(--text-main)' : 'text-(--text-muted) hover:bg-(--text-main)/5 hover:text-(--text-main)',
                    )}
                >
                    <span className="flex min-w-0 items-center gap-2">
                        <span
                            className={cx('h-2 w-2 shrink-0 rounded-full', !on && 'bg-(--border-subtle)')}
                            style={on ? { background: 'var(--brand-gradient)' } : undefined}
                        />
                        <span className="truncate">{o.label}</span>
                    </span>
                    {o.count !== undefined && <span className="font-mono text-[11px]">{o.count}</span>}
                </button>
            );
        })}
    </div>
);

export const SearchInput = ({ value, onChange, placeholder, className }) => (
    <div className={cx('group relative', className)}>
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-(--text-muted) transition-colors group-focus-within:text-(--brand-primary)" />
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="nx-input h-10 pl-10"
        />
        {value && (
            <button
                type="button"
                onClick={() => onChange('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-(--text-muted) outline-none hover:text-(--text-main)"
            >
                <X size={13} />
            </button>
        )}
    </div>
);

export const SelectInput = ({ value, onChange, children, className, ...rest }) => (
    <div className={cx('relative', className)}>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="nx-input h-10 cursor-pointer appearance-none pr-9"
            {...rest}
        >
            {children}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
    </div>
);

// ─── Content blocks ───────────────────────────────────────────────────────────
export const Panel = ({ title, icon: Icon, subtitle, actions, children, className, bodyClassName }) => (
    <section className={cx('min-w-0 rounded-[20px] border border-(--border-subtle) bg-(--bg-surface)', className)}>
        {(title || actions) && (
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-(--border-subtle) px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    {Icon && (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-(--brand-primary)/10 text-(--brand-primary)">
                            <Icon size={16} />
                        </span>
                    )}
                    <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold text-(--text-main)">{title}</h3>
                        {subtitle && <p className="text-xs text-(--text-muted)">{subtitle}</p>}
                    </div>
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </header>
        )}
        <div className={cx('p-4', bodyClassName)}>{children}</div>
    </section>
);

export const Fact = ({ label, value, mono = false, icon: Icon, className }) => (
    <div className={cx('min-w-0', className)}>
        <p className="flex items-center gap-1.5 text-[11px] text-(--text-muted)">
            {Icon && <Icon size={11} />}
            {label}
        </p>
        <div className={cx('mt-0.5 break-words text-sm font-medium text-(--text-main)', mono && 'font-mono')}>
            {value === null || value === undefined || value === '' ? '—' : value}
        </div>
    </div>
);

export const Avatar = ({ name = '', size = 40, className, ring = false }) => {
    const initials = String(name).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
    return (
        <span
            className={cx('flex shrink-0 items-center justify-center rounded-full font-semibold text-white', ring && 'ring-4 ring-(--brand-primary)/15', className)}
            style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.34)), background: 'var(--brand-gradient)' }}
        >
            {initials}
        </span>
    );
};

export const EmptyState = ({ icon: Icon = Inbox, title = 'Nothing here yet', text, action }) => (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-(--border-subtle) text-(--text-muted)">
            <span className="absolute inset-0 rounded-full opacity-20 blur-md" style={{ background: 'var(--brand-gradient)' }} />
            <Icon size={22} className="relative" />
        </span>
        <div>
            <p className="text-sm font-semibold text-(--text-main)">{title}</p>
            {text && <p className="mt-1 max-w-sm text-xs text-(--text-muted)">{text}</p>}
        </div>
        {action}
    </div>
);

export const LoadingState = ({ text = 'Loading…' }) => (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-(--text-muted)">
        <Loader2 size={22} className="animate-spin text-(--brand-primary)" />
        <p className="text-sm">{text}</p>
    </div>
);

/** Card list container used in place of a classic data table. */
export const RecordList = ({ children, className }) => (
    <div className={cx('space-y-2.5', className)}>{children}</div>
);

export const RecordCard = ({ onClick, children, className, muted = false, title }) => (
    <div
        onClick={onClick}
        title={title}
        className={cx(
            'group relative overflow-hidden rounded-[16px] border border-(--border-subtle) bg-(--bg-surface) px-3.5 py-3 transition-all duration-200 sm:px-4',
            onClick && 'cursor-pointer hover:-translate-y-0.5 hover:border-(--brand-primary)/45 hover:shadow-[0_18px_40px_-26px_var(--brand-glow)]',
            muted && 'opacity-70',
            className,
        )}
    >
        <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full opacity-0 transition-opacity group-hover:opacity-100" style={{ background: 'var(--brand-gradient)' }} />
        {children}
    </div>
);

// ─── Detail views ─────────────────────────────────────────────────────────────
/**
 * Detail layout for drawers: a summary column (identity, key facts, quick actions)
 * and a section navigator; the selected section renders on the right.
 */
export const DetailLayout = ({ aside, sections, active, onSelect, children }) => (
    <div className="grid min-h-full lg:grid-cols-[252px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-(--border-subtle) bg-(--bg-app)/40 p-4 lg:border-b-0 lg:border-r lg:p-5">
            {aside}
            {sections && sections.length > 0 && (
                <nav className="hide-scrollbar mt-6 flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
                    {sections.map(({ key, label, icon: Icon, count, hidden }) => {
                        if (hidden) return null;
                        const on = active === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => onSelect(key)}
                                className={cx(
                                    'relative flex shrink-0 items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-left text-sm outline-none transition-colors',
                                    on ? 'bg-(--bg-surface) font-semibold text-(--text-main) shadow-[0_10px_30px_-20px_var(--brand-glow)]' : 'text-(--text-muted) hover:bg-(--text-main)/5 hover:text-(--text-main)',
                                )}
                            >
                                {on && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: 'var(--brand-gradient)' }} />}
                                {Icon && <Icon size={16} className={on ? 'text-(--brand-primary)' : ''} />}
                                <span className="whitespace-nowrap">{label}</span>
                                {count !== undefined && count !== null && (
                                    <span className="ml-auto rounded-full bg-(--text-main)/5 px-2 font-mono text-[11px]">{count}</span>
                                )}
                            </button>
                        );
                    })}
                </nav>
            )}
        </aside>
        <div className="min-w-0 p-4 sm:p-5 lg:p-6">{children}</div>
    </div>
);

export const SectionTitle = ({ icon: Icon, title, subtitle, actions }) => (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
            {Icon && (
                <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-(--brand-primary)/10 text-(--brand-primary)">
                    <Icon size={18} />
                </span>
            )}
            <div>
                <h3 className="text-lg font-semibold text-(--text-main)">{title}</h3>
                {subtitle && <p className="text-xs text-(--text-muted)">{subtitle}</p>}
            </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
);

const NOTICE_TONES = {
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
    rose:  'border-rose-500/30 bg-rose-500/10 text-rose-500',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
    sky:   'border-sky-500/30 bg-sky-500/10 text-sky-600',
    brand: 'border-(--brand-primary)/25 bg-(--brand-primary)/5 text-(--text-muted)',
};

/** Inline banner for warnings, errors and confirmations. */
export const Notice = ({ tone = 'amber', icon: Icon, children, className }) => (
    <div className={cx('flex items-start gap-2.5 rounded-[14px] border px-3.5 py-2.5 text-xs leading-relaxed', NOTICE_TONES[tone] || NOTICE_TONES.amber, className)}>
        {Icon && <Icon size={14} className="mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">{children}</div>
    </div>
);

/** Labelled form control wrapper. */
export const Field = ({ label, required, hint, error, children, className }) => (
    <label className={cx('block min-w-0', className)}>
        {label && (
            <span className="nx-label">
                {label}{required && <span className="ml-0.5 text-rose-500">*</span>}
            </span>
        )}
        {children}
        {hint && !error && <span className="mt-1 block text-[11px] text-(--text-muted)">{hint}</span>}
        {error && <span className="mt-1 block text-[11px] font-medium text-rose-500">{error}</span>}
    </label>
);
