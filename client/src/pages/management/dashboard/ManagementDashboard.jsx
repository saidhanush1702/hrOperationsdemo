import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Briefcase, Clock, Loader2, CalendarX, FileText, FileWarning, TrendingUp, Cake, Trophy, Plane } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import { fmtDate } from '../../../utils/dateUtils';

const fmt$ = (v) => `$${parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const StatCard = ({ label, value, icon: Icon, colorClass, subLabel, loading, onClick }) => (
    <div
        onClick={onClick}
        className={`bg-(--bg-surface) border border-(--border-subtle) p-5 rounded-2xl shadow-sm transition-all duration-300
            ${onClick ? 'cursor-pointer hover:border-(--brand-primary)/40 hover:shadow-md hover:-translate-y-0.5' : ''}`}
    >
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center mb-3 ${colorClass}/10`}>
            <Icon size={18} className={colorClass} />
        </div>
        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">{label}</p>
        {loading ? (
            <div className="h-7 w-24 bg-(--border-subtle) rounded animate-pulse mt-1" />
        ) : (
            <p className="text-xl font-bold text-(--text-main) mt-1">{value}</p>
        )}
        {subLabel && !loading && (
            <p className="text-[9px] text-(--text-muted) mt-1 font-bold uppercase tracking-widest">{subLabel}</p>
        )}
    </div>
);

const InfoSection = ({ icon: Icon, title, colorClass, children, emptyText }) => (
    <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-xl p-6 shadow-sm transition-colors duration-300">
        <div className={`flex items-center gap-2 mb-5 ${colorClass}`}>
            <Icon size={18} />
            <h2 className="text-sm font-bold tracking-wide">{title}</h2>
        </div>
        {children}
        {!children && (
            <p className="text-sm text-(--text-muted) py-3 text-center italic">{emptyText}</p>
        )}
    </div>
);

