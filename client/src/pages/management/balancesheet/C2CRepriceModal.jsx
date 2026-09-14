import { useState, useEffect } from 'react';
import { RefreshCw, Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import BaseModal from '../../../components/ui/BaseModal';
import { managementAPI } from '../../../api/apiService';
import { fmtDate } from '../../../utils/dateUtils';

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Why a row could not be re-priced, in words an accountant can act on.
const SKIP_REASONS = {
    invoice_not_found:  'Source invoice no longer exists',
    invoice_not_paid:   'Invoice is no longer marked Paid',
    no_hours_recorded:  'No hours recorded on the entry',
};

// Where the new rate came from.
const RATE_SOURCES = {
    dated_pay_rate:                'Pay rate effective for the period',
    dated_percentage_of_bill_rate: '% of the effective bill rate',
    placement_flat_rate:           'Placement pay rate (no dated rates on file)',
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
        <div className="flex justify-between items-center w-full gap-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">
                {preview && changes.length > 0 && (
                    <>
                        {fmt$(preview.total_before)} → <span className="text-(--text-main)">{fmt$(preview.total_after)}</span>
                        <span className={`ml-2 ${preview.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            ({preview.delta >= 0 ? '+' : '−'}{fmt$(Math.abs(preview.delta))})
                        </span>
                    </>
                )}
            </div>
            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={applying}
                    className="px-5 py-2.5 text-xs font-bold text-(--text-main) bg-(--bg-surface) border border-(--border-subtle) hover:opacity-80 rounded-xl uppercase tracking-widest transition-all outline-none"
                >
                    {changes.length > 0 ? 'Cancel' : 'Close'}
                </button>
                {changes.length > 0 && (
                    <button
                        type="button"
                        onClick={handleApply}
                        disabled={applying}
                        className="px-6 py-2.5 text-xs font-bold text-(--brand-primary-text) bg-(--brand-primary) hover:opacity-90 rounded-xl uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm outline-none"
                    >
                        {applying ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                        Apply {changes.length} Change{changes.length !== 1 ? 's' : ''}
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <BaseModal
            isOpen={true}
            onClose={!applying ? onClose : undefined}
            icon={<RefreshCw size={16} />}
            title="Sync C2C Earnings to Current Pay Rates"
            subtitle={`${employee.first_name} ${employee.last_name} — ${employee.employee_code || ''}`}
            footer={footer}
        >
            {loading ? (
                <div className="flex flex-col items-center justify-center py-28 text-(--text-muted)">
                    <Loader2 className="w-8 h-8 animate-spin mb-4 text-(--brand-primary)" />
                    <p className="text-xs font-bold uppercase tracking-widest">Recalculating…</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {error && (
                        <div className="bg-red-500/10 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-500/20">
                            <AlertTriangle size={16} /> {error}
                        </div>
                    )}

                    <div className="bg-(--bg-app) border border-(--border-subtle) rounded-xl p-3 flex gap-2.5 text-[11px] text-(--text-muted) leading-relaxed">
                        <Info size={15} className="shrink-0 mt-0.5 text-(--brand-primary)" />
                        <span>
                            C2C earnings are written once, when an invoice is paid, using the pay rate on file
                            at that moment. This re-prices those entries against the rates on the placement
                            today. <span className="font-bold text-(--text-main)">Hours are never changed</span> —
                            only the rate and the resulting amount.
                        </span>
                    </div>

                    {/* A rate exists but its effective date starts after the invoice
                        period, so the entry still prices at $0. This is the usual
                        reason a $0 balance stays $0 after a rate is entered. */}
                    {warnings.length > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2">
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                <AlertTriangle size={14} />
                                {warnings.length} entr{warnings.length === 1 ? 'y' : 'ies'} still price at $0
                            </div>
                            <p className="text-[11px] text-(--text-muted) leading-relaxed">
                                The placement has a rate on file, but its effective date starts
                                <span className="font-bold text-(--text-main)"> after </span>
                                these invoice periods. Backdate the pay rate's effective date on the
                                placement to cover them, then run this again.
                            </p>
                            <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                {warnings.slice(0, 12).map((w, i) => (
                                    <div key={i} className="text-[11px] text-(--text-muted)">
                                        <span className="font-mono font-bold text-(--text-main)">{w.invoice_number}</span>
                                        {' — period '}{fmtDate(w.period_start)} – {fmtDate(w.period_end)}
                                        {w.earliest_rate_date && (
                                            <>, earliest rate starts <span className="font-bold">{fmtDate(w.earliest_rate_date)}</span></>
                                        )}
                                    </div>
                                ))}
                                {warnings.length > 12 && (
                                    <div className="text-[11px] text-(--text-muted) italic">
                                        …and {warnings.length - 12} more
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {changes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-(--text-muted) gap-3">
                            <CheckCircle2 size={36} className="opacity-30 text-emerald-600" />
                            <p className="text-xs font-bold uppercase tracking-widest">
                                {warnings.length > 0 ? 'Nothing to re-price' : 'Already up to date'}
                            </p>
                            <p className="text-[11px] max-w-sm text-center">
                                {warnings.length > 0
                                    ? "Fix the pay rate effective dates above and the entries will re-price."
                                    : "Every posted C2C entry already matches the placement's current pay rates."}
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-(--border-subtle) overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs min-w-[720px]">
                                    <thead className="bg-(--bg-app) text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                                        <tr>
                                            <th className="px-3 py-2.5">Placement</th>
                                            <th className="px-3 py-2.5">Invoice #</th>
                                            <th className="px-3 py-2.5">Period</th>
                                            <th className="px-3 py-2.5 text-right">Hours</th>
                                            <th className="px-3 py-2.5 text-right">Rate</th>
                                            <th className="px-3 py-2.5 text-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-(--border-subtle)">
                                        {changes.map(c => (
                                            <tr key={c.transaction_id} className="hover:bg-(--brand-primary)/5 transition-colors">
                                                <td className="px-3 py-2.5 font-mono font-bold text-(--text-main) whitespace-nowrap">
                                                    {c.placement_code}
                                                </td>
                                                <td className="px-3 py-2.5 font-mono text-(--text-muted)">{c.invoice_number}</td>
                                                <td className="px-3 py-2.5 text-(--text-muted) font-bold whitespace-nowrap">
                                                    {c.period_start && c.period_end
                                                        ? `${fmtDate(c.period_start)} – ${fmtDate(c.period_end)}`
                                                        : '—'}
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-(--text-main)">
                                                    {parseFloat(c.hours).toFixed(2)}
                                                </td>
                                                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                    {c.parts ? (
                                                        // A rate change lands inside this period, so the entry
                                                        // splits into one row per rate — same total hours.
                                                        <div className="flex flex-col items-end gap-0.5">
                                                            {c.parts.map((p, pi) => (
                                                                <div key={pi} className="text-[10px]">
                                                                    <span className="text-(--text-muted)">
                                                                        {fmtDate(p.segment_start)}–{fmtDate(p.segment_end)}:
                                                                    </span>{' '}
                                                                    <span className="font-bold text-(--text-main)">{fmt$(p.pay_rate)}</span>
                                                                    <span className="text-(--text-muted)"> × {p.hours}h</span>
                                                                </div>
                                                            ))}
                                                            <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-wide">
                                                                Split at rate change
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <span className="text-(--text-muted) line-through">{fmt$(c.old_pay_rate)}</span>
                                                            <span className="mx-1 text-(--text-muted)">→</span>
                                                            <span className="font-bold text-(--text-main)">{fmt$(c.new_pay_rate)}</span>
                                                            {RATE_SOURCES[c.rate_source] && c.new_pay_rate === 0 && (
                                                                <div className="text-[9px] font-bold text-amber-600 mt-0.5 normal-case tracking-normal">
                                                                    {RATE_SOURCES[c.rate_source]}
                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                                                    <span className="text-(--text-muted) line-through">{fmt$(c.old_amount)}</span>
                                                    <span className="mx-1 text-(--text-muted)">→</span>
                                                    <span className={`font-bold ${c.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                        {fmt$(c.new_amount)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {(skipped.length > 0 || preview?.missing_ledger_rows > 0) && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1.5">
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-700">
                                <AlertTriangle size={14} /> Not re-priced
                            </div>
                            {skipped.map((s, i) => (
                                <div key={i} className="text-[11px] text-(--text-muted)">
                                    <span className="font-mono font-bold text-(--text-main)">{s.invoice_number}</span>
                                    {' — '}{SKIP_REASONS[s.reason] || s.reason}
                                </div>
                            ))}
                            {preview?.missing_ledger_rows > 0 && (
                                <div className="text-[11px] text-(--text-muted)">
                                    {preview.missing_ledger_rows} paid C2C invoice{preview.missing_ledger_rows !== 1 ? 's' : ''} never
                                    posted to the ledger at all. Re-pricing cannot create those — run{' '}
                                    <span className="font-mono font-bold text-(--text-main)">scripts/backfill_c2c_ledger.js</span> for them.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </BaseModal>
    );
};

export default C2CRepriceModal;
