import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Timer, AlertCircle, XCircle, CheckCircle2, Plus, Download, RefreshCw, Trash2, Layers,
    Hourglass, ClipboardCheck, Eye, Handshake,
} from 'lucide-react';
import { timesheetAPI, commonAPI } from '../../../api/apiService';
import ReviewTimesheetModal from './ReviewTimesheetModal';
import ManualTimesheetModal from './ManualTimesheetModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import { fmtDate, isBeforeEasternToday, toDay } from '../../../utils/dateUtils';
import { rowOpen } from '../../../utils/rowClick';
import { matchesSearch } from '../../../utils/searchMatch';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import DateRangeFilter from '../../../components/ui/DateRangeFilter';
import { exportToExcel } from '../../../utils/exportToExcel';
import {
    PageHero, StatRail, StatTile, Workbench, FilterDock, DockField, DockOptions, SearchInput, SelectInput,
    Btn, Chip, RecordCard, EmptyState,
} from '../../../components/ui/kit';

// ─── constants ────────────────────────────────────────────────────────────────
const TABS = [
    { key: 'ALL',              label: 'All logs',     icon: Layers },
    { key: 'NOT_SUBMITTED',    label: 'Awaiting',     icon: Hourglass },
    { key: 'PENDING_APPROVAL', label: 'Needs review', icon: ClipboardCheck },
    { key: 'APPROVED',         label: 'Approved',     icon: CheckCircle2 },
    { key: 'REJECTED',         label: 'Sent back',    icon: XCircle },
    { key: 'PAST_DUE',         label: 'Overdue',      icon: AlertCircle },
];

const EMPTY_FILTERS = { payType: 'ALL', employee: 'ALL', client: 'ALL', dateFrom: '', dateTo: '' };

// Dropdown filters count when set to something other than ALL; the date range
// counts as a single filter no matter which of its two bounds is filled in.
const countActive = (f) =>
    ['payType', 'employee', 'client'].filter(k => f[k] !== 'ALL').length + ((f.dateFrom || f.dateTo) ? 1 : 0);

