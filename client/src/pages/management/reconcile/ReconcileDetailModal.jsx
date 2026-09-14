import { useState, useEffect, useMemo } from 'react';
import { Scale, Download, CheckCircle, Clock, XCircle, AlertTriangle, FileText, Loader2 } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import { fmtDate } from '../../../utils/dateUtils';
import { exportToExcel } from '../../../utils/exportToExcel';

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Every row is one timesheet's hours as settled by ONE thing — a payroll run, a
// C2C invoice, or nothing yet. A weekly timesheet crossing the 15th is paid by
// two different payroll runs, so it legitimately produces two rows.
const PAID_VIA = {
    PAYROLL:          { label: 'Paid',       tone: 'emerald', icon: CheckCircle },
    PAYROLL_CATCHUP:  { label: 'Paid',       tone: 'emerald', icon: CheckCircle },
    C2C:              { label: 'Paid',       tone: 'emerald', icon: CheckCircle },
    PENDING_PAYROLL:  { label: 'In payroll', tone: 'amber',   icon: Clock },
    REJECTED_PAYROLL: { label: 'Rejected',   tone: 'red',     icon: XCircle },
    NOT_RUN:          { label: 'Not paid',   tone: 'amber',   icon: AlertTriangle },
    NOT_APPROVED:     { label: 'Not paid',   tone: 'slate',   icon: XCircle },
};

const TONE_CLS = {
    emerald: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    amber:   'bg-amber-500/10 text-amber-600 border-amber-500/20',
    red:     'bg-red-500/10 text-red-500 border-red-500/20',
    slate:   'bg-(--bg-app) text-(--text-muted) border-(--border-subtle)',
};

const PaidCell = ({ row }) => {
    const cfg  = PAID_VIA[row.paid_via] || PAID_VIA.NOT_APPROVED;
    const Icon = cfg.icon;

    return (
        <div className="flex flex-col items-start gap-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${TONE_CLS[cfg.tone]}`}>
                <Icon size={10} /> {cfg.label}
            </span>
            {row.paid_label && (
                <span className="text-[10px] font-bold text-(--text-main) leading-tight">
                    {row.paid_via === 'C2C' && (
                        <span className="mr-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20 text-[9px] font-bold">C2C</span>
                    )}
                    {row.paid_via === 'PAYROLL_CATCHUP' && (
                        <span className="mr-1 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 border border-purple-500/20 text-[9px] font-bold">CATCH-UP</span>
                    )}
                    {row.paid_label}
                </span>
            )}
            {row.paid_date && (
                <span className="text-[10px] font-mono text-(--text-muted)">{fmtDate(row.paid_date)}</span>
            )}
            {row.unpriced && (
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600"
                    title="This placement has no pay rate on file, so these hours cannot be priced or paid.">
                    No pay rate on file
                </span>
            )}
        </div>
    );
};

