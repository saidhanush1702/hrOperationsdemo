import { useState, useEffect } from 'react';
import { Scale, Search, Filter, Globe, X, Download, ChevronRight, AlertTriangle } from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import ReconcileDetailModal from './ReconcileDetailModal';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import { exportToExcel } from '../../../utils/exportToExcel';
import { rowOpen } from '../../../utils/rowClick';
import { matchesSearch } from '../../../utils/searchMatch';

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SelectFilter = ({ value, onChange, options, icon: Icon, placeholder }) => (
    <div className="relative w-full sm:w-40 shrink-0 group">
        <div className="absolute left-3 sm:left-2.5 top-1/2 -translate-y-1/2 text-(--text-muted) group-focus-within:text-(--brand-primary) transition-colors pointer-events-none">
            <Icon size={14} />
        </div>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 sm:py-1.5 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl sm:rounded-lg text-xs font-bold focus:border-(--brand-primary) outline-none transition-all shadow-sm appearance-none"
        >
            <option value="ALL">{placeholder}</option>
            {(options || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
    </div>
);

// A difference is only meaningful past a cent — floating-point noise from
// hours x rate should not paint a row as out of balance.
const isBalanced = (diff) => Math.abs(parseFloat(diff || 0)) < 0.01;

const Reconcile = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lookups, setLookups] = useState({ payTypes: [], countries: [] });
    const [showFilters, setShowFilters] = useState(false);

    const [filterStatus, setFilterStatus]   = useState('ALL');
    const [filterPayType, setFilterPayType] = useState('ALL');
    const [filterCountry, setFilterCountry] = useState('ALL');
    const [filterBalance, setFilterBalance] = useState('ALL'); // ALL | OUTSTANDING
    const [searchQuery, setSearchQuery]     = useState('');
    const [currentPage, setCurrentPage]     = useState(1);

    const [selectedEmployee, setSelectedEmployee] = useState(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const [res, lk] = await Promise.all([
                    managementAPI.getReconcileSummary(),
                    commonAPI.getLookups(),
                ]);
                setData(res.data || []);
                if (lk.data) setLookups(lk.data);
            } catch (err) {
                console.error('Failed to load reconciliation', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    useEffect(() => { setCurrentPage(1); }, [filterStatus, filterPayType, filterCountry, filterBalance, searchQuery]);

    // Search and non-status filters first, so the status tab counts describe the
    // set the user is currently looking at — same ordering as Workforce.
    const baseFiltered = data.filter(row => {
        if (filterPayType !== 'ALL' && String(row.pay_type_id) !== String(filterPayType)) return false;
        if (filterCountry !== 'ALL' && String(row.country_id) !== String(filterCountry)) return false;
        if (filterBalance === 'OUTSTANDING' && isBalanced(row.difference)) return false;
        if (!matchesSearch(searchQuery,
            row.first_name, row.last_name, row.employee_code, row.pay_type_name)) return false;
        return true;
    });

    const tabCounts = {
        ALL:        baseFiltered.length,
        ACTIVE:     baseFiltered.filter(r => r.is_active).length,
        TERMINATED: baseFiltered.filter(r => !r.is_active).length,
    };

    const filtered = baseFiltered.filter(row => {
        if (filterStatus === 'ACTIVE'     && !row.is_active) return false;
        if (filterStatus === 'TERMINATED' &&  row.is_active) return false;
        return true;
    });

    const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    // Only the unpriced-hours count is still needed: the Expected / Paid / Difference
    // tiles were removed, and every one of those figures is already shown per row.
    const totals = filtered.reduce(
        (acc, r) => ({ unpriced: acc.unpriced + parseFloat(r.unpriced_hours || 0) }),
        { unpriced: 0 }
    );

    const isFilterActive = filterCountry !== 'ALL' || filterPayType !== 'ALL' || filterStatus !== 'ALL' || filterBalance !== 'ALL' || searchQuery;

    const handleExport = () => {
        const headers = ['Employee Code', 'Employee', 'Pay Type', 'Status', 'Approved Hours', 'Hours With No Pay Rate', 'Expected Amount', 'Paid Hours', 'Paid Amount', 'Difference'];
        const keys    = ['employee_code', 'full_name', 'pay_type_name', 'status_label', 'expected_hours', 'unpriced_hours', 'expected_amount_fmt', 'paid_hours', 'paid_amount_fmt', 'difference_fmt'];
        const rows = filtered.map(r => ({
            ...r,
            full_name:           `${r.first_name} ${r.last_name}`,
            pay_type_name:       r.pay_type_name || '—',
            status_label:        r.is_active ? 'Active' : 'Terminated',
            expected_amount_fmt: parseFloat(r.expected_amount || 0).toFixed(2),
            paid_amount_fmt:     parseFloat(r.paid_amount || 0).toFixed(2),
            difference_fmt:      parseFloat(r.difference || 0).toFixed(2),
        }));
        exportToExcel(rows, headers, keys, 'reconciliation');
    };

    return (
        <div className="-mt-4 lg:-mt-8 -mx-4 lg:-mx-8 flex flex-col gap-2 animate-in fade-in duration-500">
            <div className="flex flex-col h-[calc(100vh-4rem)] gap-2">

                {/* HEADER */}
                <div className="bg-(--bg-surface) px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-(--border-subtle) shadow-sm flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 sm:h-10 sm:w-10 bg-(--brand-primary)/10 rounded-xl flex items-center justify-center text-(--brand-primary)">
                            <Scale size={18} className="sm:w-5 sm:h-5" />
                        </div>
                        <div>
                            <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-(--text-main) leading-none">Reconcile</h1>
                            <p className="hidden sm:block text-[10px] text-(--text-muted) mt-1 uppercase tracking-widest font-bold">Approved timesheets vs amounts paid</p>
                        </div>

                        {/* Approved hours on placements with no pay rate cannot be priced,
                            so they contribute $0 to every total. Without calling that out,
                            those employees read as perfectly settled.

                            Only rendered when there are any -- a permanently visible icon
                            would stop meaning anything. Opens on hover and on keyboard
                            focus, so it is not mouse-only. */}
                        {totals.unpriced > 0 && (
                            <div className="relative group shrink-0">
                                <button
                                    type="button"
                                    aria-label={`${totals.unpriced.toLocaleString('en-US', { maximumFractionDigits: 2 })} approved hours sit on placements with no pay rate on file`}
                                    className="flex items-center justify-center h-7 w-7 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/25 hover:bg-amber-500/20 transition-colors outline-none cursor-help"
                                >
                                    <AlertTriangle size={14} />
                                </button>
                                <div
                                    role="tooltip"
                                    className="pointer-events-none absolute left-0 top-full mt-2 w-[260px] sm:w-[340px] rounded-xl border border-amber-500/30 bg-(--bg-surface) shadow-lg px-3 py-2.5 z-50
                                               opacity-0 invisible translate-y-1 transition-all duration-150
                                               group-hover:opacity-100 group-hover:visible group-hover:translate-y-0
                                               group-focus-within:opacity-100 group-focus-within:visible group-focus-within:translate-y-0"
                                >
                                    <p className="text-[11px] text-(--text-main) font-bold leading-relaxed">
                                        {totals.unpriced.toLocaleString('en-US', { maximumFractionDigits: 2 })} approved hours sit on placements with no pay rate on file.
                                        <span className="font-normal text-(--text-muted) block mt-1">
                                            They price at $0, so they are excluded from Expected, Paid and Difference, and payroll cannot pay them. Add a pay rate to the placement to bring them in.
                                        </span>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleExport}
                        title="Export to Excel"
                        className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 w-9 h-9 sm:w-auto sm:px-4 sm:py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2 shrink-0 outline-none"
                    >
                        <Download size={15} /> <span className="hidden sm:inline">Export</span>
                    </button>
                </div>

                {/* TABLE CARD */}
                <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden">

                    {/* Mobile filter toggle */}
                    <div className="lg:hidden px-4 py-3 border-b border-(--border-subtle) bg-(--bg-app)/30 flex justify-between items-center shrink-0">
                        <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">
                            {filtered.length} Employee{filtered.length !== 1 ? 's' : ''}
                        </span>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`p-2 rounded-lg border flex items-center justify-center transition-all outline-none ${isFilterActive || showFilters ? 'bg-(--brand-primary)/10 border-(--brand-primary)/30 text-(--brand-primary)' : 'bg-(--bg-surface) border-(--border-subtle) text-(--text-muted) hover:text-(--text-main)'}`}
                        >
                            {showFilters ? <X size={16} /> : <Filter size={16} />}
                        </button>
                    </div>

                    {/* Filters toolbar */}
                    <div className={`${showFilters ? 'flex' : 'hidden'} lg:flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 px-4 sm:px-6 py-4 lg:py-3 border-b border-(--border-subtle) bg-(--bg-app)/30 shrink-0`}>
                        <div className="flex p-1 bg-(--bg-surface) rounded-xl lg:rounded-lg border border-(--border-subtle) w-full lg:w-auto shadow-sm overflow-x-auto hide-scrollbar shrink-0">
                            {['ALL', 'ACTIVE', 'TERMINATED'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setFilterStatus(tab)}
                                    className={`flex-1 lg:flex-none whitespace-nowrap px-3 sm:px-4 py-2 lg:py-1.5 rounded-lg lg:rounded-md text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 outline-none ${filterStatus === tab ? 'bg-(--brand-primary)/10 text-(--brand-primary)' : 'text-(--text-muted) hover:text-(--text-main)'}`}
                                >
                                    {tab}
                                    <span className={`px-1.5 py-0.5 rounded-md text-[9px] leading-none ${filterStatus === tab ? 'bg-(--brand-primary) text-(--brand-primary-text)' : 'bg-(--border-subtle) text-(--text-muted)'}`}>
                                        {tabCounts[tab]}
                                    </span>
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                            <div className="flex flex-row gap-3 w-full sm:w-auto">
                                <SelectFilter value={filterCountry} onChange={setFilterCountry} options={lookups.countries} icon={Globe} placeholder="All Origins" />
                                <SelectFilter value={filterPayType} onChange={setFilterPayType} options={lookups.payTypes} icon={Filter} placeholder="All Pay" />
                            </div>
                            <button
                                onClick={() => setFilterBalance(v => v === 'OUTSTANDING' ? 'ALL' : 'OUTSTANDING')}
                                className={`w-full sm:w-auto whitespace-nowrap px-3 py-2.5 sm:py-1.5 rounded-xl sm:rounded-lg text-[10px] font-bold uppercase tracking-widest border transition-all outline-none shadow-sm ${filterBalance === 'OUTSTANDING' ? 'bg-amber-500/15 text-amber-600 border-amber-500/30' : 'bg-(--bg-surface) text-(--text-muted) border-(--border-subtle) hover:text-(--text-main)'}`}
                            >
                                Unbalanced only
                            </button>
                            <div className="relative w-full sm:w-48 lg:w-56 shrink-0 group">
                                <div className="absolute left-3 sm:left-2.5 top-1/2 -translate-y-1/2 text-(--text-muted) group-focus-within:text-(--brand-primary) transition-colors">
                                    <Search size={14} />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search name or employee code..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 sm:py-1.5 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl sm:rounded-lg text-xs font-bold focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) outline-none transition-all placeholder:text-(--text-muted) placeholder:font-normal shadow-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* MOBILE CARD LIST */}
                    <div className="sm:hidden flex-1 overflow-y-auto divide-y divide-(--border-subtle)">
                        {loading ? (
                            <div className="py-10 text-center text-xs text-(--text-muted) uppercase tracking-widest font-bold">Loading…</div>
                        ) : paginated.length > 0 ? (
                            paginated.map(row => (
                                <button
                                    key={row.employee_id}
                                    onClick={() => setSelectedEmployee(row)}
                                    className="w-full text-left px-4 py-3.5 hover:bg-(--bg-app) transition-colors outline-none"
                                >
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-(--text-main) truncate">{row.first_name} {row.last_name}</p>
                                            <p className="text-[9px] text-(--text-muted) font-mono mt-0.5">{row.employee_code}</p>
                                            <div className="grid grid-cols-3 gap-2 mt-2">
                                                <div>
                                                    <p className="text-[8px] font-bold uppercase tracking-widest text-(--text-muted)">Expected</p>
                                                    <p className="text-[11px] font-bold text-(--text-main)">{fmt$(row.expected_amount)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[8px] font-bold uppercase tracking-widest text-(--text-muted)">Paid</p>
                                                    <p className="text-[11px] font-bold text-emerald-600">{fmt$(row.paid_amount)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[8px] font-bold uppercase tracking-widest text-(--text-muted)">Diff</p>
                                                    <p className={`text-[11px] font-bold ${isBalanced(row.difference) ? 'text-(--text-muted)' : 'text-amber-600'}`}>{fmt$(row.difference)}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <ChevronRight size={14} className="text-(--text-muted) shrink-0 mt-1" />
                                    </div>
                                </button>
                            ))
                        ) : (
                            <div className="py-12 text-center text-(--text-muted) font-bold uppercase tracking-widest text-xs px-4">No employees match these filters.</div>
                        )}
                    </div>

                    {/* DESKTOP TABLE */}
                    <div className="hidden sm:flex flex-col flex-1 overflow-hidden">
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left table-fixed">
                                <thead className="bg-(--bg-app) text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-3.5 w-[26%]">Employee</th>
                                        <th className="px-4 py-3.5 w-[10%]">Pay Type</th>
                                        <th className="px-4 py-3.5 w-[11%] text-right">Approved Hrs</th>
                                        <th className="px-4 py-3.5 w-[15%] text-right">Expected</th>
                                        <th className="px-4 py-3.5 w-[15%] text-right">Paid</th>
                                        <th className="px-4 py-3.5 w-[15%] text-right">Difference</th>
                                        <th className="px-4 py-3.5 w-[8%] text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm divide-y divide-(--border-subtle)">
                                    {loading ? (
                                        <tr><td colSpan="7" className="p-16 text-center text-(--text-muted) font-bold uppercase tracking-widest text-xs">Loading reconciliation…</td></tr>
                                    ) : paginated.length > 0 ? (
                                        paginated.map(row => {
                                            const balanced = isBalanced(row.difference);
                                            return (
                                                <tr key={row.employee_id}
                                                    onClick={rowOpen(() => setSelectedEmployee(row))}
                                                    title="View Reconciliation"
                                                    className="hover:bg-(--bg-app) transition-colors group cursor-pointer">
                                                    <td className="px-6 py-3.5 overflow-hidden">
                                                        <div className="flex items-center gap-3">
                                                            <div className="relative shrink-0">
                                                                <div className="h-9 w-9 rounded-full bg-(--bg-surface) border border-(--border-subtle) flex items-center justify-center text-[10px] font-bold text-(--text-muted) uppercase shadow-sm">
                                                                    {row.first_name?.[0] || '?'}{row.last_name?.[0] || '?'}
                                                                </div>
                                                                <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-(--bg-surface) ${row.is_active ? 'bg-green-500' : 'bg-red-500'}`} title={row.is_active ? 'Active' : 'Terminated'} />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className={`text-sm font-bold tracking-tight leading-none truncate ${row.is_active ? 'text-(--text-main)' : 'text-red-500/80'}`}>
                                                                    {row.first_name} {row.last_name}
                                                                </p>
                                                                <p className="text-[10px] text-(--text-muted) font-mono tracking-tighter mt-1 uppercase truncate">{row.employee_code || '---'}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3.5">
                                                        <span className="px-2 py-0.5 bg-(--brand-primary)/10 text-(--brand-primary) rounded text-[10px] font-bold border border-(--brand-primary)/20 truncate inline-block max-w-full">
                                                            {row.pay_type_name || '---'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right">
                                                        <div className="font-bold text-(--text-main) text-xs">{parseFloat(row.expected_hours || 0).toFixed(2)}</div>
                                                        {parseFloat(row.unpriced_hours || 0) > 0 && (
                                                            <div className="text-[9px] font-bold uppercase tracking-widest text-amber-600 mt-0.5"
                                                                title="Approved hours on a placement with no pay rate on file. They cannot be priced or paid.">
                                                                {parseFloat(row.unpriced_hours).toFixed(2)} no rate
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right font-bold text-(--text-main)">{fmt$(row.expected_amount)}</td>
                                                    <td className="px-4 py-3.5 text-right font-bold text-emerald-600">{fmt$(row.paid_amount)}</td>
                                                    <td className="px-4 py-3.5 text-right">
                                                        <span className={`font-bold ${balanced ? 'text-(--text-muted)' : 'text-amber-600'}`}>{fmt$(row.difference)}</span>
                                                        {!balanced && (
                                                            <div className="text-[9px] font-bold uppercase tracking-widest text-amber-500 mt-0.5">Unbalanced</div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3.5 text-right">
                                                        <button
                                                            onClick={() => setSelectedEmployee(row)}
                                                            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest bg-(--bg-surface) text-(--text-main) hover:bg-(--brand-primary) hover:text-(--brand-primary-text) hover:border-(--brand-primary) px-3 py-1.5 rounded-lg border border-(--border-subtle) transition-all shadow-sm outline-none"
                                                        >
                                                            View <ChevronRight size={12} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr><td colSpan="7" className="p-16 text-center text-(--text-muted) font-bold uppercase tracking-widest text-xs">No employees match these filters.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <Pagination currentPage={currentPage} totalItems={filtered.length} onPageChange={setCurrentPage} />
                </div>
            </div>

            {selectedEmployee && (
                <ReconcileDetailModal
                    employee={selectedEmployee}
                    onClose={() => setSelectedEmployee(null)}
                />
            )}
        </div>
    );
};

export default Reconcile;
