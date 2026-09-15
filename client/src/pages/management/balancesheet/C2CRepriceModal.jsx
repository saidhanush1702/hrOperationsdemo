import { useState, useEffect } from 'react';
import { RefreshCw, Loader2, AlertTriangle, CheckCircle2, Info, ArrowRight, Receipt } from 'lucide-react';
import BaseModal from '../../../components/ui/BaseModal';
import { managementAPI } from '../../../api/apiService';
import { fmtDate } from '../../../utils/dateUtils';
import { Btn, Chip, Notice, EmptyState, LoadingState, cx } from '../../../components/ui/kit';

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Why an entry could not be re-priced, in words an accountant can act on.
const SKIP_REASONS = {
    invoice_not_found:  'Source invoice no longer exists',
    invoice_not_paid:   'Invoice is no longer marked Paid',
    no_hours_recorded:  'No hours recorded on the entry',
};

// Where the new rate came from.
const RATE_SOURCES = {
    dated_pay_rate:                'Pay rate effective for the period',
    dated_percentage_of_bill_rate: '% of the effective bill rate',
    placement_flat_rate:           'Engagement pay rate (no dated rates on file)',
    no_rate_effective_yet:         'No pay rate effective this early — check the effective date',
    no_bill_rate_effective_yet:    'No bill rate effective this early — check the effective date',
};

