import { useState, useMemo, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Receipt, CheckCircle, XCircle, Loader2, Lock, AlertTriangle, Download, User, MessageSquare, RefreshCw, Plus, ArrowUpCircle, ArrowDownCircle, Trash2, X as XIcon, ShieldCheck, Users, History, Wallet } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import AmountInput from '../../../components/ui/AmountInput';
import { fmtDate } from '../../../utils/dateUtils';
import { exportToExcel } from '../../../utils/exportToExcel';

const fmt = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Compute buffer/totals per item, incorporating per-employee adjustments.
//
// Buffer = what the employee earned minus what we actually paid out, where
//   payout = lcaPerPeriod + empAdj   (empAdj = Σ additions − Σ deductions)
// so additions raise the payout and shrink the buffer, while deductions lower the
// payout and leave more of the employee's money with us. Mirrors submitPayrollRun.
//
// For LCA items: buffer = combinedTotal - lcaPerPeriod - empAdj (on last item of group).
// For non-LCA items there is no buffer; totalWithAdj is the payout itself, so the
// adjustment keeps its natural sign: totalWithAdj = totalAmount + empAdj.
// The LCA wage a W2 placement pays for the period, or null when it pays by the hour.
//
// FIXED is deliberately NOT handled here. A fixed-pay row is a C2C draw-down against
// an already-accrued balance, not a W2 buffer accrual, so it has its own section and
// its own arithmetic (computeFixedRows) rather than sharing this one.
const periodPayout = (item) => (
    item.lca_wage_per_period != null ? parseFloat(item.lca_wage_per_period) : null
);

// True when the row carries a buffer (a set payout) rather than paying hours worked.
const hasBufferBasis = (item) => item.payout_basis !== 'FIXED' && periodPayout(item) != null;

// True for a C2C fixed-pay row.
const isFixedRow = (item) => item.payout_basis === 'FIXED';

// ─── C2C fixed-pay arithmetic ────────────────────────────────────────────────
//
// A fixed-pay row does not compute earnings at all. Its earnings already reached
// the balance sheet when the placement's invoices were paid. What this row decides
// is how much comes back OUT of that balance this period:
//
//   drawn     = fixedPay + empAdj          (what the employee is handed)
//   remaining = balance  - drawn           (what stays as their carried balance)
//
// The sign convention matches the LCA branch and the backend: an ADDITION raises
// what the employee is handed and so draws more down; a DEDUCTION lowers it and
// leaves more of their money with us.
//
// The balance shown is the employee's whole net position across every placement, so
// when one employee has several fixed-pay placements the draw-downs must be summed
// against that single balance rather than each row pretending to own it. Earlier
// rows therefore render as "(part of combined)" and the last row for the employee
// carries the totals -- the same grouping the multi-segment LCA rows already use.
const computeFixedRows = (fixedItems, adjustments = [], adjCarrier = null) => {
    const adjByEmp = {};
    adjustments.forEach(adj => {
        if (!adjByEmp[adj.employee_id]) adjByEmp[adj.employee_id] = 0;
        adjByEmp[adj.employee_id] += adj.type === 'addition' ? parseFloat(adj.amount) : -parseFloat(adj.amount);
    });

    const byEmp = {};
    fixedItems.forEach(item => {
        if (!byEmp[item.employee_id]) byEmp[item.employee_id] = [];
        byEmp[item.employee_id].push(item);
    });

    const result = {};
    Object.entries(byEmp).forEach(([empId, group]) => {
        // Only absorb the adjustment here if one of this group's rows actually
        // carries it; otherwise an hourly row elsewhere in the run already has.
        const groupCarries = !adjCarrier || group.some(i => adjCarrier[i.employee_id] === i.id);
        const empAdj    = groupCarries ? (adjByEmp[empId] || 0) : 0;
        const balance   = parseFloat(group[0].balance_snapshot ?? 0);
        const fixedSum  = group.reduce((s, i) => s + parseFloat(i.fixed_pay_per_period || 0), 0);
        const drawn     = parseFloat((fixedSum + empAdj).toFixed(2));
        const remaining = parseFloat((balance - drawn).toFixed(2));
        const lastId    = group[group.length - 1].id;

        group.forEach(item => {
            const isLast = item.id === lastId;
            // Two different questions. `show` is "does this row print the combined
            // totals for the group". `carries` is "does this row hold the employee's
            // single run-wide adjustment" — which must be decided across ALL of that
            // employee's rows, fixed and hourly alike, or an employee holding both
            // kinds would have the adjustment counted twice on screen.
            const carries = adjCarrier ? adjCarrier[item.employee_id] === item.id : isLast;
            result[item.id] = {
                show:      isLast,
                isMulti:   group.length > 1,
                placements: group.length,
                balance,
                fixedPay:  parseFloat(item.fixed_pay_per_period || 0),
                fixedSum,
                adjNet:    carries ? empAdj : 0,
                showAdj:   carries,
                drawn,
                remaining,
            };
        });
    });
    return result;
};

const computeItemBuffers = (items, adjustments = [], adjCarrier = null) => {
    const adjByEmp = {};
    adjustments.forEach(adj => {
        if (!adjByEmp[adj.employee_id]) adjByEmp[adj.employee_id] = 0;
        adjByEmp[adj.employee_id] += adj.type === 'addition' ? parseFloat(adj.amount) : -parseFloat(adj.amount);
    });

    // Falls back to "last row for this employee among the rows given" when no
    // shared carrier is supplied, which is how this behaved before fixed-pay rows
    // existed as a separate set.
    const lastItemByEmp = {};
    items.forEach(item => { lastItemByEmp[item.employee_id] = item.id; });
    const carrierFor = (item) => (adjCarrier ? adjCarrier[item.employee_id] === item.id
                                             : lastItemByEmp[item.employee_id] === item.id);

    const lcaGroups = {};
    items.forEach(item => {
        if (hasBufferBasis(item)) {
            if (!lcaGroups[item.placement_id]) lcaGroups[item.placement_id] = [];
            lcaGroups[item.placement_id].push(item);
        }
    });

    const result = {};
    items.forEach(item => {
        const hasLca       = hasBufferBasis(item);
        const isLastForEmp = carrierFor(item);
        const empAdj       = adjByEmp[item.employee_id] || 0;

        if (!hasLca) {
            const base = parseFloat(item.total_amount);
            result[item.id] = {
                show:         true,
                buffer:       0,
                totalWithAdj: isLastForEmp ? base + empAdj : base,
                isMulti:      false,
                adjNet:       isLastForEmp ? empAdj : 0,
                showAdj:      isLastForEmp,
            };
            return;
        }

        const group = lcaGroups[item.placement_id] || [item];
        if (group.length === 1) {
            const base = parseFloat(item.total_amount) - periodPayout(item);
            result[item.id] = {
                show:         true,
                buffer:       isLastForEmp ? base - empAdj : base,
                totalWithAdj: null,
                isMulti:      false,
                adjNet:       isLastForEmp ? empAdj : 0,
                showAdj:      isLastForEmp,
            };
        } else {
            const isLastInLcaGroup = group[group.length - 1].id === item.id;
            if (!isLastInLcaGroup) {
                result[item.id] = { show: false, buffer: null, totalWithAdj: null, isMulti: true, adjNet: 0, showAdj: false };
            } else {
                const combinedTotal = group.reduce((s, i) => s + parseFloat(i.total_amount), 0);
                const base = combinedTotal - periodPayout(item);
                result[item.id] = {
                    show:         true,
                    buffer:       isLastForEmp ? base - empAdj : base,
                    totalWithAdj: null,
                    isMulti:      true,
                    segments:     group.length,
                    combinedTotal,
                    adjNet:       isLastForEmp ? empAdj : 0,
                    showAdj:      isLastForEmp,
                };
            }
        }
    });
    return result;
};

// Catch-up rows are deliberately excluded from computeItemBuffers above: they
// carry no lca_wage_per_period (the LCA payout for their source period was
// settled when that period ran), so feeding them into the LCA grouping would
// corrupt the buffer for the regular rows of the same placement.
//
// That leaves one gap to close. An employee's adjustment is baked into their
// LAST REGULAR row; an employee whose only rows in this run are catch-up rows
// has no regular row to carry it, so the backend falls through to their first
// catch-up row. This mirrors that, so the screen agrees with what will post.
const computeArrearsAdj = (arrearsItems, regularItems, adjustments = []) => {
    const adjByEmp = {};
    adjustments.forEach(adj => {
        if (!adjByEmp[adj.employee_id]) adjByEmp[adj.employee_id] = 0;
        adjByEmp[adj.employee_id] += adj.type === 'addition' ? parseFloat(adj.amount) : -parseFloat(adj.amount);
    });

    const empsWithRegular = new Set(regularItems.map(i => i.employee_id));
    const claimed = new Set();
    const result = {};

    arrearsItems.forEach(item => {
        const emp = item.employee_id;
        if (empsWithRegular.has(emp) || claimed.has(emp) || !adjByEmp[emp]) {
            result[item.id] = 0;
            return;
        }
        claimed.add(emp);
        result[item.id] = adjByEmp[emp];
    });
    return result;
};

// ─── Per-row adjustments ─────────────────────────────────────────────────────
//
// Adjustments belong to an EMPLOYEE, not a row, but they are entered and shown on
// the row that carries them (the same row computeItemBuffers / computeFixedRows
// picks to absorb the adjustment). Threading add/remove callbacks through four
// tables and four card components would be noise, so the handlers travel by
// context instead and the cell is a single shared component.
//
// The reason for an adjustment goes in that row's Comments box, so no separate
// description is collected here; the comment is sent along as the description if
// one has been typed.
const AdjustCtx = createContext(null);

