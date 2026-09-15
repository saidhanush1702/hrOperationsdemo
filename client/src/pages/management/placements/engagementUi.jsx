/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import { Trash2, Eye } from 'lucide-react';
import AmountInput from '../../../components/ui/AmountInput';
import { Field, cx } from '../../../components/ui/kit';
import { fmtDate } from '../../../utils/dateUtils';

export const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Numbered builder section used by the engagement create and detail views. */
export const Step = ({ n, icon: Icon, title, subtitle, action, children }) => (
    <section className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-5 sm:p-6">
        <header className="mb-5 flex flex-wrap items-center gap-3">
            {n && <span className="font-mono text-xl font-semibold nx-gradient-text">{n}</span>}
            {n && <span className="h-8 w-px bg-(--border-subtle)" />}
            {Icon && (
                <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-(--brand-primary)/10 text-(--brand-primary)">
                    <Icon size={16} />
                </span>
            )}
            <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-(--text-main)">{title}</h3>
                {subtitle && <p className="text-xs text-(--text-muted)">{subtitle}</p>}
            </div>
            {action}
        </header>
        <div className="space-y-4">{children}</div>
    </section>
);

const NOTICE = {
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
    rose:  'border-rose-500/30 bg-rose-500/10 text-rose-500',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
    brand: 'border-(--brand-primary)/25 bg-(--brand-primary)/5 text-(--text-muted)',
};

export const Notice = ({ tone = 'amber', icon: Icon, children, className }) => (
    <div className={cx('flex items-start gap-2.5 rounded-[14px] border px-3.5 py-2.5 text-xs leading-relaxed', NOTICE[tone], className)}>
        {Icon && <Icon size={14} className="mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">{children}</div>
    </div>
);

/** One dated record in a vertical timeline (pay model periods, bill and pay rates). */
export const TimelineItem = ({ children, onRemove, last = false }) => (
    <div className="relative pl-7">
        <span className="absolute left-[6px] top-5 h-3 w-3 rounded-full ring-4 ring-(--bg-surface)" style={{ background: 'var(--brand-gradient)' }} />
        {!last && <span className="absolute -bottom-3 left-[11px] top-9 w-px bg-(--border-subtle)" />}
        <div className="relative rounded-[18px] border border-(--border-subtle) bg-(--bg-app)/40 p-4">
            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    title="Remove"
                    className="absolute right-3 top-3 rounded-full p-1.5 text-(--text-muted) outline-none transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                >
                    <Trash2 size={14} />
                </button>
            )}
            {children}
        </div>
    </div>
);

export const EmptyRecords = ({ children }) => (
    <p className="rounded-[16px] border border-dashed border-(--border-subtle) py-4 text-center text-xs text-(--text-muted)">{children}</p>
);