const DateBlock = ({ date }) => {
    const day = toDay(date);
    const d = day ? new Date(`${day}T12:00:00`) : null;
    return (
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[14px] border border-(--border-subtle) bg-(--bg-app)/60 leading-none">
            <span className="text-[10px] font-semibold text-(--brand-primary)">{d ? d.toLocaleString('en-US', { month: 'short' }) : '—'}</span>
            <span className="mt-0.5 text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{d ? d.getDate() : ''}</span>
        </div>
    );
};

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
    const [applied, setApplied] = useState(EMPTY_FILTERS);

    // ─── multi-select state ───────────────────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState(new Set());

    // ─── engagement scope (server-side filter) ───────────────────────────────
    const [showAllPlacements, setShowAllPlacements] = useState(false);

    // ─── data fetch ──────────────────────────────────────────────────────────
    const fetchTimesheets = useCallback(async () => {
        setLoading(true);
        try {
            // activeOnly = !showAllPlacements: default fetches active-engagement time logs only
            const res = await timesheetAPI.getManagementTimesheets(!showAllPlacements);
            setTimesheets(res.data);
        } catch (err) {
            console.error('Failed to fetch time logs:', err);
        } finally {
            setLoading(false);
        }
    }, [showAllPlacements]);

    const handleDelete = async (ts) => {
        if (!window.confirm(`Delete time log for ${ts.first_name} ${ts.last_name} (${fmtDate(ts.start_date)} – ${fmtDate(ts.end_date)})? This cannot be undone.`)) return;
        try {
            await timesheetAPI.deleteTimesheet(ts.id);
            fetchTimesheets();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete time log.');
        }
    };

    // Lookups run once; fetchTimesheets re-runs whenever the scope changes.
    // Period generation is handled by the daily job; use Sync to force a run.
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
            alert(err.response?.data?.error || 'Failed to sync time logs.');
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
        // Date range matches on period overlap.
        if (f.dateFrom && toDay(t.end_date)   <  f.dateFrom) return false;
        if (f.dateTo   && toDay(t.start_date) >  f.dateTo)   return false;
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
        if (!window.confirm(`Delete ${selectedIds.size} selected time log(s)? This cannot be undone.`)) return;
        try {
            await Promise.all([...selectedIds].map(id => timesheetAPI.deleteTimesheet(id)));
            setSelectedIds(new Set());
            fetchTimesheets();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete some time logs.');
            fetchTimesheets();
        }
    };

    // ─── filter actions ───────────────────────────────────────────────────────
    const setFilter = (key, value) => setApplied(prev => ({ ...prev, [key]: value }));
    const clearAll  = () => { setApplied(EMPTY_FILTERS); setShowAllPlacements(false); setSearchQuery(''); };
    const activeCount = countActive(applied) + (showAllPlacements ? 1 : 0) + (searchQuery ? 1 : 0);

    // ─── status helpers ───────────────────────────────────────────────────────
    const getStatusChip = (ts) => {
        if (ts.status_id === 2) return <Chip tone="amber" icon={ClipboardCheck}>Needs review</Chip>;
        if (ts.status_id === 3) return <Chip tone="green" icon={CheckCircle2}>Approved</Chip>;
        if (ts.status_id === 4) return <Chip tone="rose" icon={XCircle}>Sent back</Chip>;
        if (isPastDue(ts))      return <Chip tone="rose" icon={AlertCircle}>Overdue</Chip>;
        return <Chip tone="slate" icon={Hourglass}>Awaiting</Chip>;
    };

    const getStatusLabel = (ts) => {
        if (ts.status_id === 2) return 'Needs review';
        if (ts.status_id === 3) return 'Approved';
        if (ts.status_id === 4) return 'Sent back';
        if (isPastDue(ts))      return 'Overdue';
        return 'Awaiting';
    };

    // ─── export ───────────────────────────────────────────────────────────────
    const handleExport = () => {
        const headers = ['Consultant', 'Partner', 'Pay Model', 'Period Start', 'Period End', 'Total Hours', 'Status'];
        const keys    = ['full_name', 'client_name', 'pay_type_name', 'start_date_fmt', 'end_date_fmt', 'total_hours', 'status_label'];
        const rows = filteredTimesheets.map(t => ({
            ...t,
            full_name:      `${t.first_name} ${t.last_name}`,
            start_date_fmt: fmtDate(t.start_date),
            end_date_fmt:   fmtDate(t.end_date),
            status_label:   getStatusLabel(t),
        }));
        exportToExcel(rows, headers, keys, 'time-logs');
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="mx-auto max-w-[1600px] space-y-6">
            <PageHero
                icon={Timer}
                eyebrow="Talent"
                title="Time logs"
                description="Hours logged against every engagement — approve, send back or override."
                actions={
                    <>
                        <Btn variant="success" icon={Download} onClick={handleExport} title="Export to Excel">Export</Btn>
                        <Btn icon={RefreshCw} onClick={handleGenerate} disabled={generating} title="Generate any time log periods that have become due since the last daily run">
                            {generating ? 'Syncing…' : 'Sync periods'}
                        </Btn>
                        <Btn variant="primary" icon={Plus} onClick={() => setShowManualModal(true)}>Log manually</Btn>
                    </>
                }
            >
                <StatRail>
                    {TABS.map(tab => (
                        <StatTile
                            key={tab.key}
                            label={tab.label}
                            icon={tab.icon}
                            value={tabCounts[tab.key]}
                            active={filterTab === tab.key}
                            onClick={() => setFilterTab(tab.key)}
                        />
                    ))}
                </StatRail>
            </PageHero>

            <Workbench
                dock={
                    <FilterDock activeCount={activeCount} onReset={clearAll}>
                        <DockField label="Find">
                            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Name, consultant or engagement ID…" />
                        </DockField>
                        <DockField label="Period">
                            <DateRangeFilter
                                from={applied.dateFrom}
                                to={applied.dateTo}
                                onChange={({ from, to }) => setApplied(p => ({ ...p, dateFrom: from, dateTo: to }))}
                                hint="Shows periods overlapping this range"
                            />
                        </DockField>
                        <DockField label="Pay model">
                            <SelectInput value={applied.payType} onChange={v => setFilter('payType', v)}>
                                <option value="ALL">All pay models</option>
                                {(lookups.payTypes || []).map(pt => <option key={pt.id} value={pt.name}>{pt.name}</option>)}
                            </SelectInput>
                        </DockField>
                        <DockField label="Consultant">
                            <SelectInput value={applied.employee} onChange={v => setFilter('employee', v)}>
                                <option value="ALL">All consultants</option>
                                {uniqueEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                            </SelectInput>
                        </DockField>
                        <DockField label="Partner">
                            <SelectInput value={applied.client} onChange={v => setFilter('client', v)}>
                                <option value="ALL">All partners</option>
                                {uniqueClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </SelectInput>
                        </DockField>
                        <DockField label="Scope">
                            <DockOptions
                                value={showAllPlacements ? 'ALL' : 'ACTIVE'}
                                onChange={v => setShowAllPlacements(v === 'ALL')}
                                options={[
                                    { value: 'ACTIVE', label: 'Active engagements' },
                                    { value: 'ALL', label: 'All engagements' },
                                ]}
                            />
                        </DockField>
                    </FilterDock>
                }
            >
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-(--text-muted)">
                        <span className="font-semibold text-(--text-main)">{filteredTimesheets.length}</span> time logs
                    </p>
                    {isOrgAdmin && selectableOnPage.length > 0 && (
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-(--text-muted)">
                            <input
                                type="checkbox"
                                checked={allPageSelected}
                                ref={el => { if (el) el.indeterminate = somePageSelected; }}
                                onChange={toggleSelectAll}
                                className="h-4 w-4 cursor-pointer"
                            />
                            Select deletable on this page
                        </label>
                    )}
                </div>

                {loading ? (
                    <div className="space-y-2.5">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4 rounded-[20px] border border-(--border-subtle) bg-(--bg-surface) px-5 py-4">
                                <div className="nx-shimmer h-12 w-12 rounded-[14px]" />
                                <div className="flex-1 space-y-2">
                                    <div className="nx-shimmer h-2.5 w-2/5 rounded-full" />
                                    <div className="nx-shimmer h-2.5 w-1/4 rounded-full" />
                                </div>
                                <div className="nx-shimmer h-6 w-24 rounded-full" />
                            </div>
                        ))}
                    </div>
                ) : paginatedTimesheets.length === 0 ? (
                    <EmptyState icon={Timer} title="No time logs found" text="Try another status, range or scope." />
                ) : (
                    <div className="space-y-2.5">
                        {paginatedTimesheets.map(t => (
                            <RecordCard
                                key={t.id}
                                onClick={rowOpen(() => setSelectedTimesheet(t))}
                                title={t.status_id === 2 ? 'Review time log' : 'Open time log'}
                                className={selectedIds.has(t.id) ? 'border-(--brand-primary)/60 bg-(--brand-primary)/5' : ''}
                            >
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                                    {isOrgAdmin && (
                                        <div className="w-4 shrink-0">
                                            {isSelectable(t) && (
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(t.id)}
                                                    onChange={() => toggleSelect(t.id)}
                                                    className="h-4 w-4 cursor-pointer"
                                                />
                                            )}
                                        </div>
                                    )}
                                    <DateBlock date={t.start_date} />
                                    <div className="min-w-[160px] flex-1">
                                        <p className="truncate text-sm font-semibold text-(--text-main)">{t.first_name} {t.last_name}</p>
                                        <p className="flex items-center gap-1.5 truncate text-xs text-(--text-muted)">
                                            <Handshake size={12} className="shrink-0" /> <span className="truncate">{t.client_name}</span>
                                        </p>
                                    </div>
                                    <div className="hidden min-w-[170px] md:block">
                                        <p className="text-[11px] text-(--text-muted)">Period</p>
                                        <p className="text-xs font-medium text-(--text-main)">{fmtDate(t.start_date)} → {fmtDate(t.end_date)}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {t.pay_type_name && <Chip tone="brand">{t.pay_type_name}</Chip>}
                                        <span className="rounded-full bg-(--bg-app) px-3 py-1 font-mono text-xs font-semibold text-(--text-main)">{Number(t.total_hours)} h</span>
                                    </div>
                                    {getStatusChip(t)}
                                    <div className="ml-auto flex items-center gap-1.5">
                                        <Btn
                                            size="sm"
                                            variant={t.status_id === 2 ? 'warn' : 'ghost'}
                                            icon={t.status_id === 2 ? ClipboardCheck : Eye}
                                            onClick={() => setSelectedTimesheet(t)}
                                        >
                                            {t.status_id === 2 ? 'Review' : 'Open'}
                                        </Btn>
                                        {isOrgAdmin && isSelectable(t) && (
                                            <Btn size="icon" variant="danger" icon={Trash2} onClick={() => handleDelete(t)} title="Delete time log" />
                                        )}
                                    </div>
                                </div>
                            </RecordCard>
                        ))}
                    </div>
                )}

                {isOrgAdmin && selectedIds.size > 0 && (
                    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-rose-500/30 bg-(--bg-surface) px-5 py-3" style={{ boxShadow: 'var(--shadow-floating)' }}>
                        <span className="text-sm font-semibold text-rose-500">
                            {selectedIds.size} time log{selectedIds.size > 1 ? 's' : ''} selected
                        </span>
                        <div className="flex items-center gap-2">
                            <Btn size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Btn>
                            <Btn size="sm" variant="danger" icon={Trash2} onClick={handleDeleteSelected}>Delete {selectedIds.size}</Btn>
                        </div>
                    </div>
                )}

                <div className="overflow-hidden rounded-[20px] border border-(--border-subtle)">
                    <Pagination currentPage={currentPage} totalItems={filteredTimesheets.length} onPageChange={setCurrentPage} />
                </div>
            </Workbench>

            <AuditLogPanel module="timesheets" />
            {selectedTimesheet && <ReviewTimesheetModal timesheet={selectedTimesheet} onClose={() => setSelectedTimesheet(null)} onRefresh={fetchTimesheets} />}
            {showManualModal    && <ManualTimesheetModal onClose={() => setShowManualModal(false)} onRefresh={fetchTimesheets} />}
        </div>
    );
};

export default Timesheets;
