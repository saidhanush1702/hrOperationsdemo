import { useState, useEffect } from 'react';
import { FileSpreadsheet, Search, Plus, Download, Loader2, ChevronRight } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import BalanceSheetDetailModal from './BalanceSheetDetailModal';
import AddAdjustmentModal from './AddAdjustmentModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import { exportToExcel } from '../../../utils/exportToExcel';
import { fmtDate } from '../../../utils/dateUtils';
import { rowOpen } from '../../../utils/rowClick';
import { matchesSearch } from '../../../utils/searchMatch';

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BalanceSheet = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await managementAPI.getBalanceSheets();
            setData(res.data);
        } catch (err) {
            console.error("Failed to load balance sheets", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);
    useEffect(() => { setCurrentPage(1); }, [searchTerm, filterStatus]);

    // Search first, so the tab counts reflect the current search the way the
    // Workforce page does — tabs narrow the searched set, not the other way round.
    const searchedData = data.filter(row => {
        return matchesSearch(searchTerm,
            row.first_name, row.last_name, row.employee_code);
    });

    const tabCounts = {
        ALL:       searchedData.length,
        ACTIVE:    searchedData.filter(r => r.is_active).length,
        COMPLETED: searchedData.filter(r => !r.is_active).length,
    };

    const filteredData = searchedData.filter(row => {
        if (filterStatus === 'ACTIVE'    && !row.is_active) return false;
        if (filterStatus === 'COMPLETED' &&  row.is_active) return false;
        return true;
    });

    const paginatedData = filteredData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await managementAPI.getBalanceSheetsExport();
            const txRows = res.data || [];

            if (txRows.length === 0) {
                const headers = ['Employee Code', 'Name', 'Placement Earnings', 'Manual Additions', 'Manual Deductions', 'Fixed Pay Paid', 'Net Balance'];
                const keys    = ['employee_code', 'full_name', 'placement_earnings', 'manual_additions', 'manual_deductions', 'c2c_fixed_payouts', 'net_balance'];
                const rows = filteredData.map(r => ({ ...r, full_name: `${r.first_name} ${r.last_name}` }));
                exportToExcel(rows, headers, keys, 'balance_sheets');
                return;
            }

            const headers = [
                'Employee Code', 'Employee Name', 'Section', 'Placement Code',
                'Client', 'Pay Type', 'Transaction Type',
                'Invoice #', 'Date', 'Period',
                'Hours', 'Pay Rate ($)', 'Amount ($)', 'Reason',
            ];
            const keys = [
                'employee_code', 'employee_name', 'section', 'placement_code',
                'client_name', 'pay_type', 'transaction_type',
                'invoice_number', 'date_fmt', 'period',
                'hours_fmt', 'pay_rate_fmt', 'amount_fmt', 'reason',
            ];
            const rows = txRows.map(r => ({
                ...r,
                date_fmt:     fmtDate(r.date),
                hours_fmt:    r.hours !== '' ? parseFloat(r.hours || 0).toFixed(2) : '',
                pay_rate_fmt: r.pay_rate > 0  ? parseFloat(r.pay_rate).toFixed(2)  : '',
                amount_fmt:   parseFloat(r.amount || 0).toFixed(2),
            }));
            exportToExcel(rows, headers, keys, 'balance_sheet_detail');
        } catch (err) {
            console.error('Balance sheet export failed:', err);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="-mt-4 lg:-mt-8 -mx-4 lg:-mx-8 flex flex-col gap-2 animate-in fade-in duration-500">
            <div className="flex flex-col h-[calc(100vh-4rem)] gap-2">

                {/* HEADER CARD */}
                <div className="bg-(--bg-surface) px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-(--border-subtle) shadow-sm flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 sm:h-10 sm:w-10 bg-(--brand-primary)/10 rounded-xl flex items-center justify-center text-(--brand-primary)">
                            <FileSpreadsheet size={18} className="sm:w-5 sm:h-5" />
                        </div>
                        <div>
                            <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-(--text-main) leading-none">Employee Balance Ledger</h1>
                            <p className="hidden sm:block text-[10px] text-(--text-muted) mt-1 uppercase tracking-widest font-bold">Track balance per employee</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleExport}
                            title="Export to Excel"
                            className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 w-9 h-9 sm:w-auto sm:px-4 sm:py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2 shrink-0 outline-none"
                        >
                            <Download size={15} /> <span className="hidden sm:inline">Export</span>
                        </button>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="bg-(--brand-primary) text-(--brand-primary-text) w-9 h-9 sm:w-auto sm:px-5 sm:py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 outline-none"
                        >
                            <Plus size={16} /> <span className="hidden sm:inline">Add Adjustment</span>
                        </button>
                    </div>
                </div>

                {/* TABLE CARD */}
                <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden">
                    <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 px-4 sm:px-6 py-3 border-b border-(--border-subtle) bg-(--bg-app)/30 shrink-0">
                        <div className="flex p-1 bg-(--bg-surface) rounded-xl lg:rounded-lg border border-(--border-subtle) w-full lg:w-auto shadow-sm overflow-x-auto hide-scrollbar shrink-0">
                            {['ALL', 'ACTIVE', 'COMPLETED'].map(tab => (
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
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
                            <div className="flex items-center justify-center px-3 py-1.5 bg-(--bg-surface) border border-(--border-subtle) rounded-lg shadow-sm w-auto shrink-0">
                                <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest whitespace-nowrap">
                                    {filteredData.length} Employee{filteredData.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <div className="relative w-full sm:w-64 xl:w-72">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)">
                                    <Search size={13} />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search name or employee code..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-8 pr-3 py-2 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl text-xs font-bold focus:border-(--brand-primary) outline-none shadow-sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* MOBILE CARD LIST — hidden on sm+ */}
                    <div className="sm:hidden flex-1 overflow-y-auto divide-y divide-(--border-subtle)">
                        {loading ? (
                            <div className="py-10 text-center text-xs text-(--text-muted) uppercase tracking-widest font-bold">Loading ledger data...</div>
                        ) : paginatedData.length > 0 ? (
                            paginatedData.map(row => (
                                <div key={row.employee_id}
                                    onClick={rowOpen(() => setSelectedEmployee(row))}
                                    className="px-4 py-3.5 hover:bg-(--bg-app) transition-colors cursor-pointer">
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-(--text-main) truncate">{row.first_name} {row.last_name}</p>
                                            <p className="text-[9px] text-(--text-muted) font-mono uppercase tracking-tight mt-0.5">{row.employee_code}</p>
                                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border ${row.net_balance >= 0 ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-red-500/10 text-red-600 border-red-500/20'}`}>
                                                    Net: {row.net_balance >= 0 ? '' : '-'}{fmt$(Math.abs(row.net_balance))}
                                                </span>
                                                <span className="text-[9px] text-green-600 font-mono">+{fmt$(row.manual_additions)}</span>
                                                <span className="text-[9px] text-red-500 font-mono">-{fmt$(row.manual_deductions)}</span>
                                                {row.c2c_fixed_payouts > 0 && (
                                                    <span className="text-[9px] text-amber-600 font-mono" title="Fixed pay drawn by payroll">
                                                        -{fmt$(row.c2c_fixed_payouts)} fixed
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {/* The whole card opens the ledger. */}
                                        <ChevronRight size={14} className="text-(--text-muted) shrink-0 mt-1" />
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="py-12 text-center text-(--text-muted) font-bold uppercase tracking-widest text-xs">No records found.</div>
                        )}
                    </div>

                    {/* DESKTOP TABLE — hidden on mobile */}
                    <div className="hidden sm:flex flex-col flex-1 overflow-hidden">
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left table-fixed">
                                <thead className="bg-(--bg-app) text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-3 sm:py-3.5 w-[22%]">Employee</th>
                                        <th className="px-6 py-3 sm:py-3.5 w-[15%] text-right">Placement Earnings</th>
                                        <th className="px-6 py-3 sm:py-3.5 w-[13%] text-right">Manual Additions</th>
                                        <th className="px-6 py-3 sm:py-3.5 w-[13%] text-right">Manual Deductions</th>
                                        <th className="px-6 py-3 sm:py-3.5 w-[14%] text-right" title="Fixed pay handed to the employee by payroll, drawn out of their C2C balance.">Fixed Pay Paid</th>
                                        <th className="px-6 py-3 sm:py-3.5 w-[14%] text-right">Net Balance</th>
                                        <th className="px-6 py-3 sm:py-3.5 w-[9%] text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm divide-y divide-(--border-subtle)">
                                    {loading ? (
                                        <tr><td colSpan="7" className="p-16 text-center text-(--text-muted) font-bold uppercase tracking-widest text-xs">Loading ledger data...</td></tr>
                                    ) : paginatedData.length > 0 ? (
                                        paginatedData.map(row => (
                                            <tr key={row.employee_id}
                                                onClick={rowOpen(() => setSelectedEmployee(row))}
                                                title="View Ledger"
                                                className="hover:bg-(--bg-app) transition-colors group cursor-pointer">
                                                <td className="px-6 py-3 sm:py-3.5">
                                                    <div className="text-xs font-bold text-(--text-main)">{row.first_name} {row.last_name}</div>
                                                    <div className="text-[10px] text-(--text-muted) font-mono uppercase tracking-tight mt-0.5">{row.employee_code}</div>
                                                </td>
                                                <td className="px-6 py-3 sm:py-3.5 text-right font-bold text-(--text-main)">{fmt$(row.placement_earnings)}</td>
                                                <td className="px-6 py-3 sm:py-3.5 text-right font-medium text-green-600">+{fmt$(row.manual_additions)}</td>
                                                <td className="px-6 py-3 sm:py-3.5 text-right font-medium text-red-600">-{fmt$(row.manual_deductions)}</td>
                                                <td className="px-6 py-3 sm:py-3.5 text-right font-medium text-amber-600">
                                                    {row.c2c_fixed_payouts > 0 ? `-${fmt$(row.c2c_fixed_payouts)}` : <span className="text-(--text-muted)">—</span>}
                                                </td>
                                                <td className="px-6 py-3 sm:py-3.5 text-right">
                                                    <span className={`px-2 py-1 rounded-lg text-xs font-bold border inline-block shadow-sm ${row.net_balance >= 0 ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-red-500/10 text-red-600 border-red-500/20'}`}>
                                                        {row.net_balance >= 0 ? '' : '-'}{fmt$(Math.abs(row.net_balance))}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 sm:py-3.5 text-right">
                                                    <button
                                                        onClick={() => setSelectedEmployee(row)}
                                                        className="text-[10px] font-bold uppercase tracking-widest bg-(--bg-surface) text-(--text-main) hover:bg-(--brand-primary) hover:text-(--brand-primary-text) hover:border-(--brand-primary) px-4 py-2 rounded-lg border border-(--border-subtle) transition-all shadow-sm outline-none"
                                                    >
                                                        View
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan="7" className="p-16 text-center text-(--text-muted) font-bold uppercase tracking-widest text-xs">No records found.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <Pagination
                        currentPage={currentPage}
                        totalItems={filteredData.length}
                        onPageChange={setCurrentPage}
                    />
                </div>
            </div>

            <AuditLogPanel module="balance-sheet" />

            {selectedEmployee && (
                <BalanceSheetDetailModal isOpen={!!selectedEmployee} employee={selectedEmployee} onClose={() => setSelectedEmployee(null)} onRefresh={fetchData} />
            )}
            {isAddModalOpen && (
                <AddAdjustmentModal onClose={() => setIsAddModalOpen(false)} onRefresh={fetchData} />
            )}
        </div>
    );
};

export default BalanceSheet;
