import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Briefcase, Clock, CalendarX, FileText, FileWarning, TrendingUp, Cake, Trophy, Plane, ArrowUpRight, CalendarDays, Activity } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import { fmtDate } from '../../../utils/dateUtils';

const fmt$ = (v) => `$${parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const easternHour = () => Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/New_York' }).format(new Date()));
const greeting = () => {
    const h = easternHour();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};
const todayLabel = () => new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }).format(new Date());

const StatCard = ({ label, value, icon: Icon, colorClass, subLabel, loading, onClick, wide }) => (
    <div
        onClick={onClick}
        className={`group relative overflow-hidden rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5 transition-all duration-300 ${wide ? 'sm:col-span-2' : ''}
            ${onClick ? 'cursor-pointer hover:-translate-y-1 hover:border-(--brand-primary)/50 hover:shadow-[0_24px_48px_-24px_var(--brand-glow)]' : ''}`}
    >
        <div
            className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
            style={{ background: 'var(--brand-glow)' }}
        />
        <div className="relative flex items-start justify-between">
            <div className={`relative flex h-11 w-11 items-center justify-center rounded-[14px] ${colorClass}`}>
                <span className="absolute inset-0 rounded-[14px] bg-current opacity-10" />
                <Icon size={20} className="relative" />
            </div>
            {onClick && (
                <ArrowUpRight size={18} className="text-(--text-muted) transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-(--brand-primary)" />
            )}
        </div>
        <p className="relative mt-5 text-[13px] font-medium text-(--text-muted)">{label}</p>
        {loading ? (
            <div className="nx-shimmer mt-2 h-8 w-28 rounded-full" />
        ) : (
            <p className="relative mt-1 truncate text-3xl font-semibold tabular-nums text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{value}</p>
        )}
        {subLabel && !loading && (
            <p className="relative mt-4 inline-flex max-w-full items-center gap-1.5 rounded-full border border-(--border-subtle) px-2.5 py-1 text-[11px] text-(--text-muted)">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${colorClass}`} />
                <span className="truncate">{subLabel}</span>
            </p>
        )}
    </div>
);

const InfoSection = ({ icon: Icon, title, colorClass, children, emptyText }) => (
    <div className="overflow-hidden rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) transition-colors duration-300">
        <div className="flex items-center gap-3 border-b border-(--border-subtle) px-5 py-4">
            <span className={`relative flex h-9 w-9 items-center justify-center rounded-[12px] ${colorClass}`}>
                <span className="absolute inset-0 rounded-[12px] bg-current opacity-10" />
                <Icon size={17} className="relative" />
            </span>
            <h2 className="text-[15px] font-semibold text-(--text-main)">{title}</h2>
        </div>
        <div className="p-3">
            {children}
            {!children && (
                <p className="py-3 text-center text-sm text-(--text-muted)">{emptyText}</p>
            )}
        </div>
    </div>
);

