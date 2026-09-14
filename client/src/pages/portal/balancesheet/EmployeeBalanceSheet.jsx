import { useState, useEffect } from 'react';
import { Wallet, Loader2, Briefcase, SlidersHorizontal, ChevronDown, ChevronUp, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { portalAPI } from '../../../api/apiService';
import { fmtDate } from '../../../utils/dateUtils';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Pay-type chip ────────────────────────────────────────────────────────────
const PayTypeBadge = ({ type }) => {
    const map = {
        C2C:   'bg-indigo-500/10 text-indigo-500',
        W2:    'bg-blue-500/10 text-blue-500',
        '1099':'bg-amber-500/10 text-amber-500',
    };
    return (
        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${map[type] || 'bg-(--bg-app) text-(--text-muted)'}`}>
            {type}
        </span>
    );
};

// ─── C2C sub-table ────────────────────────────────────────────────────────────
const C2CDetail = ({ items }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[400px]">
            <thead>
                <tr className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                    <th className="px-3 py-2">Invoice #</th>
                    <th className="px-3 py-2 text-center">Paid Date</th>
                    <th className="px-3 py-2 text-right">Hours</th>
                    <th className="px-3 py-2 text-right">Pay Rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
                {items.map((item, i) => (
                    <tr key={item.id || i} className="hover:bg-(--brand-primary)/5 transition-colors">
                        <td className="px-3 py-2.5 font-mono font-bold text-(--text-main)">{item.invoice_number}</td>
                        <td className="px-3 py-2.5 text-center text-(--text-muted) font-bold">{fmtDate(item.paid_date)}</td>
                        <td className="px-3 py-2.5 text-right text-(--text-main)">{parseFloat(item.total_hours || 0).toFixed(2)} hrs</td>
                        <td className="px-3 py-2.5 text-right text-(--text-muted)">{fmt$(item.pay_rate)}/hr</td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-600">{fmt$(item.amount)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// ─── W2 sub-table ─────────────────────────────────────────────────────────────
const W2Detail = ({ items }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[400px]">
            <thead>
                <tr className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                    <th className="px-3 py-2">Run Date</th>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2 text-right">Hours</th>
                    <th className="px-3 py-2 text-right">Pay Rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
                {items.map((item, i) => (
                    <tr key={item.id || i} className="hover:bg-(--brand-primary)/5 transition-colors">
                        <td className="px-3 py-2.5 font-bold text-(--text-main)">{fmtDate(item.run_date)}</td>
                        <td className="px-3 py-2.5 text-(--text-muted) font-bold">{item.period_label}</td>
                        <td className="px-3 py-2.5 text-right text-(--text-main)">{parseFloat(item.approved_hours || 0).toFixed(2)} hrs</td>
                        <td className="px-3 py-2.5 text-right text-(--text-muted)">{fmt$(item.pay_rate)}/hr</td>
                        <td className="px-3 py-2.5 text-right font-bold text-emerald-600">{fmt$(item.amount)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

// ─── Manual adjustments sub-table ─────────────────────────────────────────────
const ManualDetail = ({ items }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[350px]">
            <thead>
                <tr className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
                {items.map((item, i) => {
                    const isPayout = item.type === 'PAYOUT';
                    return (
                        <tr key={item.id || i} className="hover:bg-(--brand-primary)/5 transition-colors">
                            <td className="px-3 py-2.5 font-bold text-(--text-muted)">{fmtDate(item.date)}</td>
                            <td className="px-3 py-2.5">
                                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md ${isPayout ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'}`}>
                                    {isPayout ? 'Payout' : 'Deduction'}
                                </span>
                            </td>
                            <td className="px-3 py-2.5 text-(--text-main) max-w-[200px] truncate">{item.reason || '—'}</td>
                            <td className={`px-3 py-2.5 text-right font-bold ${isPayout ? 'text-emerald-600' : 'text-red-500'}`}>
                                {isPayout ? '+' : '−'}{fmt$(item.amount)}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

// ─── Expandable section row ───────────────────────────────────────────────────
const LedgerSection = ({ icon, label, sub, badge, amount, isPositive, count, children }) => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <tr
                onClick={() => count > 0 && setOpen(o => !o)}
                className={`border-b border-(--border-subtle) transition-colors
                    ${count > 0 ? 'cursor-pointer hover:bg-(--brand-primary)/5' : 'cursor-default'}
                    ${open ? 'bg-(--brand-primary)/5' : ''}`}
            >
                <td className="px-5 py-4">
                    <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-(--brand-primary)/10 flex items-center justify-center text-(--brand-primary) shrink-0">
                            {icon}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-bold ${open ? 'text-(--brand-primary)' : 'text-(--text-main)'}`}>{label}</span>
                                {badge && <PayTypeBadge type={badge} />}
                            </div>
                            {sub && <div className="text-[10px] text-(--text-muted) font-bold mt-0.5">{sub}</div>}
                        </div>
                    </div>
                </td>
                <td className="px-5 py-4 text-center">
                    <span className="text-xs font-bold text-(--text-muted)">{count}</span>
                </td>
                <td className="px-5 py-4 text-right">
                    <span className={`text-sm font-bold ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                        {isPositive ? '+' : ''}{fmt$(amount)}
                    </span>
                </td>
                <td className="px-4 py-4 w-10 text-right">
                    {count > 0 && (
                        <span className={`transition-colors ${open ? 'text-(--brand-primary)' : 'text-(--text-muted)'}`}>
                            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                    )}
                </td>
            </tr>
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

// ─── Main page ────────────────────────────────────────────────────────────────
const EmployeeBalanceSheet = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        portalAPI.getMyBalanceSheetSummary()
            .then(res => setData(res.data))
            .catch(err => console.error('Balance sheet error:', err))
            .finally(() => setLoading(false));
    }, []);

    const summary   = data?.summary || { placement_earnings: 0, manual_additions: 0, manual_deductions: 0, net_balance: 0 };
    const netBal    = summary.net_balance;
    const isEmpty   = !data || (data.placements?.length === 0 && data.manual_adjustments?.items?.length === 0);

    return (
        <div className="-mt-4 lg:-mt-8 -mx-4 lg:-mx-8 -mb-4 lg:-mb-8 flex flex-col h-[calc(100vh-4rem)] gap-2 animate-in fade-in duration-500">

            {/* Header */}
            <div className="bg-(--bg-surface) px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-(--border-subtle) shadow-sm flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 bg-(--brand-primary)/10 rounded-xl flex items-center justify-center text-(--brand-primary)">
                        <Wallet size={18} />
                    </div>
                    <div>
                        <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-(--text-main) leading-none">
                            My Balance Sheet
                        </h1>
                        <p className="hidden sm:block text-[10px] text-(--text-muted) mt-1 uppercase tracking-widest font-bold">
                            Your personal earnings ledger
                        </p>
                    </div>
                </div>
                {!loading && data && (
                    <div className={`px-4 py-2 rounded-xl border text-sm font-bold ${
                        netBal >= 0
                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-600 border-red-500/20'
                    }`}>
                        Net: {netBal >= 0 ? '+' : '−'}{fmt$(Math.abs(netBal))}
                    </div>
                )}
            </div>

            {/* Summary Cards */}
            {!loading && data && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
                    {[
                        { label: 'Placement Earnings', value: summary.placement_earnings, icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                        { label: 'Manual Additions', value: summary.manual_additions, icon: DollarSign, color: 'text-blue-500', bg: 'bg-blue-500/10 border-blue-500/20' },
                        { label: 'Deductions', value: summary.manual_deductions, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20' },
                        { label: 'Net Balance', value: Math.abs(netBal), icon: Wallet,
                          color: netBal >= 0 ? 'text-(--brand-primary)' : 'text-red-600',
                          bg:    netBal >= 0 ? 'bg-(--brand-primary)/10 border-(--brand-primary)/20' : 'bg-red-500/10 border-red-500/20' },
                    ].map((card, i) => (
                        <div key={i} className={`bg-(--bg-surface) border ${card.bg} rounded-2xl px-4 py-3 shadow-sm`}>
                            <div className="flex items-center gap-2 mb-2">
                                <card.icon size={14} className={card.color} />
                                <p className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest">{card.label}</p>
                            </div>
                            <p className={`text-lg font-bold ${card.color}`}>
                                {i === 2 ? '−' : i === 3 && netBal < 0 ? '−' : i === 3 && netBal >= 0 ? '+' : '+'}
                                {fmt$(card.value)}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {/* Ledger Table Card */}
            <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden">
                {/* <div className="px-5 py-3 border-b border-(--border-subtle) bg-(--bg-app)/30 shrink-0">
                    <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Transaction Ledger</p>
                </div> */}

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-4 text-(--text-muted)">
                            <Loader2 className="w-8 h-8 animate-spin text-(--brand-primary)" />
                            <p className="text-xs font-bold uppercase tracking-widest">Loading ledger…</p>
                        </div>
                    ) : isEmpty ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-3 text-(--text-muted)">
                            <Wallet size={36} className="opacity-20" />
                            <p className="text-xs font-bold uppercase tracking-widest">No transactions found.</p>
                            <p className="text-[10px] text-(--text-muted)">Your balance will appear here once transactions are processed.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left table-auto">
                            <thead className="bg-(--bg-app) text-[9px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) sticky top-0 z-10">
                                <tr>
                                    <th className="px-5 py-3">Section</th>
                                    <th className="px-5 py-3 text-center">Entries</th>
                                    <th className="px-5 py-3 text-right">Amount</th>
                                    <th className="px-4 py-3 w-10" />
                                </tr>
                            </thead>
                            <tbody>
                                {/* Placement rows */}
                                {data.placements.map(pl => {
                                    const isC2C = pl.pay_type === 'C2C';
                                    return (
                                        <LedgerSection
                                            key={pl.placement_id}
                                            icon={<Briefcase size={14} />}
                                            label={pl.placement_code || 'Placement'}
                                            sub={pl.client_name}
                                            badge={pl.pay_type}
                                            amount={pl.total_amount}
                                            isPositive
                                            count={pl.items.length}
                                        >
                                            {isC2C ? <C2CDetail items={pl.items} /> : <W2Detail items={pl.items} />}
                                        </LedgerSection>
                                    );
                                })}

                                {/* Manual Adjustments row */}
                                {data.manual_adjustments.items.length > 0 && (() => {
                                    const ma  = data.manual_adjustments;
                                    const net = ma.net;
                                    return (
                                        <LedgerSection
                                            icon={<SlidersHorizontal size={14} />}
                                            label="Manual Adjustments"
                                            sub={`+${fmt$(ma.total_additions)} additions · −${fmt$(ma.total_deductions)} deductions`}
                                            amount={Math.abs(net)}
                                            isPositive={net >= 0}
                                            count={ma.items.length}
                                        >
                                            <ManualDetail items={ma.items} />
                                        </LedgerSection>
                                    );
                                })()}

                                {/* Net Balance footer row */}
                                <tr className="bg-(--bg-app)/60 border-t-2 border-(--border-subtle)">
                                    <td colSpan={2} className="px-5 py-4 text-sm font-bold text-(--text-main) uppercase tracking-widest">
                                        Net Balance
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <span className={`text-lg font-bold ${netBal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                            {netBal >= 0 ? '+' : '−'}{fmt$(Math.abs(netBal))}
                                        </span>
                                    </td>
                                    <td />
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmployeeBalanceSheet;