export const FormInput = ({ label, required = false, type = 'text', value, onChange, placeholder, step, readOnly = false, min, prefix, suffix, className }) => (
    <Field label={label} required={required} className={className}>
        <div className="relative">
            {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-(--text-muted)">{prefix}</span>}
            {type === 'amount' ? (
                <AmountInput
                    value={value || ''}
                    onChange={onChange}
                    placeholder={placeholder || '0.00'}
                    className={cx('nx-input', prefix && 'pl-7', suffix && 'pr-12')}
                />
            ) : (
                <input
                    type={type}
                    step={step}
                    min={min}
                    required={required}
                    readOnly={readOnly}
                    placeholder={placeholder}
                    onWheel={type === 'number' ? e => e.target.blur() : undefined}
                    className={cx('nx-input', prefix && 'pl-7', suffix && 'pr-12')}
                    value={value || ''}
                    onChange={e => onChange && onChange(e.target.value)}
                />
            )}
            {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-(--text-muted)">{suffix}</span>}
        </div>
    </Field>
);

export const FormSelect = ({ label, children, value, onChange, required = false, className }) => (
    <Field label={label} required={required} className={className}>
        <select
            required={required}
            className="nx-input cursor-pointer"
            value={value || ''}
            onChange={e => onChange(e.target.value)}
        >
            {children}
        </select>
    </Field>
);

/** Segmented two-way switch (e.g. Fixed $ / Percent %). */
export const Segmented = ({ value, options, onChange }) => (
    <div className="inline-flex rounded-full border border-(--border-subtle) bg-(--bg-app)/60 p-1">
        {options.map(([v, label]) => (
            <button
                key={v}
                type="button"
                onClick={() => onChange(v)}
                className={cx('rounded-full px-4 py-1.5 text-xs font-semibold outline-none transition-colors', value === v ? 'text-white' : 'text-(--text-muted) hover:text-(--text-main)')}
                style={value === v ? { background: 'var(--brand-gradient)' } : undefined}
            >
                {label}
            </button>
        ))}
    </div>
);

// ── Rate segment helpers (mirrors backend buildRateSegments logic) ──────────
const _dateMinus1 = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
};

const buildDisplaySegments = (billRates, payRates, payRateType) => {
    const validBR = (billRates || [])
        .filter(br => br.effective_date && br.bill_rate_value)
        .map(br => ({ ...br, effective_date: String(br.effective_date).split('T')[0] }))
        .sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1));

    const validPR = (payRates || [])
        .filter(pr => pr.effective_date && pr.pay_rate_value)
        .map(pr => ({ ...pr, effective_date: String(pr.effective_date).split('T')[0] }))
        .sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1));

    if (validPR.length === 0) return [];

    // Percentage: both BR and PR changes split segments (mirrors backend exactly)
    // Amount: only PR changes split segments (mirrors backend) — BR shown for reference only
    const brDates = payRateType === 'Percentage' ? validBR.map(r => r.effective_date) : [];
    const allDates = [...new Set([...brDates, ...validPR.map(r => r.effective_date)])].sort();
    if (allDates.length === 0) return [];

    const getActiveBR = (date) => {
        const active = validBR.filter(r => r.effective_date <= date);
        if (!active.length) return null;
        const br = active[active.length - 1];
        const base = parseFloat(br.bill_rate_value) || 0;
        const disc = parseFloat(br.discount_percentage) || 0;
        return base - (base * disc / 100);
    };

    const getActivePR = (date) => {
        const active = validPR.filter(r => r.effective_date <= date);
        return active.length ? active[active.length - 1] : null;
    };

    const segments = [];
    for (let i = 0; i < allDates.length; i++) {
        const startDate = allDates[i];
        const endDate = i + 1 < allDates.length ? _dateMinus1(allDates[i + 1]) : null;
        const prObj = getActivePR(startDate);
        if (!prObj) continue;
        const prVal = parseFloat(prObj.pay_rate_value) || 0;
        const brFinal = getActiveBR(startDate);
        const actualRate = payRateType === 'Percentage'
            ? (brFinal !== null ? brFinal * (prVal / 100) : 0)
            : prVal;
        segments.push({ startDate, endDate, billRateFinal: brFinal, payRateInput: prVal, actualRate });
    }
    return segments;
};

export const RateSegmentsPopover = ({ billRates, payRates, payRateType }) => {
    const [visible, setVisible] = useState(false);
    const segments = buildDisplaySegments(billRates, payRates, payRateType);
    if (segments.length === 0) return null;
    const isPerc = payRateType === 'Percentage';

    return (
        <div className="relative" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
            <button type="button" className="flex h-8 items-center gap-1.5 rounded-full border border-(--border-subtle) px-3 text-xs font-semibold text-(--text-muted) outline-none transition-colors hover:border-(--brand-primary)/45 hover:text-(--brand-primary)" title="View rate segment breakdown">
                <Eye size={13} /> Segments
            </button>
            {visible && (
                <div
                    className="nx-pop absolute right-0 top-full z-[100] mt-2 w-[min(480px,80vw)]"
                    onMouseEnter={() => setVisible(true)}
                    onMouseLeave={() => setVisible(false)}
                >
                    <div className="rounded-[20px] border border-(--border-subtle) bg-(--bg-surface) p-4" style={{ boxShadow: 'var(--shadow-floating)' }}>
                        <p className="text-sm font-semibold text-(--text-main)">Rate segment breakdown</p>
                        <p className="mb-3 text-xs text-(--text-muted)">How pay runs compute $/hr for each period</p>
                        <div className="space-y-2">
                            {segments.map((seg, i) => (
                                <div key={i} className="rounded-[14px] bg-(--bg-app)/60 px-3 py-2.5">
                                    <p className="text-xs font-semibold text-(--text-main)">
                                        {fmtDate(seg.startDate)} — {seg.endDate ? fmtDate(seg.endDate) : <span className="text-emerald-500">Ongoing</span>}
                                    </p>
                                    <div className="mt-1.5 grid grid-cols-3 gap-2 text-xs">
                                        <span className="text-(--text-muted)">Bill <b className="text-emerald-500">{seg.billRateFinal !== null ? fmt$(seg.billRateFinal) : '—'}</b></span>
                                        <span className="text-(--text-muted)">Pay <b className="text-sky-500">{isPerc ? `${seg.payRateInput}%` : fmt$(seg.payRateInput)}</b></span>
                                        <span className="text-right text-(--text-muted)">Actual <b className="text-(--brand-primary)">{fmt$(seg.actualRate)}</b></span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <p className="mt-3 border-t border-(--border-subtle) pt-2 text-[11px] leading-relaxed text-(--text-muted)">
                            {isPerc
                                ? <><b className="text-(--brand-primary)">Formula:</b> actual $/hr = bill rate × pay % — each bill or pay rate change starts a new segment.</>
                                : <><b className="text-(--brand-primary)">Note:</b> fixed pay rate — the bill rate is shown for reference only.</>}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};