const PersonRow = ({ name, code, badge, badgeColor, detail, detailColor }) => (
    <div className="flex items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 transition-colors hover:bg-(--text-main)/[0.04]">
        <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: 'var(--brand-gradient)' }}>
                {name.substring(0, 2)}
            </div>
            <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-(--text-main)">{name}</p>
                <p className="font-mono text-[11px] text-(--text-muted)">{code}</p>
            </div>
        </div>
        <div className="ml-3 flex shrink-0 flex-col items-end gap-1">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badgeColor}`}>{badge}</span>
            {detail && <span className={`text-[11px] ${detailColor || 'text-(--text-muted)'}`}>{detail}</span>}
        </div>
    </div>
);

const EmptyState = ({ text }) => (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <span className="h-1.5 w-10 rounded-full opacity-40" style={{ background: 'var(--brand-gradient)' }} />
        <p className="text-sm text-(--text-muted)">{text}</p>
    </div>
);

const ManagementDashboard = () => {
    const userRole = localStorage.getItem('userRole');
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState({
        stats: {
            employees: 0, employeesTotal: 0,
            placements: 0, placementsTotal: 0,
            pendingTimesheets: 0, pendingTimesheetsTotal: 0,
            pastDueTimesheets: 0, pastDueTimesheetsTotal: 0,
            pastDueInvoices: 0,   pastDueInvoicesTotal: 0,
            readyToSendInvoices: 0, readyToSendInvoicesTotal: 0,
            totalNetBalance: 0,
        },
        todayBirthdays: [],
        todayAnniversaries: [],
        immigrationExpiring: []
    });

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const res = await managementAPI.getDashboardStats();
                setData(res.data);
            } catch (error) {
                console.error("Failed to fetch dashboard stats", error);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboardData();
    }, []);

    const isOrgAdminOrAccountant = userRole === 'ORG_ADMIN' || userRole === 'ACCOUNTANT';

    // Every tile is defined exactly once and the role arrays below only choose which
    // of them to show. A role sees fewer tiles, never different numbers or wording.
    //
    // For the placement-backed tiles the headline number counts Active placements only
    // (matching the default view of the page each tile links to), and the sub-label
    // reports the same metric across every placement.
    const allPlacementsLabel = (total) => `${total} across all placements`;

    const activeEmployeesCard = {
        label: 'Active Employees',
        value: data.stats.employees,
        icon: Users,
        colorClass: 'text-(--brand-primary)',
        subLabel: `${data.stats.employeesTotal} all employees`,
        onClick: () => navigate('/management/workforce?status=ACTIVE'),
    };

    const activePlacementsCard = {
        label: 'Active Placements',
        value: data.stats.placements,
        icon: Briefcase,
        colorClass: 'text-sky-500',
        subLabel: `${data.stats.placementsTotal} all placements`,
        onClick: () => navigate('/management/placements?status=ACTIVE'),
    };

    const pendingTimesheetsCard = {
        label: 'Pending Approval Timesheets',
        value: data.stats.pendingTimesheets,
        icon: Clock,
        colorClass: data.stats.pendingTimesheets > 0 ? 'text-orange-500' : 'text-emerald-500',
        subLabel: allPlacementsLabel(data.stats.pendingTimesheetsTotal),
        onClick: () => navigate('/management/timesheets?tab=PENDING_APPROVAL'),
    };

    const pastDueTimesheetsCard = {
        label: 'Past Due Timesheets',
        value: data.stats.pastDueTimesheets,
        icon: CalendarX,
        colorClass: data.stats.pastDueTimesheets > 0 ? 'text-rose-500' : 'text-emerald-500',
        subLabel: allPlacementsLabel(data.stats.pastDueTimesheetsTotal),
        onClick: () => navigate('/management/timesheets?tab=PAST_DUE'),
    };

    const readyToSendInvoicesCard = {
        label: 'Invoices Ready to Send',
        value: data.stats.readyToSendInvoices,
        icon: FileText,
        colorClass: 'text-fuchsia-500',
        subLabel: allPlacementsLabel(data.stats.readyToSendInvoicesTotal),
        onClick: () => navigate('/management/invoices?tab=READY'),
    };

    const pastDueInvoicesCard = {
        label: 'Past Due Invoices',
        value: data.stats.pastDueInvoices,
        icon: FileWarning,
        colorClass: data.stats.pastDueInvoices > 0 ? 'text-rose-500' : 'text-emerald-500',
        subLabel: allPlacementsLabel(data.stats.pastDueInvoicesTotal),
        onClick: () => navigate('/management/invoices?tab=PAST_DUE'),
    };

    const netBalanceCard = {
        label: 'Total Net Balance',
        value: fmt$(data.stats.totalNetBalance),
        icon: TrendingUp,
        colorClass: (data.stats.totalNetBalance ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500',
        subLabel: 'all employees',
        onClick: () => navigate('/management/balance-sheet'),
        wide: true,
    };

    const orgAdminCards = [
        activeEmployeesCard,
        activePlacementsCard,
        pendingTimesheetsCard,
        pastDueTimesheetsCard,
        readyToSendInvoicesCard,
        pastDueInvoicesCard,
        netBalanceCard,
    ];

    const hrCards = [
        activeEmployeesCard,
        activePlacementsCard,
        pendingTimesheetsCard,
        pastDueTimesheetsCard,
    ];

    const cards = isOrgAdminOrAccountant ? orgAdminCards : hrCards;

    const attentionCount = data.stats.pendingTimesheets + data.stats.pastDueTimesheets
        + (isOrgAdminOrAccountant ? data.stats.pastDueInvoices : 0);

    if (loading) {
        return (
            <div className="mx-auto max-w-7xl space-y-6 p-1 sm:p-2">
                <div className="nx-shimmer h-44 rounded-[28px]" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => <div key={i} className="nx-shimmer h-40 rounded-[22px]" />)}
                </div>
            </div>
        );
    }

    const { todayBirthdays, todayAnniversaries, immigrationExpiring } = data;

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-1 sm:p-2">

            {/* Hero */}
            <section
                className="relative overflow-hidden rounded-[28px] border border-(--border-subtle) p-6 sm:p-8"
                style={{ background: 'linear-gradient(120deg, color-mix(in srgb, var(--brand-primary) 16%, var(--bg-surface)) 0%, var(--bg-surface) 55%, color-mix(in srgb, var(--brand-secondary) 13%, var(--bg-surface)) 100%)' }}
            >
                <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full opacity-70 blur-3xl" style={{ background: 'var(--brand-glow)' }} />
                <div
                    className="pointer-events-none absolute inset-0 opacity-60"
                    style={{
                        backgroundImage: 'linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)',
                        backgroundSize: '32px 32px',
                        WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 60%)',
                        maskImage: 'linear-gradient(90deg, transparent, #000 60%)',
                    }}
                />
                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-(--brand-primary)">Command center</p>
                        <h1 className="mt-2 text-3xl font-semibold text-(--text-main) sm:text-4xl">
                            {greeting()}<span className="nx-gradient-text">.</span>
                        </h1>
                        <p className="mt-2 max-w-xl text-sm text-(--text-muted)">
                            Overview of your{' '}
                            {userRole === 'ORG_ADMIN' ? 'administration' : userRole === 'ACCOUNTANT' ? 'accounting' : 'HR management'} system
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-(--border-subtle) bg-(--bg-surface)/80 px-3.5 py-2 text-xs text-(--text-main) backdrop-blur">
                            <CalendarDays size={14} className="text-(--brand-primary)" /> {todayLabel()}
                        </span>
                        <span className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs backdrop-blur ${attentionCount > 0 ? 'border-orange-500/30 bg-orange-500/10 text-orange-500' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'}`}>
                            <Activity size={14} />
                            {attentionCount > 0 ? `${attentionCount} items need attention` : 'All clear'}
                        </span>
                    </div>
                </div>
            </section>

            {/* KPI bento */}
            <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${isOrgAdminOrAccountant ? 'xl:grid-cols-4' : 'lg:grid-cols-4'}`}>
                {cards.map((card, i) => (
                    <StatCard key={i} {...card} loading={loading} />
                ))}
            </div>

            {/* People signals */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

                {/* Today's Birthdays */}
                <InfoSection
                    icon={Cake}
                    title="Today's Birthdays"
                    colorClass="text-pink-500"
                    emptyText={todayBirthdays.length === 0 ? "No birthdays today." : null}
                >
                    {todayBirthdays.length > 0 ? (
                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                            {todayBirthdays.map((emp, i) => (
                                <PersonRow
                                    key={i}
                                    name={emp.name}
                                    code={emp.employee_code || '—'}
                                    badge="🎂 Birthday"
                                    badgeColor="bg-pink-500/10 text-pink-500"
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyState text="No birthdays today." />
                    )}
                </InfoSection>

                {/* Work Anniversaries */}
                <InfoSection
                    icon={Trophy}
                    title="Work Anniversaries"
                    colorClass="text-amber-500"
                    emptyText={null}
                >
                    {todayAnniversaries.length > 0 ? (
                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                            {todayAnniversaries.map((emp, i) => (
                                <PersonRow
                                    key={i}
                                    name={emp.name}
                                    code={emp.employee_code || '—'}
                                    badge={`${emp.years} ${emp.years === 1 ? 'Year' : 'Years'}`}
                                    badgeColor="bg-amber-500/10 text-amber-600"
                                    detail={`Joined ${fmtDate(emp.joining_date)}`}
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyState text="No anniversaries today." />
                    )}
                </InfoSection>

                {/* Immigration Expiring */}
                <InfoSection
                    icon={Plane}
                    title="Immigration Expiring (180 days)"
                    colorClass="text-rose-500"
                    emptyText={null}
                >
                    {immigrationExpiring.length > 0 ? (
                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                            {immigrationExpiring.map((emp, i) => {
                                const urgent = emp.days_remaining <= 30;
                                const warn   = emp.days_remaining <= 90;
                                const badgeColor = urgent ? 'bg-rose-500/10 text-rose-500' : warn ? 'bg-orange-500/10 text-orange-500' : 'bg-yellow-500/10 text-yellow-600';
                                return (
                                    <PersonRow
                                        key={i}
                                        name={emp.name}
                                        code={emp.employee_code || '—'}
                                        badge={emp.status_name}
                                        badgeColor={badgeColor}
                                        detail={`Expires ${emp.days_remaining}d left`}
                                        detailColor={urgent ? 'text-rose-500' : warn ? 'text-orange-500' : 'text-(--text-muted)'}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <EmptyState text="No immigration records expiring within 180 days." />
                    )}
                </InfoSection>

            </div>
        </div>
    );
};

export default ManagementDashboard;
