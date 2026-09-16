import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Receipt, AlertCircle, CheckCircle2, Trash2, RefreshCw, Download, Layers, FileText, Send,
    FolderOpen, Settings2, User,
} from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import { rowOpen } from '../../../utils/rowClick';
import ManageInvoiceModal from './ManageInvoiceModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import DateRangeFilter from '../../../components/ui/DateRangeFilter';
import { fmtDate } from '../../../utils/dateUtils';
import { exportToExcel } from '../../../utils/exportToExcel';
import {
    PageHero, StatRail, StatTile, Workbench, FilterDock, DockField, DockOptions, SearchInput, SelectInput,
    Btn, Chip, RecordCard, EmptyState,
} from '../../../components/ui/kit';

const TABS = [
    { key: 'ALL',      label: 'All invoices',  icon: Layers },
    { key: 'DRAFT',    label: 'Drafts',        icon: FileText },
    { key: 'READY',    label: 'Ready to send', icon: Send },
    { key: 'OPEN',     label: 'Open',          icon: FolderOpen },
    { key: 'PAST_DUE', label: 'Overdue',       icon: AlertCircle },
    { key: 'PAID',     label: 'Paid',          icon: CheckCircle2 },
];

const EMPTY_FILTERS = { payType: 'ALL', employee: 'ALL', client: 'ALL', dateFrom: '', dateTo: '' };

