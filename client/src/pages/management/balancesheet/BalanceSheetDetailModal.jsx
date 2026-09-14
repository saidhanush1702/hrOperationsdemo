import { useState, useEffect } from 'react';
import { managementAPI } from '../../../api/apiService';
import {
    Loader2, BookOpen, ChevronDown, ChevronUp,
    Briefcase, SlidersHorizontal, RefreshCw, Trash2, Wallet
} from 'lucide-react';
import BaseModal from '../../../components/ui/BaseModal';
import C2CRepriceModal from './C2CRepriceModal';

import { fmtDate } from '../../../utils/dateUtils';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtHr = (v) => `${parseFloat(v  || 0).toFixed(2)} hrs`;

// ─── Pay-type chip ───────────────────────────────────────────────────────────
const PayTypeBadge = ({ type }) => {
    const map = {
        C2C:   'bg-indigo-500/10 text-indigo-500',
        W2:    'bg-blue-500/10 text-blue-500',
        '1099':'bg-amber-500/10 text-amber-500',
    };
    return (
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${map[type] || 'bg-(--bg-app) text-(--text-muted)'}`}>
            {type}
        </span>
    );
};

// ─── C2C detail sub-table ────────────────────────────────────────────────────
const C2CDetail = ({ items }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[560px]">
            <thead>
                <tr className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                    <th className="px-3 py-2">Invoice #</th>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2 text-center">Paid Date</th>
                    <th className="px-3 py-2 text-right">Hours</th>
                    <th className="px-3 py-2 text-right">Pay Rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
                {items.map((item, i) => (
                    <tr key={item.id || i} className="hover:bg-(--brand-primary)/5 transition-colors">
                        <td className="px-3 py-2.5 font-mono font-bold text-(--text-main)">
                            {item.invoice_number}
                        </td>
                        <td className="px-3 py-2.5 text-(--text-muted) font-bold whitespace-nowrap">
                            {item.period_start && item.period_end
                                ? `${fmtDate(item.period_start)} – ${fmtDate(item.period_end)}`
                                : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center text-(--text-muted) font-bold">
                            {fmtDate(item.paid_date)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-(--text-main)">
                            {fmtHr(item.total_hours)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-(--text-muted)">
                            {fmt$(item.pay_rate)}/hr
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-600">
                            {fmt$(item.amount)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// ─── W2 detail sub-table ─────────────────────────────────────────────────────
const W2Detail = ({ items }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[560px]">
            <thead>
                <tr className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                    <th className="px-3 py-2">Payroll Run Date</th>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2 text-right">Approved Hrs</th>
                    <th className="px-3 py-2 text-right">Pay Rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
                {items.map((item, i) => (
                    <tr key={item.id || i} className="hover:bg-(--brand-primary)/5 transition-colors">
                        <td className="px-3 py-2.5 font-bold text-(--text-main)">
                            {fmtDate(item.run_date)}
                        </td>
                        <td className="px-3 py-2.5 text-(--text-muted) font-bold">
                            {item.period_label}
                        </td>
                        <td className="px-3 py-2.5 text-right text-(--text-main)">
                            {fmtHr(item.approved_hours)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-(--text-muted)">
                            {fmt$(item.pay_rate)}/hr
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-600">
                            {fmt$(item.amount)}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// ─── Manual adjustments sub-table ────────────────────────────────────────────
// Deletion is offered here and nowhere else in this modal: placement earnings are
// generated from paid invoices and payroll runs, so they are corrected at source
// rather than removed from the ledger.
const ManualDetail = ({ items, canDelete, onDelete, deletingId }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[560px]">
            <thead>
                <tr className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    {canDelete && <th className="px-3 py-2 w-12" />}
                </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
                {items.map((item, i) => {
                    const isPayout = item.type === 'PAYOUT';
                    const busy     = deletingId === item.id;
                    return (
                        <tr key={item.id || i} className="hover:bg-(--brand-primary)/5 transition-colors">
                            <td className="px-3 py-2.5 font-bold text-(--text-muted)">
                                {fmtDate(item.date)}
                            </td>
                            <td className="px-3 py-2.5">
                                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${isPayout ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'}`}>
                                    {isPayout ? 'Payout' : 'Deduction'}
                                </span>
                            </td>
                            <td className="px-3 py-2.5 text-(--text-main) max-w-[220px] truncate">
                                {item.reason || '—'}
                            </td>
                            <td className={`px-3 py-2.5 text-right font-bold ${isPayout ? 'text-emerald-600' : 'text-red-500'}`}>
                                {isPayout ? '+' : '−'}{fmt$(item.amount)}
                            </td>
                            {canDelete && (
                                <td className="px-3 py-2.5 text-right">
                                    <button
                                        onClick={() => onDelete(item)}
                                        disabled={busy}
                                        title={`Delete this ${isPayout ? 'payout' : 'deduction'}`}
                                        className="p-1.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all outline-none disabled:opacity-50 disabled:cursor-default"
                                    >
                                        {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                    </button>
                                </td>
                            )}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

// ─── C2C fixed-pay withdrawal sub-table ──────────────────────────────
//
// Each row is one payroll period handing the employee their flat figure, taken
// back out of what the placement's paid invoices accrued. Amounts arrive already
// negated by the API so they read the way they act on the running balance.
const C2CFixedDetail = ({ items }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[560px]">
            <thead>
                <tr className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                    <th className="px-3 py-2">Run Date</th>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2 text-right">Balance Before</th>
                    <th className="px-3 py-2 text-right">Fixed Pay</th>
                    <th className="px-3 py-2 text-right">Adjustment</th>
                    <th className="px-3 py-2 text-right">Drawn</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
                {items.map((item, i) => (
                    <tr key={item.id || i} className="hover:bg-(--brand-primary)/5 transition-colors">
                        <td className="px-3 py-2.5 text-(--text-muted) font-bold whitespace-nowrap">{fmtDate(item.run_date)}</td>
                        <td className="px-3 py-2.5 font-bold text-(--text-main)">{item.period_label}</td>
                        <td className="px-3 py-2.5 text-right text-(--text-muted)">
                            {item.balance_before != null ? fmt$(item.balance_before) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right text-(--text-main)">
                            {item.fixed_pay_per_period != null ? fmt$(item.fixed_pay_per_period) : '—'}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold ${
                            !item.adjustment ? 'text-(--text-muted)' : item.adjustment > 0 ? 'text-green-600' : 'text-red-500'
                        }`}>
                            {item.adjustment ? `${item.adjustment > 0 ? '+' : ''}${fmt$(item.adjustment)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-bold text-red-500">{fmt$(item.amount)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// ─── Expandable summary row ───────────────────────────────────────────────────
const SummaryRow = ({ icon, label, sub, badge, amountLabel, amount, isPositive, children, count }) => {
    const [open, setOpen] = useState(false);
    return (
        <>
            {/* Summary row */}
            <tr
                onClick={() => count > 0 && setOpen(o => !o)}
                className={`border-b border-(--border-subtle) transition-colors
                    ${count > 0 ? 'cursor-pointer hover:bg-(--brand-primary)/5' : 'cursor-default'}
                    ${open ? 'bg-(--brand-primary)/5' : ''}`}
            >
                {/* Label */}
                <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-(--brand-primary)/10 flex items-center justify-center text-(--brand-primary) shrink-0">
                            {icon}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${open ? 'text-(--brand-primary)' : 'text-(--text-main)'}`}>
                                    {label}
                                </span>
                                {badge && <PayTypeBadge type={badge} />}
                            </div>
                            {sub && <div className="text-[10px] text-(--text-muted) font-bold mt-0.5">{sub}</div>}
                        </div>
                    </div>
                </td>

                {/* Entries count */}
                <td className="px-5 py-4 text-center">
                    <span className="text-xs font-bold text-(--text-muted)">{count}</span>
                </td>

                {/* Amount */}
                <td className="px-5 py-4 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                        {amountLabel && (
                            <span className="text-[10px] text-(--text-muted) uppercase tracking-widest font-bold">
                                {amountLabel}
                            </span>
                        )}
                        <span className={`text-sm font-bold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                            {isPositive ? '+' : ''}{fmt$(amount)}
                        </span>
                    </div>
                </td>

                {/* Chevron */}
                <td className="px-4 py-4 w-10 text-right">
                    {count > 0 && (
                        <span className={`transition-colors ${open ? 'text-(--brand-primary)' : 'text-(--text-muted)'}`}>
                            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                    )}
                </td>
            </tr>

            {/* Expanded sub-table */}
            {open && count > 0 && (
                <tr className="bg-(--bg-app)/60">
                    <td colSpan={4} className="px-5 pb-4 pt-2">
                        <div className="rounded-xl border border-(--border-subtle) overflow-hidden bg-(--bg-surface) shadow-sm">
                            {children}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

// ─── Main modal ──────────────────────────────────────────────────────────────
const BalanceSheetDetailModal = ({ isOpen, onClose, employee, onRefresh }) => {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRepriceOpen, setIsRepriceOpen] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [deletingId, setDeletingId] = useState(null);

    // The balance sheet is already restricted to these two roles at the route level;
    // checking again here keeps the button correct if that ever widens.
    const canDeleteAdjustment = ['ORG_ADMIN', 'ACCOUNTANT'].includes(localStorage.getItem('userRole'));

    useEffect(() => {
        if (!employee || !isOpen) return;
        setSummary(null);
        setLoading(true);
        managementAPI
            .getEmployeeBalanceSheetSummary(employee.employee_id || employee.id)
            .then(res => setSummary(res.data))
            .catch(err => { console.error('Failed to fetch summary', err); setSummary(null); })
            .finally(() => setLoading(false));
    }, [employee, isOpen, reloadKey]);

    const handleDeleteAdjustment = async (item) => {
        const label = item.type === 'PAYOUT' ? 'payout' : 'deduction';
        const sign  = item.type === 'PAYOUT' ? '+' : '−';
        if (!window.confirm(
            `Delete this ${label} of ${sign}${fmt$(item.amount)} dated ${fmtDate(item.date)}?\n\n` +
            `This changes the employee's net balance and cannot be undone.`
        )) return;

        setDeletingId(item.id);
        try {
            await managementAPI.deleteBalanceAdjustment(item.id);
            // Drop the row locally rather than refetching — a refetch unmounts the
            // table and collapses the expanded section, which makes removing several
            // adjustments in a row tedious. The parent list still reloads via onRefresh.
            setSummary(prev => {
                if (!prev) return prev;
                const items = prev.manual_adjustments.items.filter(i => i.id !== item.id);
                const additions  = items.filter(i => i.type === 'PAYOUT').reduce((s, i) => s + i.amount, 0);
                const deductions = items.filter(i => i.type === 'DEDUCTION').reduce((s, i) => s + i.amount, 0);
                return {
                    ...prev,
                    manual_adjustments: {
                        total_additions:  parseFloat(additions.toFixed(2)),
                        total_deductions: parseFloat(deductions.toFixed(2)),
                        net:              parseFloat((additions - deductions).toFixed(2)),
                        items,
                    },
                };
            });
            onRefresh?.();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete adjustment.');
        } finally {
            setDeletingId(null);
        }
    };

    if (!employee) return null;

    const hasC2C = !!summary?.placements.some(p => p.transaction_type === 'C2C');

    // Re-pricing only ever touches C2C rows, so the action is hidden when this
    // employee has none — W2 earnings are corrected in the payroll run instead.
    const headerRight = hasC2C ? (
        <button
            onClick={() => setIsRepriceOpen(true)}
            title="Recalculate C2C earnings against the placement's current pay rates"
            className="text-[10px] font-bold uppercase tracking-widest bg-(--bg-surface) text-(--text-main) hover:bg-(--brand-primary) hover:text-(--brand-primary-text) hover:border-(--brand-primary) px-3 sm:px-4 py-2 rounded-lg border border-(--border-subtle) transition-all shadow-sm outline-none flex items-center gap-2"
        >
            <RefreshCw size={13} /> <span className="hidden sm:inline">Sync Pay Rates</span>
        </button>
    ) : null;

    // ── totals ──
    const placementTotal = summary
        ? summary.placements.reduce((s, p) => s + p.total_amount, 0)
        : 0;
    const manualNet = summary?.manual_adjustments?.net ?? 0;
    const netBalance = placementTotal + manualNet;

    const footer = !loading && summary ? (
        <>
            <span className="text-xs font-bold text-(--text-muted) uppercase tracking-wider">
                Net Balance
            </span>
            <span className={`text-lg font-bold ${netBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {netBalance >= 0 ? '+' : '−'} {fmt$(Math.abs(netBalance))}
            </span>
        </>
    ) : null;

    return (
        <>
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            icon={<BookOpen size={16} />}
            title="Employee Balance Sheet"
            subtitle={`${employee.first_name} ${employee.last_name} — ${employee.employee_code || ''}`}
            headerRight={headerRight}
            footer={footer}
            noPadding
        >
            {loading ? (
                <div className="flex flex-col items-center justify-center py-28 text-(--text-muted)">
                    <Loader2 className="w-8 h-8 animate-spin mb-4 text-(--brand-primary)" />
                    <p className="text-xs font-bold uppercase tracking-widest">Loading ledger data…</p>
                </div>
            ) : !summary || (summary.placements.length === 0 && summary.manual_adjustments.items.length === 0) ? (
                <div className="flex flex-col items-center justify-center py-28 text-(--text-muted) gap-3">
                    <BookOpen size={36} className="opacity-20" />
                    <p className="text-xs font-bold uppercase tracking-widest">No transactions found.</p>
                </div>
            ) : (
                <table className="w-full text-left table-auto">
                    {/* Column headers */}
                    <thead className="bg-(--bg-app) text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) sticky top-0 z-10">
                        <tr>
                            <th className="px-5 py-3">Section</th>
                            <th className="px-5 py-3 text-center">Entries</th>
                            <th className="px-5 py-3 text-right">Amount</th>
                            <th className="px-4 py-3 w-10"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* One row per placement+type group */}
                        {summary.placements.map((pl) => {
                            const isFixed = pl.transaction_type === 'C2C_FIXED';
                            const isC2C   = pl.transaction_type === 'C2C';
                            const isLca   = pl.transaction_type === 'W2_LCA';
                            const sub = [
                                pl.client_name,
                                isFixed ? 'Fixed pay drawn from balance'
                                        : !isC2C ? (isLca ? 'As per LCA Wage' : 'Fixed / Standard Pay') : null,
                            ].filter(Boolean).join(' · ');
                            return (
                                <SummaryRow
                                    key={pl.group_key || pl.placement_id + '_' + pl.transaction_type}
                                    icon={isFixed ? <Wallet size={14} /> : <Briefcase size={14} />}
                                    label={isFixed
                                        ? `Payroll C2C (Fixed Pay) — ${pl.placement_code || 'Placement'}`
                                        : (pl.placement_code || 'Placement')}
                                    sub={sub}
                                    badge={pl.pay_type}
                                    // total_amount already arrives negative for a fixed-pay
                                    // group; show its magnitude and let isPositive carry the sign.
                                    amount={isFixed ? Math.abs(pl.total_amount) : pl.total_amount}
                                    isPositive={!isFixed}
                                    count={pl.items.length}
                                    amountLabel={isFixed ? 'Paid out' : 'Earnings'}
                                >
                                    {isFixed ? <C2CFixedDetail items={pl.items} />
                                             : isC2C ? <C2CDetail items={pl.items} />
                                             : <W2Detail items={pl.items} />}
                                </SummaryRow>
                            );
                        })}

                        {/* Manual adjustments row */}
                        {summary.manual_adjustments.items.length > 0 && (() => {
                            const ma = summary.manual_adjustments;
                            const net = ma.net;
                            return (
                                <SummaryRow
                                    icon={<SlidersHorizontal size={14} />}
                                    label="Manual Adjustments"
                                    sub={`+${fmt$(ma.total_additions)} additions · −${fmt$(ma.total_deductions)} deductions`}
                                    amount={Math.abs(net)}
                                    isPositive={net >= 0}
                                    count={ma.items.length}
                                    amountLabel="Net"
                                >
                                    <ManualDetail
                                        items={ma.items}
                                        canDelete={canDeleteAdjustment}
                                        onDelete={handleDeleteAdjustment}
                                        deletingId={deletingId}
                                    />
                                </SummaryRow>
                            );
                        })()}
                    </tbody>
                </table>
            )}
        </BaseModal>

        {isRepriceOpen && (
            <C2CRepriceModal
                employee={employee}
                onClose={() => setIsRepriceOpen(false)}
                onApplied={() => { setReloadKey(k => k + 1); onRefresh?.(); }}
            />
        )}
        </>
    );
};

export default BalanceSheetDetailModal;
