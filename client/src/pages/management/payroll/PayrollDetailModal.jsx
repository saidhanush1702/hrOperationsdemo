import { useState, useMemo, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import {
    Banknote, CheckCircle, XCircle, Loader2, Lock, AlertTriangle, Download, MessageSquare, RefreshCw, Plus,
    Trash2, X as XIcon, ShieldCheck, Users, History, Wallet, Clock, CalendarDays, Info,
} from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import AmountInput from '../../../components/ui/AmountInput';
import { fmtDate } from '../../../utils/dateUtils';
import { exportToExcel } from '../../../utils/exportToExcel';
import { DetailLayout, SectionTitle, Btn, Chip, Notice, EmptyState, Avatar, cx } from '../../../components/ui/kit';

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
// picks to absorb the adjustment). The handlers travel by context so every pay
// line can share a single adjustment cell.
//
// The reason for an adjustment goes in that row's comment box, so no separate
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

    // An adjustment belongs to the EMPLOYEE for the whole run, not to a row. It can
    // be ADDED from any of their rows, but it is SHOWN on exactly one — the carrier,
    // which matches submitPayrollRun's own choice — so it never reads as several.
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
        <button
            type="button"
            onClick={() => { setOpen(true); setErr(''); }}
            title="Add an adjustment for this consultant. It applies once for the whole run."
            className="inline-flex items-center gap-1 rounded-full border border-(--border-subtle) px-2.5 py-1 text-[11px] font-semibold text-(--text-muted) outline-none transition-colors hover:border-(--brand-primary)/40 hover:text-(--brand-primary)"
        >
            <Plus size={11} /> Adjust
        </button>
    );

    const editor = editable && open && (
        <div className="flex w-full max-w-[230px] flex-col gap-2 rounded-[14px] border border-(--brand-primary)/30 bg-(--bg-surface) p-2">
            <div className="grid grid-cols-2 gap-1">
                <button
                    type="button"
                    onClick={() => setType('addition')}
                    className={cx('rounded-full px-2 py-1 text-[11px] font-semibold outline-none transition-colors', type === 'addition' ? 'bg-emerald-500 text-white' : 'text-emerald-500 hover:bg-emerald-500/10')}
                >
                    + Addition
                </button>
                <button
                    type="button"
                    onClick={() => setType('deduction')}
                    className={cx('rounded-full px-2 py-1 text-[11px] font-semibold outline-none transition-colors', type === 'deduction' ? 'bg-rose-500 text-white' : 'text-rose-500 hover:bg-rose-500/10')}
                >
                    − Deduction
                </button>
            </div>
            <AmountInput value={amount} onChange={setAmount} autoFocus className="nx-input h-8 text-right" />
            {err && <span className="text-[11px] font-medium text-rose-500">{err}</span>}
            <div className="flex gap-1">
                <Btn size="sm" variant="primary" icon={busy ? Loader2 : CheckCircle} onClick={submit} disabled={busy} className="flex-1">Save</Btn>
                <Btn size="sm" variant="subtle" icon={XIcon} onClick={() => { setOpen(false); setAmount(''); setErr(''); }} />
            </div>
        </div>
    );

    // ── A row that is not the carrier: add from here, but the figure is printed
    //    where it is actually applied so nothing double-reads.
    if (!carries) {
        return (
            <div className="flex flex-col items-start gap-1.5">
                {net !== 0 ? (
                    <span
                        className="text-xs text-(--text-muted)"
                        title={`This consultant has a net ${net > 0 ? 'addition' : 'deduction'} of ${fmt(Math.abs(net))} for this run. It is applied once, on their first engagement's line.`}
                    >
                        {fmt(net)} · applied on another line
                    </span>
                ) : !open && <span className="text-sm text-(--text-muted)">—</span>}
                {addButton}
                {editor}
            </div>
        );
    }

    return (
        <div className="flex flex-col items-start gap-1.5">
            {adjNet !== 0 && (
                <span className={cx('text-sm font-semibold', adjNet > 0 ? 'text-emerald-500' : 'text-rose-500')}>
                    {adjNet > 0 ? '+' : ''}{fmt(adjNet)} <span className="text-[11px] font-medium">{adjNet > 0 ? 'addition' : 'deduction'}</span>
                </span>
            )}

            {/* Each entry removable — the net above can be made of several. */}
            {editable && mine.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {mine.map(a => (
                        <span key={a.id} className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', a.type === 'addition' ? 'border-emerald-500/25 text-emerald-500' : 'border-rose-500/25 text-rose-500')}>
                            {a.type === 'addition' ? '+' : '−'}{fmt(a.amount)}
                            <button type="button" onClick={() => ctx.remove(a.id)} title="Remove this adjustment" className="outline-none hover:opacity-70">
                                <Trash2 size={11} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {adjNet === 0 && mine.length === 0 && !open && <span className="text-sm text-(--text-muted)">—</span>}

            {addButton}
            {editor}
        </div>
    );
};

// ─── Pay line (one card per run item, every section and every width) ─────────
const DECISION = {
    APPROVED: { tone: 'green', label: 'Approved', icon: CheckCircle },
    REJECTED: { tone: 'rose',  label: 'Rejected', icon: XCircle },
    PENDING:  { tone: 'amber', label: 'Pending',  icon: Clock },
};

const Metric = ({ label, value, sub, tone }) => (
    <div className="min-w-[118px] flex-1 rounded-[14px] bg-(--bg-app)/60 px-3 py-2">
        <p className="text-[11px] text-(--text-muted)">{label}</p>
        <p className={cx('text-sm font-semibold', tone || 'text-(--text-main)')}>{value}</p>
        {sub && <p className="text-[11px] text-(--text-muted)">{sub}</p>}
    </div>
);

const PayLine = ({ item, st, comments, readOnly, onApprove, onReject, onCommentChange, accent, badges, metrics, adjust, showBillRate = true }) => {
    const d = DECISION[st] || DECISION.PENDING;
    return (
        <article className={cx(
            'relative overflow-hidden rounded-[22px] border bg-(--bg-surface) p-4 pl-5 transition-colors sm:p-5 sm:pl-6',
            st === 'APPROVED' ? 'border-emerald-500/40' : st === 'REJECTED' ? 'border-rose-500/40' : 'border-(--border-subtle)',
        )}>
            <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />

            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={`${item.first_name} ${item.last_name}`} size={38} />
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-(--text-main)">{item.first_name} {item.last_name}</p>
                        <p className="font-mono text-[11px] text-(--text-muted)">{item.employee_code}</p>
                    </div>
                </div>
                {readOnly ? (
                    <Chip tone={d.tone} icon={d.icon}>{d.label}</Chip>
                ) : (
                    <div className="inline-flex rounded-full border border-(--border-subtle) p-1">
                        <button
                            type="button"
                            onClick={onApprove}
                            className={cx('flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold outline-none transition-colors', st === 'APPROVED' ? 'bg-emerald-500 text-white' : 'text-emerald-500 hover:bg-emerald-500/10')}
                        >
                            <CheckCircle size={13} /> Approve
                        </button>
                        <button
                            type="button"
                            onClick={onReject}
                            className={cx('flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold outline-none transition-colors', st === 'REJECTED' ? 'bg-rose-500 text-white' : 'text-rose-500 hover:bg-rose-500/10')}
                        >
                            <XCircle size={13} /> Reject
                        </button>
                    </div>
                )}
            </div>

            {badges && <div className="mt-3 flex flex-wrap items-center gap-2">{badges}</div>}

            <div className="mt-3 flex flex-wrap gap-2">{metrics}</div>

            <div className="mt-4 grid gap-4 border-t border-(--border-subtle) pt-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
                <div className="min-w-0">
                    <p className="text-[11px] text-(--text-muted)">Partner</p>
                    <p className="truncate text-sm font-medium text-(--text-main)" title={item.client_name}>{item.client_name}</p>
                    {showBillRate && <p className="text-[11px] text-(--text-muted)">{fmt(item.bill_rate)}/hr bill</p>}
                </div>
                <div className="min-w-0">
                    <p className="mb-1 text-[11px] text-(--text-muted)">Adjustment</p>
                    {adjust}
                </div>
                <div className="min-w-0">
                    <p className="mb-1 flex items-center gap-1 text-[11px] text-(--text-muted)"><MessageSquare size={11} /> Comment</p>
                    {readOnly ? (
                        <p className="break-words text-sm text-(--text-main)">{comments || '—'}</p>
                    ) : (
                        <textarea
                            value={comments || ''}
                            onChange={e => onCommentChange(e.target.value)}
                            rows={2}
                            placeholder="Optional…"
                            className="nx-input resize-none text-sm"
                        />
                    )}
                </div>
            </div>
        </article>
    );
};

const SegmentChip = ({ item }) => item.segment_start ? (
    <Chip tone="slate" icon={CalendarDays}>{fmtDate(item.segment_start)} – {fmtDate(item.segment_end)}</Chip>
) : null;

// W2 row paid a set LCA wage; the difference accrues as buffer.
const LcaLine = ({ item, bufInfo, ...rest }) => {
    let bufferMetric;
    if (!bufInfo || !bufInfo.show) {
        bufferMetric = <Metric label="Buffer" value="—" sub="Part of combined" />;
    } else {
        const { buffer, isMulti, segments } = bufInfo;
        const isPositive = !item.lca_wage_per_period || buffer > 0;
        bufferMetric = (
            <Metric
                label="Buffer"
                value={fmt(buffer)}
                tone={isPositive ? 'text-emerald-500' : 'text-rose-500'}
                sub={`${isPositive ? 'Surplus' : 'No surplus'}${isMulti && segments ? ` · ${segments} segments combined` : ''}`}
            />
        );
    }
    return (
        <PayLine
            item={item}
            {...rest}
            accent="linear-gradient(180deg,#d946ef,#8b5cf6)"
            badges={<SegmentChip item={item} />}
            metrics={
                <>
                    <Metric label="Approved hrs" value={`${parseFloat(item.approved_hours).toFixed(2)} hrs`} />
                    <Metric label="Pay rate" value={`${fmt(item.pay_rate)}/hr`} />
                    <Metric label="Total amount" value={fmt(item.total_amount)} tone="text-(--brand-primary)" />
                    <Metric label="LCA / period" value={item.lca_wage_per_period != null ? fmt(item.lca_wage_per_period) : '—'} tone="text-fuchsia-500" />
                    {bufferMetric}
                </>
            }
            adjust={<InlineAdjust employeeId={item.employee_id} itemId={item.id} show={!!bufInfo?.showAdj} adjNet={bufInfo?.adjNet || 0} />}
        />
    );
};

// C2C row drawing a fixed figure out of the accrued balance.
const FixedLine = ({ item, info, ...rest }) => {
    let totalMetric;
    if (!info || !info.show) {
        totalMetric = <Metric label="Total amount" value="—" sub="Part of combined" />;
    } else {
        const positive = info.remaining >= 0;
        totalMetric = (
            <Metric
                label="Total amount"
                value={fmt(info.remaining)}
                tone={positive ? 'text-emerald-500' : 'text-rose-500'}
                sub={`${positive ? 'Balance left' : 'Overdrawn'} · drawn ${fmt(info.drawn)}${info.isMulti ? ` · ${info.placements} engagements` : ''}`}
            />
        );
    }
    return (
        <PayLine
            item={item}
            {...rest}
            accent="linear-gradient(180deg,#f59e0b,#f97316)"
            badges={
                <>
                    <SegmentChip item={item} />
                    <span className="text-[11px] text-(--text-muted)">
                        {parseFloat(item.approved_hours).toFixed(2)} hrs approved
                        {parseFloat(item.pay_rate) > 0 && (
                            <span title="The rate this engagement's invoices accrue to the ledger at. It does not decide this payout — the fixed figure does.">
                                {' · '}accrues @ {fmt(item.pay_rate)}/hr
                            </span>
                        )}
                    </span>
                </>
            }
            metrics={
                <>
                    <Metric label="Ledger balance" value={fmt(info?.balance ?? 0)} tone="text-(--brand-primary)" sub="Net balance" />
                    <Metric label="Fixed pay" value={fmt(info?.fixedPay ?? item.fixed_pay_per_period)} tone="text-amber-500" sub="Per period" />
                    {totalMetric}
                </>
            }
            adjust={<InlineAdjust employeeId={item.employee_id} itemId={item.id} show={!!info?.showAdj} adjNet={info?.adjNet || 0} />}
        />
    );
};

// Row paid exactly the hours worked.
const HourlyLine = ({ item, bufInfo, ...rest }) => {
    const adjNet       = bufInfo?.adjNet || 0;
    const totalWithAdj = bufInfo ? bufInfo.totalWithAdj : parseFloat(item.total_amount);
    return (
        <PayLine
            item={item}
            {...rest}
            accent="linear-gradient(180deg,#0ea5e9,#22d3ee)"
            badges={<SegmentChip item={item} />}
            metrics={
                <>
                    <Metric label="Approved hrs" value={`${parseFloat(item.approved_hours).toFixed(2)} hrs`} />
                    <Metric label="Pay rate" value={`${fmt(item.pay_rate)}/hr`} />
                    <Metric label="Amount" value={fmt(item.total_amount)} tone="text-(--brand-primary)" sub="hrs × rate" />
                    <Metric label="Total amount" value={fmt(totalWithAdj)} tone="text-emerald-500" sub={bufInfo?.showAdj && adjNet !== 0 ? 'incl. adjustment' : undefined} />
                </>
            }
            adjust={<InlineAdjust employeeId={item.employee_id} itemId={item.id} show={!!bufInfo?.showAdj} adjNet={adjNet} />}
        />
    );
};

// Hours from an earlier period approved too late for that period's run.
const ArrearsLine = ({ item, adjNet, ...rest }) => (
    <PayLine
        item={item}
        {...rest}
        showBillRate={false}
        accent="linear-gradient(180deg,#8b5cf6,#6366f1)"
        badges={
            <>
                <Chip tone="fuchsia" icon={History}>{item.source_period_label || 'Prior period'}</Chip>
                {hasBufferBasis(item) && (
                    <span title="That period was paid a set amount and is already settled, so this amount posts entirely to the buffer.">
                        <Chip tone="slate">To buffer</Chip>
                    </span>
                )}
                <Chip tone="slate" icon={CalendarDays}>{fmtDate(item.segment_start)} – {fmtDate(item.segment_end)}</Chip>
            </>
        }
        metrics={
            <>
                <Metric label="Unpaid hrs" value={`${parseFloat(item.approved_hours).toFixed(2)} hrs`} />
                <Metric label="Pay rate" value={`${fmt(item.pay_rate)}/hr`} sub="Rate at the time" />
                <Metric label="Amount" value={fmt(item.total_amount)} tone="text-violet-500" />
            </>
        }
        adjust={<InlineAdjust employeeId={item.employee_id} itemId={item.id} arrears adjNet={adjNet} />}
    />
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
    const [groupKey, setGroupKey]       = useState(null);

    const [adjustments, setAdjustments]   = useState(initialRun.adjustments || []);

    // Split items by section. Catch-up rows are held out of the regular
    // LCA/non-LCA split entirely: they carry no lca_wage_per_period, so
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
            if (recomputed === 0) setRefreshMsg('Already up to date — no unpaid approved time logs found.');
            else {
                const parts = [`${recomputed} pending line${recomputed !== 1 ? 's' : ''} recomputed`];
                if (arrearsAdded > 0) parts.push(`${arrearsAdded} catch-up line${arrearsAdded !== 1 ? 's' : ''}`);
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
            setError(err.response?.data?.error || 'Failed to submit the pay run. Please try again.');
        } finally { setSubmitting(false); }
    };

    // Called from a line's adjustment cell. The reason lives in that line's comment
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
        try { await managementAPI.deletePayrollAdjustment(currentRun.id, adjId); setAdjustments(prev => prev.filter(a => a.id !== adjId)); } catch { /* ignore */ }
    };

    const handleExport = () => {
        const headers = ['Section', 'Consultant', 'Consultant Code', 'Segment Period', 'Approved Hours', 'Pay Rate', 'Amount', 'Adjustment', 'LCA Wage', 'LCA / Period', 'Fixed Pay', 'Total Amount', 'Buffer', 'Partner', 'Bill Rate', 'Comments', 'Status'];
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
                                  : isFixed   ? 'Fixed Draw (C2C)'
                                  : isLca     ? 'LCA Wage' : 'Hourly Pay',
                emp_name:           `${item.first_name} ${item.last_name}`,
                employee_code:      item.employee_code,
                segment_period:     segPeriod,
                approved_hours:     parseFloat(item.approved_hours).toFixed(2),
                // A fixed-pay row has no pay rate and no hours x rate amount. Its
                // 'Amount' column is the ledger figure it draws against.
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
        exportToExcel(rows, headers, keys, `pay_run_${currentRun.period_label}_${currentRun.year}`);
    };

    const pendingCount  = Object.values(itemStates).filter(s => s.item_status === 'PENDING').length;
    const approvedCount = Object.values(itemStates).filter(s => s.item_status === 'APPROVED').length;
    const rejectedCount = Object.values(itemStates).filter(s => s.item_status === 'REJECTED').length;
    const totalCount    = approvedCount + rejectedCount + pendingCount;
    const run = currentRun;

    const groups = [
        { key: 'arrears', label: 'Catch-up',   icon: History,     items: arrearsItems, subtitle: "Approved after that period's pay run closed" },
        { key: 'fixed',   label: 'Fixed draw', icon: Wallet,      items: fixedItems,   subtitle: 'C2C · total = balance − fixed pay ± adjustment' },
        { key: 'lca',     label: 'LCA wage',   icon: ShieldCheck, items: lcaItems,     subtitle: 'W2 · buffer = earnings − LCA per period' },
        { key: 'hourly',  label: 'Hourly pay', icon: Users,       items: nonLcaItems,  subtitle: 'Total = approved hrs × pay rate + adjustments' },
    ];
    const visibleGroups = groups.filter(g => g.items.length > 0);
    const activeGroup   = visibleGroups.find(g => g.key === groupKey) || visibleGroups[0];

    const lineProps = (item) => ({
        item,
        st:              itemStates[item.id]?.item_status || 'PENDING',
        comments:        itemStates[item.id]?.comments || '',
        readOnly,
        onApprove:       () => setStatus(item.id, 'APPROVED'),
        onReject:        () => setStatus(item.id, 'REJECTED'),
        onCommentChange: (v) => setComment(item.id, v),
    });

    const footer = readOnly ? (
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm text-(--text-muted)">
                <Lock size={14} className="shrink-0 text-(--brand-primary)" /> Submitted — locked
            </span>
            <Btn variant="success" icon={Download} onClick={handleExport}>Export</Btn>
        </div>
    ) : (
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
            <Btn icon={RefreshCw} onClick={handleRefresh} disabled={refreshing || submitting} title="Pull in newly approved time logs" className={refreshing ? '[&_svg]:animate-spin' : ''}>
                {refreshing ? 'Refreshing…' : 'Refresh'}
            </Btn>
            <Btn variant="success" icon={Download} onClick={handleExport}>Export</Btn>
            <Btn onClick={onClose} disabled={submitting || refreshing}>Cancel</Btn>
            <Btn
                variant="primary"
                icon={submitting ? Loader2 : CheckCircle}
                onClick={() => { setError(''); setRefreshMsg(''); setConfirmOpen(true); }}
                disabled={submitting || refreshing || run.items?.length === 0}
            >
                {submitting ? 'Submitting…' : 'Submit pay run'}
            </Btn>
        </div>
    );

    const adjustCtx = {
        adjustments,
        arrearsCarrier,
        readOnly,
        add:    handleAddAdjustment,
        remove: handleDeleteAdjustment,
    };

    const aside = (
        <div className="space-y-4">
            <div className="rounded-[22px] p-5 text-white" style={{ background: 'var(--brand-gradient)', boxShadow: '0 20px 40px -24px var(--brand-glow)' }}>
                <p className="flex items-center gap-1.5 text-xs text-white/80"><Banknote size={13} /> Pay run</p>
                <p className="mt-2 text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{run.period_label} {run.year}</p>
                <p className="text-xs text-white/80">{fmtDate(run.period_start)} — {fmtDate(run.period_end)}</p>
                <div className="mt-4">
                    <div className="flex h-1.5 overflow-hidden rounded-full bg-white/25">
                        <div className="h-full bg-white" style={{ width: totalCount ? `${(approvedCount / totalCount) * 100}%` : 0 }} />
                        <div className="h-full bg-white/50" style={{ width: totalCount ? `${(rejectedCount / totalCount) * 100}%` : 0 }} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-white/85">{approvedCount + rejectedCount} of {totalCount} lines decided</p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                {readOnly
                    ? <Chip tone="green" icon={Lock}>Submitted · read only</Chip>
                    : run.status === 'DRAFT' ? <Chip tone="amber" icon={Clock}>Draft · review &amp; submit</Chip> : null}
                {adjustments.length > 0 && <Chip tone="brand">{adjustments.length} adjustment{adjustments.length !== 1 ? 's' : ''}</Chip>}
            </div>

            <div className="grid grid-cols-3 gap-2">
                {[['Approved', approvedCount, 'text-emerald-500'], ['Rejected', rejectedCount, 'text-rose-500'], ['Pending', pendingCount, 'text-amber-500']].map(([label, val, tone]) => (
                    <div key={label} className="rounded-[14px] border border-(--border-subtle) bg-(--bg-surface) px-2 py-2 text-center">
                        <p className={cx('text-lg font-semibold', tone)} style={{ fontFamily: 'var(--font-display)' }}>{val}</p>
                        <p className="text-[11px] text-(--text-muted)">{label}</p>
                    </div>
                ))}
            </div>

            {error && <Notice tone="rose" icon={AlertTriangle}>{error}</Notice>}
            {refreshMsg && <Notice tone="sky" icon={Info}>{refreshMsg}</Notice>}

            {arrearsItems.length > 0 && (
                <Notice tone="brand" icon={History}>
                    <b className="text-(--text-main)">
                        {arrearsItems.length} catch-up line{arrearsItems.length !== 1 ? 's' : ''}
                        {run.arrears_summary?.hours ? ` (${run.arrears_summary.hours} hrs, ${fmt(run.arrears_summary.amount)})` : ''}
                        {run.arrears_summary?.periods?.length ? ` from ${run.arrears_summary.periods.join(', ')}` : ''}.
                    </b>{' '}
                    Approved hours earlier pay runs never paid. Approve or reject each one.
                </Notice>
            )}
            {run.arrears_summary?.unpriced_hours > 0 && (
                <Notice tone="amber" icon={AlertTriangle}>
                    <b>{run.arrears_summary.unpriced_hours} unpaid approved hours could not be included</b> — their engagement has no pay rate. Add one, then Refresh. Pay Audit lists them all.
                </Notice>
            )}
            {run.pending_timesheets?.timesheet_count > 0 && !readOnly && (
                <Notice tone="amber" icon={AlertTriangle}>
                    <b>
                        {run.pending_timesheets.timesheet_count} time log{run.pending_timesheets.timesheet_count !== 1 ? 's' : ''} overlapping this period
                        {run.pending_timesheets.employee_count ? ` (${run.pending_timesheets.employee_count} consultant${run.pending_timesheets.employee_count !== 1 ? 's' : ''})` : ''} not approved yet.
                    </b>{' '}
                    Submitting now is fine — anything approved later arrives as a catch-up line next run.
                </Notice>
            )}
        </div>
    );

    return (
        <AdjustCtx.Provider value={adjustCtx}>
            <BaseModal
                isOpen
                onClose={onClose}
                icon={<Banknote size={18} />}
                title={`Pay run — ${run.period_label} ${run.year}`}
                subtitle={`${fmtDate(run.period_start)} to ${fmtDate(run.period_end)}`}
                footer={footer}
                noPadding
            >
                <DetailLayout
                    aside={aside}
                    sections={visibleGroups.map(g => ({ key: g.key, label: g.label, icon: g.icon, count: g.items.length }))}
                    active={activeGroup?.key}
                    onSelect={setGroupKey}
                >
                    {!activeGroup ? (
                        <EmptyState icon={Banknote} title="No pay lines for this period" text="No W2 consultants with approved time logs fall in this period." />
                    ) : (
                        <>
                            <SectionTitle icon={activeGroup.icon} title={activeGroup.label} subtitle={activeGroup.subtitle} />
                            <div className="space-y-3">
                                {activeGroup.key === 'arrears' && arrearsItems.map(item => (
                                    <ArrearsLine key={item.id} {...lineProps(item)} adjNet={arrearsAdj[item.id] || 0} />
                                ))}
                                {activeGroup.key === 'fixed' && fixedItems.map(item => (
                                    <FixedLine key={item.id} {...lineProps(item)} info={fixedRows[item.id]} />
                                ))}
                                {activeGroup.key === 'lca' && lcaItems.map(item => (
                                    <LcaLine key={item.id} {...lineProps(item)} bufInfo={buffers[item.id]} />
                                ))}
                                {activeGroup.key === 'hourly' && nonLcaItems.map(item => (
                                    <HourlyLine key={item.id} {...lineProps(item)} bufInfo={buffers[item.id]} />
                                ))}
                            </div>
                        </>
                    )}
                </DetailLayout>
            </BaseModal>

            {/* Confirm submit dialog */}
            {confirmOpen && createPortal(
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                    <div className="nx-pop w-full max-w-sm rounded-[28px] border border-(--border-subtle) bg-(--bg-surface) p-6" style={{ boxShadow: 'var(--shadow-floating)' }}>
                        <span className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-amber-500/10 text-amber-500"><Lock size={20} /></span>
                        <h3 className="mt-4 text-lg font-semibold text-(--text-main)">Lock this pay run?</h3>
                        <p className="mt-1 text-sm text-(--text-muted)">
                            Once submitted the run is locked and cannot be changed. Approved LCA lines reach the Earnings Ledger immediately.
                        </p>
                        {adjustments.length > 0 && (
                            <p className="mt-2 text-xs font-semibold text-amber-600">{adjustments.length} adjustment{adjustments.length !== 1 ? 's' : ''} will be included in posted amounts.</p>
                        )}
                        {arrearsItems.length > 0 && (
                            <p className="mt-1 text-xs font-semibold text-violet-500">
                                {arrearsItems.length} catch-up line{arrearsItems.length !== 1 ? 's' : ''} from earlier periods will be settled with this run.
                            </p>
                        )}
                        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                            {[['Approved', approvedCount, 'text-emerald-500 bg-emerald-500/10'], ['Rejected', rejectedCount, 'text-rose-500 bg-rose-500/10'], ['Pending', pendingCount, 'text-amber-500 bg-amber-500/10']].map(([label, val, tone]) => (
                                <div key={label} className={cx('rounded-[14px] p-3', tone)}>
                                    <div className="text-lg font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{val}</div>
                                    <div className="text-[11px]">{label}</div>
                                </div>
                            ))}
                        </div>
                        {error && <Notice tone="rose" icon={AlertTriangle} className="mt-4">{error}</Notice>}
                        <div className="mt-5 flex gap-2">
                            <Btn onClick={() => setConfirmOpen(false)} disabled={submitting} className="flex-1">Go back</Btn>
                            <Btn variant="primary" icon={submitting ? Loader2 : CheckCircle} onClick={handleSubmit} disabled={submitting} className="flex-1">
                                {submitting ? 'Submitting…' : 'Confirm'}
                            </Btn>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </AdjustCtx.Provider>
    );
};

export default PayrollDetailModal;
