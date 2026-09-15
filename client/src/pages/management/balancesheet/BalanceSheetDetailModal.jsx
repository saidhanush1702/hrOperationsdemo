import { useState, useEffect } from 'react';
import { managementAPI } from '../../../api/apiService';
import {
    Loader2, BookOpen, Briefcase, SlidersHorizontal, RefreshCw, Trash2, Wallet, Receipt, CalendarDays, Banknote,
} from 'lucide-react';
import BaseModal from '../../../components/ui/BaseModal';
import C2CRepriceModal from './C2CRepriceModal';
import { fmtDate } from '../../../utils/dateUtils';
import { DetailLayout, SectionTitle, Btn, Chip, Avatar, EmptyState, LoadingState, cx } from '../../../components/ui/kit';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtHr = (v) => `${parseFloat(v  || 0).toFixed(2)} hrs`;

const PAY_TYPE_TONE = { C2C: 'fuchsia', W2: 'sky', '1099': 'amber' };

// One line of the statement: what happened, the working, and the amount.
const Entry = ({ icon: Icon, iconTone, title, meta, working, amount, amountTone, action }) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', iconTone)}>
            <Icon size={15} />
        </span>
        <div className="min-w-[160px] flex-1">
            <p className="truncate text-sm font-semibold text-(--text-main)">{title}</p>
            {meta && <p className="truncate text-xs text-(--text-muted)">{meta}</p>}
        </div>
        {working && <div className="min-w-[140px] text-xs text-(--text-muted) sm:text-right">{working}</div>}
        <div className={cx('min-w-[110px] text-right text-sm font-semibold', amountTone)}>{amount}</div>
        {action}
    </div>
);

const Statement = ({ children }) => (
    <div className="divide-y divide-(--border-subtle) overflow-hidden rounded-[22px] border border-(--border-subtle) bg-(--bg-surface)">
        {children}
    </div>
);

// ─── C2C: earnings accrued from paid invoices ───────────────────────────────
const C2CDetail = ({ items }) => (
    <Statement>
        {items.map((item, i) => (
            <Entry
                key={item.id || i}
                icon={Receipt}
                iconTone="bg-emerald-500/10 text-emerald-500"
                title={<span className="font-mono">{item.invoice_number}</span>}
                meta={item.period_start && item.period_end ? `${fmtDate(item.period_start)} – ${fmtDate(item.period_end)} · paid ${fmtDate(item.paid_date)}` : `Paid ${fmtDate(item.paid_date)}`}
                working={`${fmtHr(item.total_hours)} × ${fmt$(item.pay_rate)}/hr`}
                amount={`+${fmt$(item.amount)}`}
                amountTone="text-emerald-500"
            />
        ))}
    </Statement>
);

// ─── W2: earnings posted by pay runs ────────────────────────────────────────
const W2Detail = ({ items }) => (
    <Statement>
        {items.map((item, i) => (
            <Entry
                key={item.id || i}
                icon={Banknote}
                iconTone="bg-emerald-500/10 text-emerald-500"
                title={item.period_label}
                meta={`Pay run ${fmtDate(item.run_date)}`}
                working={`${fmtHr(item.approved_hours)} × ${fmt$(item.pay_rate)}/hr`}
                amount={`+${fmt$(item.amount)}`}
                amountTone="text-emerald-500"
            />
        ))}
    </Statement>
);

// ─── Manual adjustments ─────────────────────────────────────────────────────
// Deletion is offered here and nowhere else in this view: engagement earnings are
// generated from paid invoices and pay runs, so they are corrected at source
// rather than removed from the ledger.
const ManualDetail = ({ items, canDelete, onDelete, deletingId }) => (
    <Statement>
        {items.map((item, i) => {
            const isPayout = item.type === 'PAYOUT';
            const busy     = deletingId === item.id;
            return (
                <Entry
                    key={item.id || i}
                    icon={SlidersHorizontal}
                    iconTone={isPayout ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}
                    title={item.reason || '—'}
                    meta={<span className="flex items-center gap-2">{fmtDate(item.date)} <Chip tone={isPayout ? 'green' : 'rose'}>{isPayout ? 'Payout' : 'Deduction'}</Chip></span>}
                    amount={`${isPayout ? '+' : '−'}${fmt$(item.amount)}`}
                    amountTone={isPayout ? 'text-emerald-500' : 'text-rose-500'}
                    action={canDelete && (
                        <Btn
                            size="icon"
                            variant="danger"
                            icon={busy ? Loader2 : Trash2}
                            onClick={() => onDelete(item)}
                            disabled={busy}
                            title={`Delete this ${isPayout ? 'payout' : 'deduction'}`}
                        />
                    )}
                />
            );
        })}
    </Statement>
);