const InlineAdjust = ({ employeeId, itemId, show, adjNet = 0, arrears = false }) => {
    const ctx = useContext(AdjustCtx);
    const [open, setOpen]     = useState(false);
    const [type, setType]     = useState('deduction');
    const [amount, setAmount] = useState('');
    const [err, setErr]       = useState('');
    const [busy, setBusy]     = useState(false);

    // An adjustment belongs to the EMPLOYEE for the whole run, not to a row. An
    // employee can hold several rows — one per rate segment, one per placement, or
    // one in each section — so two things are kept deliberately separate:
    //
    //   ADD    from any row. The entry is per employee, so the row you happen to be
    //          looking at is irrelevant and hunting for a particular one is friction.
    //   SHOW   on exactly one row, the carrier. Printing the figure on every row of
    //          the employee would read as several adjustments totalling several times
    //          the real amount.
    //
    // The carrier matches submitPayrollRun's own choice, so the row highlighted here
    // is the row the ledger will attribute it to.
    const carries  = arrears ? !!ctx?.arrearsCarrier?.[itemId] : show;
    const mine     = (ctx?.adjustments || []).filter(a => a.employee_id === employeeId);
    const editable = ctx && !ctx.readOnly;
    const net      = mine.reduce((t, a) => t + (a.type === 'addition' ? parseFloat(a.amount) : -parseFloat(a.amount)), 0);

    const submit = async () => {
        const val = parseFloat(amount);
        if (!val || val <= 0) return setErr('Enter an amount');
        setBusy(true); setErr('');
        const ok = await ctx.add(employeeId, type, val, itemId);
        setBusy(false);
        if (!ok) return setErr('Failed to add');
        setAmount(''); setOpen(false);
    };

    const addButton = editable && !open && (
        <button onClick={() => { setOpen(true); setErr(''); }}
            title="Add an adjustment for this employee. It applies once for the whole run."
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest border border-(--border-subtle) bg-(--bg-surface) text-(--text-muted) hover:text-(--brand-primary) hover:border-(--brand-primary)/40 transition-colors outline-none">
            <Plus size={10} /> Adjust
        </button>
    );

    const editor = editable && open && (
        <div className="w-[150px] rounded-lg border border-(--brand-primary)/30 bg-(--bg-surface) p-1.5 shadow-sm flex flex-col gap-1.5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex gap-1">
                <button onClick={() => setType('addition')}
                    className={`flex-1 px-1 py-1 rounded text-[9px] font-bold uppercase tracking-wider border transition-colors outline-none ${
                        type === 'addition' ? 'bg-green-600 text-white border-green-600'
                                            : 'bg-(--bg-app) text-green-700 border-(--border-subtle) hover:border-green-500/50'}`}>
                    + Add
                </button>
                <button onClick={() => setType('deduction')}
                    className={`flex-1 px-1 py-1 rounded text-[9px] font-bold uppercase tracking-wider border transition-colors outline-none ${
                        type === 'deduction' ? 'bg-red-500 text-white border-red-500'
                                             : 'bg-(--bg-app) text-red-600 border-(--border-subtle) hover:border-red-500/50'}`}>
                    − Ded
                </button>
            </div>
            <AmountInput value={amount} onChange={setAmount} autoFocus
                className="w-full px-2 py-1 text-[11px] font-bold text-right bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded focus:border-(--brand-primary) outline-none" />
            {err && <span className="text-[9px] font-bold text-red-500">{err}</span>}
            <div className="flex gap-1">
                <button onClick={submit} disabled={busy}
                    className="flex-1 flex items-center justify-center gap-1 px-1 py-1 rounded text-[9px] font-bold uppercase tracking-wider bg-(--brand-primary) text-(--brand-primary-text) disabled:opacity-50 outline-none">
                    {busy ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />} Save
                </button>
                <button onClick={() => { setOpen(false); setAmount(''); setErr(''); }}
                    className="px-1.5 py-1 rounded text-[9px] font-bold border border-(--border-subtle) text-(--text-muted) hover:text-(--text-main) outline-none">
                    <XIcon size={10} />
                </button>
            </div>
        </div>
    );

    // ── A row that is not the carrier: add from here, but the figure is printed
    //    where it is actually applied so nothing double-reads.
    if (!carries) {
        return (
            <div className="flex flex-col items-end gap-1">
                {net !== 0 ? (
                    <span className="text-[10px] font-bold text-(--text-muted)/80 leading-tight text-right"
                        title={`This employee has a net ${net > 0 ? 'addition' : 'deduction'} of ${fmt(Math.abs(net))} for this run. It is applied once, on their first placement's row.`}>
                        {fmt(net)}<br />
                        <span className="uppercase tracking-widest">applied on another row</span>
                    </span>
                ) : !open && <span className="text-(--text-muted) text-sm">—</span>}
                {addButton}
                {editor}
            </div>
        );
    }

    return (
        <div className="flex flex-col items-end gap-1">
            {adjNet !== 0 && (
                <div>
                    <span className={`font-bold text-sm ${adjNet > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {adjNet > 0 ? '+' : ''}{fmt(adjNet)}
                    </span>
                    <div className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${adjNet > 0 ? 'text-green-500' : 'text-red-400'}`}>
                        {adjNet > 0 ? 'Addition' : 'Deduction'}
                    </div>
                </div>
            )}

            {/* Each entry removable — the net above can be made of several. */}
            {editable && mine.length > 0 && (
                <div className="flex flex-col items-end gap-0.5 w-full">
                    {mine.map(a => (
                        <div key={a.id} className="flex items-center gap-1 text-[10px] font-bold">
                            <span className={a.type === 'addition' ? 'text-green-600' : 'text-red-500'}>
                                {a.type === 'addition' ? '+' : '−'}{fmt(a.amount)}
                            </span>
                            <button onClick={() => ctx.remove(a.id)} title="Remove this adjustment"
                                className="text-red-400 hover:text-red-600 outline-none shrink-0">
                                <Trash2 size={11} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {adjNet === 0 && mine.length === 0 && !open && (
                <span className="text-(--text-muted) text-sm">—</span>
            )}

            {addButton}
            {editor}
        </div>
    );
};

// ─── Section header ───────────────────────────────────────────────────────────
const SectionHeading = ({ title, subtitle, count, accent, iconBg, iconColor, icon: Icon }) => (
    <div className={`flex items-center justify-between px-4 py-2.5 border-b border-(--border-subtle) ${accent}`}>
        <div className="flex items-center gap-3">
            <div className={`flex items-center justify-center w-7 h-7 rounded-xl ${iconBg} shrink-0`}>
                <Icon size={14} className={iconColor} />
            </div>
            <div>
                <span className={`text-[11px] font-bold uppercase tracking-widest ${iconColor}`}>{title}</span>
                {subtitle && <p className="text-[10px] text-(--text-muted) font-bold uppercase tracking-wider mt-0.5 hidden sm:block">{subtitle}</p>}
            </div>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full border ${iconBg} ${iconColor} border-current/20 shrink-0`}>
            {count} {count !== 1 ? 'items' : 'item'}
        </span>
    </div>
);

// ─── Mobile card — LCA item ───────────────────────────────────────────────────
const LcaItemCard = ({ item, bufInfo, st, comments, readOnly, onApprove, onReject, onCommentChange }) => {
    const hasLca     = item.lca_wage_per_period != null;
    const showBuf    = !bufInfo || bufInfo.show;
    const buffer     = bufInfo ? bufInfo.buffer : (hasLca
        ? parseFloat(item.total_amount) - periodPayout(item)
        : 0);
    const isPositive = !hasLca || (buffer != null && buffer > 0);

    return (
        <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
            st === 'APPROVED' ? 'bg-emerald-500/5 border-emerald-500/20' :
            st === 'REJECTED' ? 'bg-red-500/5 border-red-500/20' :
            'bg-(--bg-surface) border-(--border-subtle)'
        }`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-(--brand-primary)/10 flex items-center justify-center text-(--brand-primary) text-[10px] font-bold shrink-0">
                        <User size={14} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-(--text-main) truncate">{item.first_name} {item.last_name}</p>
                        <p className="text-[10px] font-mono text-(--text-muted) uppercase tracking-tight mt-0.5">{item.employee_code}</p>
                    </div>
                </div>
                {readOnly && (
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${
                        st === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                        st === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                        'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    }`}>
                        {st === 'APPROVED' && <CheckCircle size={11} />}
                        {st === 'REJECTED' && <XCircle size={11} />}
                        {st}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {item.segment_start && (
                    <div className="col-span-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Segment Period</p>
                        <p className="font-bold text-(--text-main) mt-0.5 font-mono text-[11px]">{fmtDate(item.segment_start)} – {fmtDate(item.segment_end)}</p>
                    </div>
                )}
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Approved Hrs</p>
                    <p className="font-bold text-(--text-main) mt-0.5">{parseFloat(item.approved_hours).toFixed(2)} hrs</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Pay Rate</p>
                    <p className="font-bold text-(--text-main) mt-0.5">{fmt(item.pay_rate)}/hr</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Total Amount</p>
                    <p className="font-bold text-(--brand-primary) mt-0.5">{fmt(item.total_amount)}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Adjustment</p>
                    <div className="mt-0.5 flex justify-start">
                        <InlineAdjust employeeId={item.employee_id} itemId={item.id}
                            show={!!bufInfo?.showAdj} adjNet={bufInfo?.adjNet || 0} />
                    </div>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">LCA / Period</p>
                    {item.lca_wage_per_period != null
                        ? <p className="font-bold text-purple-600 mt-0.5">{fmt(item.lca_wage_per_period)}</p>
                        : <p className="text-(--text-muted) mt-0.5 text-[10px] font-bold">—</p>
                    }
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Buffer</p>
                    {showBuf ? (
                        <p className={`font-bold mt-0.5 ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                            {fmt(buffer)}
                            <span className={`text-[10px] ml-1 ${isPositive ? 'text-emerald-500' : 'text-red-400'}`}>
                                {isPositive ? 'Surplus' : 'No Surplus'}
                            </span>
                        </p>
                    ) : (
                        <p className="text-(--text-muted) mt-0.5 text-xs font-bold">—</p>
                    )}
                </div>
                <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Client</p>
                    <p className="font-bold text-(--text-main) mt-0.5 truncate">{item.client_name}</p>
                    <p className="text-[10px] text-(--text-muted) font-bold">{fmt(item.bill_rate)}/hr</p>
                </div>
            </div>

            {readOnly ? (
                comments && (
                    <div className="flex items-start gap-2 bg-(--bg-app) border border-(--border-subtle) rounded-lg px-3 py-2">
                        <MessageSquare size={12} className="text-(--text-muted) shrink-0 mt-0.5" />
                        <p className="text-[10px] text-(--text-main) font-bold leading-relaxed">{comments}</p>
                    </div>
                )
            ) : (
                <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted) flex items-center gap-1 mb-1">
                        <MessageSquare size={10} /> Comment
                    </label>
                    <textarea value={comments || ''} onChange={e => onCommentChange(e.target.value)} rows={2}
                        placeholder="Optional comment…"
                        className="w-full px-2.5 py-2 text-[10px] font-bold bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none resize-none" />
                </div>
            )}
            {!readOnly && (
                <div className="flex gap-2 pt-1">
                    <button onClick={onApprove} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold border transition-all outline-none ${st === 'APPROVED' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-(--bg-surface) text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10'}`}>
                        <CheckCircle size={13} /> Approve
                    </button>
                    <button onClick={onReject} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold border transition-all outline-none ${st === 'REJECTED' ? 'bg-red-500 text-white border-red-500' : 'bg-(--bg-surface) text-red-500 border-red-500/30 hover:bg-red-500/10'}`}>
                        <XCircle size={13} /> Reject
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── Mobile card — C2C fixed-pay item ────────────────────────────────────────
const FixedPayItemCard = ({ item, info, st, comments, readOnly, onApprove, onReject, onCommentChange }) => {
    const showTot  = !info || info.show;
    const positive = (info?.remaining ?? 0) >= 0;

    return (
        <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
            st === 'APPROVED' ? 'bg-emerald-500/5 border-emerald-500/20' :
            st === 'REJECTED' ? 'bg-red-500/5 border-red-500/20' :
            'bg-(--bg-surface) border-(--border-subtle)'
        }`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 shrink-0">
                        <User size={14} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-(--text-main) truncate">{item.first_name} {item.last_name}</p>
                        <p className="text-[10px] font-mono text-(--text-muted) uppercase tracking-tight mt-0.5">{item.employee_code}</p>
                    </div>
                </div>
                {readOnly && (
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${
                        st === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                        st === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                        'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    }`}>
                        {st === 'APPROVED' && <CheckCircle size={11} />}
                        {st === 'REJECTED' && <XCircle size={11} />}
                        {st}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Segment Period</p>
                    <p className="font-bold text-(--text-main) mt-0.5 font-mono text-[11px]">{fmtDate(item.segment_start)} – {fmtDate(item.segment_end)}</p>
                    <p className="text-[10px] text-(--text-muted) font-bold mt-0.5">
                        {parseFloat(item.approved_hours).toFixed(2)} hrs approved
                        {parseFloat(item.pay_rate) > 0 && ` · accrues @ ${fmt(item.pay_rate)}/hr`}
                    </p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Amount (Balance Sheet)</p>
                    <p className="font-bold text-(--brand-primary) mt-0.5">{fmt(info?.balance ?? 0)}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Fixed Pay</p>
                    <p className="font-bold text-amber-600 mt-0.5">{fmt(info?.fixedPay ?? item.fixed_pay_per_period)}</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Adjustment</p>
                    <div className="mt-0.5 flex justify-start">
                        <InlineAdjust employeeId={item.employee_id} itemId={item.id}
                            show={!!info?.showAdj} adjNet={info?.adjNet || 0} />
                    </div>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Total Amount</p>
                    {showTot ? (
                        <p className={`font-bold mt-0.5 ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
                            {fmt(info?.remaining ?? 0)}
                            <span className={`text-[10px] ml-1 ${positive ? 'text-emerald-500' : 'text-red-400'}`}>
                                {positive ? 'left' : 'overdrawn'}
                            </span>
                        </p>
                    ) : (
                        <p className="text-(--text-muted) mt-0.5 text-[10px] font-bold">Part of combined</p>
                    )}
                </div>
                <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Client</p>
                    <p className="font-bold text-(--text-main) mt-0.5 truncate">{item.client_name}</p>
                    <p className="text-[10px] text-(--text-muted) font-bold">{fmt(item.bill_rate)}/hr</p>
                </div>
            </div>

            {readOnly ? (
                comments && (
                    <div className="flex items-start gap-2 bg-(--bg-app) border border-(--border-subtle) rounded-lg px-3 py-2">
                        <MessageSquare size={12} className="text-(--text-muted) shrink-0 mt-0.5" />
                        <p className="text-[10px] text-(--text-main) font-bold leading-relaxed">{comments}</p>
                    </div>
                )
            ) : (
                <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted) flex items-center gap-1 mb-1">
                        <MessageSquare size={10} /> Comment
                    </label>
                    <textarea value={comments || ''} onChange={e => onCommentChange(e.target.value)} rows={2}
                        placeholder="Optional comment…"
                        className="w-full px-2.5 py-2 text-[10px] font-bold bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none resize-none" />
                </div>
            )}
            {!readOnly && (
                <div className="flex gap-2 pt-1">
                    <button onClick={onApprove} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold border transition-all outline-none ${st === 'APPROVED' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-(--bg-surface) text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10'}`}>
                        <CheckCircle size={13} /> Approve
                    </button>
                    <button onClick={onReject} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold border transition-all outline-none ${st === 'REJECTED' ? 'bg-red-500 text-white border-red-500' : 'bg-(--bg-surface) text-red-500 border-red-500/30 hover:bg-red-500/10'}`}>
                        <XCircle size={13} /> Reject
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── Mobile card — Non-LCA item ───────────────────────────────────────────────
const NonLcaItemCard = ({ item, bufInfo, st, comments, readOnly, onApprove, onReject, onCommentChange }) => {
    const totalWithAdj = bufInfo ? bufInfo.totalWithAdj : parseFloat(item.total_amount);

    return (
        <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
            st === 'APPROVED' ? 'bg-emerald-500/5 border-emerald-500/20' :
            st === 'REJECTED' ? 'bg-red-500/5 border-red-500/20' :
            'bg-(--bg-surface) border-(--border-subtle)'
        }`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 text-[10px] font-bold shrink-0">
                        <User size={14} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-bold text-(--text-main) truncate">{item.first_name} {item.last_name}</p>
                        <p className="text-[10px] font-mono text-(--text-muted) uppercase tracking-tight mt-0.5">{item.employee_code}</p>
                    </div>
                </div>
                {readOnly && (
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${
                        st === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                        st === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                        'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    }`}>
                        {st === 'APPROVED' && <CheckCircle size={11} />}
                        {st === 'REJECTED' && <XCircle size={11} />}
                        {st}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {item.segment_start && (
                    <div className="col-span-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Segment Period</p>
                        <p className="font-bold text-(--text-main) mt-0.5 font-mono text-[11px]">{fmtDate(item.segment_start)} – {fmtDate(item.segment_end)}</p>
                    </div>
                )}
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Approved Hrs</p>
                    <p className="font-bold text-(--text-main) mt-0.5">{parseFloat(item.approved_hours).toFixed(2)} hrs</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Pay Rate</p>
                    <p className="font-bold text-(--text-main) mt-0.5">{fmt(item.pay_rate)}/hr</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Amount</p>
                    <p className="font-bold text-(--brand-primary) mt-0.5">{fmt(item.total_amount)}</p>
                    <p className="text-[10px] text-(--text-muted) mt-0.5">hrs × rate</p>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Adjustment</p>
                    <div className="mt-0.5 flex justify-start">
                        <InlineAdjust employeeId={item.employee_id} itemId={item.id}
                            show={!!bufInfo?.showAdj} adjNet={bufInfo?.adjNet || 0} />
                    </div>
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Total Amount</p>
                    <p className="font-bold text-emerald-600 mt-0.5">{fmt(totalWithAdj)}</p>
                </div>
                <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Client</p>
                    <p className="font-bold text-(--text-main) mt-0.5 truncate">{item.client_name}</p>
                    <p className="text-[10px] text-(--text-muted) font-bold">{fmt(item.bill_rate)}/hr</p>
                </div>
            </div>

            {readOnly ? (
                comments && (
                    <div className="flex items-start gap-2 bg-(--bg-app) border border-(--border-subtle) rounded-lg px-3 py-2">
                        <MessageSquare size={12} className="text-(--text-muted) shrink-0 mt-0.5" />
                        <p className="text-[10px] text-(--text-main) font-bold leading-relaxed">{comments}</p>
                    </div>
                )
            ) : (
                <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted) flex items-center gap-1 mb-1">
                        <MessageSquare size={10} /> Comment
                    </label>
                    <textarea value={comments || ''} onChange={e => onCommentChange(e.target.value)} rows={2}
                        placeholder="Optional comment…"
                        className="w-full px-2.5 py-2 text-[10px] font-bold bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none resize-none" />
                </div>
            )}
            {!readOnly && (
                <div className="flex gap-2 pt-1">
                    <button onClick={onApprove} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold border transition-all outline-none ${st === 'APPROVED' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-(--bg-surface) text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10'}`}>
                        <CheckCircle size={13} /> Approve
                    </button>
                    <button onClick={onReject} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold border transition-all outline-none ${st === 'REJECTED' ? 'bg-red-500 text-white border-red-500' : 'bg-(--bg-surface) text-red-500 border-red-500/30 hover:bg-red-500/10'}`}>
                        <XCircle size={13} /> Reject
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── Desktop table — LCA section ─────────────────────────────────────────────
const LcaTable = ({ items, buffers, itemStates, readOnly, setStatus, setComment }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left table-auto min-w-[1100px]">
            <thead className="bg-purple-500/8 text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                <tr>
                    <th className="px-4 py-3 w-40">Employee</th>
                    <th className="px-4 py-3">Segment Period</th>
                    <th className="px-4 py-3 text-right">Approved Hrs</th>
                    <th className="px-4 py-3 text-right">Pay Rate</th>
                    <th className="px-4 py-3 text-right">Total Amount</th>
                    <th className="px-4 py-3 text-right w-44">Adjustment</th>
                    <th className="px-4 py-3 text-right">Buffer</th>
                    <th className="px-4 py-3 w-32">Client (Bill Rate)</th>
                    <th className="px-4 py-3 text-right">LCA / Period</th>
                    <th className="px-4 py-3">Comments</th>
                    <th className="px-4 py-3 text-center">Status</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
                {items.map(item => {
                    const state    = itemStates[item.id] || {};
                    const st       = state.item_status;
                    const comments = state.comments || '';
                    const bufInfo  = buffers[item.id];
                    return (
                        <tr key={item.id} className={`transition-colors ${
                            st === 'APPROVED' ? 'bg-emerald-500/5' :
                            st === 'REJECTED' ? 'bg-red-500/5' : 'hover:bg-(--bg-app)'
                        }`}>
                            <td className="px-4 py-3 w-40">
                                <div className="font-bold text-(--text-main) text-sm break-words whitespace-normal max-w-[140px]">{item.first_name} {item.last_name}</div>
                                <div className="text-[10px] text-(--text-muted) font-mono uppercase tracking-tight mt-0.5">{item.employee_code}</div>
                            </td>
                            <td className="px-4 py-3">
                                {item.segment_start ? (
                                    <div className="font-mono text-xs font-bold text-(--text-main) whitespace-nowrap">
                                        {fmtDate(item.segment_start)}<span className="text-(--text-muted) mx-1">–</span>{fmtDate(item.segment_end)}
                                    </div>
                                ) : <span className="text-(--text-muted) text-sm">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-(--text-main) text-sm">{parseFloat(item.approved_hours).toFixed(2)} hrs</td>
                            <td className="px-4 py-3 text-right text-sm text-(--text-main) font-bold">{fmt(item.pay_rate)}/hr</td>
                            <td className="px-4 py-3 text-right">
                                <span className="font-bold text-(--brand-primary) text-sm">{fmt(item.total_amount)}</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                                <InlineAdjust employeeId={item.employee_id} itemId={item.id}
                                    show={!!bufInfo?.showAdj} adjNet={bufInfo?.adjNet || 0} />
                            </td>
                            <td className="px-4 py-3 text-right">
                                {(() => {
                                    if (!bufInfo || !bufInfo.show) return (
                                        <div><span className="text-(--text-muted) text-sm">—</span>
                                        <div className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest mt-0.5">Part of combined</div></div>
                                    );
                                    const { buffer, isMulti, segments } = bufInfo;
                                    const isPositive = !item.lca_wage_per_period || buffer > 0;
                                    return (
                                        <div>
                                            <span className={`font-bold text-sm ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(buffer)}</span>
                                            <div className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${isPositive ? 'text-emerald-500' : 'text-red-400'}`}>
                                                {isPositive ? 'Surplus' : 'No Surplus'}
                                            </div>
                                            {isMulti && segments && <div className="text-[10px] text-(--text-muted) mt-0.5">{segments} segs combined</div>}
                                        </div>
                                    );
                                })()}
                            </td>
                            <td className="px-4 py-3 text-sm text-(--text-main) w-32 max-w-[128px]">
                                <div className="font-bold truncate" title={item.client_name}>{item.client_name}</div>
                                <div className="text-[10px] text-(--text-muted) font-bold mt-0.5">({fmt(item.bill_rate)}/hr)</div>
                            </td>
                            <td className="px-4 py-3 text-right">
                                {item.lca_wage_per_period != null
                                    ? <span className="font-bold text-purple-600 text-sm">{fmt(item.lca_wage_per_period)}</span>
                                    : <div><span className="text-(--text-muted) text-sm">—</span></div>
                                }
                            </td>
                            <td className="px-4 py-3 max-w-[160px]">
                                {readOnly ? (
                                    comments ? <p className="text-[10px] text-(--text-main) font-bold break-words whitespace-normal">{comments}</p>
                                             : <span className="text-(--text-muted) text-sm">—</span>
                                ) : (
                                    <textarea value={comments} onChange={e => setComment(item.id, e.target.value)} rows={2}
                                        placeholder="Optional…"
                                        className="w-full px-2 py-1.5 text-[10px] font-bold bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none resize-none min-w-[120px]" />
                                )}
                            </td>
                            <td className="px-4 py-3 text-center">
                                {readOnly ? (
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${
                                        st === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                        st === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                        'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                    }`}>
                                        {st === 'APPROVED' && <CheckCircle size={11} />}
                                        {st === 'REJECTED' && <XCircle size={11} />}
                                        {st}
                                    </span>
                                ) : (
                                    <div className="flex items-center gap-1.5 justify-center">
                                        <button onClick={() => setStatus(item.id, 'APPROVED')}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all outline-none shadow-sm ${st === 'APPROVED' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-(--bg-surface) text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10'}`}>
                                            <CheckCircle size={12} /> Approve
                                        </button>
                                        <button onClick={() => setStatus(item.id, 'REJECTED')}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all outline-none shadow-sm ${st === 'REJECTED' ? 'bg-red-500 text-white border-red-500' : 'bg-(--bg-surface) text-red-500 border-red-500/30 hover:bg-red-500/10'}`}>
                                            <XCircle size={12} /> Reject
                                        </button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

// ─── Desktop table — C2C Fixed Pay section ───────────────────────────────────
//
// Deliberately a different shape from the LCA table. There is no "approved hours ×
// pay rate" figure to show, because a fixed-pay row does not earn here: the earnings
// already landed on the balance sheet when the invoices were paid. What matters is
// the balance, what comes out of it, and what is left.
const FixedPayTable = ({ items, fixedRows, itemStates, readOnly, setStatus, setComment }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left table-auto min-w-[1050px]">
            <thead className="bg-amber-500/8 text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                <tr>
                    <th className="px-4 py-3 w-40">Employee</th>
                    <th className="px-4 py-3">Segment Period</th>
                    <th className="px-4 py-3 text-right">Amount (Balance Sheet)</th>
                    <th className="px-4 py-3 text-right">Fixed Pay</th>
                    <th className="px-4 py-3 text-right w-44">Adjustment</th>
                    <th className="px-4 py-3 text-right">Total Amount</th>
                    <th className="px-4 py-3 w-32">Client (Bill Rate)</th>
                    <th className="px-4 py-3">Comments</th>
                    <th className="px-4 py-3 text-center">Status</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
                {items.map(item => {
                    const state    = itemStates[item.id] || {};
                    const st       = state.item_status;
                    const comments = state.comments || '';
                    const info     = fixedRows[item.id];
                    return (
                        <tr key={item.id} className={`transition-colors ${
                            st === 'APPROVED' ? 'bg-emerald-500/5' :
                            st === 'REJECTED' ? 'bg-red-500/5' : 'hover:bg-(--bg-app)'
                        }`}>
                            <td className="px-4 py-3 w-40">
                                <div className="font-bold text-(--text-main) text-sm break-words whitespace-normal max-w-[140px]">{item.first_name} {item.last_name}</div>
                                <div className="text-[10px] text-(--text-muted) font-mono uppercase tracking-tight mt-0.5">{item.employee_code}</div>
                            </td>
                            <td className="px-4 py-3">
                                <div className="font-mono text-xs font-bold text-(--text-main) whitespace-nowrap">
                                    {fmtDate(item.segment_start)}<span className="text-(--text-muted) mx-1">–</span>{fmtDate(item.segment_end)}
                                </div>
                                <div className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest mt-0.5">
                                    {parseFloat(item.approved_hours).toFixed(2)} hrs approved
                                    {parseFloat(item.pay_rate) > 0 && (
                                        <span title="The rate this placement's invoices accrue to the balance sheet at. It does not decide this payout — the fixed figure does.">
                                            {' · '}accrues @ {fmt(item.pay_rate)}/hr
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                                <span className="font-bold text-(--brand-primary) text-sm">{fmt(info?.balance ?? 0)}</span>
                                <div className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest mt-0.5">Net balance</div>
                            </td>
                            <td className="px-4 py-3 text-right">
                                <span className="font-bold text-amber-600 text-sm">{fmt(info?.fixedPay ?? item.fixed_pay_per_period)}</span>
                                <div className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest mt-0.5">Per period</div>
                            </td>
                            <td className="px-4 py-3 text-right">
                                <InlineAdjust employeeId={item.employee_id} itemId={item.id}
                                    show={!!info?.showAdj} adjNet={info?.adjNet || 0} />
                            </td>
                            <td className="px-4 py-3 text-right">
                                {(() => {
                                    if (!info || !info.show) return (
                                        <div><span className="text-(--text-muted) text-sm">—</span>
                                        <div className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest mt-0.5">Part of combined</div></div>
                                    );
                                    const positive = info.remaining >= 0;
                                    return (
                                        <div>
                                            <span className={`font-bold text-sm ${positive ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(info.remaining)}</span>
                                            <div className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${positive ? 'text-emerald-500' : 'text-red-400'}`}>
                                                {positive ? 'Balance left' : 'Overdrawn'}
                                            </div>
                                            <div className="text-[10px] text-(--text-muted) mt-0.5">drawn {fmt(info.drawn)}</div>
                                            {info.isMulti && <div className="text-[10px] text-(--text-muted) mt-0.5">{info.placements} placements combined</div>}
                                        </div>
                                    );
                                })()}
                            </td>
                            <td className="px-4 py-3 text-sm text-(--text-main) w-32 max-w-[128px]">
                                <div className="font-bold truncate" title={item.client_name}>{item.client_name}</div>
                                <div className="text-[10px] text-(--text-muted) font-bold mt-0.5">({fmt(item.bill_rate)}/hr)</div>
                            </td>
                            <td className="px-4 py-3 max-w-[160px]">
                                {readOnly ? (
                                    comments ? <p className="text-[10px] text-(--text-main) font-bold break-words whitespace-normal">{comments}</p>
                                             : <span className="text-(--text-muted) text-sm">—</span>
                                ) : (
                                    <textarea value={comments} onChange={e => setComment(item.id, e.target.value)} rows={2}
                                        placeholder="Optional…"
                                        className="w-full px-2 py-1.5 text-[10px] font-bold bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none resize-none min-w-[120px]" />
                                )}
                            </td>
                            <td className="px-4 py-3 text-center">
                                {readOnly ? (
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${
                                        st === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                        st === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                        'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                    }`}>
                                        {st === 'APPROVED' && <CheckCircle size={11} />}
                                        {st === 'REJECTED' && <XCircle size={11} />}
                                        {st}
                                    </span>
                                ) : (
                                    <div className="flex items-center gap-1.5 justify-center">
                                        <button onClick={() => setStatus(item.id, 'APPROVED')}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all outline-none shadow-sm ${st === 'APPROVED' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-(--bg-surface) text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10'}`}>
                                            <CheckCircle size={12} /> Approve
                                        </button>
                                        <button onClick={() => setStatus(item.id, 'REJECTED')}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all outline-none shadow-sm ${st === 'REJECTED' ? 'bg-red-500 text-white border-red-500' : 'bg-(--bg-surface) text-red-500 border-red-500/30 hover:bg-red-500/10'}`}>
                                            <XCircle size={12} /> Reject
                                        </button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

// ─── Desktop table — Non-LCA section ─────────────────────────────────────────
const NonLcaTable = ({ items, buffers, itemStates, readOnly, setStatus, setComment }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left table-auto min-w-[1050px]">
            <thead className="bg-blue-500/8 text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                <tr>
                    <th className="px-4 py-3 w-40">Employee</th>
                    <th className="px-4 py-3">Segment Period</th>
                    <th className="px-4 py-3 text-right">Approved Hrs</th>
                    <th className="px-4 py-3 text-right">Pay Rate</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right w-44">Adjustment</th>
                    <th className="px-4 py-3 text-right">Total Amount</th>
                    <th className="px-4 py-3 w-32">Client (Bill Rate)</th>
                    <th className="px-4 py-3">Comments</th>
                    <th className="px-4 py-3 text-center">Status</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
                {items.map(item => {
                    const state        = itemStates[item.id] || {};
                    const st           = state.item_status;
                    const comments     = state.comments || '';
                    const bufInfo      = buffers[item.id];
                    const adjNet       = bufInfo?.adjNet || 0;
                    const totalWithAdj = bufInfo ? bufInfo.totalWithAdj : parseFloat(item.total_amount);
                    return (
                        <tr key={item.id} className={`transition-colors ${
                            st === 'APPROVED' ? 'bg-emerald-500/5' :
                            st === 'REJECTED' ? 'bg-red-500/5' : 'hover:bg-(--bg-app)'
                        }`}>
                            <td className="px-4 py-3 w-40">
                                <div className="font-bold text-(--text-main) text-sm break-words whitespace-normal max-w-[140px]">{item.first_name} {item.last_name}</div>
                                <div className="text-[10px] text-(--text-muted) font-mono uppercase tracking-tight mt-0.5">{item.employee_code}</div>
                            </td>
                            <td className="px-4 py-3">
                                {item.segment_start ? (
                                    <div className="font-mono text-xs font-bold text-(--text-main) whitespace-nowrap">
                                        {fmtDate(item.segment_start)}<span className="text-(--text-muted) mx-1">–</span>{fmtDate(item.segment_end)}
                                    </div>
                                ) : <span className="text-(--text-muted) text-sm">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-(--text-main) text-sm">{parseFloat(item.approved_hours).toFixed(2)} hrs</td>
                            <td className="px-4 py-3 text-right text-sm text-(--text-main) font-bold">{fmt(item.pay_rate)}/hr</td>
                            {/* Amount = hours × rate (no adjustment baked in) */}
                            <td className="px-4 py-3 text-right">
                                <span className="font-bold text-(--brand-primary) text-sm">{fmt(item.total_amount)}</span>
                                <div className="text-[10px] text-(--text-muted) mt-0.5">hrs × rate</div>
                            </td>
                            {/* Adjustment */}
                            <td className="px-4 py-3 text-right">
                                <InlineAdjust employeeId={item.employee_id} itemId={item.id}
                                    show={!!bufInfo?.showAdj} adjNet={bufInfo?.adjNet || 0} />
                            </td>
                            {/* Total Amount = Amount + Adjustment */}
                            <td className="px-4 py-3 text-right">
                                <span className="font-bold text-emerald-600 text-sm">{fmt(totalWithAdj)}</span>
                                {bufInfo?.showAdj && adjNet !== 0 && (
                                    <div className="text-[10px] text-(--text-muted) mt-0.5">incl. adj</div>
                                )}
                            </td>
                            <td className="px-4 py-3 text-sm text-(--text-main) w-32 max-w-[128px]">
                                <div className="font-bold truncate" title={item.client_name}>{item.client_name}</div>
                                <div className="text-[10px] text-(--text-muted) font-bold mt-0.5">({fmt(item.bill_rate)}/hr)</div>
                            </td>
                            <td className="px-4 py-3 max-w-[160px]">
                                {readOnly ? (
                                    comments ? <p className="text-[10px] text-(--text-main) font-bold break-words whitespace-normal">{comments}</p>
                                             : <span className="text-(--text-muted) text-sm">—</span>
                                ) : (
                                    <textarea value={comments} onChange={e => setComment(item.id, e.target.value)} rows={2}
                                        placeholder="Optional…"
                                        className="w-full px-2 py-1.5 text-[10px] font-bold bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none resize-none min-w-[120px]" />
                                )}
                            </td>
                            <td className="px-4 py-3 text-center">
                                {readOnly ? (
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${
                                        st === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                        st === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                        'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                    }`}>
                                        {st === 'APPROVED' && <CheckCircle size={11} />}
                                        {st === 'REJECTED' && <XCircle size={11} />}
                                        {st}
                                    </span>
                                ) : (
                                    <div className="flex items-center gap-1.5 justify-center">
                                        <button onClick={() => setStatus(item.id, 'APPROVED')}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all outline-none shadow-sm ${st === 'APPROVED' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-(--bg-surface) text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10'}`}>
                                            <CheckCircle size={12} /> Approve
                                        </button>
                                        <button onClick={() => setStatus(item.id, 'REJECTED')}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all outline-none shadow-sm ${st === 'REJECTED' ? 'bg-red-500 text-white border-red-500' : 'bg-(--bg-surface) text-red-500 border-red-500/30 hover:bg-red-500/10'}`}>
                                            <XCircle size={12} /> Reject
                                        </button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

// ─── Catch-up (arrears) rows ─────────────────────────────────────────────────
// Hours that belong to an earlier pay period but were approved too late for it.
// Rendered apart from the regular rows because they answer a different question:
// not "what did this employee earn this period" but "what do we still owe them
// from a period that has already closed".
const ArrearsRowMeta = ({ item }) => (
    <div className="flex flex-wrap items-center gap-1.5">
        <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20 uppercase tracking-widest">
            {item.source_period_label || 'Prior period'}
        </span>
        {hasBufferBasis(item) && (
            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-(--bg-app) text-(--text-muted) border border-(--border-subtle) uppercase tracking-widest"
                title="That period was paid a set amount and is already settled, so this amount posts entirely to the buffer.">
                To buffer
            </span>
        )}
    </div>
);

const ArrearsItemCard = ({ item, adjNet, st, comments, readOnly, onApprove, onReject, onCommentChange }) => (
    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${
        st === 'APPROVED' ? 'bg-emerald-500/5 border-emerald-500/20' :
        st === 'REJECTED' ? 'bg-red-500/5 border-red-500/20' :
        'bg-(--bg-surface) border-(--border-subtle)'
    }`}>
        <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-600 shrink-0">
                    <History size={14} />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-bold text-(--text-main) truncate">{item.first_name} {item.last_name}</p>
                    <p className="text-[10px] font-mono text-(--text-muted) uppercase tracking-tight mt-0.5">{item.employee_code}</p>
                </div>
            </div>
            {readOnly && (
                <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${
                    st === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                    st === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                    'bg-amber-500/10 text-amber-600 border-amber-500/20'
                }`}>
                    {st === 'APPROVED' && <CheckCircle size={11} />}
                    {st === 'REJECTED' && <XCircle size={11} />}
                    {st}
                </span>
            )}
        </div>

        <ArrearsRowMeta item={item} />

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div className="col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Days Being Caught Up</p>
                <p className="font-bold text-(--text-main) mt-0.5 font-mono text-[11px]">{fmtDate(item.segment_start)} – {fmtDate(item.segment_end)}</p>
            </div>
            <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Unpaid Hrs</p>
                <p className="font-bold text-(--text-main) mt-0.5">{parseFloat(item.approved_hours).toFixed(2)} hrs</p>
            </div>
            <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Pay Rate</p>
                <p className="font-bold text-(--text-main) mt-0.5">{fmt(item.pay_rate)}/hr</p>
                <p className="text-[9px] text-(--text-muted) font-bold mt-0.5">rate at the time</p>
            </div>
            {adjNet !== 0 && (
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Adjustment</p>
                    <p className={`font-bold mt-0.5 ${adjNet > 0 ? 'text-green-600' : 'text-red-500'}`}>{adjNet > 0 ? '+' : ''}{fmt(adjNet)}</p>
                </div>
            )}
            <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Amount</p>
                <p className="font-bold text-purple-600 mt-0.5">{fmt(item.total_amount)}</p>
            </div>
            <div className="col-span-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">Client</p>
                <p className="font-bold text-(--text-main) mt-0.5 truncate">{item.client_name}</p>
            </div>
        </div>

        {readOnly ? (
            comments && (
                <div className="flex items-start gap-2 bg-(--bg-app) border border-(--border-subtle) rounded-lg px-3 py-2">
                    <MessageSquare size={12} className="text-(--text-muted) shrink-0 mt-0.5" />
                    <p className="text-[10px] text-(--text-main) font-bold leading-relaxed">{comments}</p>
                </div>
            )
        ) : (
            <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted) flex items-center gap-1 mb-1">
                    <MessageSquare size={10} /> Comment
                </label>
                <textarea value={comments || ''} onChange={e => onCommentChange(e.target.value)} rows={2}
                    placeholder="Optional comment…"
                    className="w-full px-2.5 py-2 text-[10px] font-bold bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none resize-none" />
            </div>
        )}
        {!readOnly && (
            <div className="flex gap-2 pt-1">
                <button onClick={onApprove} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold border transition-all outline-none ${st === 'APPROVED' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-(--bg-surface) text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10'}`}>
                    <CheckCircle size={13} /> Approve
                </button>
                <button onClick={onReject} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-[10px] font-bold border transition-all outline-none ${st === 'REJECTED' ? 'bg-red-500 text-white border-red-500' : 'bg-(--bg-surface) text-red-500 border-red-500/30 hover:bg-red-500/10'}`}>
                    <XCircle size={13} /> Reject
                </button>
            </div>
        )}
    </div>
);

const ArrearsTable = ({ items, arrearsAdj, itemStates, readOnly, setStatus, setComment }) => (
    <div className="overflow-x-auto">
        <table className="w-full text-left table-auto min-w-[1050px]">
            <thead className="bg-purple-500/8 text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                <tr>
                    <th className="px-4 py-3 w-40">Employee</th>
                    <th className="px-4 py-3">Catch-up For</th>
                    <th className="px-4 py-3">Days Being Caught Up</th>
                    <th className="px-4 py-3 text-right">Unpaid Hrs</th>
                    <th className="px-4 py-3 text-right">Pay Rate</th>
                    <th className="px-4 py-3 text-right w-44">Adjustment</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 w-32">Client</th>
                    <th className="px-4 py-3">Comments</th>
                    <th className="px-4 py-3 text-center">Status</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-(--border-subtle)">
                {items.map(item => {
                    const state    = itemStates[item.id] || {};
                    const st       = state.item_status;
                    const comments = state.comments || '';
                    const adjNet   = arrearsAdj[item.id] || 0;
                    return (
                        <tr key={item.id} className={`transition-colors ${
                            st === 'APPROVED' ? 'bg-emerald-500/5' :
                            st === 'REJECTED' ? 'bg-red-500/5' : 'hover:bg-(--bg-app)'
                        }`}>
                            <td className="px-4 py-3 w-40">
                                <div className="font-bold text-(--text-main) text-sm break-words whitespace-normal max-w-[140px]">{item.first_name} {item.last_name}</div>
                                <div className="text-[10px] text-(--text-muted) font-mono uppercase tracking-tight mt-0.5">{item.employee_code}</div>
                            </td>
                            <td className="px-4 py-3"><ArrearsRowMeta item={item} /></td>
                            <td className="px-4 py-3">
                                <div className="font-mono text-xs font-bold text-(--text-main) whitespace-nowrap">
                                    {fmtDate(item.segment_start)}<span className="text-(--text-muted) mx-1">–</span>{fmtDate(item.segment_end)}
                                </div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-(--text-main) text-sm">{parseFloat(item.approved_hours).toFixed(2)} hrs</td>
                            <td className="px-4 py-3 text-right text-sm text-(--text-main) font-bold">
                                {fmt(item.pay_rate)}/hr
                                <div className="text-[9px] text-(--text-muted) font-bold uppercase tracking-widest mt-0.5">rate at the time</div>
                            </td>
                            <td className="px-4 py-3 text-right">
                                <InlineAdjust employeeId={item.employee_id} itemId={item.id} arrears adjNet={adjNet} />
                            </td>
                            <td className="px-4 py-3 text-right">
                                <span className="font-bold text-purple-600 text-sm">{fmt(item.total_amount)}</span>
                            </td>
                            <td className="px-4 py-3 text-sm text-(--text-main) w-32 max-w-[128px]">
                                <div className="font-bold truncate" title={item.client_name}>{item.client_name}</div>
                            </td>
                            <td className="px-4 py-3">
                                {readOnly ? (
                                    <span className="text-xs text-(--text-main) font-bold">{comments || '—'}</span>
                                ) : (
                                    <textarea value={comments} onChange={e => setComment(item.id, e.target.value)} rows={2}
                                        placeholder="Optional comment…"
                                        className="w-full min-w-[150px] px-2 py-1.5 text-[11px] font-bold bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none resize-none" />
                                )}
                            </td>
                            <td className="px-4 py-3 text-center">
                                {readOnly ? (
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${
                                        st === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                        st === 'REJECTED' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                        'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                    }`}>
                                        {st === 'APPROVED' && <CheckCircle size={11} />}
                                        {st === 'REJECTED' && <XCircle size={11} />}
                                        {st}
                                    </span>
                                ) : (
                                    <div className="flex items-center gap-1.5 justify-center">
                                        <button onClick={() => setStatus(item.id, 'APPROVED')}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all outline-none shadow-sm ${st === 'APPROVED' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-(--bg-surface) text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10'}`}>
                                            <CheckCircle size={12} /> Approve
                                        </button>
                                        <button onClick={() => setStatus(item.id, 'REJECTED')}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all outline-none shadow-sm ${st === 'REJECTED' ? 'bg-red-500 text-white border-red-500' : 'bg-(--bg-surface) text-red-500 border-red-500/30 hover:bg-red-500/10'}`}>
                                            <XCircle size={12} /> Reject
                                        </button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </div>
);

// ─── Main modal ─────────────────────────────────────────────────────────────────
const PayrollDetailModal = ({ run: initialRun, readOnly, onClose, onSubmitted }) => {
    const [currentRun, setCurrentRun] = useState(initialRun);
    const [itemStates, setItemStates] = useState(() => {
        const init = {};
        (initialRun.items || []).forEach(item => {
            init[item.id] = { item_status: item.item_status || 'PENDING', comments: item.comments || '' };
        });
        return init;
    });
    const [submitting, setSubmitting]   = useState(false);
    const [refreshing, setRefreshing]   = useState(false);
    const [refreshMsg, setRefreshMsg]   = useState('');
    const [error, setError]             = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);

    const [adjustments, setAdjustments]   = useState(initialRun.adjustments || []);



    // Split items by section. Catch-up rows come first because they are the
    // exception the reviewer needs to notice, and they are held out of the
    // regular LCA/non-LCA split entirely: they carry no lca_wage_per_period, so
    // including them would distort the buffer of the placement's regular rows.
    const arrearsItems = useMemo(() => (currentRun.items || []).filter(i => i.item_type === 'ARREARS'), [currentRun.items]);
    const regularItems = useMemo(() => (currentRun.items || []).filter(i => i.item_type !== 'ARREARS'), [currentRun.items]);
    // Three regular sections, and the split is by how the row settles, not by pay type:
    //   FIXED  — C2C, draws its flat figure out of the accrued balance sheet
    //   LCA    — W2, accrues (earned − LCA wage) onto the balance sheet as buffer
    //   HOURLY — pays exactly what was worked, no buffer either way
    const fixedItems   = useMemo(() => regularItems.filter(i =>  isFixedRow(i)), [regularItems]);
    const lcaItems     = useMemo(() => regularItems.filter(i => !isFixedRow(i) &&  hasBufferBasis(i)), [regularItems]);
    const nonLcaItems  = useMemo(() => regularItems.filter(i => !isFixedRow(i) && !hasBufferBasis(i)), [regularItems]);

    // Fixed rows are held out of computeItemBuffers for the same reason arrears are:
    // they carry no lca_wage_per_period and no earnings, so feeding them into the
    // buffer grouping would corrupt it.
    // Exactly one row per employee carries their run-wide adjustment.
    //
    // The rule mirrors submitPayrollRun so the screen names the same row the ledger
    // will: the backend groups approved rows by placement, walks those groups in
    // insertion order, and lets the FIRST group for an employee absorb the adjustment
    // (adjApplied); within a non-LCA group it lands on the last item of that group.
    // So: the employee's first placement, last row within it.
    //
    // Chosen across every regular row regardless of section, because an employee can
    // hold both a fixed-pay row and an hourly one — letting each section pick its own
    // carrier applied the same adjustment twice on screen while the backend posted it
    // once.
    const adjCarrier = useMemo(() => {
        const firstPlacementByEmp = {};
        regularItems.forEach(i => {
            if (!(i.employee_id in firstPlacementByEmp)) firstPlacementByEmp[i.employee_id] = i.placement_id;
        });
        const map = {};
        regularItems.forEach(i => {
            if (i.placement_id === firstPlacementByEmp[i.employee_id]) map[i.employee_id] = i.id;
        });
        return map;
    }, [regularItems]);

    const buffers    = computeItemBuffers(regularItems.filter(i => !isFixedRow(i)), adjustments, adjCarrier);
    const fixedRows  = computeFixedRows(fixedItems, adjustments, adjCarrier);
    const arrearsAdj = computeArrearsAdj(arrearsItems, regularItems, adjustments);

    // An employee with a regular row carries their adjustment there; only those with
    // catch-up rows alone fall through to one, and it is always their first.
    const arrearsCarrier = useMemo(() => {
        const withRegular = new Set(regularItems.map(i => i.employee_id));
        const claimed = new Set();
        const map = {};
        for (const i of arrearsItems) {
            if (withRegular.has(i.employee_id) || claimed.has(i.employee_id)) continue;
            claimed.add(i.employee_id);
            map[i.id] = true;
        }
        return map;
    }, [arrearsItems, regularItems]);

    const setStatus  = (id, status)  => { if (readOnly) return; setItemStates(prev => ({ ...prev, [id]: { ...prev[id], item_status: status } })); };
    const setComment = (id, value)   => { if (readOnly) return; setItemStates(prev => ({ ...prev, [id]: { ...prev[id], comments: value } })); };

    const handleRefresh = async () => {
        setRefreshing(true); setRefreshMsg(''); setError('');
        try {
            const res = await managementAPI.refreshPayrollRun(currentRun.id);
            const updatedRun = res.data;
            setCurrentRun(updatedRun);
            setItemStates(prev => {
                const next = {};
                (updatedRun.items || []).forEach(item => {
                    next[item.id] = { item_status: item.item_status || 'PENDING', comments: prev[item.id]?.comments || item.comments || '' };
                });
                return next;
            });
            const recomputed   = updatedRun.recomputed ?? 0;
            const arrearsAdded = updatedRun.arrears_added ?? 0;
            if (recomputed === 0) setRefreshMsg('Already up to date — no unpaid approved timesheets found.');
            else {
                const parts = [`${recomputed} pending item${recomputed !== 1 ? 's' : ''} recomputed`];
                if (arrearsAdded > 0) parts.push(`${arrearsAdded} catch-up row${arrearsAdded !== 1 ? 's' : ''}`);
                setRefreshMsg(parts.join(', ') + '.');
            }
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to refresh. Please try again.');
        } finally { setRefreshing(false); }
    };

    const handleSubmit = async () => {
        setError(''); setSubmitting(true);
        try {
            const items = Object.entries(itemStates).map(([id, s]) => ({ id, item_status: s.item_status, comments: s.comments?.trim() || null }));
            await managementAPI.submitPayrollRun(currentRun.id, { items });
            setConfirmOpen(false); onSubmitted();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to submit payroll. Please try again.');
        } finally { setSubmitting(false); }
    };

    // Called from a row's Adjustment cell. The reason lives in that row's Comments
    // box, so the comment (if typed) is sent as the description and a neutral
    // fallback is used otherwise — the API requires one.
    const handleAddAdjustment = async (employeeId, type, amount, itemId) => {
        const description = (itemStates[itemId]?.comments || '').trim() || 'Payroll adjustment';
        try {
            const res = await managementAPI.addPayrollAdjustment(currentRun.id, {
                employee_id: employeeId, type, amount, description,
            });
            const src = (currentRun.items || []).find(i => i.employee_id === employeeId);
            setAdjustments(prev => [...prev, {
                id: res.data.id, employee_id: employeeId,
                first_name: src?.first_name || '', last_name: src?.last_name || '',
                type, amount, description,
            }]);
            return true;
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to add adjustment.');
            return false;
        }
    };

    const handleDeleteAdjustment = async (adjId) => {
        try { await managementAPI.deletePayrollAdjustment(currentRun.id, adjId); setAdjustments(prev => prev.filter(a => a.id !== adjId)); } catch { }
    };

    const handleExport = () => {
        const headers = ['Section', 'Employee', 'Employee Code', 'Segment Period', 'Approved Hours', 'Pay Rate', 'Amount', 'Adjustment', 'LCA Wage', 'LCA / Period', 'Fixed Pay', 'Total Amount', 'Buffer', 'Client', 'Bill Rate', 'Comments', 'Status'];
        const keys    = ['section', 'emp_name', 'employee_code', 'segment_period', 'approved_hours', 'pay_rate_fmt', 'amount_fmt', 'adjustment_fmt', 'lca_wage_fmt', 'lca_per_period_fmt', 'fixed_pay_fmt', 'total_amount_fmt', 'buffer_fmt', 'client_name', 'bill_rate_fmt', 'comments', 'status'];
        const rows = (currentRun.items || []).map(item => {
            const st        = itemStates[item.id]?.item_status || item.item_status || 'PENDING';
            const isArrears = item.item_type === 'ARREARS';
            const isFixed   = isFixedRow(item) && !isArrears;
            const bufInfo   = buffers[item.id];
            const fixInfo   = fixedRows[item.id];
            const adjNet    = isArrears ? (arrearsAdj[item.id] || 0)
                            : isFixed   ? (fixInfo?.showAdj ? (fixInfo.adjNet || 0) : 0)
                            :             (bufInfo?.showAdj ? (bufInfo.adjNet || 0) : 0);
            // A catch-up row has no set payout of its own, so it is exported on
            // the plain hours x rate basis regardless of the placement's basis.
            const isLca     = hasBufferBasis(item) && !isArrears;
            const buffer  = isLca ? ((!bufInfo || !bufInfo.show) ? null : parseFloat(bufInfo.buffer).toFixed(2)) : null;
            const totalWAdj = (isLca || isFixed) ? null : (bufInfo ? parseFloat(bufInfo.totalWithAdj).toFixed(2) : parseFloat(item.total_amount).toFixed(2));
            const segPeriod = item.segment_start ? `${fmtDate(item.segment_start)} – ${fmtDate(item.segment_end)}` : `${fmtDate(currentRun.period_start)} – ${fmtDate(currentRun.period_end)}`;
            return {
                section:            isArrears ? `Catch-up — ${item.source_period_label || 'prior period'}`
                                  : isFixed   ? 'Fixed Pay (C2C)'
                                  : isLca     ? 'As per LCA Wage' : 'Not as per LCA Wage',
                emp_name:           `${item.first_name} ${item.last_name}`,
                employee_code:      item.employee_code,
                segment_period:     segPeriod,
                approved_hours:     parseFloat(item.approved_hours).toFixed(2),
                // A fixed-pay row has no pay rate and no hours x rate amount. Its
                // 'Amount' column is the balance-sheet figure it draws against.
                pay_rate_fmt:       fmt(item.pay_rate),
                amount_fmt:         isFixed ? fmt(fixInfo?.balance ?? 0) : fmt(item.total_amount),
                adjustment_fmt:     adjNet !== 0 ? `${adjNet > 0 ? '+' : ''}$${Math.abs(adjNet).toFixed(2)}` : '—',
                lca_wage_fmt:       isLca && item.lca_wage ? fmt(item.lca_wage) : '—',
                lca_per_period_fmt: isLca && item.lca_wage_per_period ? fmt(item.lca_wage_per_period) : '—',
                fixed_pay_fmt:      isFixed ? fmt(fixInfo?.fixedPay ?? item.fixed_pay_per_period) : '—',
                total_amount_fmt:   isFixed ? ((!fixInfo || !fixInfo.show) ? '(part of combined)' : fmt(fixInfo.remaining))
                                  : isLca   ? fmt(item.total_amount) : '—',
                buffer_fmt:         isFixed ? (fixInfo?.show ? `$${fixInfo.drawn.toFixed(2)} drawn` : '—')
                                  : isLca   ? (buffer != null ? `$${buffer}` : '(part of combined)')
                                  :           `$${totalWAdj}`,
                client_name:        item.client_name,
                bill_rate_fmt:      fmt(item.bill_rate),
                comments:           item.comments || '',
                status:             st,
            };
        });
        exportToExcel(rows, headers, keys, `payroll_${currentRun.period_label}_${currentRun.year}`);
    };

    const pendingCount  = Object.values(itemStates).filter(s => s.item_status === 'PENDING').length;
    const approvedCount = Object.values(itemStates).filter(s => s.item_status === 'APPROVED').length;
    const rejectedCount = Object.values(itemStates).filter(s => s.item_status === 'REJECTED').length;
    const run = currentRun;

    const exportBtn = (
        <button onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-xl hover:bg-emerald-500/20 transition-all outline-none shadow-sm shrink-0">
            <Download size={13} /><span className="hidden sm:inline">Export</span>
        </button>
    );

    const footer = readOnly ? (
        <div className="flex flex-wrap items-center justify-between w-full gap-2">
            <div className="flex items-center gap-2 text-xs text-(--text-muted) font-bold uppercase tracking-widest">
                <Lock size={14} className="text-(--brand-primary) shrink-0" />
                <span className="hidden sm:inline">Submitted — locked.</span>
                <span className="sm:hidden text-[10px]">Locked</span>
            </div>
            {exportBtn}
        </div>
    ) : (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-widest">
                <span className="text-emerald-600">{approvedCount} Approved</span>
                <span className="text-red-500">{rejectedCount} Rejected</span>
                {pendingCount > 0 && <span className="text-amber-500">{pendingCount} Pending</span>}
                {refreshMsg && <span className="text-blue-500 normal-case font-bold text-[10px] tracking-normal">{refreshMsg}</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end w-full sm:w-auto">
                <button onClick={handleRefresh} disabled={refreshing || submitting} title="Refresh"
                    className="flex items-center gap-1.5 px-3 py-2 sm:py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest bg-blue-500/10 text-blue-600 border border-blue-500/20 rounded-xl hover:bg-blue-500/20 transition-all outline-none shadow-sm disabled:opacity-50 shrink-0">
                    <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                    <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                </button>
                {exportBtn}
                <button onClick={onClose} disabled={submitting || refreshing}
                    className="px-4 sm:px-5 py-2 sm:py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-(--text-main) bg-(--bg-surface) border border-(--border-subtle) rounded-xl hover:opacity-80 outline-none transition-all disabled:opacity-50 shrink-0">
                    Cancel
                </button>
                <button onClick={() => { setError(''); setRefreshMsg(''); setConfirmOpen(true); }}
                    disabled={submitting || refreshing || run.items?.length === 0}
                    className="flex items-center gap-1.5 px-4 sm:px-5 py-2 sm:py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-(--brand-primary-text) bg-(--brand-primary) rounded-xl hover:opacity-90 outline-none transition-all disabled:opacity-50 shadow-sm active:scale-95 shrink-0">
                    {submitting ? <><Loader2 size={13} className="animate-spin" /> Submitting...</> : <><CheckCircle size={13} /> Submit Payroll</>}
                </button>
            </div>
        </div>
    );

    const headerRight = readOnly
        ? <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest hidden sm:block">Submitted — Read Only</span>
        : run.status === 'DRAFT'
            ? (
                <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest hidden lg:block">Draft — Review &amp; Submit</span>
            ) : null;

    const adjustCtx = {
        adjustments,
        arrearsCarrier,
        readOnly,
        add:    handleAddAdjustment,
        remove: handleDeleteAdjustment,
    };

    return (
        <AdjustCtx.Provider value={adjustCtx}>
            <BaseModal isOpen onClose={onClose} icon={<Receipt size={16} />}
                title={`Payroll — ${run.period_label} ${run.year}`}
                subtitle={`${fmtDate(run.period_start)} to ${fmtDate(run.period_end)}`}
                headerRight={headerRight} footer={footer} noPadding>

                {error && (
                    <div className="mx-4 sm:mx-6 mt-4 p-3 bg-red-500/10 text-red-500 text-xs rounded-xl border border-red-500/20 font-bold flex items-center gap-2">
                        <AlertTriangle size={14} /> {error}
                    </div>
                )}

                {(arrearsItems.length > 0 || run.arrears_summary?.unpriced_hours > 0 || (run.pending_timesheets?.timesheet_count > 0 && !readOnly)) && (
                    <div className="mx-4 sm:mx-6 mt-4 space-y-2">
                        {arrearsItems.length > 0 && (
                            <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-start gap-2">
                                <History size={14} className="text-purple-600 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-(--text-main) font-bold leading-relaxed">
                                    This run includes {arrearsItems.length} catch-up row{arrearsItems.length !== 1 ? 's' : ''}
                                    {run.arrears_summary?.hours ? ` (${run.arrears_summary.hours} hrs, ${fmt(run.arrears_summary.amount)})` : ''}
                                    {run.arrears_summary?.periods?.length ? ` from ${run.arrears_summary.periods.join(', ')}` : ''}.
                                    <span className="font-normal text-(--text-muted) block mt-0.5">
                                        These are approved hours that earlier payroll runs never paid. Approve or reject each one individually.
                                    </span>
                                </p>
                            </div>
                        )}
                        {run.arrears_summary?.unpriced_hours > 0 && (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
                                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-(--text-main) font-bold leading-relaxed">
                                    {run.arrears_summary.unpriced_hours} unpaid approved hours could not be included — their placement has no pay rate on file.
                                    <span className="font-normal text-(--text-muted) block mt-0.5">
                                        Payroll cannot price them. Add a pay rate to the placement, then Refresh to pull them in. See the Reconcile page for the full list.
                                    </span>
                                </p>
                            </div>
                        )}
                        {run.pending_timesheets?.timesheet_count > 0 && !readOnly && (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2">
                                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-[11px] text-(--text-main) font-bold leading-relaxed">
                                    {run.pending_timesheets.timesheet_count} timesheet{run.pending_timesheets.timesheet_count !== 1 ? 's' : ''} overlapping this period
                                    {run.pending_timesheets.employee_count ? ` (${run.pending_timesheets.employee_count} employee${run.pending_timesheets.employee_count !== 1 ? 's' : ''})` : ''} are not approved yet.
                                    <span className="font-normal text-(--text-muted) block mt-0.5">
                                        Submitting now is fine — anything approved later will appear as a catch-up row in the next run.
                                    </span>
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {run.items?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-(--text-muted) font-bold uppercase tracking-widest text-xs gap-2 px-4 text-center">
                        <Receipt size={32} className="opacity-30" />
                        No W2 employees with approved timesheets for this period.
                    </div>
                ) : (
                    <>
                        {/* ── Mobile cards ─────────────────────────────── */}
                        <div className="lg:hidden px-2 py-2 space-y-2">
                            {arrearsItems.length > 0 && (
                                <div className="rounded-xl border border-purple-500/40 overflow-hidden shadow-sm">
                                    <div className="flex items-center gap-2 px-3 py-2 border-b border-purple-500/25 bg-purple-500/10">
                                        <div className="w-5 h-5 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                                            <History size={10} className="text-purple-600" />
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-purple-600">Prior Period Catch-up</span>
                                        <span className="ml-auto text-[10px] font-bold bg-purple-500/10 text-purple-600 px-2 py-0.5 rounded-full border border-purple-500/20 shrink-0">{arrearsItems.length}</span>
                                    </div>
                                    <div className="p-2 space-y-2">
                                        {arrearsItems.map(item => (
                                            <ArrearsItemCard key={item.id} item={item} adjNet={arrearsAdj[item.id] || 0}
                                                st={itemStates[item.id]?.item_status || 'PENDING'}
                                                comments={itemStates[item.id]?.comments || ''}
                                                readOnly={readOnly}
                                                onApprove={() => setStatus(item.id, 'APPROVED')}
                                                onReject={() => setStatus(item.id, 'REJECTED')}
                                                onCommentChange={v => setComment(item.id, v)} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {fixedItems.length > 0 && (
                                <div className="rounded-xl border border-amber-500/25 overflow-hidden shadow-sm">
                                    <div className="flex items-center gap-2 px-3 py-2 border-b border-amber-500/20 bg-amber-500/5">
                                        <div className="w-5 h-5 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                                            <Wallet size={10} className="text-amber-600" />
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Fixed Pay (C2C)</span>
                                        <span className="ml-auto text-[10px] font-bold bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full border border-amber-500/20 shrink-0">{fixedItems.length}</span>
                                    </div>
                                    <div className="p-2 space-y-2">
                                        {fixedItems.map(item => (
                                            <FixedPayItemCard key={item.id} item={item} info={fixedRows[item.id]}
                                                st={itemStates[item.id]?.item_status || 'PENDING'}
                                                comments={itemStates[item.id]?.comments || ''}
                                                readOnly={readOnly}
                                                onApprove={() => setStatus(item.id, 'APPROVED')}
                                                onReject={() => setStatus(item.id, 'REJECTED')}
                                                onCommentChange={v => setComment(item.id, v)} />
                                        ))}
                                    </div>
                                </div>
                            )}
                            {lcaItems.length > 0 && (
                                <div className="rounded-xl border border-purple-500/25 overflow-hidden shadow-sm">
                                    <div className="flex items-center gap-2 px-3 py-2 border-b border-purple-500/20 bg-purple-500/5">
                                        <div className="w-5 h-5 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                                            <ShieldCheck size={10} className="text-purple-600" />
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-purple-600">As per LCA Wage</span>
                                        <span className="ml-auto text-[10px] font-bold bg-purple-500/10 text-purple-600 px-2 py-0.5 rounded-full border border-purple-500/20 shrink-0">{lcaItems.length}</span>
                                    </div>
                                    <div className="p-2 space-y-2">
                                    {lcaItems.map(item => (
                                        <LcaItemCard key={item.id} item={item} bufInfo={buffers[item.id]}
                                            st={itemStates[item.id]?.item_status || 'PENDING'}
                                            comments={itemStates[item.id]?.comments || ''}
                                            readOnly={readOnly}
                                            onApprove={() => setStatus(item.id, 'APPROVED')}
                                            onReject={() => setStatus(item.id, 'REJECTED')}
                                            onCommentChange={v => setComment(item.id, v)} />
                                    ))}
                                    </div>
                                </div>
                            )}
                            {nonLcaItems.length > 0 && (
                                <div className="rounded-xl border border-blue-500/25 overflow-hidden shadow-sm">
                                    <div className="flex items-center gap-2 px-3 py-2 border-b border-blue-500/20 bg-blue-500/5">
                                        <div className="w-5 h-5 rounded-lg bg-blue-500/15 flex items-center justify-center shrink-0">
                                            <Users size={10} className="text-blue-600" />
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Not as per LCA Wage</span>
                                        <span className="ml-auto text-[10px] font-bold bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full border border-blue-500/20 shrink-0">{nonLcaItems.length}</span>
                                    </div>
                                    <div className="p-2 space-y-2">
                                        {nonLcaItems.map(item => (
                                            <NonLcaItemCard key={item.id} item={item} bufInfo={buffers[item.id]}
                                                st={itemStates[item.id]?.item_status || 'PENDING'}
                                                comments={itemStates[item.id]?.comments || ''}
                                                readOnly={readOnly}
                                                onApprove={() => setStatus(item.id, 'APPROVED')}
                                                onReject={() => setStatus(item.id, 'REJECTED')}
                                                onCommentChange={v => setComment(item.id, v)} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Desktop sections ─────────────────────────── */}
                        <div className="hidden lg:block px-3 py-2 space-y-2">
                            {arrearsItems.length > 0 && (
                                <div className="rounded-2xl border border-purple-500/40 overflow-hidden shadow-sm">
                                    <SectionHeading
                                        title="Prior Period Catch-up"
                                        subtitle="approved after that period's payroll closed"
                                        count={arrearsItems.length}
                                        accent="bg-purple-500/10"
                                        iconBg="bg-purple-500/20"
                                        iconColor="text-purple-600"
                                        icon={History}
                                    />
                                    <ArrearsTable
                                        items={arrearsItems}
                                        arrearsAdj={arrearsAdj}
                                        itemStates={itemStates}
                                        readOnly={readOnly}
                                        setStatus={setStatus}
                                        setComment={setComment}
                                    />
                                </div>
                            )}
                            {fixedItems.length > 0 && (
                                <div className="rounded-2xl border border-amber-500/40 overflow-hidden shadow-sm">
                                    <SectionHeading
                                        title="Fixed Pay (C2C)"
                                        subtitle="total = balance − fixed pay ± adjustment"
                                        count={fixedItems.length}
                                        accent="bg-amber-500/10"
                                        iconBg="bg-amber-500/20"
                                        iconColor="text-amber-600"
                                        icon={Wallet}
                                    />
                                    <FixedPayTable
                                        items={fixedItems}
                                        fixedRows={fixedRows}
                                        itemStates={itemStates}
                                        readOnly={readOnly}
                                        setStatus={setStatus}
                                        setComment={setComment}
                                    />
                                </div>
                            )}
                            {lcaItems.length > 0 && (
                                <div className="rounded-2xl border border-purple-500/25 overflow-hidden shadow-sm">
                                    <SectionHeading
                                        title="As per LCA Wage"
                                        subtitle="buffer = earnings − LCA/period"
                                        count={lcaItems.length}
                                        accent="bg-purple-500/5"
                                        iconBg="bg-purple-500/15"
                                        iconColor="text-purple-600"
                                        icon={ShieldCheck}
                                    />
                                    <LcaTable
                                        items={lcaItems}
                                        buffers={buffers}
                                        itemStates={itemStates}
                                        readOnly={readOnly}
                                        setStatus={setStatus}
                                        setComment={setComment}
                                    />
                                </div>
                            )}
                            {nonLcaItems.length > 0 && (
                                <div className="rounded-2xl border border-blue-500/25 overflow-hidden shadow-sm">
                                    <SectionHeading
                                        title="Not as per LCA Wage"
                                        subtitle="total = approved hrs × pay rate + adjustments"
                                        count={nonLcaItems.length}
                                        accent="bg-blue-500/5"
                                        iconBg="bg-blue-500/15"
                                        iconColor="text-blue-600"
                                        icon={Users}
                                    />
                                    <NonLcaTable
                                        items={nonLcaItems}
                                        buffers={buffers}
                                        itemStates={itemStates}
                                        readOnly={readOnly}
                                        setStatus={setStatus}
                                        setComment={setComment}
                                    />
                                </div>
                            )}
                        </div>
                    </>
                )}
            </BaseModal>

            {/* Confirm submit dialog */}
            {confirmOpen && createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-(--bg-surface) w-full max-w-sm rounded-2xl shadow-2xl border border-(--border-subtle) p-5 sm:p-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="h-9 w-9 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-600 shrink-0"><AlertTriangle size={18} /></div>
                            <div>
                                <h3 className="font-bold text-(--text-main) uppercase tracking-tight">Confirm Submission</h3>
                                <p className="text-xs text-(--text-muted) mt-1">
                                    Once submitted, this payroll run is <strong>locked</strong> and cannot be modified. Approved LCA employees will be reflected in the Balance Sheet immediately.
                                    {adjustments.length > 0 && (
                                        <span className="block mt-1 text-amber-600 font-bold">{adjustments.length} adjustment{adjustments.length !== 1 ? 's' : ''} will be included in posted amounts.</span>
                                    )}
                                    {arrearsItems.length > 0 && (
                                        <span className="block mt-1 text-purple-600 font-bold">
                                            {arrearsItems.length} catch-up row{arrearsItems.length !== 1 ? 's' : ''} from earlier periods will be settled with this run.
                                        </span>
                                    )}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mb-5 text-center">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                                <div className="text-lg font-bold text-emerald-600">{approvedCount}</div>
                                <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Approved</div>
                            </div>
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                <div className="text-lg font-bold text-red-500">{rejectedCount}</div>
                                <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Rejected</div>
                            </div>
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                                <div className="text-lg font-bold text-amber-500">{pendingCount}</div>
                                <div className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Pending</div>
                            </div>
                        </div>
                        {error && <div className="mb-4 p-3 bg-red-500/10 text-red-500 text-xs rounded-xl border border-red-500/20 font-bold">{error}</div>}
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmOpen(false)} disabled={submitting}
                                className="flex-1 py-2.5 text-xs font-bold uppercase tracking-widest text-(--text-main) bg-(--bg-app) border border-(--border-subtle) rounded-xl hover:opacity-80 outline-none transition-all disabled:opacity-50">
                                Go Back
                            </button>
                            <button onClick={handleSubmit} disabled={submitting}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-widest text-(--brand-primary-text) bg-(--brand-primary) rounded-xl hover:opacity-90 outline-none transition-all disabled:opacity-50 shadow-sm">
                                {submitting ? <><Loader2 size={13} className="animate-spin" /> Submitting...</> : 'Confirm & Submit'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </AdjustCtx.Provider>
    );
};

export default PayrollDetailModal;
