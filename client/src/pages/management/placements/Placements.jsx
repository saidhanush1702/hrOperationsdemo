import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
    Briefcase, Search, Plus, X, Download,
    SlidersHorizontal, ChevronDown, User, Building2, CreditCard, Activity,
} from 'lucide-react';
import api from '../../../api/axios';
import { commonAPI, managementAPI } from '../../../api/apiService';
import { exportToExcel } from '../../../utils/exportToExcel';
import { rowOpen } from '../../../utils/rowClick';
import { matchesSearch } from '../../../utils/searchMatch';
import AddPlacementModal from './AddPlacementModal';
import PlacementDetailModal from './PlacementDetailModal';
import { fmtDate } from '../../../utils/dateUtils';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';

// ─── helpers ─────────────────────────────────────────────────────────────────
const getActiveFinalRates = (p) => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Compute effective final bill rate from placement_bill_rates array
    let finalBill = 0;
    if (p.bill_rates && Array.isArray(p.bill_rates) && p.bill_rates.length > 0) {
        const active = p.bill_rates
            .filter(br => br.effective_date && new Date(br.effective_date) <= now)
            .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
        if (active.length > 0) {
            const br = active[0];
            const base = parseFloat(br.bill_rate_value) || 0;
            const disc = parseFloat(br.discount_percentage) || 0;
            finalBill = base - (base * (disc / 100));
        }
    } else {
        finalBill = parseFloat(p.bill_rate) || 0;
    }

    // Compute effective final pay rate from placement_pay_rates array
    let finalPay = parseFloat(p.pay_rate) || 0;
    if (p.pay_rates && Array.isArray(p.pay_rates)) {
        const active = p.pay_rates
            .filter(pr => pr.effective_date && new Date(pr.effective_date) <= now)
            .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
        if (active.length > 0) {
            const val = parseFloat(active[0].pay_rate_value) || 0;
            finalPay = p.pay_rate_type === 'Percentage' ? (finalBill * (val / 100)) : val;
        }
    }

    // Active pay type from placement_type_history — same MAX(start_date) <= today logic
    let payTypeName = p.pay_type_name || '';
    let lcaFlag = false;
    let payoutBasis = 'HOURS';
    let fixedPay = null;
    if (p.placement_types && Array.isArray(p.placement_types) && p.placement_types.length > 0) {
        const active = p.placement_types
            .filter(pt => pt.start_date && pt.start_date <= todayStr)
            .sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
        if (active.length > 0) {
            payTypeName = active[0].pay_type_name || payTypeName;
            lcaFlag     = !!(active[0].run_as_per_lca_wage);
            // payout_basis is authoritative; the legacy flag covers rows saved before it existed.
            payoutBasis = active[0].payout_basis || (lcaFlag ? 'LCA' : 'HOURS');
            fixedPay    = active[0].fixed_pay_per_period != null ? parseFloat(active[0].fixed_pay_per_period) : null;
        }
    }

    return { bill: finalBill.toFixed(2), pay: finalPay.toFixed(2), payTypeName, lcaFlag, payoutBasis, fixedPay };
};

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// status is kept in EMPTY_FILTERS so the drawer seeds it from filterStatus
const EMPTY_FILTERS = { status: 'ALL', payType: 'ALL', employee: 'ALL', client: 'ALL' };

// ─── Filter section header ────────────────────────────────────────────────────
const FilterSection = ({ icon: Icon, title, children }) => (
    <div className="space-y-3">
        <div className="flex items-center gap-2">
            <Icon size={13} className="text-(--brand-primary)" />
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">{title}</h3>
        </div>
        {children}
    </div>
);

// ─── Select inside filter panel ───────────────────────────────────────────────
const FilterSelect = ({ value, onChange, children }) => (
    <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
            className="w-full px-3 pr-8 py-2.5 bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-xl text-xs font-bold focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) outline-none appearance-none cursor-pointer transition-all">
            {children}
        </select>
        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted) pointer-events-none" />
    </div>
);

