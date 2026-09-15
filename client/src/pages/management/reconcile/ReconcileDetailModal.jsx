import { useState, useEffect, useMemo } from 'react';
import { ScanSearch, Download, CheckCircle, Clock, XCircle, AlertTriangle, FileText, CalendarDays } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import { fmtDate } from '../../../utils/dateUtils';
import { exportToExcel } from '../../../utils/exportToExcel';
import { DetailLayout, SectionTitle, Btn, Chip, Avatar, Notice, DockOptions, EmptyState, LoadingState, cx } from '../../../components/ui/kit';

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Every row is one time log's hours as settled by ONE thing — a pay run, a
// C2C invoice, or nothing yet. A weekly time log crossing the 15th is paid by
// two different pay runs, so it legitimately produces two rows.
const PAID_VIA = {
    PAYROLL:          { label: 'Paid',       tone: 'green', icon: CheckCircle },
    PAYROLL_CATCHUP:  { label: 'Paid',       tone: 'green', icon: CheckCircle },
    C2C:              { label: 'Paid',       tone: 'green', icon: CheckCircle },
    PENDING_PAYROLL:  { label: 'In pay run', tone: 'amber', icon: Clock },
    REJECTED_PAYROLL: { label: 'Rejected',   tone: 'rose',  icon: XCircle },
    NOT_RUN:          { label: 'Not paid',   tone: 'amber', icon: AlertTriangle },
    NOT_APPROVED:     { label: 'Not paid',   tone: 'slate', icon: XCircle },
};