const ReconcileDetailModal = ({ employee, onClose }) => {
    const [detail, setDetail]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [onlyUnpaid, setOnlyUnpaid] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true); setError('');
            try {
                const res = await managementAPI.getReconcileDetail(employee.employee_id);
                if (!cancelled) setDetail(res.data);
            } catch (err) {
                if (!cancelled) setError(err.response?.data?.error || 'Failed to load reconciliation detail.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, [employee.employee_id]);

    const rows = useMemo(() => {
        const all = detail?.rows || [];
        return onlyUnpaid ? all.filter(r => !r.is_paid) : all;
    }, [detail, onlyUnpaid]);

    const handleExport = () => {
        const headers = ['Timesheet Period', 'Placement', 'Client', 'Pay Type', 'Timesheet Status', 'Timesheet Hours', 'Timesheet Amount', 'Row Hours', 'Pay Rate', 'Row Amount', 'Paid?', 'Paid In', 'Paid Date'];
        const keys    = ['ts_period', 'placement_code', 'client_name', 'pay_type_name', 'status_name', 'timesheet_hours', 'timesheet_amount_fmt', 'hours', 'pay_rate_fmt', 'amount_fmt', 'paid_flag', 'paid_label', 'paid_date_fmt'];
        const data = (detail?.rows || []).map(r => ({
            ...r,
            ts_period:            `${fmtDate(r.period_start)} – ${fmtDate(r.period_end)}`,
            timesheet_amount_fmt: parseFloat(r.timesheet_amount || 0).toFixed(2),
            pay_rate_fmt:         parseFloat(r.pay_rate || 0).toFixed(2),
            amount_fmt:           parseFloat(r.amount || 0).toFixed(2),
            paid_flag:            r.is_paid ? 'Paid' : 'Not paid',
            paid_label:           r.paid_via === 'C2C' ? `C2C — ${r.paid_label || ''}` : (r.paid_label || ''),
            paid_date_fmt:        r.paid_date ? fmtDate(r.paid_date) : '',
        }));
        exportToExcel(data, headers, keys, `reconcile_${employee.employee_code || employee.employee_id}`);
    };

    const totals = detail?.totals || { expected_amount: 0, paid_amount: 0, difference: 0 };
    const balanced = Math.abs(parseFloat(totals.difference || 0)) < 0.01;

    const footer = (
        <div className="flex flex-wrap items-center justify-between w-full gap-3">
            <div className="flex flex-wrap items-center gap-4 text-[10px] sm:text-xs font-bold uppercase tracking-widest">
                <span className="text-(--text-muted)">Expected <span className="text-(--text-main) ml-1">{fmt$(totals.expected_amount)}</span></span>
                <span className="text-(--text-muted)">Paid <span className="text-emerald-600 ml-1">{fmt$(totals.paid_amount)}</span></span>
                <span className="text-(--text-muted)">Diff <span className={`ml-1 ${balanced ? 'text-(--text-main)' : 'text-amber-600'}`}>{fmt$(totals.difference)}</span></span>
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setOnlyUnpaid(v => !v)}
                    className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all outline-none shadow-sm ${onlyUnpaid ? 'bg-amber-500/15 text-amber-600 border-amber-500/30' : 'bg-(--bg-surface) text-(--text-muted) border-(--border-subtle) hover:text-(--text-main)'}`}
                >
                    Unpaid only
                </button>
                <button
                    onClick={handleExport}
                    className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/20 transition-all outline-none shadow-sm"
                >
                    <Download size={13} /> <span className="hidden sm:inline">Export</span>
                </button>
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-(--text-main) bg-(--bg-surface) border border-(--border-subtle) rounded-xl hover:opacity-80 outline-none transition-all"
                >
                    Close
                </button>
            </div>
        </div>
    );

    return (
        <BaseModal
            isOpen
            onClose={onClose}
            icon={<Scale size={16} />}
            title={`${employee.first_name} ${employee.last_name}`}
            subtitle={`${employee.employee_code || ''} — timesheet by timesheet`}
            footer={footer}
            noPadding
        >
            {loading ? (
                <div className="flex items-center justify-center h-48 gap-2 text-(--text-muted) font-bold uppercase tracking-widest text-xs">
                    <Loader2 size={16} className="animate-spin" /> Loading…
                </div>
            ) : error ? (
                <div className="m-4 sm:m-6 p-3 bg-red-500/10 text-red-500 text-xs rounded-xl border border-red-500/20 font-bold flex items-center gap-2">
                    <AlertTriangle size={14} /> {error}
                </div>
            ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-(--text-muted) font-bold uppercase tracking-widest text-xs gap-2 px-4 text-center">
                    <FileText size={32} className="opacity-30" />
                    {onlyUnpaid ? 'Everything is paid.' : 'No timesheets for this employee.'}
                </div>
            ) : (
                <>
                    {/* MOBILE CARDS */}
                    <div className="lg:hidden p-2 space-y-2">
                        {rows.map((r, i) => (
                            <div key={`${r.timesheet_id}-${r.row_kind}-${r.payroll_run_id || i}`}
                                className={`rounded-xl border p-3.5 space-y-2.5 ${r.is_paid ? 'bg-(--bg-surface) border-(--border-subtle)' : 'bg-amber-500/5 border-amber-500/20'}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-(--text-main) font-mono">{fmtDate(r.period_start)} – {fmtDate(r.period_end)}</p>
                                        <p className="text-[10px] text-(--text-muted) font-bold mt-0.5 truncate">{r.client_name || r.status_name} · {r.pay_type_name || '—'}</p>
                                    </div>
                                    <PaidCell row={r} />
                                </div>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-(--text-muted)">Hours</p>
                                        <p className="font-bold text-(--text-main) mt-0.5">{parseFloat(r.hours).toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-(--text-muted)">Rate</p>
                                        <p className="font-bold text-(--text-main) mt-0.5">{fmt$(r.pay_rate)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-(--text-muted)">Amount</p>
                                        <p className={`font-bold mt-0.5 ${r.is_paid ? 'text-emerald-600' : 'text-amber-600'}`}>{fmt$(r.amount)}</p>
                                    </div>
                                </div>
                                <p className="text-[9px] text-(--text-muted) font-bold uppercase tracking-widest">
                                    {r.timesheet_id
                                        ? `Timesheet total: ${parseFloat(r.timesheet_hours).toFixed(2)} hrs · ${fmt$(r.timesheet_amount)} · ${r.status_name}`
                                        : r.status_name}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* DESKTOP TABLE */}
                    <div className="hidden lg:block overflow-x-auto">
                        <table className="w-full text-left table-auto min-w-[1150px]">
                            <thead className="bg-(--bg-app) text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) sticky top-0 z-10">
                                <tr>
                                    <th className="px-4 py-3">Timesheet Period</th>
                                    <th className="px-4 py-3">Client / Placement</th>
                                    <th className="px-4 py-3">Pay Type</th>
                                    <th className="px-4 py-3">TS Status</th>
                                    <th className="px-4 py-3 text-right">Timesheet Total</th>
                                    <th className="px-4 py-3 text-right">Hours</th>
                                    <th className="px-4 py-3 text-right">Pay Rate</th>
                                    <th className="px-4 py-3 text-right">Amount</th>
                                    <th className="px-4 py-3">Paid</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-(--border-subtle) text-sm">
                                {rows.map((r, i) => (
                                    <tr key={`${r.timesheet_id}-${r.row_kind}-${r.payroll_run_id || i}`}
                                        className={r.is_paid ? 'hover:bg-(--bg-app) transition-colors' : 'bg-amber-500/5 hover:bg-amber-500/10 transition-colors'}>
                                        <td className="px-4 py-3">
                                            <div className="font-mono text-xs font-bold text-(--text-main) whitespace-nowrap">
                                                {fmtDate(r.period_start)}<span className="text-(--text-muted) mx-1">–</span>{fmtDate(r.period_end)}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="text-xs font-bold text-(--text-main) truncate max-w-[180px]">{r.client_name || '—'}</div>
                                            <div className="text-[10px] text-(--text-muted) font-mono mt-0.5">{r.placement_code || '—'}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="px-2 py-0.5 bg-(--brand-primary)/10 text-(--brand-primary) rounded text-[10px] font-bold border border-(--brand-primary)/20">
                                                {r.pay_type_name || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">{r.status_name}</td>
                                        <td className="px-4 py-3 text-right">
                                            {r.timesheet_id ? (
                                                <>
                                                    <div className="text-xs font-bold text-(--text-main)">{fmt$(r.timesheet_amount)}</div>
                                                    <div className="text-[10px] text-(--text-muted) font-bold">{parseFloat(r.timesheet_hours).toFixed(2)} hrs</div>
                                                </>
                                            ) : (
                                                <span className="text-(--text-muted) text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-bold text-(--text-main) text-xs">{parseFloat(r.hours).toFixed(2)}</td>
                                        <td className="px-4 py-3 text-right font-bold text-(--text-main) text-xs">{fmt$(r.pay_rate)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <span className={`font-bold text-sm ${r.is_paid ? 'text-emerald-600' : 'text-amber-600'}`}>{fmt$(r.amount)}</span>
                                        </td>
                                        <td className="px-4 py-3"><PaidCell row={r} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </BaseModal>
    );
};

export default ReconcileDetailModal;