const PersonRow = ({ name, code, badge, badgeColor, detail, detailColor }) => (
    <div className="flex items-center justify-between py-3 border-b border-(--border-subtle) last:border-0">
        <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-(--brand-primary)/10 text-(--brand-primary) flex items-center justify-center font-bold text-xs uppercase shrink-0">
                {name.substring(0, 2)}
            </div>
            <div className="min-w-0">
                <p className="text-sm font-bold text-(--text-main) truncate">{name}</p>
                <p className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest">{code}</p>
            </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeColor}`}>{badge}</span>
            {detail && <span className={`text-[9px] font-bold uppercase tracking-widest ${detailColor || 'text-(--text-muted)'}`}>{detail}</span>}
        </div>
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
        colorClass: 'text-blue-500',
        subLabel: `${data.stats.placementsTotal} all placements`,
        onClick: () => navigate('/management/placements?status=ACTIVE'),
    };

    const pendingTimesheetsCard = {
        label: 'Pending Approval Timesheets',
        value: data.stats.pendingTimesheets,
        icon: Clock,
        colorClass: data.stats.pendingTimesheets > 0 ? 'text-orange-500' : 'text-green-500',
        subLabel: allPlacementsLabel(data.stats.pendingTimesheetsTotal),
        onClick: () => navigate('/management/timesheets?tab=PENDING_APPROVAL'),
    };

    const pastDueTimesheetsCard = {
        label: 'Past Due Timesheets',
        value: data.stats.pastDueTimesheets,
        icon: CalendarX,
        colorClass: data.stats.pastDueTimesheets > 0 ? 'text-red-500' : 'text-green-500',
        subLabel: allPlacementsLabel(data.stats.pastDueTimesheetsTotal),
        onClick: () => navigate('/management/timesheets?tab=PAST_DUE'),
    };

    const readyToSendInvoicesCard = {
        label: 'Invoices Ready to Send',
        value: data.stats.readyToSendInvoices,
        icon: FileText,
        colorClass: 'text-purple-500',
        subLabel: allPlacementsLabel(data.stats.readyToSendInvoicesTotal),
        onClick: () => navigate('/management/invoices?tab=READY'),
    };

    const pastDueInvoicesCard = {
        label: 'Past Due Invoices',
        value: data.stats.pastDueInvoices,
        icon: FileWarning,
        colorClass: data.stats.pastDueInvoices > 0 ? 'text-red-500' : 'text-green-500',
        subLabel: allPlacementsLabel(data.stats.pastDueInvoicesTotal),
        onClick: () => navigate('/management/invoices?tab=PAST_DUE'),
    };

    const netBalanceCard = {
        label: 'Total Net Balance',
        value: fmt$(data.stats.totalNetBalance),
        icon: TrendingUp,
        colorClass: (data.stats.totalNetBalance ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500',
        subLabel: 'all employees',
        onClick: () => navigate('/management/balance-sheet'),
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
    const cols   = isOrgAdminOrAccountant
        ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
        : 'grid-cols-2 md:grid-cols-4';

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[calc(100vh-10rem)]">
                <Loader2 className="animate-spin text-(--brand-primary)" size={40} />
            </div>
        );
    }

    const { todayBirthdays, todayAnniversaries, immigrationExpiring } = data;

    return (
        <div className="space-y-5 max-w-6xl mx-auto p-2">

            {/* Header */}
            <div>
                <h1 className="text-3xl font-semibold text-(--text-main) tracking-tight">Dashboard</h1>
                <p className="text-sm text-(--text-muted) mt-1">
                    Overview of your{' '}
                    {userRole === 'ORG_ADMIN' ? 'administration' : userRole === 'ACCOUNTANT' ? 'accounting' : 'HR management'} system
                </p>
            </div>

            {/* KPI Cards */}
            <div className={`grid ${cols} gap-4`}>
                {cards.map((card, i) => (
                    <StatCard key={i} {...card} loading={loading} />
                ))}
            </div>

            {/* Info Sections Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* Today's Birthdays */}
                <InfoSection
                    icon={Cake}
                    title="Today's Birthdays"
                    colorClass="text-pink-500"
                    emptyText={todayBirthdays.length === 0 ? "No birthdays today." : null}
                >
                    {todayBirthdays.length > 0 ? (
                        <div className="overflow-y-auto max-h-58 custom-scrollbar">
                            {todayBirthdays.map((emp, i) => (
                                <PersonRow
                                    key={i}
                                    name={emp.name}
                                    code={emp.employee_code || '—'}
                                    badge="🎂 Birthday"
                                    badgeColor="bg-pink-100 text-pink-600"
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-(--text-muted) py-3 text-center italic">No birthdays today.</p>
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
                        <div className="overflow-y-auto max-h-58 custom-scrollbar">
                            {todayAnniversaries.map((emp, i) => (
                                <PersonRow
                                    key={i}
                                    name={emp.name}
                                    code={emp.employee_code || '—'}
                                    badge={`${emp.years} ${emp.years === 1 ? 'Year' : 'Years'}`}
                                    badgeColor="bg-amber-100 text-amber-600"
                                    detail={`Joined ${fmtDate(emp.joining_date)}`}
                                />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-(--text-muted) py-3 text-center italic">No anniversaries today.</p>
                    )}
                </InfoSection>

                {/* Immigration Expiring */}
                <InfoSection
                    icon={Plane}
                    title="Immigration Expiring (180 days)"
                    colorClass="text-red-500"
                    emptyText={null}
                >
                    {immigrationExpiring.length > 0 ? (
                        <div className="overflow-y-auto max-h-58 custom-scrollbar">
                            {immigrationExpiring.map((emp, i) => {
                                const urgent = emp.days_remaining <= 30;
                                const warn   = emp.days_remaining <= 90;
                                const badgeColor = urgent ? 'bg-red-100 text-red-600' : warn ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-700';
                                return (
                                    <PersonRow
                                        key={i}
                                        name={emp.name}
                                        code={emp.employee_code || '—'}
                                        badge={emp.status_name}
                                        badgeColor={badgeColor}
                                        detail={`Expires ${emp.days_remaining}d left`}
                                        detailColor={urgent ? 'text-red-500' : warn ? 'text-orange-500' : 'text-(--text-muted)'}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-sm text-(--text-muted) py-3 text-center italic">No immigration records expiring within 180 days.</p>
                    )}
                </InfoSection>

            </div>
        </div>
    );
};

export default ManagementDashboard;