// ─── Active-filter chip ───────────────────────────────────────────────────────
const FilterChip = ({ label, onRemove }) => (
    <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-(--brand-primary)/10 text-(--brand-primary) border border-(--brand-primary)/25 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap">
        {label}
        <button onClick={onRemove} className="h-3.5 w-3.5 flex items-center justify-center rounded-full hover:bg-(--brand-primary)/20 transition-colors">
            <X size={8} />
        </button>
    </span>
);

// ─── Main component ───────────────────────────────────────────────────────────
const Placements = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [placements, setPlacements] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [lookups, setLookups]       = useState({ payTypes: [] });
    const [activeEmployees, setActiveEmployees] = useState([]);

    const [isAddModalOpen, setIsAddModalOpen]     = useState(false);
    const [selectedPlacement, setSelectedPlacement] = useState(null);

    // status tab
    const [filterStatus, setFilterStatus] = useState(() => {
        const s = new URLSearchParams(location.search).get('status');
        return ['ACTIVE', 'COMPLETED'].includes(s) ? s : 'ALL';
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // drawer filters
    const [applied, setApplied]   = useState(EMPTY_FILTERS);
    const [showPanel, setShowPanel] = useState(false);
    const [pending, setPending]   = useState(EMPTY_FILTERS);

    // ─── data fetch ──────────────────────────────────────────────────────────
    const fetchData = async () => {
        setLoading(true);
        try {
            const [placementsRes, lookupsRes, employeesRes] = await Promise.all([
                api.get('/api/management/placements'),
                commonAPI.getLookups(),
                managementAPI.getEmployees(),
            ]);
            setPlacements(placementsRes.data);
            if (lookupsRes.data) setLookups(lookupsRes.data);
            if (employeesRes.data) {
                // active employees only for the dropdown
                const active = employeesRes.data
                    .filter(e => e.role === 'EMPLOYEE' && (e.is_active === 1 || e.is_active === true))
                    .map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                setActiveEmployees(active);
            }
        } catch (err) {
            console.error('Data fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);
    useEffect(() => { setCurrentPage(1); }, [filterStatus, searchQuery, applied]);

    // Deep link from the Placement History panels in the Workforce and Clients detail
    // modals: ?placementId=<id> opens that placement's modal as soon as the list has
    // loaded. The param is stripped afterwards with replace:true so the modal does not
    // reopen on a back navigation, and so a refresh does not resurrect it.
    //
    // Runs only once the fetch has finished, because the row has to exist in state
    // before it can be selected — the modal takes the whole placement object, not an id.
    useEffect(() => {
        if (loading) return;
        const wanted = new URLSearchParams(location.search).get('placementId');
        if (!wanted) return;

        const match = placements.find(p => String(p.id) === String(wanted));
        if (match) setSelectedPlacement(match);

        // Clear it either way: an id that matches nothing (deleted placement, wrong
        // org) should not sit in the URL waiting to fire again.
        const params = new URLSearchParams(location.search);
        params.delete('placementId');
        const qs = params.toString();
        navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true });
    }, [loading, placements, location.search, location.pathname, navigate]);

    // ─── unique clients from placement data ───────────────────────────────────
    const uniqueClients = useMemo(() => {
        const map = new Map();
        placements.forEach(p => {
            if (p.client_id && !map.has(p.client_id)) map.set(p.client_id, p.client_name);
        });
        return [...map.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [placements]);

    // ─── filter logic ─────────────────────────────────────────────────────────
    const filteredPlacements = useMemo(() => placements.filter(p => {
        if (filterStatus === 'ACTIVE'    && p.status !== 'Active')    return false;
        if (filterStatus === 'COMPLETED' && p.status !== 'Completed') return false;
        if (applied.payType  !== 'ALL' && String(p.pay_type_id)  !== String(applied.payType))  return false;
        if (applied.employee !== 'ALL' && String(p.employee_id)  !== String(applied.employee)) return false;
        if (applied.client   !== 'ALL' && String(p.client_id)    !== String(applied.client))   return false;
        if (!matchesSearch(searchQuery,
            p.first_name, p.last_name, p.employee_code,
            p.placement_code, p.client_name, p.job_title, p.pay_type_name)) return false;
        return true;
    }), [placements, filterStatus, applied, searchQuery]);

    const tabCounts = useMemo(() => ({
        ALL:       placements.length,
        ACTIVE:    placements.filter(p => p.status === 'Active').length,
        COMPLETED: placements.filter(p => p.status === 'Completed').length,
    }), [placements]);

    const paginatedPlacements = filteredPlacements.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    // ─── panel actions ────────────────────────────────────────────────────────
    const openPanel  = () => { setPending({ ...applied, status: filterStatus }); setShowPanel(true); };
    const closePanel = () => setShowPanel(false);
    const applyFilters = () => {
        const { status, ...rest } = pending;
        setFilterStatus(status || 'ALL');
        setApplied(rest);
        setShowPanel(false);
    };
    const resetPending  = () => setPending({ ...EMPTY_FILTERS, status: filterStatus });
    const removeApplied = (key) => setApplied(prev => ({ ...prev, [key]: 'ALL' }));
    const clearAll      = () => { setApplied(EMPTY_FILTERS); };

    // activeCount counts only drawer-managed filters (not status — that has visible tabs)
    const activeCount = Object.entries(applied)
        .filter(([k, v]) => k !== 'status' && v !== 'ALL').length;

    // chip labels
    const payTypeLabel = applied.payType  !== 'ALL' ? (lookups.payTypes?.find(pt => String(pt.id) === String(applied.payType))?.name || applied.payType) : null;
    const empLabel     = applied.employee !== 'ALL' ? (activeEmployees.find(e => String(e.id) === String(applied.employee))?.name || '—') : null;
    const clientLabel  = applied.client   !== 'ALL' ? (uniqueClients.find(c => String(c.id) === String(applied.client))?.name || '—') : null;

    // ─── export ───────────────────────────────────────────────────────────────
    const handleExport = () => {
        const headers = [
            'Employee', 'Direct Client', 'Placement Type', 'Payout Basis', 'Fixed Pay / Period',
            'Job Title', 'Placement Code', 'Start Date', 'End Date',
            'Standard Bill Rate', 'Active Discounts', 'Active Final Bill Rate',
            'Pay Rate', 'Active Final Pay Rate',
            'First Timesheet Start Date', 'Timesheet Cycle', 'Week Start Day',
        ];
        const keys = [
            'employee', 'direct_client', 'placement_type', 'payout_basis', 'fixed_pay_per_period',
            'job_title', 'placement_code', 'start_date', 'end_date',
            'standard_bill_rate', 'active_discounts', 'active_final_bill_rate',
            'pay_rate', 'active_final_pay_rate',
            'first_timesheet_start_date', 'timesheet_cycle', 'week_start_day',
        ];
        const rows = filteredPlacements.map(p => {
            const finalRates = getActiveFinalRates(p);
            const activeDiscount = (() => {
                if (!p.discounts || !Array.isArray(p.discounts) || p.discounts.length === 0) return 'None';
                const active = p.discounts
                    .filter(d => d.effective_date && new Date(d.effective_date) <= new Date())
                    .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
                if (!active.length) return 'None';
                const d = active[0];
                return `${parseFloat(d.discount_value).toFixed(1)}%${d.reason ? ` (${d.reason})` : ''}`;
            })();
            return {
                employee:                   `${p.first_name} ${p.last_name}`,
                direct_client:              p.client_name || '',
                placement_type:             p.pay_type_name || '',
                payout_basis:               finalRates.payoutBasis === 'LCA'   ? 'As per LCA Wage'
                                          : finalRates.payoutBasis === 'FIXED' ? 'Fixed Pay (C2C)'
                                          :                                      'Hourly',
                fixed_pay_per_period:       finalRates.payoutBasis === 'FIXED' && finalRates.fixedPay != null
                                              ? finalRates.fixedPay.toFixed(2) : '',
                job_title:                  p.job_title || '',
                placement_code:             p.placement_code || '',
                start_date:                 fmtDate(p.start_date),
                end_date:                   p.end_date ? fmtDate(p.end_date) : 'Ongoing',
                standard_bill_rate:         parseFloat(p.bill_rate || 0).toFixed(2),
                active_discounts:           activeDiscount,
                active_final_bill_rate:     finalRates.bill,
                pay_rate:                   parseFloat(p.pay_rate || 0).toFixed(2),
                active_final_pay_rate:      finalRates.pay,
                first_timesheet_start_date: p.timesheet_start_date ? fmtDate(p.timesheet_start_date) : '',
                timesheet_cycle:            p.timesheet_cycle_name || '',
                week_start_day:             p.week_start_day || '',
            };
        });
        exportToExcel(rows, headers, keys, 'placements');
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="-mt-4 lg:-mt-8 -mx-4 lg:-mx-8 flex flex-col gap-2 animate-in fade-in duration-500">
            <div className="flex flex-col h-[calc(100vh-4rem)] gap-2">

                {/* HEADER */}
                <div className="bg-(--bg-surface) px-4 sm:px-6 py-3 sm:py-3.5 rounded-2xl border border-(--border-subtle) shadow-sm flex justify-between items-center shrink-0 transition-colors duration-300">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="h-9 w-9 sm:h-10 sm:w-10 bg-(--brand-primary)/10 rounded-xl flex items-center justify-center text-(--brand-primary) transition-colors shrink-0">
                            <Briefcase size={18} className="sm:w-5 sm:h-5" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-(--text-main) leading-none truncate">Placements</h1>
                            <p className="hidden sm:block text-[10px] text-(--text-muted) mt-1 uppercase tracking-widest font-bold truncate">Manage employee jobs, billing, and clients</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleExport} title="Export to Excel"
                            className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 w-9 h-9 sm:w-auto sm:px-4 sm:py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2 shrink-0 outline-none">
                            <Download size={15} /><span className="hidden sm:inline">Export</span>
                        </button>
                        <button onClick={() => setIsAddModalOpen(true)}
                            className="bg-(--brand-primary) text-(--brand-primary-text) w-9 h-9 sm:w-auto sm:px-5 sm:py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 shrink-0 outline-none"
                            title="New Placement">
                            <Plus size={16} /><span className="hidden sm:inline">New Placement</span>
                        </button>
                    </div>
                </div>

                {/* MAIN CARD */}
                <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden transition-colors duration-300">

                    {/* FILTER BAR */}
                    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 px-3 sm:px-5 py-3 border-b border-(--border-subtle) bg-(--bg-app)/30 shrink-0">
                        {/* Status tabs */}
                        <div className="flex p-1 bg-(--bg-surface) rounded-xl border border-(--border-subtle) w-full sm:w-auto shadow-sm overflow-x-auto hide-scrollbar shrink-0">
                            {(['ALL', 'ACTIVE', 'COMPLETED']).map(tab => (
                                <button key={tab} onClick={() => setFilterStatus(tab)}
                                    className={`flex-1 sm:flex-none whitespace-nowrap px-3 sm:px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 outline-none ${filterStatus === tab ? 'bg-(--brand-primary)/10 text-(--brand-primary)' : 'text-(--text-muted) hover:text-(--text-main)'}`}>
                                    {tab}
                                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] leading-none ${filterStatus === tab ? 'bg-(--brand-primary) text-(--brand-primary-text)' : 'bg-(--border-subtle) text-(--text-muted)'}`}>
                                        {tabCounts[tab]}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Search + Filters button */}
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="relative w-full sm:w-48 lg:w-60 group">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted) group-focus-within:text-(--brand-primary) transition-colors pointer-events-none">
                                    <Search size={13} />
                                </div>
                                <input type="text" placeholder="Search name, employee code or placement ID…" value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-8 pr-3 py-2 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl text-xs font-bold focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) outline-none shadow-sm transition-all" />
                            </div>
                            <button onClick={openPanel}
                                className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all outline-none shrink-0 shadow-sm ${activeCount > 0 ? 'bg-(--brand-primary) text-(--brand-primary-text) border-(--brand-primary) hover:opacity-90' : 'bg-(--bg-surface) text-(--text-main) border-(--border-subtle) hover:border-(--brand-primary) hover:text-(--brand-primary)'}`}>
                                <SlidersHorizontal size={13} />
                                {/* <span className="hidden sm:inline">Filters</span> */}
                                {activeCount > 0 && (
                                    <span className="flex items-center justify-center h-4 w-4 rounded-full text-[9px] font-bold leading-none bg-white/20 text-(--brand-primary-text)">
                                        {activeCount}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* ACTIVE FILTER CHIPS */}
                    {activeCount > 0 && (
                        <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-2.5 border-b border-(--border-subtle) bg-(--brand-primary)/3">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-(--text-muted) mr-1">Active:</span>
                            {applied.payType !== 'ALL' && payTypeLabel && (
                                <FilterChip label={`Pay: ${payTypeLabel}`} onRemove={() => removeApplied('payType')} />
                            )}
                            {applied.employee !== 'ALL' && empLabel && (
                                <FilterChip label={empLabel} onRemove={() => removeApplied('employee')} />
                            )}
                            {applied.client !== 'ALL' && clientLabel && (
                                <FilterChip label={clientLabel} onRemove={() => removeApplied('client')} />
                            )}
                            <button onClick={clearAll}
                                className="text-[9px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50 ml-1">
                                Clear All
                            </button>
                        </div>
                    )}

                    {/* TABLE */}
                    <div className="flex-1 overflow-y-auto overflow-x-hidden">
                        <table className="w-full text-left table-fixed">
                            <thead className="bg-(--bg-app) text-[9px] sm:text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) sticky top-0 z-10 transition-colors duration-300">
                                <tr>
                                    <th className="px-4 sm:px-6 py-3 sm:py-3.5 w-[38%] sm:w-[25%] lg:w-[20%]">Employee</th>
                                    <th className="px-4 sm:px-6 py-3 sm:py-3.5 w-[38%] sm:w-[25%] lg:w-[20%]">Client</th>
                                    <th className="hidden sm:table-cell px-2 sm:px-6 py-3 sm:py-3.5 sm:w-[25%] lg:w-[25%]">Financials</th>
                                    <th className="hidden md:table-cell px-4 sm:px-6 py-3 sm:py-3.5 md:w-[15%]">Duration</th>
                                    <th className="hidden sm:table-cell px-4 sm:px-6 py-3 sm:py-3.5 sm:w-[15%] text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-(--border-subtle)">
                                {loading ? (
                                    <tr>
                                        <td colSpan="5" className="text-center py-10 text-xs text-(--text-muted)">Loading placements…</td>
                                    </tr>
                                ) : paginatedPlacements.length > 0 ? (
                                    paginatedPlacements.map(p => {
                                        const isActive    = p.status === 'Active';
                                        const finalRates  = getActiveFinalRates(p);
                                        return (
                                            <tr key={p.id}
                                                onClick={rowOpen(() => setSelectedPlacement(p))}
                                                title="Manage Placement"
                                                className="hover:bg-(--bg-app) transition-colors group cursor-pointer">
                                                <td className="px-4 sm:px-6 py-3 sm:py-3.5 overflow-hidden">
                                                    <div className="flex items-center gap-2 sm:gap-3">
                                                        <div className="relative shrink-0">
                                                            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-(--bg-surface) border border-(--border-subtle) flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-(--text-muted) uppercase shadow-sm">
                                                                {p.first_name?.[0] || '?'}{p.last_name?.[0] || '?'}
                                                            </div>
                                                            <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full border-2 border-(--bg-surface) ${isActive ? 'bg-green-500' : 'bg-(--text-muted)'}`} title={p.status} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-xs sm:text-sm font-bold tracking-tight leading-none text-(--text-main) truncate">{p.first_name} {p.last_name}</p>
                                                            <p className="hidden sm:block text-[9px] sm:text-[10px] text-(--text-muted) font-mono tracking-tighter mt-1 truncate">{p.job_title}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 sm:px-6 py-3 sm:py-3.5 overflow-hidden">
                                                    <p className="font-bold text-(--text-main) text-xs tracking-tight truncate">{p.client_name}</p>
                                                </td>
                                                <td className="hidden sm:table-cell px-2 sm:px-6 py-3 sm:py-3.5 overflow-hidden">
                                                    <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest space-y-1">
                                                        <p className="text-green-500 truncate">BILL: {fmt$(finalRates.bill)} / {p.bill_frequency_name?.[0] || <span className="normal-case">Hr</span>}</p>
                                                        <p className="text-blue-500 truncate">PAY ({finalRates.payTypeName}{finalRates.payTypeName === 'W2' && finalRates.payoutBasis === 'LCA' ? ' · LCA' : ''}{finalRates.payTypeName === 'C2C' && finalRates.payoutBasis === 'FIXED' ? ` · FIXED ${fmt$(finalRates.fixedPay)}/period` : ''}): {fmt$(finalRates.pay)} / {p.pay_frequency_name?.[0] || <span className="normal-case">Hr</span>}</p>
                                                    </div>
                                                </td>
                                                <td className="hidden md:table-cell px-4 sm:px-6 py-3 sm:py-3.5 overflow-hidden">
                                                    <div className="text-[9px] sm:text-[10px] font-bold uppercase text-(--text-muted) tracking-wider">
                                                        <p>Start: {fmtDate(p.start_date)}</p>
                                                        <p className="mt-1">End: {p.end_date ? fmtDate(p.end_date) : 'Ongoing'}</p>
                                                    </div>
                                                </td>
                                                {/* Hidden on mobile — the row itself opens this placement. */}
                                                <td className="hidden sm:table-cell px-4 sm:px-6 py-3 sm:py-3.5 text-right">
                                                    <button onClick={() => setSelectedPlacement(p)} title="Manage Placement"
                                                        className="inline-flex items-center justify-center px-4 py-2 text-[10px] font-bold uppercase tracking-widest bg-(--bg-surface) text-(--text-main) hover:bg-(--brand-primary) hover:text-(--brand-primary-text) hover:border-(--brand-primary) rounded-lg border border-(--border-subtle) transition-all active:scale-95 shadow-sm outline-none">
                                                        View
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="5" className="px-4 sm:px-6 py-12 text-center text-(--text-muted) text-xs font-bold uppercase tracking-widest">
                                            No placements found matching your criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <Pagination currentPage={currentPage} totalItems={filteredPlacements.length} onPageChange={setCurrentPage} />
                </div>
            </div>

            <AuditLogPanel module="placements" />
            <AddPlacementModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onRefresh={fetchData} />
            {selectedPlacement && (
                <PlacementDetailModal placement={selectedPlacement} onClose={() => setSelectedPlacement(null)} onRefresh={fetchData} />
            )}

            {/* ── FILTER DRAWER ──────────────────────────────────────────────── */}
            {showPanel && createPortal(
                <>
                    <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={closePanel} />
                    <div className="fixed right-0 top-0 h-screen w-80 bg-(--bg-surface) z-50 flex flex-col shadow-2xl border-l border-(--border-subtle) animate-in slide-in-from-right duration-250">

                        {/* Header */}
                        <div className="px-5 py-4 border-b border-(--border-subtle) bg-(--bg-app) flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="h-7 w-7 bg-(--brand-primary)/10 rounded-lg flex items-center justify-center text-(--brand-primary)">
                                    <SlidersHorizontal size={14} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold uppercase tracking-widest text-(--text-main) leading-none">Filters</h2>
                                    <p className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest mt-0.5">Placements</p>
                                </div>
                                {Object.values(pending).some(v => v !== 'ALL') && (
                                    <span className="bg-(--brand-primary) text-(--brand-primary-text) text-[10px] font-bold px-2 py-0.5 rounded-full leading-none">
                                        {Object.values(pending).filter(v => v !== 'ALL').length}
                                    </span>
                                )}
                            </div>
                            <button onClick={closePanel} className="text-(--text-muted) hover:text-(--text-main) transition-colors outline-none">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-6">

                            {/* Placement Status */}
                            <FilterSection icon={Activity} title="Placement Status">
                                <div className="flex flex-col gap-2.5">
                                    {[
                                        { value: 'ALL',       label: 'All Placements' },
                                        { value: 'ACTIVE',    label: 'Active Only' },
                                        { value: 'COMPLETED', label: 'Completed Only' },
                                    ].map(opt => (
                                        <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group">
                                            <div onClick={() => setPending(p => ({ ...p, status: opt.value }))}
                                                className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all cursor-pointer ${pending.status === opt.value ? 'border-(--brand-primary) bg-(--brand-primary)' : 'border-(--border-subtle) bg-(--bg-app) group-hover:border-(--brand-primary)/50'}`}>
                                                {pending.status === opt.value && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                                            </div>
                                            <span onClick={() => setPending(p => ({ ...p, status: opt.value }))}
                                                className={`text-xs font-bold uppercase tracking-wider cursor-pointer transition-colors ${pending.status === opt.value ? 'text-(--brand-primary)' : 'text-(--text-muted) group-hover:text-(--text-main)'}`}>
                                                {opt.label}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </FilterSection>

                            <div className="border-t border-(--border-subtle)" />

                            {/* Pay Type — from lookup */}
                            <FilterSection icon={CreditCard} title="Pay Type">
                                <FilterSelect value={pending.payType} onChange={v => setPending(p => ({ ...p, payType: v }))}>
                                    <option value="ALL">All Pay Types</option>
                                    {(lookups.payTypes || []).map(pt => (
                                        <option key={pt.id} value={pt.id}>{pt.name}</option>
                                    ))}
                                </FilterSelect>
                            </FilterSection>

                            <div className="border-t border-(--border-subtle)" />

                            {/* Employee — active only */}
                            <FilterSection icon={User} title="Employee">
                                <FilterSelect value={pending.employee} onChange={v => setPending(p => ({ ...p, employee: v }))}>
                                    <option value="ALL">All Employees</option>
                                    {activeEmployees.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                    ))}
                                </FilterSelect>
                            </FilterSection>

                            <div className="border-t border-(--border-subtle)" />

                            {/* Client */}
                            <FilterSection icon={Building2} title="Client">
                                <FilterSelect value={pending.client} onChange={v => setPending(p => ({ ...p, client: v }))}>
                                    <option value="ALL">All Clients</option>
                                    {uniqueClients.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </FilterSelect>
                            </FilterSection>

                            {/* Preview */}
                            {Object.values(pending).some(v => v !== 'ALL') && (
                                <div className="bg-(--brand-primary)/5 border border-(--brand-primary)/15 rounded-xl p-3 space-y-1.5">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--brand-primary) mb-2">Filter Preview</p>
                                    {pending.status && pending.status !== 'ALL' && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-(--text-muted) font-bold">Status</span>
                                            <span className="text-[10px] font-bold text-(--text-main)">{pending.status === 'ACTIVE' ? 'Active' : 'Completed'}</span>
                                        </div>
                                    )}
                                    {pending.payType !== 'ALL' && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-(--text-muted) font-bold">Pay Type</span>
                                            <span className="text-[10px] font-bold text-(--text-main)">{lookups.payTypes?.find(pt => String(pt.id) === String(pending.payType))?.name || '—'}</span>
                                        </div>
                                    )}
                                    {pending.employee !== 'ALL' && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-(--text-muted) font-bold">Employee</span>
                                            <span className="text-[10px] font-bold text-(--text-main) truncate ml-4 text-right">{activeEmployees.find(e => String(e.id) === String(pending.employee))?.name || '—'}</span>
                                        </div>
                                    )}
                                    {pending.client !== 'ALL' && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-(--text-muted) font-bold">Client</span>
                                            <span className="text-[10px] font-bold text-(--text-main) truncate ml-4 text-right">{uniqueClients.find(c => String(c.id) === String(pending.client))?.name || '—'}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-5 py-4 border-t border-(--border-subtle) bg-(--bg-app) flex gap-3 shrink-0">
                            <button onClick={resetPending}
                                className="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest border border-(--border-subtle) rounded-xl text-(--text-main) bg-(--bg-surface) hover:bg-(--bg-app) transition-all outline-none">
                                Reset All
                            </button>
                            <button onClick={applyFilters}
                                className="flex-1 py-2.5 text-[10px] font-bold uppercase tracking-widest bg-(--brand-primary) text-(--brand-primary-text) rounded-xl hover:opacity-90 transition-all shadow-sm outline-none active:scale-95">
                                Apply Filters
                            </button>
                        </div>
                    </div>
                </>,
                document.body
            )}
        </div>
    );
};

export default Placements;
