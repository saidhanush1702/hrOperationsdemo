import { useState, useEffect } from 'react';
import { Wallet, Briefcase, SlidersHorizontal, TrendingUp, TrendingDown, DollarSign, Receipt, Banknote, BookOpen } from 'lucide-react';
import { portalAPI } from '../../../api/apiService';
import { fmtDate } from '../../../utils/dateUtils';
import { PageHero, StatRail, StatTile, SectionTitle, Chip, EmptyState, LoadingState, cx } from '../../../components/ui/kit';

// ─── helpers ────────────────────────────────────────────────────────────────
const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PAY_TONE = { C2C: 'fuchsia', W2: 'sky', '1099': 'amber' };

const Entry = ({ icon: Icon, iconTone, title, meta, working, amount, amountTone }) => (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
        <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', iconTone)}><Icon size={15} /></span>
        <div className="min-w-[150px] flex-1">
            <p className="truncate text-sm font-semibold text-(--text-main)">{title}</p>
            {meta && <p className="truncate text-xs text-(--text-muted)">{meta}</p>}
        </div>
        {working && <p className="min-w-[130px] text-xs text-(--text-muted) sm:text-right">{working}</p>}
        <p className={cx('min-w-[100px] text-right text-sm font-semibold', amountTone)}>{amount}</p>
    </div>
);

const Statement = ({ children }) => (
    <div className="divide-y divide-(--border-subtle) overflow-hidden rounded-[22px] border border-(--border-subtle) bg-(--bg-surface)">{children}</div>
);