// ─── C2C fixed-pay withdrawals ──────────────────────────────────────────────
//
// Each row is one pay run handing the consultant their flat figure, taken back
// out of what the engagement's paid invoices accrued. Amounts arrive already
// negated by the API so they read the way they act on the running balance.
const C2CFixedDetail = ({ items }) => (
    <Statement>
        {items.map((item, i) => (
            <Entry
                key={item.id || i}
                icon={Wallet}
                iconTone="bg-amber-500/10 text-amber-500"
                title={item.period_label}
                meta={`Pay run ${fmtDate(item.run_date)}`}
                working={
                    <span className="flex flex-col sm:items-end">
                        <span>Before {item.balance_before != null ? fmt$(item.balance_before) : '—'} · fixed {item.fixed_pay_per_period != null ? fmt$(item.fixed_pay_per_period) : '—'}</span>
                        {item.adjustment ? (
                            <span className={item.adjustment > 0 ? 'text-emerald-500' : 'text-rose-500'}>
                                adj {item.adjustment > 0 ? '+' : ''}{fmt$(item.adjustment)}
                            </span>
                        ) : null}
                    </span>
                }
                amount={fmt$(item.amount)}
                amountTone="text-rose-500"
            />
        ))}
    </Statement>
);

// ─── Main modal ──────────────────────────────────────────────────────────────
const BalanceSheetDetailModal = ({ isOpen, onClose, employee, onRefresh }) => {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRepriceOpen, setIsRepriceOpen] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);
    const [deletingId, setDeletingId] = useState(null);
    const [sectionKey, setSectionKey] = useState(null);

    // The ledger is already restricted to these two roles at the route level;
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
            `This changes the consultant's net balance and cannot be undone.`
        )) return;

        setDeletingId(item.id);
        try {
            await managementAPI.deleteBalanceAdjustment(item.id);
            // Drop the entry locally rather than refetching, so removing several
            // adjustments in a row stays on the same section. The parent list still
            // reloads via onRefresh.
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

    // ── totals ──
    const placementTotal = summary
        ? summary.placements.reduce((s, p) => s + p.total_amount, 0)
        : 0;
    const manualNet = summary?.manual_adjustments?.net ?? 0;
    const netBalance = placementTotal + manualNet;

    // One statement section per engagement + type group, plus manual adjustments.
    const groups = summary ? [
        ...summary.placements.map(pl => {
            const isFixed = pl.transaction_type === 'C2C_FIXED';
            const isC2C   = pl.transaction_type === 'C2C';
            const isLca   = pl.transaction_type === 'W2_LCA';
            return {
                key:      pl.group_key || pl.placement_id + '_' + pl.transaction_type,
                label:    isFixed ? `Fixed draw · ${pl.placement_code || 'Engagement'}` : (pl.placement_code || 'Engagement'),
                icon:     isFixed ? Wallet : Briefcase,
                count:    pl.items.length,
                subtitle: [
                    pl.client_name,
                    isFixed ? 'Fixed pay drawn from balance'
                            : !isC2C ? (isLca ? 'LCA wage earnings' : 'Standard pay earnings') : 'Accrued from paid invoices',
                ].filter(Boolean).join(' · '),
                payType:  pl.pay_type,
                // total_amount already arrives negative for a fixed-pay group.
                amount:   isFixed ? `−${fmt$(Math.abs(pl.total_amount))}` : `+${fmt$(pl.total_amount)}`,
                amountLabel: isFixed ? 'Paid out' : 'Earnings',
                positive: !isFixed,
                body:     isFixed ? <C2CFixedDetail items={pl.items} />
                        : isC2C   ? <C2CDetail items={pl.items} />
                        :           <W2Detail items={pl.items} />,
            };
        }),
        ...(summary.manual_adjustments.items.length > 0 ? [(() => {
            const ma = summary.manual_adjustments;
            return {
                key:      '__manual',
                label:    'Adjustments',
                icon:     SlidersHorizontal,
                count:    ma.items.length,
                subtitle: `+${fmt$(ma.total_additions)} additions · −${fmt$(ma.total_deductions)} deductions`,
                amount:   `${ma.net >= 0 ? '+' : '−'}${fmt$(Math.abs(ma.net))}`,
                amountLabel: 'Net',
                positive: ma.net >= 0,
                body: (
                    <ManualDetail
                        items={ma.items}
                        canDelete={canDeleteAdjustment}
                        onDelete={handleDeleteAdjustment}
                        deletingId={deletingId}
                    />
                ),
            };
        })()] : []),
    ] : [];

    const active = groups.find(g => g.key === sectionKey) || groups[0];

    const footer = !loading && summary ? (
        <>
            <span className="text-sm text-(--text-muted)">Net balance</span>
            <span className={cx('text-xl font-semibold', netBalance >= 0 ? 'text-emerald-500' : 'text-rose-500')} style={{ fontFamily: 'var(--font-display)' }}>
                {netBalance >= 0 ? '+' : '−'} {fmt$(Math.abs(netBalance))}
            </span>
        </>
    ) : null;

    const aside = (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <Avatar name={`${employee.first_name} ${employee.last_name}`} size={52} ring />
                <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{employee.first_name} {employee.last_name}</p>
                    <p className="font-mono text-xs text-(--text-muted)">{employee.employee_code}</p>
                </div>
            </div>

            {summary && (
                <div className="rounded-[22px] p-5 text-white" style={{ background: 'var(--brand-gradient)', boxShadow: '0 20px 40px -24px var(--brand-glow)' }}>
                    <p className="text-xs text-white/80">Net balance</p>
                    <p className="mt-1 text-3xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>
                        {netBalance >= 0 ? '' : '−'}{fmt$(Math.abs(netBalance))}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/20 pt-3 text-xs">
                        <div>
                            <p className="text-white/75">Engagements</p>
                            <p className="font-semibold">{fmt$(placementTotal)}</p>
                        </div>
                        <div>
                            <p className="text-white/75">Adjustments</p>
                            <p className="font-semibold">{manualNet >= 0 ? '+' : '−'}{fmt$(Math.abs(manualNet))}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Re-pricing only ever touches C2C entries, so the action is hidden when
                this consultant has none — W2 earnings are corrected in the pay run. */}
            {hasC2C && (
                <Btn icon={RefreshCw} onClick={() => setIsRepriceOpen(true)} title="Recalculate C2C earnings against the engagement's current pay rates" className="w-full">
                    Sync pay rates
                </Btn>
            )}
        </div>
    );

    return (
        <>
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            icon={<BookOpen size={18} />}
            title="Earnings ledger"
            subtitle={`${employee.first_name} ${employee.last_name} — ${employee.employee_code || ''}`}
            footer={footer}
            noPadding
        >
            <DetailLayout
                aside={aside}
                sections={groups.map(g => ({ key: g.key, label: g.label, icon: g.icon, count: g.count }))}
                active={active?.key}
                onSelect={setSectionKey}
            >
                {loading ? (
                    <LoadingState text="Loading ledger…" />
                ) : !active ? (
                    <EmptyState icon={BookOpen} title="No transactions found" text="Paid invoices, pay runs and adjustments will appear here." />
                ) : (
                    <>
                        <SectionTitle
                            icon={active.icon}
                            title={active.label}
                            subtitle={active.subtitle}
                            actions={
                                <div className="flex items-center gap-2">
                                    {active.payType && <Chip tone={PAY_TYPE_TONE[active.payType] || 'slate'}>{active.payType}</Chip>}
                                    <div className="rounded-[14px] border border-(--border-subtle) bg-(--bg-surface) px-3 py-1.5 text-right">
                                        <p className="text-[11px] text-(--text-muted)">{active.amountLabel}</p>
                                        <p className={cx('text-sm font-semibold', active.positive ? 'text-emerald-500' : 'text-rose-500')}>{active.amount}</p>
                                    </div>
                                </div>
                            }
                        />
                        <p className="mb-3 flex items-center gap-1.5 text-xs text-(--text-muted)"><CalendarDays size={12} /> {active.count} entr{active.count === 1 ? 'y' : 'ies'}</p>
                        {active.body}
                    </>
                )}
            </DetailLayout>
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
