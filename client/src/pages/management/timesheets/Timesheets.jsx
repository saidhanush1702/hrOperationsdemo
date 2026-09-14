import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import {
    Clock, Search, AlertCircle, XCircle, CheckCircle, Plus, Download, RefreshCw,
    SlidersHorizontal, X, ChevronDown, User, Building2, CreditCard, Trash2, Layers, CalendarRange,
} from 'lucide-react';
import { timesheetAPI, commonAPI } from '../../../api/apiService';
import ReviewTimesheetModal from './ReviewTimesheetModal';
import ManualTimesheetModal from './ManualTimesheetModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import { fmtDate, isBeforeEasternToday, toDay, formatRangeLabel } from '../../../utils/dateUtils';
import { rowOpen } from '../../../utils/rowClick';
import { matchesSearch } from '../../../utils/searchMatch';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import DateRangeFilter from '../../../components/ui/DateRangeFilter';
import TableSkeleton from '../../../components/ui/TableSkeleton';
import { exportToExcel } from '../../../utils/exportToExcel';

// ─── constants ────────────────────────────────────────────────────────────────
const TABS = [
    { key: 'ALL',              label: 'All' },
    { key: 'NOT_SUBMITTED',    label: 'Not Submitted' },
    { key: 'PENDING_APPROVAL', label: 'Pending' },
    { key: 'APPROVED',         label: 'Approved' },
    { key: 'REJECTED',         label: 'Rejected' },
    { key: 'PAST_DUE',         label: 'Past Due' },
];

const EMPTY_FILTERS = { payType: 'ALL', employee: 'ALL', client: 'ALL', dateFrom: '', dateTo: '' };

// Dropdown filters count when set to something other than ALL; the date range
// counts as a single filter no matter which of its two bounds is filled in.
const countActive = (f) =>
    ['payType', 'employee', 'client'].filter(k => f[k] !== 'ALL').length + ((f.dateFrom || f.dateTo) ? 1 : 0);

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
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            className="w-full px-3 pr-8 py-2.5 bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-xl text-xs font-bold focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) outline-none appearance-none cursor-pointer transition-all"
        >
            {children}
        </select>
        <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted) pointer-events-none" />
    </div>
);

// ─── Active-filter chip ───────────────────────────────────────────────────────
const FilterChip = ({ label, onRemove }) => (
    <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 bg-(--brand-primary)/10 text-(--brand-primary) border border-(--brand-primary)/25 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap">
        {label}
        <button
            onClick={onRemove}
            className="h-3.5 w-3.5 flex items-center justify-center rounded-full hover:bg-(--brand-primary)/20 transition-colors"
        >
            <X size={8} />
        </button>
    </span>
);