// ─── Main page ────────────────────────────────────────────────────────────────
const EmployeeBalanceSheet = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sectionKey, setSectionKey] = useState(null);

    useEffect(() => {
        portalAPI.getMyBalanceSheetSummary()
            .then(res => setData(res.data))
            .catch(err => console.error('Ledger error:', err))
            .finally(() => setLoading(false));
    }, []);

    const summary   = data?.summary || { placement_earnings: 0, manual_additions: 0, manual_deductions: 0, net_balance: 0 };
    const netBal    = summary.net_balance;
    const isEmpty   = !data || (data.placements?.length === 0 && data.manual_adjustments?.items?.length === 0);

    const sections = data ? [
        ...data.placements.map(pl => ({
            key:      `pl_${pl.placement_id}`,
            label:    pl.placement_code || 'Engagement',
            sub:      pl.client_name,
            icon:     Briefcase,
            badge:    pl.pay_type,
            count:    pl.items.length,
            amount:   `+${fmt$(pl.total_amount)}`,
            positive: true,
            body: (
                <Statement>
                    {pl.items.map((item, i) => pl.pay_type === 'C2C' ? (
                        <Entry
                            key={item.id || i}
                            icon={Receipt}
                            iconTone="bg-emerald-500/10 text-emerald-500"
                            title={<span className="font-mono">{item.invoice_number}</span>}
                            meta={`Paid ${fmtDate(item.paid_date)}`}
                            working={`${parseFloat(item.total_hours || 0).toFixed(2)} hrs × ${fmt$(item.pay_rate)}/hr`}
                            amount={fmt$(item.amount)}
                            amountTone="text-emerald-500"
                        />
                    ) : (
                        <Entry
                            key={item.id || i}
                            icon={Banknote}
                            iconTone="bg-emerald-500/10 text-emerald-500"
                            title={item.period_label}
                            meta={`Pay run ${fmtDate(item.run_date)}`}
                            working={`${parseFloat(item.approved_hours || 0).toFixed(2)} hrs × ${fmt$(item.pay_rate)}/hr`}
                            amount={fmt$(item.amount)}
                            amountTone="text-emerald-500"
                        />
                    ))}
                </Statement>
            ),
        })),
        ...(data.manual_adjustments.items.length > 0 ? [{
            key:      'manual',
            label:    'Adjustments',
            sub:      `+${fmt$(data.manual_adjustments.total_additions)} additions · −${fmt$(data.manual_adjustments.total_deductions)} deductions`,
            icon:     SlidersHorizontal,
            count:    data.manual_adjustments.items.length,
            amount:   `${data.manual_adjustments.net >= 0 ? '+' : '−'}${fmt$(Math.abs(data.manual_adjustments.net))}`,
            positive: data.manual_adjustments.net >= 0,
            body: (
                <Statement>
                    {data.manual_adjustments.items.map((item, i) => {
                        const isPayout = item.type === 'PAYOUT';
                        return (
                            <Entry
                                key={item.id || i}
                                icon={SlidersHorizontal}
                                iconTone={isPayout ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}
                                title={item.reason || '—'}
                                meta={<span className="flex items-center gap-2">{fmtDate(item.date)} <Chip tone={isPayout ? 'green' : 'rose'}>{isPayout ? 'Payout' : 'Deduction'}</Chip></span>}
                                amount={`${isPayout ? '+' : '−'}${fmt$(item.amount)}`}
                                amountTone={isPayout ? 'text-emerald-500' : 'text-rose-500'}
                            />
                        );
                    })}
                </Statement>
            ),
        }] : []),
    ] : [];

    const active = sections.find(s => s.key === sectionKey) || sections[0];

    return (
        <div className="mx-auto max-w-[1400px] space-y-6">
            <PageHero
                icon={Wallet}
                eyebrow="My work"
                title="My ledger"
                description="Your personal earnings statement — what you've earned, received and still carry."
                actions={!loading && data && (
                    <div className="rounded-[18px] px-5 py-3 text-right text-white" style={{ background: 'var(--brand-gradient)', boxShadow: '0 18px 36px -18px var(--brand-glow)' }}>
                        <p className="text-xs text-white/80">Net balance</p>
                        <p className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{netBal >= 0 ? '+' : '−'}{fmt$(Math.abs(netBal))}</p>
                    </div>
                )}
            >
                {!loading && data && (
                    <StatRail>
                        <StatTile label="Engagement earnings" icon={TrendingUp} value={`+${fmt$(summary.placement_earnings)}`} />
                        <StatTile label="Additions" icon={DollarSign} value={`+${fmt$(summary.manual_additions)}`} />
                        <StatTile label="Deductions" icon={TrendingDown} value={`−${fmt$(summary.manual_deductions)}`} />
                        <StatTile label="Net balance" icon={Wallet} value={`${netBal >= 0 ? '+' : '−'}${fmt$(Math.abs(netBal))}`} />
                    </StatRail>
                )}
            </PageHero>

            {loading ? (
                <LoadingState text="Loading ledger…" />
            ) : isEmpty ? (
                <div className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface)">
                    <EmptyState icon={Wallet} title="No transactions yet" text="Your balance will appear here once transactions are processed." />
                </div>
            ) : (
                <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <nav className="hide-scrollbar flex gap-2 overflow-x-auto lg:flex-col lg:self-start">
                        {sections.map(s => {
                            const on = active?.key === s.key;
                            const Icon = s.icon;
                            return (
                                <button
                                    key={s.key}
                                    type="button"
                                    onClick={() => setSectionKey(s.key)}
                                    className={cx(
                                        'flex min-w-[200px] shrink-0 items-center gap-3 rounded-[18px] border px-4 py-3 text-left outline-none transition-colors lg:min-w-0',
                                        on ? 'border-(--brand-primary)/50 bg-(--brand-primary)/8' : 'border-(--border-subtle) bg-(--bg-surface) hover:border-(--brand-primary)/35',
                                    )}
                                >
                                    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px]', on ? 'text-white' : 'bg-(--brand-primary)/10 text-(--brand-primary)')} style={on ? { background: 'var(--brand-gradient)' } : undefined}>
                                        <Icon size={15} />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-(--text-main)">{s.label}</span>
                                        <span className={cx('block text-xs font-medium', s.positive ? 'text-emerald-500' : 'text-rose-500')}>{s.amount}</span>
                                    </span>
                                    <span className="rounded-full bg-(--text-main)/5 px-2 font-mono text-[11px] text-(--text-muted)">{s.count}</span>
                                </button>
                            );
                        })}
                    </nav>

                    {active && (
                        <div className="min-w-0">
                            <SectionTitle
                                icon={active.icon === Briefcase ? BookOpen : active.icon}
                                title={active.label}
                                subtitle={active.sub}
                                actions={active.badge && <Chip tone={PAY_TONE[active.badge] || 'slate'}>{active.badge}</Chip>}
                            />
                            {active.body}
                            <div className="mt-4 flex items-center justify-between rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) px-5 py-3">
                                <span className="text-sm text-(--text-muted)">Net balance</span>
                                <span className={cx('text-lg font-semibold', netBal >= 0 ? 'text-emerald-500' : 'text-rose-500')}>{netBal >= 0 ? '+' : '−'}{fmt$(Math.abs(netBal))}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default EmployeeBalanceSheet;
