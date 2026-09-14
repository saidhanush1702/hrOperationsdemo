import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Briefcase, Calendar, DollarSign, Search, ChevronDown, ChevronUp, Clock, Building } from 'lucide-react';
import { portalAPI } from '../../../api/apiService';
import { fmtDate } from '../../../utils/dateUtils';
import { rowOpen } from '../../../utils/rowClick';

const StatusBadge = ({ status }) => {
    const isActive = status === 'Active';
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${
            isActive
                ? 'bg-green-500/10 text-green-600 border-green-500/20'
                : 'bg-(--text-muted)/10 text-(--text-muted) border-(--text-muted)/20'
        }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-(--text-muted)'}`} />
            {status}
        </span>
    );
};

const PayTypeBadge = ({ type }) => {
    const styles = {
        C2C:   'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
        W2:    'bg-blue-500/10 text-blue-500 border-blue-500/20',
        '1099':'bg-amber-500/10 text-amber-500 border-amber-500/20',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${styles[type] || 'bg-(--bg-app) text-(--text-muted) border-(--border-subtle)'}`}>
            {type}
        </span>
    );
};

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateDisplay = (d) => d ? fmtDate(d) : 'Ongoing';

const PlacementCard = ({ placement }) => {
    const [expanded, setExpanded] = useState(false);

    const effectivePay = placement.current_pay_rate_override != null
        ? (placement.pay_rate_type === 'Percentage'
            ? parseFloat(placement.bill_rate) * (parseFloat(placement.current_pay_rate_override) / 100)
            : parseFloat(placement.current_pay_rate_override))
        : parseFloat(placement.pay_rate);

    return (
        <div className={`bg-(--bg-surface) border rounded-2xl shadow-sm overflow-hidden transition-all duration-200 ${
            placement.status === 'Active' ? 'border-(--brand-primary)/30' : 'border-(--border-subtle)'
        }`}>
            {/* Card Header */}
            <div className="px-5 py-4 cursor-pointer"
                onClick={rowOpen(() => setExpanded(e => !e))}
                title={expanded ? 'Hide Details' : 'View Details'}>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                            placement.status === 'Active'
                                ? 'bg-(--brand-primary)/10 text-(--brand-primary)'
                                : 'bg-(--text-muted)/10 text-(--text-muted)'
                        }`}>
                            <Briefcase size={18} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-bold text-(--text-main) tracking-tight">
                                    {placement.job_title}
                                </h3>
                                <PayTypeBadge type={placement.pay_type_name} />
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                                <Building size={11} className="text-(--text-muted)" />
                                <p className="text-[10px] text-(--text-muted) font-bold tracking-wider truncate">
                                    {placement.client_name}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge status={placement.status} />
                        <button
                            onClick={() => setExpanded(e => !e)}
                            className="p-1.5 rounded-lg hover:bg-(--bg-app) transition-colors text-(--text-muted) outline-none"
                        >
                            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                    </div>
                </div>

                {/* Quick Stats Row */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-(--bg-app) rounded-xl px-3 py-2.5">
                        <p className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest">Placement ID</p>
                        <p className="text-xs font-bold text-(--text-main) font-mono mt-0.5 truncate">{placement.placement_code}</p>
                    </div>
                    <div className="bg-(--bg-app) rounded-xl px-3 py-2.5">
                        <p className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest">Pay Rate</p>
                        <p className="text-xs font-bold text-blue-500 mt-0.5">{fmt$(effectivePay)}<span className="text-[9px] text-(--text-muted) font-normal">/hr</span></p>
                    </div>
                    <div className="bg-(--bg-app) rounded-xl px-3 py-2.5">
                        <p className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest">Start Date</p>
                        <p className="text-xs font-bold text-(--text-main) mt-0.5">{fmtDateDisplay(placement.start_date)}</p>
                    </div>
                    <div className="bg-(--bg-app) rounded-xl px-3 py-2.5">
                        <p className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest">End Date</p>
                        <p className="text-xs font-bold text-(--text-main) mt-0.5">{fmtDateDisplay(placement.end_date)}</p>
                    </div>
                </div>
            </div>

            {/* Expanded Details */}
            {expanded && (
                <div className="border-t border-(--border-subtle) px-5 py-4 bg-(--bg-app)/40">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">

                        <div>
                            <p className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest mb-1">Pay Rate</p>
                            <p className="font-bold text-blue-500">
                                {fmt$(effectivePay)}/hr
                                {placement.pay_rate_type === 'Percentage' && (
                                    <span className="ml-1 text-(--text-muted) font-normal">({parseFloat(placement.current_pay_rate_override || placement.pay_rate)}%)</span>
                                )}
                            </p>
                        </div>

                        {placement.has_timesheets === 1 && (
                            <div>
                                <p className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest mb-1">Timesheet Cycle</p>
                                <div className="flex items-center gap-1.5">
                                    <Clock size={12} className="text-orange-500" />
                                    <p className="font-bold text-orange-500">{placement.timesheet_cycle_name || 'Weekly'}</p>
                                </div>
                            </div>
                        )}

                        {placement.status === 'Completed' && (
                            <div className="sm:col-span-2 lg:col-span-3">
                                <p className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest mb-1">Status</p>
                                <p className="font-bold text-(--text-muted)">Completed on {fmtDateDisplay(placement.end_date)}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const EmployeePlacements = () => {
    const [searchParams] = useSearchParams();
    const [placements, setPlacements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState(() => {
        const p = searchParams.get('filter');
        return p === 'ACTIVE' || p === 'COMPLETED' ? p : 'ALL';
    });

    useEffect(() => {
        portalAPI.getMyPlacements()
            .then(res => setPlacements(res.data))
            .catch(err => console.error('Placements fetch error:', err))
            .finally(() => setLoading(false));
    }, []);

    const filtered = placements.filter(p => {
        if (filterStatus === 'ACTIVE'    && p.status !== 'Active')    return false;
        if (filterStatus === 'COMPLETED' && p.status !== 'Completed') return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            return `${p.job_title} ${p.client_name} ${p.placement_code}`.toLowerCase().includes(q);
        }
        return true;
    });

    const counts = {
        ALL:       placements.length,
        ACTIVE:    placements.filter(p => p.status === 'Active').length,
        COMPLETED: placements.filter(p => p.status === 'Completed').length,
    };

    return (
        <div className="-mt-4 lg:-mt-8 -mx-4 lg:-mx-8 -mb-4 lg:-mb-8 flex flex-col h-[calc(100vh-4rem)] gap-2 animate-in fade-in duration-500">

            {/* Header */}
            <div className="bg-(--bg-surface) px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-(--border-subtle) shadow-sm flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 bg-(--brand-primary)/10 rounded-xl flex items-center justify-center text-(--brand-primary)">
                        <Briefcase size={18} />
                    </div>
                    <div>
                        <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-(--text-main) leading-none">
                            My Placements
                        </h1>
                        <p className="hidden sm:block text-[10px] text-(--text-muted) mt-1 uppercase tracking-widest font-bold">
                            Your job assignments and pay details
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold">
                    <span className="px-3 py-1.5 bg-green-500/10 text-green-600 rounded-lg border border-green-500/20">
                        {counts.ACTIVE} Active
                    </span>
                    <span className="px-3 py-1.5 bg-(--text-muted)/10 text-(--text-muted) rounded-lg border border-(--border-subtle)">
                        {counts.COMPLETED} Completed
                    </span>
                </div>
            </div>

            {/* Filter + Content Card */}
            <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden">

                {/* Filters */}
                <div className="px-4 sm:px-6 py-3 border-b border-(--border-subtle) bg-(--bg-app)/30 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 shrink-0">
                    {/* Status Tabs */}
                    <div className="flex p-1 bg-(--bg-surface) rounded-xl border border-(--border-subtle) w-full sm:w-auto shadow-sm">
                        {['ALL', 'ACTIVE', 'COMPLETED'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setFilterStatus(tab)}
                                className={`flex-1 sm:flex-none whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all outline-none flex items-center gap-1.5 justify-center ${
                                    filterStatus === tab
                                        ? 'bg-(--brand-primary)/10 text-(--brand-primary)'
                                        : 'text-(--text-muted) hover:text-(--text-main)'
                                }`}
                            >
                                {tab}
                                <span className={`px-1.5 py-0.5 rounded-md text-[9px] leading-none ${
                                    filterStatus === tab
                                        ? 'bg-(--brand-primary) text-(--brand-primary-text)'
                                        : 'bg-(--border-subtle) text-(--text-muted)'
                                }`}>{counts[tab]}</span>
                            </button>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative w-full sm:w-64">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                        <input
                            type="text"
                            placeholder="Search by title or client..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl text-xs font-bold focus:border-(--brand-primary) outline-none shadow-sm"
                        />
                    </div>
                </div>

                {/* Cards */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
                    {loading ? (
                        <div className="flex items-center justify-center h-48 text-(--text-muted) text-xs font-bold uppercase tracking-widest">
                            Loading placements...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-(--text-muted) gap-3">
                            <Briefcase size={32} className="opacity-20" />
                            <p className="text-xs font-bold uppercase tracking-widest">
                                {placements.length === 0 ? 'No placements found.' : 'No results match your filters.'}
                            </p>
                        </div>
                    ) : (
                        filtered.map(p => <PlacementCard key={p.id} placement={p} />)
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmployeePlacements;
