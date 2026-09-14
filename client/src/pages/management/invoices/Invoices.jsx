import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import {
    DollarSign, Search, AlertCircle, CheckCircle, Trash2, Edit, RefreshCw, Download,
    SlidersHorizontal, X, ChevronDown, User, Building2, CreditCard, Layers, CalendarRange,
} from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import { rowOpen } from '../../../utils/rowClick';
import ManageInvoiceModal from './ManageInvoiceModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import DateRangeFilter from '../../../components/ui/DateRangeFilter';
import TableSkeleton from '../../../components/ui/TableSkeleton';
import { fmtDate, formatRangeLabel } from '../../../utils/dateUtils';
import { exportToExcel } from '../../../utils/exportToExcel';

const TABS = [
    { key: 'ALL',      label: 'All' },
    { key: 'DRAFT',    label: 'Draft' },
    { key: 'READY',    label: 'Ready to Send' },
    { key: 'OPEN',     label: 'Open' },
    { key: 'PAST_DUE', label: 'Past Due' },
    { key: 'PAID',     label: 'Paid' },
];

const EMPTY_FILTERS = { payType: 'ALL', employee: 'ALL', client: 'ALL', dateFrom: '', dateTo: '' };

// Dropdown filters count when set to something other than ALL; the date range
// counts as a single filter no matter which of its two bounds is filled in.
const countActive = (f) =>
    ['payType', 'employee', 'client'].filter(k => f[k] !== 'ALL').length + ((f.dateFrom || f.dateTo) ? 1 : 0);

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Filter helpers ───────────────────────────────────────────────────────────
const FilterSection = ({ icon: Icon, title, children }) => (
    <div className="space-y-3">
        <div className="flex items-center gap-2">
            <Icon size={13} className="text-(--brand-primary)" />
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">{title}</h3>
        </div>
        {children}
    </div>
);

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
const Invoices = () => {
    const location = useLocation();
    const [invoices, setInvoices] = useState([]);
    const [total, setTotal]       = useState(0);
    const [counts, setCounts]     = useState({ ALL: 0, DRAFT: 0, READY: 0, OPEN: 0, PAST_DUE: 0, PAID: 0 });
    const [filterOptions, setFilterOptions] = useState({ employees: [], clients: [] });
    const [exporting, setExporting] = useState(false);
    const [lookups, setLookups]   = useState({ payTypes: [] });
    const [loading, setLoading]   = useState(true);
    const [generating, setGenerating] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [filterTab, setFilterTab] = useState(() => {
        const tab = new URLSearchParams(location.search).get('tab');
        return TABS.some(t => t.key === tab) ? tab : 'ALL';
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    // applied filters (committed) / pending (in drawer)
    const [applied, setApplied]     = useState(EMPTY_FILTERS);
    const [showPanel, setShowPanel] = useState(false);
    const [pending, setPending]     = useState(EMPTY_FILTERS);

    const isOrgAdmin = localStorage.getItem('userRole') === 'ORG_ADMIN';

    // ─── multi-select state ───────────────────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState(new Set());

    // ─── invoice scope (server-side filter) ──────────────────────────────────
    const [showAllInvoices, setShowAllInvoices]   = useState(false);
    const [pendingShowAll, setPendingShowAll]      = useState(false);

    // Search is debounced so typing does not fire a request per keystroke.
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // The single source of truth for "which invoices am I looking at". The list,
    // the counts, select-all and export are all driven from this same object, so
    // they cannot disagree about what the current filters mean.
    const queryParams = useMemo(() => ({
        activeOnly: !showAllInvoices,
        tab:        filterTab,
        search:     debouncedSearch.trim() || undefined,
        payType:    applied.payType  !== 'ALL' ? applied.payType  : undefined,
        employee:   applied.employee !== 'ALL' ? applied.employee : undefined,
        client:     applied.client   !== 'ALL' ? applied.client   : undefined,
        dateFrom:   applied.dateFrom || undefined,
        dateTo:     applied.dateTo   || undefined,
    }), [showAllInvoices, filterTab, debouncedSearch, applied]);

    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        try {
            const res = await managementAPI.getInvoices({
                ...queryParams,
                page:     currentPage,
                pageSize: PAGE_SIZE,
            });
            setInvoices(res.data.rows || []);
            setTotal(res.data.total || 0);
            if (res.data.counts) setCounts(res.data.counts);
        } catch (err) {
            console.error("Failed to fetch invoices:", err);
        } finally {
            setLoading(false);
        }
    }, [queryParams, currentPage]);

    // getLookups runs once; fetchInvoices re-runs whenever showAllInvoices changes
    const didInit = useRef(false);
    useEffect(() => {
        if (!didInit.current) {
            didInit.current = true;
            commonAPI.getLookups().then(res => setLookups(res.data)).catch(() => {});
        }
        fetchInvoices();
    }, [fetchInvoices]);

    // Filter drawer options come from the server now that the page only holds one
    // page of rows. Reloads when the active/all scope changes, not on every filter.
    useEffect(() => {
        managementAPI.getInvoiceFilterOptions(!showAllInvoices)
            .then(res => setFilterOptions(res.data))
            .catch(() => {});
    }, [showAllInvoices]);

    // reset page + selection when filters change
    useEffect(() => { setCurrentPage(1); setSelectedIds(new Set()); }, [filterTab, debouncedSearch, applied, showAllInvoices]);

    // Filter drawer options now come from the server (see effect above); the page
    // only holds 20 rows so they can no longer be derived from the loaded data.
    const uniqueEmployees = filterOptions.employees;
    const uniqueClients   = filterOptions.clients;

    // The server has already applied every filter, the status tab and the paging,
    // so `invoices` IS the current page. Tab counts arrive alongside it.
    const paginatedInvoices = invoices;
    const tabCounts = counts;

    // ─── multi-select helpers ─────────────────────────────────────────────────
    const selectableOnPage  = isOrgAdmin ? paginatedInvoices : [];
    const allPageSelected   = selectableOnPage.length > 0 && selectableOnPage.every(inv => selectedIds.has(inv.id));
    const somePageSelected  = selectableOnPage.some(inv => selectedIds.has(inv.id)) && !allPageSelected;

    const toggleSelect = (id) => setSelectedIds(prev => {
        const n = new Set(prev);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
    });

    const toggleSelectAll = () => {
        if (allPageSelected) {
            setSelectedIds(prev => { const n = new Set(prev); selectableOnPage.forEach(inv => n.delete(inv.id)); return n; });
        } else {
            setSelectedIds(prev => { const n = new Set(prev); selectableOnPage.forEach(inv => n.add(inv.id)); return n; });
        }
    };

    // The header checkbox can only reach the 20 rows on screen. This pulls the ids
    // of everything matching the current filters so a bulk action can still cover
    // the whole set — ids only, so selecting thousands stays a few KB.
    const [selectingAll, setSelectingAll] = useState(false);
    const selectAllMatching = async () => {
        setSelectingAll(true);
        try {
            const res = await managementAPI.getInvoiceIds(queryParams);
            setSelectedIds(new Set(res.data.ids || []));
        } catch {
            alert('Could not select all matching invoices. Please try again.');
        } finally {
            setSelectingAll(false);
        }
    };

    const handleDeleteSelected = async () => {
        if (!window.confirm(`Delete ${selectedIds.size} selected invoice(s)? Attached timesheets will be returned to the unbilled queue.`)) return;
        try {
            await Promise.all([...selectedIds].map(id => managementAPI.deleteInvoice(id)));
            setSelectedIds(new Set());
            fetchInvoices();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete some invoices.');
            fetchInvoices();
        }
    };

    // ─── panel actions ────────────────────────────────────────────────────────
    const openPanel    = () => { setPending({ ...applied }); setPendingShowAll(showAllInvoices); setShowPanel(true); };
    const closePanel   = () => setShowPanel(false);
    const applyFilters = () => { setApplied({ ...pending }); setShowAllInvoices(pendingShowAll); setShowPanel(false); };
    const resetPending = () => { setPending(EMPTY_FILTERS); setPendingShowAll(false); };
    const removeApplied = (key) => setApplied(prev => ({ ...prev, [key]: 'ALL' }));
    const removeDateRange = () => setApplied(prev => ({ ...prev, dateFrom: '', dateTo: '' }));
    const clearAll     = () => { setApplied(EMPTY_FILTERS); setShowAllInvoices(false); };

    const activeCount        = countActive(applied) + (showAllInvoices ? 1 : 0);
    const pendingActiveCount = countActive(pending) + (pendingShowAll ? 1 : 0);

    // skeleton column widths — mirrors the <th> layout, including the
    // `hidden sm:table-cell` columns so nothing shifts on mobile.
    const skeletonColumns = [
        ...(isOrgAdmin ? [{ lines: ['14px'] }] : []),
        { lines: ['80%', '60%', '45%'] },
        { lines: ['55%'], className: 'hidden sm:table-cell' },
        { lines: ['85%', '60%'], className: 'hidden sm:table-cell' },
        { lines: ['60%', '45%'], className: 'hidden sm:table-cell' },
        { lines: ['70%'] },
        { lines: ['65%'], align: 'right' },
    ];

    // chip labels
    const empLabel    = applied.employee !== 'ALL' ? (uniqueEmployees.find(e => String(e.id) === String(applied.employee))?.name || '—') : null;
    const clientLabel = applied.client   !== 'ALL' ? (uniqueClients.find(c => String(c.id) === String(applied.client))?.name   || '—') : null;

    // ─── other handlers ───────────────────────────────────────────────────────
    const handleGenerate = async () => {
        setGenerating(true);
        try {
            await managementAPI.generateInvoices();
            fetchInvoices();
        } catch (err) {
        } finally {
            setGenerating(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this invoice? Attached timesheets will be returned to the unbilled queue.")) return;
        try {
            await managementAPI.deleteInvoice(id);
            fetchInvoices();
        } catch (error) {
            alert(error.response?.data?.error || "Failed to delete invoice.");
        }
    };

    const getStatusLabel = (id) => ({ 1: 'Not Ready', 2: 'Ready to Approve', 3: 'Ready to Invoice', 4: 'Open Invoice', 5: 'Past Due', 6: 'Paid' }[id] || '');

    // The page holds only 20 rows now, so export fetches the full filtered set
    // first. Same filters, same file the user got before.
    const handleExport = async () => {
        setExporting(true);
        let source = [];
        try {
            const res = await managementAPI.getInvoicesForExport(queryParams);
            source = res.data || [];
        } catch {
            alert('Could not build the export. Please try again.');
            setExporting(false);
            return;
        }
        const headers = ['Invoice #', 'Client', 'Employee', 'Pay Type', 'Period Start', 'Period End', 'Due Date', 'Total Amount', 'Amount Paid', 'Remaining Amount', 'Status'];
        const keys    = ['invoice_number', 'client_name', 'emp_name', 'pay_type_name', 'period_start', 'period_end', 'due_date', 'adj_total_amount', 'paid_amount', 'remaining_amount', 'status_label'];
        const rows = source.map(inv => {
            const totalAmount = parseFloat(inv.total_amount || 0) + parseFloat(inv.adj_total || 0);
            const paidAmount  = parseFloat(inv.amount_paid || 0);
            const remaining   = Math.max(0, totalAmount - paidAmount);
            // Any payment short of the full balance reads as Partially Paid in the
            // export only; the stored status is untouched. Same 0.005 tolerance as
            // addInvoicePayment uses to decide an invoice is fully paid.
            const partiallyPaid = paidAmount > 0 && remaining > 0.005;
            return {
                ...inv,
                emp_name:          `${inv.emp_first} ${inv.emp_last}`,
                period_start:      fmtDate(inv.period_start),
                period_end:        fmtDate(inv.period_end),
                due_date:          fmtDate(inv.due_date),
                status_label:      partiallyPaid ? 'Partially Paid' : getStatusLabel(inv.status_id),
                adj_total_amount:  totalAmount.toFixed(2),
                paid_amount:       paidAmount.toFixed(2),
                remaining_amount:  remaining.toFixed(2),
            };
        });
        exportToExcel(rows, headers, keys, 'invoices');
        setExporting(false);
    };

    const getStatusBadge = (statusId) => {
        switch (statusId) {
            case 1: return <span className="text-[9px] bg-(--text-muted)/10 text-(--text-muted) px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-(--text-muted)/20">Not Ready</span>;
            case 2: return <span className="text-[9px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-blue-500/20">Ready</span>;
            case 3: return <span className="text-[9px] bg-orange-500/10 text-orange-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-orange-500/20">Ready to Invoice</span>;
            case 4: return <span className="text-[9px] bg-purple-500/10 text-purple-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-purple-500/20">Open</span>;
            case 5: return <span className="text-[9px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-red-500/20 inline-flex items-center gap-1"><AlertCircle size={9}/> Past Due</span>;
            case 6: return <span className="text-[9px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-green-500/20 inline-flex items-center gap-1"><CheckCircle size={9}/> Paid</span>;
            default: return null;
        }
    };

    return (
        <div className="-mt-4 lg:-mt-8 -mx-4 lg:-mx-8 flex flex-col gap-2 animate-in fade-in duration-500">
        <div className="flex flex-col h-[calc(100vh-4rem)] gap-2">

            {/* Header */}
            <div className="bg-(--bg-surface) px-4 sm:px-6 py-3 sm:py-3.5 rounded-2xl border border-(--border-subtle) shadow-sm flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 bg-(--brand-primary)/10 rounded-xl flex items-center justify-center text-(--brand-primary) shrink-0">
                        <DollarSign size={18} className="sm:w-5 sm:h-5" />
                    </div>
                    <div>
                        <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-(--text-main) leading-none">Invoices & Billing</h1>
                        <p className="hidden sm:block text-[10px] text-(--text-muted) mt-1 uppercase tracking-widest font-bold">Manage client billing and payments</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        title="Export to Excel"
                        className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all outline-none flex items-center gap-2 shadow-sm disabled:opacity-50"
                    >
                        <Download size={14} className={exporting ? 'animate-pulse' : ''} />
                        <span className="hidden sm:inline">{exporting ? 'Preparing…' : 'Export'}</span>
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="bg-(--brand-primary)/10 text-(--brand-primary) border border-(--brand-primary)/20 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-(--brand-primary) hover:text-white transition-all outline-none flex items-center gap-2 shadow-sm disabled:opacity-60"
                    >
                        <RefreshCw size={14} className={generating ? "animate-spin" : ""} />
                        <span className="hidden sm:inline">{generating ? 'Syncing…' : 'Sync'}</span>
                    </button>
                </div>
            </div>

            {/* Main card */}
            <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden">

                {/* Filter bar */}
                <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 px-4 sm:px-6 py-3 border-b border-(--border-subtle) bg-(--bg-app)/30 shrink-0">
                    <div className="flex p-1 bg-(--bg-surface) rounded-xl lg:rounded-lg border border-(--border-subtle) w-full lg:w-auto shadow-sm overflow-x-auto hide-scrollbar">
                        {TABS.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setFilterTab(tab.key)}
                                className={`shrink-0 whitespace-nowrap px-2.5 sm:px-4 py-2 lg:py-1.5 rounded-lg lg:rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-all inline-flex items-center gap-1.5 outline-none ${filterTab === tab.key ? 'bg-(--brand-primary)/10 text-(--brand-primary)' : 'text-(--text-muted) hover:text-(--text-main)'}`}
                            >
                                {tab.label}
                                <span className={`px-1.5 py-0.5 rounded text-[8px] leading-none font-bold ${filterTab === tab.key ? 'bg-(--brand-primary) text-(--brand-primary-text)' : 'bg-(--border-subtle) text-(--text-muted)'}`}>
                                    {tabCounts[tab.key]}
                                </span>
                            </button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <div className="relative w-full sm:w-52 group">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted) group-focus-within:text-(--brand-primary) transition-colors pointer-events-none">
                                <Search size={13} />
                            </div>
                            <input
                                type="text"
                                placeholder="Search invoice #, name, employee or placement ID…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-2 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl text-xs font-bold focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) outline-none shadow-sm transition-all"
                            />
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

                {/* Active filter chips */}
                {activeCount > 0 && (
                    <div className="flex flex-wrap items-center gap-2 px-4 sm:px-5 py-2.5 border-b border-(--border-subtle) bg-(--brand-primary)/3">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-(--text-muted) mr-1">Active:</span>
                        {showAllInvoices && (
                            <FilterChip label="All Invoices" onRemove={() => setShowAllInvoices(false)} />
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

                {/* Table */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    <table className="w-full text-left table-fixed">
                        <thead className="bg-(--bg-app) text-[9px] sm:text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) sticky top-0 z-10">
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
                                <th className="px-4 py-3 w-[38%] sm:w-[20%]">Employee & Client</th>
                                <th className="hidden sm:table-cell px-4 py-3 sm:w-[10%]">Pay Type</th>
                                <th className="hidden sm:table-cell px-4 py-3 sm:w-[22%]">Period & Due Date</th>
                                <th className="hidden sm:table-cell px-4 py-3 sm:w-[13%]">Amount</th>
                                <th className="px-4 py-3 w-[30%] sm:w-[13%]">Status</th>
                                <th className="px-4 py-3 w-[25%] sm:w-[17%] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-(--border-subtle)">
                            {loading ? (
                                <TableSkeleton rows={10} columns={skeletonColumns} />
                            ) : paginatedInvoices.length > 0 ? (
                                paginatedInvoices.map(inv => (
                                    <tr key={inv.id}
                                        onClick={rowOpen(() => setSelectedInvoice(inv))}
                                        title="Manage Invoice"
                                        className={`hover:bg-(--bg-app) transition-colors group cursor-pointer ${selectedIds.has(inv.id) ? 'bg-(--brand-primary)/5' : ''}`}>
                                        {isOrgAdmin && (
                                            <td className="pl-4 py-3 sm:py-3.5">
                                                <input type="checkbox"
                                                    checked={selectedIds.has(inv.id)}
                                                    onChange={() => toggleSelect(inv.id)}
                                                    className="h-3.5 w-3.5 rounded border-gray-300 accent-indigo-600 cursor-pointer"
                                                />
                                            </td>
                                        )}
                                        <td className="px-4 py-3 sm:py-3.5">
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-(--text-main) truncate">{inv.client_name}</p>
                                                <p className="text-[10px] font-bold text-(--text-muted) truncate mt-0.5">{inv.emp_first} {inv.emp_last}</p>
                                                <p className="text-[9px] font-mono text-(--text-muted)/70 mt-1 truncate">{inv.invoice_number}</p>
                                            </div>
                                        </td>
                                        <td className="hidden sm:table-cell px-4 py-3 sm:py-3.5">
                                            {inv.pay_type_name
                                                ? <span className="text-[9px] bg-(--brand-primary)/10 text-(--brand-primary) px-2 py-0.5 rounded border border-(--brand-primary)/20 font-bold uppercase tracking-wider">{inv.pay_type_name}</span>
                                                : <span className="text-(--text-muted) text-xs">—</span>
                                            }
                                        </td>
                                        <td className="hidden sm:table-cell px-4 py-3 sm:py-3.5">
                                            <div className="text-[10px] font-bold uppercase text-(--text-muted) tracking-wider">
                                                <p>{fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}</p>
                                                {inv.due_date && (
                                                    <p className={`mt-0.5 ${inv.status_id === 5 ? 'text-red-500' : ''}`}>
                                                        Due: {fmtDate(inv.due_date)}
                                                    </p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="hidden sm:table-cell px-4 py-3 sm:py-3.5">
                                            {(() => {
                                                const adjTotal = parseFloat(inv.total_amount) + parseFloat(inv.adj_total || 0);
                                                return parseFloat(inv.amount_paid) > 0 && inv.status_id !== 6 ? (
                                                    <>
                                                        <span className="text-xs font-bold text-red-500">{fmt$(adjTotal - parseFloat(inv.amount_paid))}</span>
                                                        <p className="text-[9px] text-(--text-muted) font-bold uppercase tracking-widest mt-0.5">remaining of {fmt$(adjTotal)}</p>
                                                    </>
                                                ) : (
                                                    <span className={`text-xs font-bold ${inv.status_id === 6 ? 'text-emerald-600' : 'text-(--brand-primary)'}`}>{fmt$(adjTotal)}</span>
                                                );
                                            })()}
                                            <p className="text-[9px] text-(--text-muted) font-bold uppercase tracking-widest mt-0.5">{Number(inv.total_hours)} hrs</p>
                                        </td>
                                        <td className="px-4 py-3 sm:py-3.5">{getStatusBadge(inv.status_id)}</td>
                                        <td className="px-4 py-3 sm:py-3.5 text-right">
                                            <div className="flex justify-end items-center gap-2">
                                                {/* Hidden on mobile — the row opens this invoice. Delete stays,
                                                    since nothing else on the row performs it. */}
                                                <button
                                                    onClick={() => setSelectedInvoice(inv)}
                                                    className="hidden sm:inline-flex items-center justify-center px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) hover:bg-(--brand-primary) hover:text-white transition-all outline-none gap-1.5 shadow-sm"
                                                >
                                                    <Edit size={12} /> Manage
                                                </button>
                                                {isOrgAdmin && (
                                                    <button
                                                        onClick={() => handleDelete(inv.id)}
                                                        className="p-2 sm:py-1.5 sm:px-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all outline-none border border-red-500/20 shadow-sm"
                                                        title="Delete Invoice"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan={isOrgAdmin ? 7 : 6} className="px-4 py-12 text-center text-(--text-muted) text-xs font-bold uppercase tracking-widest">No invoices found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* BULK ACTION BAR */}
                {isOrgAdmin && selectedIds.size > 0 && (
                    <div className="flex items-center justify-between px-4 sm:px-5 py-2.5 border-t border-(--border-subtle) bg-red-500/5 shrink-0">
                        <span className="text-xs font-bold text-red-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span>{selectedIds.size} invoice{selectedIds.size > 1 ? 's' : ''} selected</span>
                            {/* The header checkbox only reaches the current page, so when more
                                rows match the filters, offer to extend to all of them. */}
                            {selectedIds.size < total && (
                                <button onClick={selectAllMatching} disabled={selectingAll}
                                    className="text-[10px] font-bold text-(--brand-primary) hover:underline uppercase tracking-widest outline-none disabled:opacity-50">
                                    {selectingAll ? 'Selecting…' : `Select all ${total} matching`}
                                </button>
                            )}
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

                <Pagination
                    currentPage={currentPage}
                    totalItems={total}
                    onPageChange={setCurrentPage}
                />
            </div>
        </div>

            <AuditLogPanel module="invoices" />

            {selectedInvoice && <ManageInvoiceModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} onRefresh={fetchInvoices} />}

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
                                    <p className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest mt-0.5">Invoices</p>
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

                            {/* Billing period date range */}
                            <FilterSection icon={CalendarRange} title="Period Date Range">
                                <DateRangeFilter
                                    from={pending.dateFrom}
                                    to={pending.dateTo}
                                    onChange={({ from, to }) => setPending(p => ({ ...p, dateFrom: from, dateTo: to }))}
                                    hint="Shows billing periods overlapping this range"
                                />
                            </FilterSection>

                            <div className="border-t border-(--border-subtle)" />

                            <FilterSection icon={CreditCard} title="Pay Type">
                                <FilterSelect value={pending.payType} onChange={v => setPending(p => ({ ...p, payType: v }))}>
                                    <option value="ALL">All Pay Types</option>
                                    {(lookups.payTypes || []).map(pt => (
                                        <option key={pt.id} value={pt.name}>{pt.name}</option>
                                    ))}
                                </FilterSelect>
                            </FilterSection>

                            <div className="border-t border-(--border-subtle)" />

                            <FilterSection icon={User} title="Employee">
                                <FilterSelect value={pending.employee} onChange={v => setPending(p => ({ ...p, employee: v }))}>
                                    <option value="ALL">All Employees</option>
                                    {uniqueEmployees.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                                    ))}
                                </FilterSelect>
                            </FilterSection>

                            <div className="border-t border-(--border-subtle)" />

                            <FilterSection icon={Building2} title="Client">
                                <FilterSelect value={pending.client} onChange={v => setPending(p => ({ ...p, client: v }))}>
                                    <option value="ALL">All Clients</option>
                                    {uniqueClients.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </FilterSelect>
                            </FilterSection>

                            <div className="border-t border-(--border-subtle)" />

                            {/* Invoice Scope */}
                            <FilterSection icon={Layers} title="Invoice Scope">
                                <label className="flex items-center gap-3 cursor-pointer group px-1 py-0.5">
                                    <input
                                        type="checkbox"
                                        checked={pendingShowAll}
                                        onChange={e => setPendingShowAll(e.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 accent-indigo-600 cursor-pointer shrink-0"
                                    />
                                    <span className="text-xs font-bold text-(--text-main) group-hover:text-(--brand-primary) transition-colors">
                                        Show all invoices
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
                                            <span className="text-[10px] font-bold text-(--text-main)">All Invoices</span>
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

export default Invoices;