// Dropdown filters count when set to something other than ALL; the date range
// counts as a single filter no matter which of its two bounds is filled in.
const countActive = (f) =>
    ['payType', 'employee', 'client'].filter(k => f[k] !== 'ALL').length + ((f.dateFrom || f.dateTo) ? 1 : 0);

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
    const [applied, setApplied] = useState(EMPTY_FILTERS);

    const isOrgAdmin = localStorage.getItem('userRole') === 'ORG_ADMIN';

    // ─── multi-select state ───────────────────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState(new Set());

    // ─── invoice scope (server-side filter) ──────────────────────────────────
    const [showAllInvoices, setShowAllInvoices] = useState(false);

    // Search is debounced so typing does not fire a request per keystroke.
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // The single source of truth for "which invoices am I looking at". The list,
    // the counts, select-all and export are all driven from this same object.
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

    // getLookups runs once; fetchInvoices re-runs whenever its inputs change
    const didInit = useRef(false);
    useEffect(() => {
        if (!didInit.current) {
            didInit.current = true;
            commonAPI.getLookups().then(res => setLookups(res.data)).catch(() => {});
        }
        fetchInvoices();
    }, [fetchInvoices]);

    // Filter options come from the server; reload when the scope changes.
    useEffect(() => {
        managementAPI.getInvoiceFilterOptions(!showAllInvoices)
            .then(res => setFilterOptions(res.data))
            .catch(() => {});
    }, [showAllInvoices]);

    // reset page + selection when filters change
    useEffect(() => { setCurrentPage(1); setSelectedIds(new Set()); }, [filterTab, debouncedSearch, applied, showAllInvoices]);

    const uniqueEmployees = filterOptions.employees;
    const uniqueClients   = filterOptions.clients;

    // The server has already applied every filter, the status tab and the paging.
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

    // Select every invoice matching the current filters (ids only).
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
        if (!window.confirm(`Delete ${selectedIds.size} selected invoice(s)? Attached time logs will be returned to the unbilled queue.`)) return;
        try {
            await Promise.all([...selectedIds].map(id => managementAPI.deleteInvoice(id)));
            setSelectedIds(new Set());
            fetchInvoices();
        } catch (err) {
            alert(err.response?.data?.error || 'Failed to delete some invoices.');
            fetchInvoices();
        }
    };

    // ─── filter actions ───────────────────────────────────────────────────────
    const setFilter = (key, value) => setApplied(prev => ({ ...prev, [key]: value }));
    const clearAll  = () => { setApplied(EMPTY_FILTERS); setShowAllInvoices(false); setSearchQuery(''); };
    const activeCount = countActive(applied) + (showAllInvoices ? 1 : 0) + (searchQuery ? 1 : 0);

    // ─── other handlers ───────────────────────────────────────────────────────
    const handleGenerate = async () => {
        setGenerating(true);
        try {
            await managementAPI.generateInvoices();
            fetchInvoices();
        } catch (err) {
            console.error('Invoice sync failed:', err);
        } finally {
            setGenerating(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this invoice? Attached time logs will be returned to the unbilled queue.")) return;
        try {
            await managementAPI.deleteInvoice(id);
            fetchInvoices();
        } catch (error) {
            alert(error.response?.data?.error || "Failed to delete invoice.");
        }
    };

    const getStatusLabel = (id) => ({ 1: 'Not Ready', 2: 'Ready to Approve', 3: 'Ready to Invoice', 4: 'Open Invoice', 5: 'Overdue', 6: 'Paid' }[id] || '');

    // Export fetches the full filtered set first.
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
        const headers = ['Invoice #', 'Partner', 'Consultant', 'Pay Model', 'Period Start', 'Period End', 'Due Date', 'Total Amount', 'Amount Paid', 'Remaining Amount', 'Status'];
        const keys    = ['invoice_number', 'client_name', 'emp_name', 'pay_type_name', 'period_start', 'period_end', 'due_date', 'adj_total_amount', 'paid_amount', 'remaining_amount', 'status_label'];
        const rows = source.map(inv => {
            const totalAmount = parseFloat(inv.total_amount || 0) + parseFloat(inv.adj_total || 0);
            const paidAmount  = parseFloat(inv.amount_paid || 0);
            const remaining   = Math.max(0, totalAmount - paidAmount);
            // Any payment short of the full balance reads as Partially Paid in the
            // export only; the stored status is untouched.
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
        exportToExcel(rows, headers, keys, 'billing');
        setExporting(false);
    };

    const getStatusChip = (statusId) => {
        switch (statusId) {
            case 1: return <Chip tone="slate">Not ready</Chip>;
            case 2: return <Chip tone="sky">Ready</Chip>;
            case 3: return <Chip tone="amber">Ready to invoice</Chip>;
            case 4: return <Chip tone="fuchsia">Open</Chip>;
            case 5: return <Chip tone="rose" icon={AlertCircle}>Overdue</Chip>;
            case 6: return <Chip tone="green" icon={CheckCircle2}>Paid</Chip>;
            default: return null;
        }
    };

    return (
        <div className="mx-auto max-w-[1800px] space-y-4">
            <PageHero
                icon={Receipt}
                eyebrow="Money"
                title="Billing"
                description="Every invoice from draft to paid — amounts, due dates and collections."
                actions={
                    <>
                        <Btn variant="success" icon={Download} onClick={handleExport} disabled={exporting} title="Export to Excel">
                            {exporting ? 'Preparing…' : 'Export'}
                        </Btn>
                        <Btn variant="primary" icon={RefreshCw} onClick={handleGenerate} disabled={generating}>
                            {generating ? 'Syncing…' : 'Sync invoices'}
                        </Btn>
                    </>
                }
            >
                <StatRail>
                    {TABS.map(tab => (
                        <StatTile
                            key={tab.key}
                            label={tab.label}
                            icon={tab.icon}
                            value={tabCounts[tab.key] ?? 0}
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
                            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Invoice #, name or engagement ID…" />
                        </DockField>
                        <DockField label="Billing period">
                            <DateRangeFilter
                                from={applied.dateFrom}
                                to={applied.dateTo}
                                onChange={({ from, to }) => setApplied(p => ({ ...p, dateFrom: from, dateTo: to }))}
                                hint="Shows billing periods overlapping this range"
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
                                value={showAllInvoices ? 'ALL' : 'ACTIVE'}
                                onChange={v => setShowAllInvoices(v === 'ALL')}
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
                        <span className="font-semibold text-(--text-main)">{total}</span> invoices
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
                            Select this page
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
                                <div className="nx-shimmer h-7 w-28 rounded-full" />
                            </div>
                        ))}
                    </div>
                ) : paginatedInvoices.length === 0 ? (
                    <EmptyState icon={Receipt} title="No invoices found" text="Try another status, filter or scope." />
                ) : (
                    <div className="space-y-2.5">
                        {paginatedInvoices.map(inv => {
                            const adjTotal = parseFloat(inv.total_amount) + parseFloat(inv.adj_total || 0);
                            const partlyPaid = parseFloat(inv.amount_paid) > 0 && inv.status_id !== 6;
                            return (
                                <RecordCard
                                    key={inv.id}
                                    onClick={rowOpen(() => setSelectedInvoice(inv))}
                                    title="Manage invoice"
                                    className={selectedIds.has(inv.id) ? 'border-(--brand-primary)/60 bg-(--brand-primary)/5' : ''}
                                >
                                    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                                        {isOrgAdmin && (
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(inv.id)}
                                                onChange={() => toggleSelect(inv.id)}
                                                className="h-4 w-4 shrink-0 cursor-pointer"
                                            />
                                        )}
                                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-(--brand-primary)/10 text-(--brand-primary)">
                                            <Receipt size={20} />
                                        </span>
                                        <div className="min-w-[170px] flex-1">
                                            <p className="truncate text-sm font-semibold text-(--text-main)">{inv.client_name}</p>
                                            <p className="flex items-center gap-1.5 truncate text-xs text-(--text-muted)">
                                                <User size={12} className="shrink-0" /> {inv.emp_first} {inv.emp_last}
                                            </p>
                                            <p className="truncate font-mono text-[11px] text-(--text-muted)">{inv.invoice_number}</p>
                                        </div>
                                        <div className="hidden min-w-[180px] md:block">
                                            <p className="text-[11px] text-(--text-muted)">Billing period</p>
                                            <p className="text-xs font-medium text-(--text-main)">{fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}</p>
                                            {inv.due_date && (
                                                <p className={`text-[11px] ${inv.status_id === 5 ? 'font-semibold text-rose-500' : 'text-(--text-muted)'}`}>Due {fmtDate(inv.due_date)}</p>
                                            )}
                                        </div>
                                        <div className="min-w-[120px] text-right">
                                            {partlyPaid ? (
                                                <>
                                                    <p className="text-lg font-semibold text-rose-500" style={{ fontFamily: 'var(--font-display)' }}>{fmt$(adjTotal - parseFloat(inv.amount_paid))}</p>
                                                    <p className="text-[11px] text-(--text-muted)">left of {fmt$(adjTotal)}</p>
                                                </>
                                            ) : (
                                                <p className={`text-lg font-semibold ${inv.status_id === 6 ? 'text-emerald-500' : 'text-(--text-main)'}`} style={{ fontFamily: 'var(--font-display)' }}>{fmt$(adjTotal)}</p>
                                            )}
                                            <p className="font-mono text-[11px] text-(--text-muted)">{Number(inv.total_hours)} h</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {inv.pay_type_name && <Chip tone="brand">{inv.pay_type_name}</Chip>}
                                            {getStatusChip(inv.status_id)}
                                        </div>
                                        <div className="ml-auto flex items-center gap-1.5">
                                            <Btn size="sm" icon={Settings2} onClick={() => setSelectedInvoice(inv)}>Manage</Btn>
                                            {isOrgAdmin && (
                                                <Btn size="icon" variant="danger" icon={Trash2} onClick={() => handleDelete(inv.id)} title="Delete invoice" />
                                            )}
                                        </div>
                                    </div>
                                </RecordCard>
                            );
                        })}
                    </div>
                )}

                {isOrgAdmin && selectedIds.size > 0 && (
                    <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-rose-500/30 bg-(--bg-surface) px-5 py-3" style={{ boxShadow: 'var(--shadow-floating)' }}>
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-rose-500">
                            <span>{selectedIds.size} invoice{selectedIds.size > 1 ? 's' : ''} selected</span>
                            {selectedIds.size < total && (
                                <button onClick={selectAllMatching} disabled={selectingAll} className="text-xs font-semibold text-(--brand-primary) outline-none hover:underline disabled:opacity-50">
                                    {selectingAll ? 'Selecting…' : `Select all ${total} matching`}
                                </button>
                            )}
                        </span>
                        <div className="flex items-center gap-2">
                            <Btn size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Btn>
                            <Btn size="sm" variant="danger" icon={Trash2} onClick={handleDeleteSelected}>Delete {selectedIds.size}</Btn>
                        </div>
                    </div>
                )}

                <div className="overflow-hidden rounded-[20px] border border-(--border-subtle)">
                    <Pagination currentPage={currentPage} totalItems={total} onPageChange={setCurrentPage} />
                </div>
            </Workbench>

            <AuditLogPanel module="invoices" />

            {selectedInvoice && <ManageInvoiceModal invoice={selectedInvoice} onClose={() => setSelectedInvoice(null)} onRefresh={fetchInvoices} />}
        </div>
    );
};

export default Invoices;