const PaidCell = ({ row }) => {
    const cfg = PAID_VIA[row.paid_via] || PAID_VIA.NOT_APPROVED;
    return (
        <div className="flex min-w-[150px] flex-col items-start gap-1 sm:items-end">
            <Chip tone={cfg.tone} icon={cfg.icon}>{cfg.label}</Chip>
            {row.paid_label && (
                <span className="flex items-center gap-1 text-xs font-medium text-(--text-main)">
                    {row.paid_via === 'C2C' && <Chip tone="sky">C2C</Chip>}
                    {row.paid_via === 'PAYROLL_CATCHUP' && <Chip tone="fuchsia">Catch-up</Chip>}
                    {row.paid_label}
                </span>
            )}
            {row.paid_date && <span className="font-mono text-[11px] text-(--text-muted)">{fmtDate(row.paid_date)}</span>}
            {row.unpriced && (
                <span className="text-[11px] font-medium text-amber-600" title="This engagement has no pay rate on file, so these hours cannot be priced or paid.">
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
                if (!cancelled) setError(err.response?.data?.error || 'Failed to load pay audit detail.');
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
        const headers = ['Time Log Period', 'Engagement', 'Partner', 'Pay Model', 'Time Log Status', 'Time Log Hours', 'Time Log Amount', 'Row Hours', 'Pay Rate', 'Row Amount', 'Paid?', 'Paid In', 'Paid Date'];
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
        exportToExcel(data, headers, keys, `pay_audit_${employee.employee_code || employee.employee_id}`);
    };

    const totals = detail?.totals || { expected_amount: 0, paid_amount: 0, difference: 0 };
    const balanced = Math.abs(parseFloat(totals.difference || 0)) < 0.01;
    const expected = parseFloat(totals.expected_amount || 0);
    const paidPct  = expected > 0 ? Math.min(100, (parseFloat(totals.paid_amount || 0) / expected) * 100) : 0;
    const unpaidCount = (detail?.rows || []).filter(r => !r.is_paid).length;

    const footer = (
        <div className="flex w-full items-center justify-end gap-2">
            <Btn variant="success" icon={Download} onClick={handleExport}>Export</Btn>
            <Btn onClick={onClose}>Close</Btn>
        </div>
    );

    const aside = (
        <div className="space-y-5">
            <div className="flex items-center gap-3">
                <Avatar name={`${employee.first_name} ${employee.last_name}`} size={52} ring />
                <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{employee.first_name} {employee.last_name}</p>
                    <p className="font-mono text-xs text-(--text-muted)">{employee.employee_code}</p>
                </div>
            </div>

            <div className="rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5">
                <p className="text-[11px] text-(--text-muted)">Difference</p>
                <p className={cx('text-3xl font-semibold', balanced ? 'text-(--text-main)' : 'text-amber-500')} style={{ fontFamily: 'var(--font-display)' }}>{fmt$(totals.difference)}</p>
                {balanced ? <Chip tone="green" icon={CheckCircle}>Balanced</Chip> : <Chip tone="amber" icon={AlertTriangle}>Unbalanced</Chip>}
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-(--text-main)/5">
                    <div className={cx('h-full rounded-full', balanced ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${paidPct}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                    <div>
                        <p className="text-[11px] text-(--text-muted)">Expected</p>
                        <p className="text-sm font-semibold text-(--text-main)">{fmt$(totals.expected_amount)}</p>
                    </div>
                    <div>
                        <p className="text-[11px] text-(--text-muted)">Paid</p>
                        <p className="text-sm font-semibold text-emerald-500">{fmt$(totals.paid_amount)}</p>
                    </div>
                </div>
            </div>

            <div>
                <p className="mb-2 text-xs font-semibold text-(--text-muted)">Show</p>
                <DockOptions
                    value={onlyUnpaid ? 'UNPAID' : 'ALL'}
                    onChange={v => setOnlyUnpaid(v === 'UNPAID')}
                    options={[
                        { value: 'ALL', label: 'Every row', count: detail?.rows?.length ?? 0 },
                        { value: 'UNPAID', label: 'Unpaid only', count: unpaidCount },
                    ]}
                />
            </div>
        </div>
    );

    return (
        <BaseModal
            isOpen
            onClose={onClose}
            icon={<ScanSearch size={18} />}
            title="Pay audit"
            subtitle={`${employee.first_name} ${employee.last_name} · ${employee.employee_code || ''} — time log by time log`}
            footer={footer}
            noPadding
        >
            <DetailLayout aside={aside}>
                <SectionTitle icon={CalendarDays} title="Settlement trail" subtitle="How each time log's hours were paid" />
                {loading ? (
                    <LoadingState />
                ) : error ? (
                    <Notice tone="rose" icon={AlertTriangle}>{error}</Notice>
                ) : rows.length === 0 ? (
                    <EmptyState icon={FileText} title={onlyUnpaid ? 'Everything is paid' : 'No time logs for this consultant'} />
                ) : (
                    <div className="space-y-2.5">
                        {rows.map((r, i) => (
                            <div
                                key={`${r.timesheet_id}-${r.row_kind}-${r.payroll_run_id || i}`}
                                className={cx('rounded-[20px] border px-4 py-3.5 sm:px-5', r.is_paid ? 'border-(--border-subtle) bg-(--bg-surface)' : 'border-amber-500/30 bg-amber-500/5')}
                            >
                                <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                                    <div className="min-w-[200px] flex-1">
                                        <p className="font-mono text-sm font-semibold text-(--text-main)">{fmtDate(r.period_start)} – {fmtDate(r.period_end)}</p>
                                        <p className="truncate text-xs text-(--text-muted)">{r.client_name || '—'} · <span className="font-mono">{r.placement_code || '—'}</span></p>
                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                            <Chip tone="brand">{r.pay_type_name || '—'}</Chip>
                                            {r.status_name && <Chip tone="slate">{r.status_name}</Chip>}
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4">
                                        <div>
                                            <p className="text-[11px] text-(--text-muted)">Log total</p>
                                            {r.timesheet_id ? (
                                                <>
                                                    <p className="text-sm font-semibold text-(--text-main)">{fmt$(r.timesheet_amount)}</p>
                                                    <p className="text-[11px] text-(--text-muted)">{parseFloat(r.timesheet_hours).toFixed(2)} hrs</p>
                                                </>
                                            ) : <p className="text-sm text-(--text-muted)">—</p>}
                                        </div>
                                        <div>
                                            <p className="text-[11px] text-(--text-muted)">Hours</p>
                                            <p className="text-sm font-semibold text-(--text-main)">{parseFloat(r.hours).toFixed(2)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] text-(--text-muted)">Pay rate</p>
                                            <p className="text-sm font-semibold text-(--text-main)">{fmt$(r.pay_rate)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[11px] text-(--text-muted)">Amount</p>
                                            <p className={cx('text-sm font-semibold', r.is_paid ? 'text-emerald-500' : 'text-amber-500')}>{fmt$(r.amount)}</p>
                                        </div>
                                    </div>
                                    <PaidCell row={r} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </DetailLayout>
        </BaseModal>
    );
};

export default ReconcileDetailModal;