// ─── Main component ───────────────────────────────────────────────────────────
const Timesheets = () => {
    const location = useLocation();
    const [timesheets, setTimesheets]   = useState([]);
    const [lookups, setLookups]         = useState({ payTypes: [] });
    const [loading, setLoading]         = useState(true);
    const [generating, setGenerating]   = useState(false);
    const [selectedTimesheet, setSelectedTimesheet] = useState(null);
    const [showManualModal, setShowManualModal]     = useState(false);

    const isOrgAdmin = localStorage.getItem('userRole') === 'ORG_ADMIN';
    const [filterTab, setFilterTab] = useState(() => {
        const tab = new URLSearchParams(location.search).get('tab');
        return TABS.some(t => t.key === tab) ? tab : 'ALL';
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // applied filters (committed)
    const [applied, setApplied] = useState(EMPTY_FILTERS);
    // pending filters (in drawer, not yet applied)
    const [showPanel, setShowPanel] = useState(false);
    const [pending, setPending]     = useState(EMPTY_FILTERS);

    // ─── multi-select state ───────────────────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState(new Set());

    // ─── placement scope (server-side filter) ────────────────────────────────
    const [showAllPlacements, setShowAllPlacements] = useState(false);
    const [pendingShowAll, setPendingShowAll]       = useState(false);

    // ─── data fetch ──────────────────────────────────────────────────────────
    const fetchTimesheets = useCallback(async () => {
        setLoading(true);
        try {
            // activeOnly = !showAllPlacements: default fetches active-placement timesheets only
            const res = await timesheetAPI.getManagementTimesheets(!showAllPlacements);
            setTimesheets(res.data);
        } catch (err) {
            console.error('Failed to fetch timesheets:', err);
        } finally {
            setLoading(false);
        }
    }, [showAllPlacements]);

    const handleDelete = async (ts) => {
        if (!window.confirm(`Delete timesheet for ${ts.first_name} ${ts.last_name} (${fmtDate(ts.start_date)} – ${fmtDate(ts.end_date)})? This cannot be undone.`)) return;
        try {
            await timesheetAPI.deleteTimesheet(ts.id);
            fetchTimesheets();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete timesheet.');
        }
    };

    // lookups run once; fetchTimesheets re-runs whenever showAllPlacements changes.
    //
    // Period generation deliberately does NOT happen here. It used to run — and be
    // awaited — on every visit to this tab, so the list could not load until it
    // finished. It is now handled by the daily timesheet cron, with placement
    // create/update still generating inline. Use Sync to force a run in between.
    const didInit = useRef(false);
    useEffect(() => {
        if (!didInit.current) {
            didInit.current = true;
            commonAPI.getLookups().then(res => setLookups(res.data)).catch(() => {});
        }
        fetchTimesheets();
    }, [fetchTimesheets]);

    const handleGenerate = async () => {
        setGenerating(true);
        try {
            await timesheetAPI.generateTimesheets();
            await fetchTimesheets();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to sync timesheets.');
        } finally {
            setGenerating(false);
        }
    };

    // reset page + selection when filters change
    useEffect(() => { setCurrentPage(1); setSelectedIds(new Set()); }, [filterTab, searchQuery, applied, showAllPlacements]);

    // ─── derive unique option lists ───────────────────────────────────────────
    const uniqueEmployees = useMemo(() => {
        const map = new Map();
        timesheets.forEach(t => {
            if (t.employee_id && !map.has(t.employee_id))
                map.set(t.employee_id, `${t.first_name} ${t.last_name}`);
        });
        return [...map.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [timesheets]);

    const uniqueClients = useMemo(() => {
        const map = new Map();
        timesheets.forEach(t => {
            if (t.client_id && !map.has(t.client_id)) map.set(t.client_id, t.client_name);
        });
        return [...map.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [timesheets]);

    // ─── filter logic ─────────────────────────────────────────────────────────
    const isPastDue = (ts) =>
        ts.status_id === 5 || (ts.status_id === 1 && isBeforeEasternToday(ts.end_date));

    const applyNonTabFilters = (list, f) => list.filter(t => {
        if (f.payType   !== 'ALL' && t.pay_type_name             !== f.payType)   return false;
        if (f.employee  !== 'ALL' && String(t.employee_id)       !== String(f.employee))  return false;
        if (f.client    !== 'ALL' && String(t.client_id)         !== String(f.client))    return false;
        // Date range matches on period overlap: keep a timesheet whose start–end
        // window touches the range at any point, not only ones fully inside it.
        if (f.dateFrom && toDay(t.end_date)   <  f.dateFrom) return false;
        if (f.dateTo   && toDay(t.start_date) >  f.dateTo)   return false;
        // t.id is the timesheet's UUID - there is no short human timesheet code,
        // so this at least lets a pasted id find its row.
        if (!matchesSearch(searchQuery,
            t.first_name, t.last_name, t.employee_code,
            t.placement_code, t.client_name, t.id)) return false;
        return true;
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const baseFiltered = useMemo(() => applyNonTabFilters(timesheets, applied), [timesheets, applied, searchQuery]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const tabCounts = useMemo(() => ({
        ALL:              baseFiltered.length,
        NOT_SUBMITTED:    baseFiltered.filter(t => t.status_id === 1 && !isPastDue(t)).length,
        PENDING_APPROVAL: baseFiltered.filter(t => t.status_id === 2).length,
        APPROVED:         baseFiltered.filter(t => t.status_id === 3).length,
        REJECTED:         baseFiltered.filter(t => t.status_id === 4).length,
        PAST_DUE:         baseFiltered.filter(t => isPastDue(t)).length,
    }), [baseFiltered]);

    const filteredTimesheets = useMemo(() => baseFiltered.filter(t => {
        if (filterTab === 'NOT_SUBMITTED'    && (t.status_id !== 1 || isPastDue(t))) return false;
        if (filterTab === 'PENDING_APPROVAL' && t.status_id !== 2) return false;
        if (filterTab === 'APPROVED'         && t.status_id !== 3) return false;
        if (filterTab === 'REJECTED'         && t.status_id !== 4) return false;
        if (filterTab === 'PAST_DUE'         && !isPastDue(t))     return false;
        return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [baseFiltered, filterTab]);

    const paginatedTimesheets = filteredTimesheets.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    // ─── multi-select helpers ─────────────────────────────────────────────────
    const isSelectable = (t) => t.status_id === 1 || t.status_id === 5;
    const selectableOnPage = isOrgAdmin ? paginatedTimesheets.filter(isSelectable) : [];
    const allPageSelected  = selectableOnPage.length > 0 && selectableOnPage.every(t => selectedIds.has(t.id));
    const somePageSelected = selectableOnPage.some(t => selectedIds.has(t.id)) && !allPageSelected;

    const toggleSelect = (id) => setSelectedIds(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
    });

    const toggleSelectAll = () => {
        if (allPageSelected) {
            setSelectedIds(prev => { const n = new Set(prev); selectableOnPage.forEach(t => n.delete(t.id)); return n; });
        } else {
            setSelectedIds(prev => { const n = new Set(prev); selectableOnPage.forEach(t => n.add(t.id)); return n; });
        }
    };

    const handleDeleteSelected = async () => {
        if (!window.confirm(`Delete ${selectedIds.size} selected timesheet(s)? This cannot be undone.`)) return;
        try {
            await Promise.all([...selectedIds].map(id => timesheetAPI.deleteTimesheet(id)));
            setSelectedIds(new Set());
            fetchTimesheets();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete some timesheets.');
            fetchTimesheets();
        }
    };

    // ─── panel actions ────────────────────────────────────────────────────────
    const openPanel    = () => { setPending({ ...applied }); setPendingShowAll(showAllPlacements); setShowPanel(true); };
    const closePanel   = () => setShowPanel(false);
    const applyFilters = () => { setApplied({ ...pending }); setShowAllPlacements(pendingShowAll); setShowPanel(false); };
    const resetPending = () => { setPending(EMPTY_FILTERS); setPendingShowAll(false); };
    const removeApplied = (key) => setApplied(prev => ({ ...prev, [key]: 'ALL' }));
    const removeDateRange = () => setApplied(prev => ({ ...prev, dateFrom: '', dateTo: '' }));
    const clearAll     = () => { setApplied(EMPTY_FILTERS); setShowAllPlacements(false); };

    const activeCount        = countActive(applied) + (showAllPlacements ? 1 : 0);
    const pendingActiveCount = countActive(pending) + (pendingShowAll ? 1 : 0);

    // ─── status helpers ───────────────────────────────────────────────────────
    const getStatusBadge = (ts) => {
        if (ts.status_id === 2) return <span className="text-[9px] bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-orange-500/20">Pending</span>;
        if (ts.status_id === 3) return <span className="text-[9px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-green-500/20 inline-flex items-center gap-1"><CheckCircle size={9} /> Approved</span>;
        if (ts.status_id === 4) return <span className="text-[9px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-red-500/20 inline-flex items-center gap-1"><XCircle size={9} /> Rejected</span>;
        if (isPastDue(ts))      return <span className="text-[9px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-red-500/20 inline-flex items-center gap-1"><AlertCircle size={9} /> Past Due</span>;
        return <span className="text-[9px] bg-(--bg-surface) text-(--text-muted) px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-(--border-subtle)">Not Submitted</span>;
    };

    const getStatusLabel = (ts) => {
        if (ts.status_id === 2) return 'Pending';
        if (ts.status_id === 3) return 'Approved';
        if (ts.status_id === 4) return 'Rejected';
        if (isPastDue(ts))      return 'Past Due';
        return 'Not Submitted';
    };

    // ─── export ───────────────────────────────────────────────────────────────
    const handleExport = () => {
        const headers = ['Employee', 'Client', 'Pay Type', 'Period Start', 'Period End', 'Total Hours', 'Status'];
        const keys    = ['full_name', 'client_name', 'pay_type_name', 'start_date_fmt', 'end_date_fmt', 'total_hours', 'status_label'];
        const rows = filteredTimesheets.map(t => ({
            ...t,
            full_name:      `${t.first_name} ${t.last_name}`,
            start_date_fmt: fmtDate(t.start_date),
            end_date_fmt:   fmtDate(t.end_date),
            status_label:   getStatusLabel(t),
        }));
        exportToExcel(rows, headers, keys, 'timesheets');
    };

    // skeleton column widths — must track the <th> layout below
    const skeletonColumns = [
        ...(isOrgAdmin ? [{ lines: ['14px'] }] : []),
        { lines: ['75%', '55%'] },
        { lines: ['50%'] },
        { lines: ['70%', '70%'] },
        { lines: ['55%'] },
        { lines: ['65%'] },
        { lines: ['60%'], align: 'right' },
    ];

    // chip labels
    const empLabel    = applied.employee !== 'ALL' ? (uniqueEmployees.find(e => String(e.id) === String(applied.employee))?.name || '—') : null;
    const clientLabel = applied.client   !== 'ALL' ? (uniqueClients.find(c => String(c.id) === String(applied.client))?.name   || '—') : null;

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="-mt-4 lg:-mt-8 -mx-4 lg:-mx-8 flex flex-col gap-2 animate-in fade-in duration-500">
            <div className="flex flex-col h-[calc(100vh-4rem)] gap-2">

                {/* PAGE HEADER */}
                <div className="bg-(--bg-surface) px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-(--border-subtle) shadow-sm flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 sm:h-10 sm:w-10 bg-(--brand-primary)/10 rounded-xl flex items-center justify-center text-(--brand-primary) shrink-0">
                            <Clock size={18} className="sm:w-5 sm:h-5" />
                        </div>
                        <div>
                            <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-(--text-main) leading-none">Timesheets</h1>
                            <p className="hidden sm:block text-[10px] text-(--text-muted) mt-1 uppercase tracking-widest font-bold">Auto-generated periods ready for review</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={handleExport} title="Export to Excel"
                            className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 h-9 w-9 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all outline-none flex items-center justify-center gap-1.5">
                            <Download size={15} /><span className="hidden sm:inline">Export</span>
                        </button>
                        <button onClick={handleGenerate} disabled={generating}
                            title="Generate any timesheet periods that have become due since the last daily run"
                            className="bg-(--brand-primary)/10 text-(--brand-primary) border border-(--brand-primary)/20 h-9 w-9 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-(--brand-primary) hover:text-white transition-all outline-none flex items-center justify-center gap-1.5 disabled:opacity-60">
                            <RefreshCw size={15} className={generating ? 'animate-spin' : ''} />
                            <span className="hidden sm:inline">{generating ? 'Syncing…' : 'Sync'}</span>
                        </button>
                        <button onClick={() => setShowManualModal(true)}
                            className="bg-(--brand-primary)/10 text-(--brand-primary) border border-(--brand-primary)/20 h-9 w-9 sm:w-auto sm:h-auto sm:px-4 sm:py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-(--brand-primary) hover:text-white transition-all outline-none flex items-center justify-center gap-1.5">
                            <Plus size={15} /><span className="hidden sm:inline">Manual Create</span>
                        </button>
                    </div>
                </div>

                {/* MAIN CARD */}
                <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden">

                    {/* FILTER BAR */}
                    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 px-3 sm:px-5 py-3 border-b border-(--border-subtle) bg-(--bg-app)/30 shrink-0">
                        <div className="flex overflow-x-auto hide-scrollbar gap-1 p-1 bg-(--bg-surface) rounded-xl border border-(--border-subtle) shadow-sm">
                            {TABS.map(tab => (
                                <button key={tab.key} onClick={() => setFilterTab(tab.key)}
                                    className={`shrink-0 whitespace-nowrap px-2.5 sm:px-3 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all inline-flex items-center gap-1 outline-none ${filterTab === tab.key ? 'bg-(--brand-primary)/10 text-(--brand-primary)' : 'text-(--text-muted) hover:text-(--text-main)'}`}>
                                    {tab.label}
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] leading-none font-bold ${filterTab === tab.key ? 'bg-(--brand-primary) text-(--brand-primary-text)' : 'bg-(--border-subtle) text-(--text-muted)'}`}>
                                        {tabCounts[tab.key]}
                                    </span>
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="relative w-full sm:w-48 lg:w-56 group">
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
                            {showAllPlacements && (
                                <FilterChip label="All Timesheets" onRemove={() => setShowAllPlacements(false)} />
                            )}
                            {applied.payType !== 'ALL' && (
                                <FilterChip label={`Pay: ${applied.payType}`} onRemove={() => removeApplied('payType')} />
                            )}
                            {applied.employee !== 'ALL' && empLabel && (
                                <FilterChip label={empLabel} onRemove={() => removeApplied('employee')} />
                            )}
                            {applied.client !== 'ALL' && clientLabel && (
                                <FilterChip label={clientLabel} onRemove={() => removeApplied('client')} />
                            )}
                            {(applied.dateFrom || applied.dateTo) && (
                                <FilterChip label={formatRangeLabel(applied.dateFrom, applied.dateTo)} onRemove={removeDateRange} />
                            )}
                            <button onClick={clearAll}
                                className="text-[9px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50 ml-1">
                                Clear All
                            </button>
                        </div>
                    )}

                    {/* MOBILE CARD LIST */}
                    <div className="sm:hidden flex-1 overflow-y-auto divide-y divide-(--border-subtle)">
                        {loading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="px-4 py-3.5 animate-pulse">
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="flex-1 space-y-2">
                                            <div className="h-2.5 w-2/5 rounded bg-(--text-muted)/15" />
                                            <div className="h-2.5 w-3/5 rounded bg-(--text-muted)/15" />
                                            <div className="h-4 w-20 rounded bg-(--text-muted)/15 mt-2" />
                                        </div>
                                        <div className="shrink-0 flex flex-col items-end gap-2">
                                            <div className="h-2.5 w-16 rounded bg-(--text-muted)/15" />
                                            <div className="h-2.5 w-16 rounded bg-(--text-muted)/15" />
                                            <div className="h-6 w-14 rounded-lg bg-(--text-muted)/15" />
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : paginatedTimesheets.length > 0 ? (
                            paginatedTimesheets.map(t => (
                                <div key={t.id}
                                    onClick={rowOpen(() => setSelectedTimesheet(t))}
                                    className={`px-4 py-3.5 hover:bg-(--bg-app) transition-colors cursor-pointer ${selectedIds.has(t.id) ? 'bg-(--brand-primary)/5' : ''}`}>
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                {isOrgAdmin && isSelectable(t) && (
                                                    <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggleSelect(t.id)}
                                                        className="h-3.5 w-3.5 rounded border-gray-300 accent-indigo-600 cursor-pointer shrink-0" />
                                                )}
                                                <p className="text-xs font-bold tracking-tight text-(--text-main) truncate">{t.first_name} {t.last_name}</p>
                                            </div>
                                            <p className="text-[9px] text-(--text-muted) font-mono tracking-tighter mt-0.5 truncate">{t.client_name}</p>
                                            <div className="flex flex-wrap items-center gap-2 mt-2">
                                                {getStatusBadge(t)}
                                                {t.pay_type_name && (
                                                    <span className="text-[9px] bg-(--brand-primary)/10 text-(--brand-primary) px-1.5 py-0.5 rounded border border-(--brand-primary)/20 font-bold">{t.pay_type_name}</span>
                                                )}
                                                <span className="text-[9px] text-(--text-muted) font-mono">{Number(t.total_hours)} hrs</span>
                                            </div>
                                        </div>
                                        <div className="shrink-0 flex flex-col items-end gap-2">
                                            <div className="text-[9px] font-bold text-(--text-muted) text-right leading-relaxed">
                                                <p>{fmtDate(t.start_date)}</p>
                                                <p className="opacity-70">→ {fmtDate(t.end_date)}</p>
                                            </div>
                                            {/* Tapping the card opens the timesheet, so only the actions the
                                                card itself cannot perform are kept here. */}
                                            <div className="flex items-center gap-1.5">
                                                {isOrgAdmin && isSelectable(t) && (
                                                    <button onClick={() => handleDelete(t)}
                                                        title="Delete"
                                                        className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all outline-none border border-red-500/20">
                                                        <Trash2 size={12} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="py-12 text-center text-(--text-muted) text-xs font-bold uppercase tracking-widest">No timesheets found.</div>
                        )}
                    </div>

                    {/* DESKTOP TABLE */}
                    <div className="hidden sm:flex flex-col flex-1 overflow-hidden">
                        <div className="flex-1 overflow-y-auto overflow-x-hidden">
                            <table className="w-full text-left table-fixed">
                                <thead className="bg-(--bg-app) text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) sticky top-0 z-10">
                                    <tr>
                                        {isOrgAdmin && (
                                            <th className="pl-4 py-3 w-10">
                                                <input type="checkbox"
                                                    checked={allPageSelected}
                                                    ref={el => { if (el) el.indeterminate = somePageSelected; }}
                                                    onChange={toggleSelectAll}
                                                    disabled={selectableOnPage.length === 0}
                                                    className="h-3.5 w-3.5 rounded border-gray-300 accent-indigo-600 cursor-pointer disabled:opacity-40 disabled:cursor-default"
                                                />
                                            </th>
                                        )}
                                        <th className="px-4 py-3 w-[26%]">Employee & Client</th>
                                        <th className="px-4 py-3 w-[12%]">Pay Type</th>
                                        <th className="px-4 py-3 w-[20%]">Period</th>
                                        <th className="px-4 py-3 w-[12%]">Total Hours</th>
                                        <th className="px-4 py-3 w-[13%]">Status</th>
                                        <th className="px-4 py-3 w-[12%] text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm divide-y divide-(--border-subtle)">
                                    {loading ? (
                                        <TableSkeleton rows={10} columns={skeletonColumns} />
                                    ) : paginatedTimesheets.length > 0 ? (
                                        paginatedTimesheets.map(t => (
                                            <tr key={t.id}
                                                onClick={rowOpen(() => setSelectedTimesheet(t))}
                                                title={t.status_id === 2 ? 'Review Timesheet' : 'View Timesheet'}
                                                className={`hover:bg-(--bg-app) transition-colors cursor-pointer ${selectedIds.has(t.id) ? 'bg-(--brand-primary)/5' : ''}`}>
                                                {isOrgAdmin && (
                                                    <td className="pl-4 py-3.5">
                                                        {isSelectable(t) && (
                                                            <input type="checkbox"
                                                                checked={selectedIds.has(t.id)}
                                                                onChange={() => toggleSelect(t.id)}
                                                                className="h-3.5 w-3.5 rounded border-gray-300 accent-indigo-600 cursor-pointer"
                                                            />
                                                        )}
                                                    </td>
                                                )}
                                                <td className="px-4 py-3.5">
                                                    <p className="text-xs font-bold tracking-tight text-(--text-main) truncate">{t.first_name} {t.last_name}</p>
                                                    <p className="text-[10px] text-(--text-muted) font-mono tracking-tighter mt-0.5 truncate">{t.client_name}</p>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    {t.pay_type_name ? (
                                                        <span className="text-[9px] bg-(--brand-primary)/10 text-(--brand-primary) px-2 py-0.5 rounded border border-(--brand-primary)/20 font-bold uppercase tracking-wider">{t.pay_type_name}</span>
                                                    ) : <span className="text-(--text-muted) text-xs">—</span>}
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <div className="text-[10px] font-bold uppercase text-(--text-muted) tracking-wider">
                                                        <p>{fmtDate(t.start_date)}</p>
                                                        <p className="mt-0.5">to {fmtDate(t.end_date)}</p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <span className="text-xs font-bold text-(--text-main) bg-(--bg-app) px-2 py-1 rounded border border-(--border-subtle)">{Number(t.total_hours)} hrs</span>
                                                </td>
                                                <td className="px-4 py-3.5">{getStatusBadge(t)}</td>
                                                <td className="px-4 py-3.5 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button onClick={() => setSelectedTimesheet(t)}
                                                            className={`inline-flex items-center justify-center px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg border transition-all active:scale-95 shadow-sm outline-none ${t.status_id === 2 ? 'bg-orange-500 text-white border-orange-600 hover:bg-orange-600' : 'bg-(--bg-surface) text-(--text-main) border-(--border-subtle) hover:bg-(--brand-primary) hover:text-white hover:border-(--brand-primary)'}`}>
                                                            {t.status_id === 2 ? 'Review' : 'View'}
                                                        </button>
                                                        {isOrgAdmin && isSelectable(t) && (
                                                            <button onClick={() => handleDelete(t)}
                                                                title="Delete timesheet"
                                                                className="p-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all outline-none border border-red-500/20 shadow-sm">
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan={isOrgAdmin ? 7 : 6} className="px-4 py-12 text-center text-(--text-muted) text-xs font-bold uppercase tracking-widest">No timesheets found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* BULK ACTION BAR */}
                    {isOrgAdmin && selectedIds.size > 0 && (
                        <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-t border-(--border-subtle) bg-red-500/5 shrink-0">
                            <span className="text-xs font-bold text-red-500">
                                {selectedIds.size} timesheet{selectedIds.size > 1 ? 's' : ''} selected
                            </span>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setSelectedIds(new Set())}
                                    className="text-[10px] font-bold text-(--text-muted) hover:text-(--text-main) uppercase tracking-widest transition-colors outline-none">
                                    Clear
                                </button>
                                <button onClick={handleDeleteSelected}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-red-600 transition-all shadow-sm outline-none active:scale-95">
                                    <Trash2 size={12} /> Delete {selectedIds.size}
                                </button>
                            </div>
                        </div>
                    )}

                    <Pagination currentPage={currentPage} totalItems={filteredTimesheets.length} onPageChange={setCurrentPage} />
                </div>
            </div>

            <AuditLogPanel module="timesheets" />
            {selectedTimesheet && <ReviewTimesheetModal timesheet={selectedTimesheet} onClose={() => setSelectedTimesheet(null)} onRefresh={fetchTimesheets} />}
            {showManualModal    && <ManualTimesheetModal onClose={() => setShowManualModal(false)} onRefresh={fetchTimesheets} />}

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
                                    <p className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest mt-0.5">Timesheets</p>
                                </div>
                                {pendingActiveCount > 0 && (
                                    <span className="bg-(--brand-primary) text-(--brand-primary-text) text-[10px] font-bold px-2 py-0.5 rounded-full leading-none">
                                        {pendingActiveCount}
                                    </span>
                                )}
                            </div>
                            <button onClick={closePanel} className="text-(--text-muted) hover:text-(--text-main) transition-colors outline-none">
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-5 space-y-6">

                            {/* Period date range */}
                            <FilterSection icon={CalendarRange} title="Period Date Range">
                                <DateRangeFilter
                                    from={pending.dateFrom}
                                    to={pending.dateTo}
                                    onChange={({ from, to }) => setPending(p => ({ ...p, dateFrom: from, dateTo: to }))}
                                    hint="Shows timesheet periods overlapping this range"
                                />
                            </FilterSection>

                            <div className="border-t border-(--border-subtle)" />

                            {/* Pay Type — from lookup table */}
                            <FilterSection icon={CreditCard} title="Pay Type">
                                <FilterSelect value={pending.payType} onChange={v => setPending(p => ({ ...p, payType: v }))}>
                                    <option value="ALL">All Pay Types</option>
                                    {(lookups.payTypes || []).map(pt => (
                                        <option key={pt.id} value={pt.name}>{pt.name}</option>
                                    ))}
                                </FilterSelect>
                            </FilterSection>

                            <div className="border-t border-(--border-subtle)" />

                            {/* Employee — active only */}
                            <FilterSection icon={User} title="Employee">
                                <FilterSelect value={pending.employee} onChange={v => setPending(p => ({ ...p, employee: v }))}>
                                    <option value="ALL">All Employees</option>
                                    {uniqueEmployees.map(emp => (
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

                            <div className="border-t border-(--border-subtle)" />

                            {/* Timesheet Scope */}
                            <FilterSection icon={Layers} title="Timesheet Scope">
                                <label className="flex items-center gap-3 cursor-pointer group px-1 py-0.5">
                                    <input
                                        type="checkbox"
                                        checked={pendingShowAll}
                                        onChange={e => setPendingShowAll(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 accent-indigo-600 cursor-pointer shrink-0"
                                    />
                                    <span className="text-xs font-bold text-(--text-main) group-hover:text-(--brand-primary) transition-colors">
                                        Show all timesheets
                                    </span>
                                </label>
                                <p className="text-[10px] text-(--text-muted) font-bold uppercase tracking-wider pl-1">
                                    {pendingShowAll
                                        ? 'Active + Completed placements'
                                        : 'Active placements only (default — faster)'}
                                </p>
                            </FilterSection>

                            {/* Preview */}
                            {pendingActiveCount > 0 && (
                                <div className="bg-(--brand-primary)/5 border border-(--brand-primary)/15 rounded-xl p-3 space-y-1.5">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-(--brand-primary) mb-2">Filter Preview</p>
                                    {(pending.dateFrom || pending.dateTo) && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-(--text-muted) font-bold">Period</span>
                                            <span className="text-[10px] font-bold text-(--text-main) ml-4 text-right">
                                                {formatRangeLabel(pending.dateFrom, pending.dateTo)}
                                            </span>
                                        </div>
                                    )}
                                    {pendingShowAll && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-(--text-muted) font-bold">Scope</span>
                                            <span className="text-[10px] font-bold text-(--text-main)">All Timesheets</span>
                                        </div>
                                    )}
                                    {pending.payType !== 'ALL' && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-(--text-muted) font-bold">Pay Type</span>
                                            <span className="text-[10px] font-bold text-(--text-main)">{pending.payType}</span>
                                        </div>
                                    )}
                                    {pending.employee !== 'ALL' && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-(--text-muted) font-bold">Employee</span>
                                            <span className="text-[10px] font-bold text-(--text-main) truncate ml-4 text-right">
                                                {uniqueEmployees.find(e => String(e.id) === String(pending.employee))?.name || '—'}
                                            </span>
                                        </div>
                                    )}
                                    {pending.client !== 'ALL' && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-(--text-muted) font-bold">Client</span>
                                            <span className="text-[10px] font-bold text-(--text-main) truncate ml-4 text-right">
                                                {uniqueClients.find(c => String(c.id) === String(pending.client))?.name || '—'}
                                            </span>
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

export default Timesheets;