const C2CRepriceModal = ({ employee, onClose, onApplied }) => {
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState('');

    const employeeId = employee.employee_id || employee.id;

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        managementAPI.previewC2CReprice(employeeId)
            .then(res => { if (!cancelled) setPreview(res.data); })
            .catch(err => { if (!cancelled) setError(err.response?.data?.error || 'Failed to load preview.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [employeeId]);

    const handleApply = async () => {
        setApplying(true);
        setError('');
        try {
            const res = await managementAPI.applyC2CReprice(employeeId);
            onApplied?.(res.data);
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to apply re-pricing.');
            setApplying(false);
        }
    };

    const changes = preview
        ? preview.placements.flatMap(p => p.changes.map(c => ({ ...c, placement_code: p.placement_code })))
        : [];
    const skipped = preview
        ? preview.placements.flatMap(p => p.skipped.map(s => ({ ...s, placement_code: p.placement_code })))
        : [];
    const warnings = preview
        ? preview.placements.flatMap(p => (p.warnings || []).map(w => ({ ...w, placement_code: p.placement_code })))
        : [];

    const footer = (
        <div className="flex w-full items-center justify-end gap-2">
            <Btn onClick={onClose} disabled={applying}>{changes.length > 0 ? 'Cancel' : 'Close'}</Btn>
            {changes.length > 0 && (
                <Btn variant="primary" icon={applying ? Loader2 : CheckCircle2} onClick={handleApply} disabled={applying}>
                    Apply {changes.length} change{changes.length !== 1 ? 's' : ''}
                </Btn>
            )}
        </div>
    );

    return (
        <BaseModal
            isOpen={true}
            onClose={!applying ? onClose : undefined}
            icon={<RefreshCw size={18} />}
            title="Sync C2C earnings to current pay rates"
            subtitle={`${employee.first_name} ${employee.last_name} — ${employee.employee_code || ''}`}
            footer={footer}
        >
            {loading ? (
                <LoadingState text="Recalculating…" />
            ) : (
                <div className="mx-auto max-w-5xl space-y-5">
                    {error && <Notice tone="rose" icon={AlertTriangle}>{error}</Notice>}

                    {preview && changes.length > 0 && (
                        <div className="flex flex-wrap items-center gap-4 rounded-[24px] p-5 text-white" style={{ background: 'var(--brand-gradient)', boxShadow: '0 20px 40px -24px var(--brand-glow)' }}>
                            <div>
                                <p className="text-xs text-white/75">Posted today</p>
                                <p className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{fmt$(preview.total_before)}</p>
                            </div>
                            <ArrowRight size={20} className="text-white/70" />
                            <div>
                                <p className="text-xs text-white/75">After sync</p>
                                <p className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{fmt$(preview.total_after)}</p>
                            </div>
                            <span className="ml-auto rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
                                {preview.delta >= 0 ? '+' : '−'}{fmt$(Math.abs(preview.delta))}
                            </span>
                        </div>
                    )}

                    <Notice tone="brand" icon={Info}>
                        C2C earnings are written once, when an invoice is paid, using the pay rate on file at that moment.
                        This re-prices those entries against the rates on the engagement today.{' '}
                        <b className="text-(--text-main)">Hours are never changed</b> — only the rate and the resulting amount.
                    </Notice>

                    {/* A rate exists but its effective date starts after the invoice
                        period, so the entry still prices at $0. This is the usual
                        reason a $0 balance stays $0 after a rate is entered. */}
                    {warnings.length > 0 && (
                        <Notice tone="amber" icon={AlertTriangle}>
                            <b>{warnings.length} entr{warnings.length === 1 ? 'y' : 'ies'} still price at $0.</b>{' '}
                            The engagement has a rate on file, but its effective date starts <b>after</b> these invoice periods.
                            Backdate the pay rate's effective date to cover them, then run this again.
                            <div className="mt-2 max-h-32 space-y-0.5 overflow-y-auto text-(--text-muted)">
                                {warnings.slice(0, 12).map((w, i) => (
                                    <div key={i}>
                                        <span className="font-mono font-semibold text-(--text-main)">{w.invoice_number}</span>
                                        {' — period '}{fmtDate(w.period_start)} – {fmtDate(w.period_end)}
                                        {w.earliest_rate_date && <>, earliest rate starts <b>{fmtDate(w.earliest_rate_date)}</b></>}
                                    </div>
                                ))}
                                {warnings.length > 12 && <div className="italic">…and {warnings.length - 12} more</div>}
                            </div>
                        </Notice>
                    )}

                    {changes.length === 0 ? (
                        <div className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface)">
                            <EmptyState
                                icon={CheckCircle2}
                                title={warnings.length > 0 ? 'Nothing to re-price' : 'Already up to date'}
                                text={warnings.length > 0
                                    ? 'Fix the pay rate effective dates above and the entries will re-price.'
                                    : "Every posted C2C entry already matches the engagement's current pay rates."}
                            />
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {changes.map(c => (
                                <div key={c.transaction_id} className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[20px] border border-(--border-subtle) bg-(--bg-surface) px-4 py-3.5 sm:px-5">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-(--brand-primary)/10 text-(--brand-primary)"><Receipt size={17} /></span>
                                    <div className="min-w-[160px] flex-1">
                                        <p className="font-mono text-sm font-semibold text-(--text-main)">{c.invoice_number}</p>
                                        <p className="text-xs text-(--text-muted)">
                                            <Chip tone="slate" className="mr-1.5">{c.placement_code}</Chip>
                                            {c.period_start && c.period_end ? `${fmtDate(c.period_start)} – ${fmtDate(c.period_end)}` : '—'}
                                        </p>
                                    </div>
                                    <div className="min-w-[70px] text-right">
                                        <p className="text-[11px] text-(--text-muted)">Hours</p>
                                        <p className="text-sm font-semibold text-(--text-main)">{parseFloat(c.hours).toFixed(2)}</p>
                                    </div>
                                    <div className="min-w-[160px] text-right">
                                        <p className="text-[11px] text-(--text-muted)">Rate</p>
                                        {c.parts ? (
                                            // A rate change lands inside this period, so the entry
                                            // splits into one part per rate — same total hours.
                                            <div className="flex flex-col items-end gap-0.5">
                                                {c.parts.map((p, pi) => (
                                                    <div key={pi} className="text-xs">
                                                        <span className="text-(--text-muted)">{fmtDate(p.segment_start)}–{fmtDate(p.segment_end)}:</span>{' '}
                                                        <span className="font-semibold text-(--text-main)">{fmt$(p.pay_rate)}</span>
                                                        <span className="text-(--text-muted)"> × {p.hours}h</span>
                                                    </div>
                                                ))}
                                                <Chip tone="fuchsia">Split at rate change</Chip>
                                            </div>
                                        ) : (
                                            <>
                                                <p className="text-sm">
                                                    <span className="text-(--text-muted) line-through">{fmt$(c.old_pay_rate)}</span>
                                                    <span className="mx-1 text-(--text-muted)">→</span>
                                                    <span className="font-semibold text-(--text-main)">{fmt$(c.new_pay_rate)}</span>
                                                </p>
                                                {RATE_SOURCES[c.rate_source] && c.new_pay_rate === 0 && (
                                                    <p className="text-[11px] font-medium text-amber-600">{RATE_SOURCES[c.rate_source]}</p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <div className="min-w-[160px] text-right">
                                        <p className="text-[11px] text-(--text-muted)">Amount</p>
                                        <p className="text-sm">
                                            <span className="text-(--text-muted) line-through">{fmt$(c.old_amount)}</span>
                                            <span className="mx-1 text-(--text-muted)">→</span>
                                            <span className={cx('font-semibold', c.delta >= 0 ? 'text-emerald-500' : 'text-rose-500')}>{fmt$(c.new_amount)}</span>
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {(skipped.length > 0 || preview?.missing_ledger_rows > 0) && (
                        <Notice tone="amber" icon={AlertTriangle}>
                            <b>Not re-priced</b>
                            <div className="mt-1 space-y-0.5 text-(--text-muted)">
                                {skipped.map((s, i) => (
                                    <div key={i}>
                                        <span className="font-mono font-semibold text-(--text-main)">{s.invoice_number}</span>
                                        {' — '}{SKIP_REASONS[s.reason] || s.reason}
                                    </div>
                                ))}
                                {preview?.missing_ledger_rows > 0 && (
                                    <div>
                                        {preview.missing_ledger_rows} paid C2C invoice{preview.missing_ledger_rows !== 1 ? 's' : ''} never
                                        posted to the ledger at all. Re-pricing cannot create those — run{' '}
                                        <span className="font-mono font-semibold text-(--text-main)">scripts/backfill_c2c_ledger.js</span> for them.
                                    </div>
                                )}
                            </div>
                        </Notice>
                    )}
                </div>
            )}
        </BaseModal>
    );
};

export default C2CRepriceModal;
