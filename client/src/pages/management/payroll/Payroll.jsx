import { useState, useEffect } from 'react';
import { Receipt, PlayCircle, CheckCircle, Clock, ChevronRight, CalendarDays, Download } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import RunPayrollModal from './RunPayrollModal';
import PayrollDetailModal from './PayrollDetailModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import { fmtDate } from '../../../utils/dateUtils';
import { exportToExcel } from '../../../utils/exportToExcel';
import { rowOpen } from '../../../utils/rowClick';

const STATUS_BADGE = {
    DRAFT:     { label: 'Draft',     cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    SUBMITTED: { label: 'Submitted', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
};

const Payroll = () => {
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRunModalOpen, setIsRunModalOpen] = useState(false);
    const [selectedRun, setSelectedRun] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);

    const fetchRuns = async () => {
        setLoading(true);
        try {
            const res = await managementAPI.getPayrollRuns();
            setRuns(res.data);
        } catch (err) {
            console.error('Failed to load payroll runs', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRuns(); }, []);

    const paginatedRuns = runs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const handlePayrollGenerated = (run) => {
        setIsRunModalOpen(false);
        setSelectedRun({ run, readOnly: run.already_exists && run.status === 'SUBMITTED' });
        fetchRuns();
    };

    const handleViewRun = async (row) => {
        try {
            const res = await managementAPI.getPayrollRunDetail(row.id);
            setSelectedRun({ run: res.data, readOnly: res.data.status === 'SUBMITTED' });
        } catch (err) {
            console.error('Failed to load payroll detail', err);
        }
    };

    const handleDetailClose = () => {
        setSelectedRun(null);
        fetchRuns();
    };

    const handleExport = () => {
        const headers = ['Period', 'Period Start', 'Period End', 'Run Date', 'Employees', 'Approved', 'Rejected', 'Status'];
        const keys    = ['period_label', 'period_start', 'period_end', 'run_date', 'total_items', 'approved_count', 'rejected_count', 'status_label'];
        const rows = runs.map(r => ({
            ...r,
            period_start:  fmtDate(r.period_start),
            period_end:    fmtDate(r.period_end),
            run_date:      fmtDate(r.run_date),
            total_items:   r.total_items ?? 0,
            approved_count: r.approved_count ?? 0,
            rejected_count: r.rejected_count ?? 0,
            status_label:  STATUS_BADGE[r.status]?.label || r.status,
        }));
        exportToExcel(rows, headers, keys, 'payroll_runs');
    };

    return (
        <div className="-mt-4 lg:-mt-8 -mx-4 lg:-mx-8 flex flex-col gap-2 animate-in fade-in duration-500">
            <div className="flex flex-col h-[calc(100vh-4rem)] gap-2">

                {/* HEADER */}
                <div className="bg-(--bg-surface) px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-(--border-subtle) shadow-sm flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 sm:h-10 sm:w-10 bg-(--brand-primary)/10 rounded-xl flex items-center justify-center text-(--brand-primary)">
                            <Receipt size={18} className="sm:w-5 sm:h-5" />
                        </div>
                        <div>
                            <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-(--text-main) leading-none">W2 Payroll</h1>
                            <p className="hidden sm:block text-[10px] text-(--text-muted) mt-1 uppercase tracking-widest font-bold">Bi-monthly payroll runs</p>
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
                            onClick={() => setIsRunModalOpen(true)}
                            className="bg-(--brand-primary) text-(--brand-primary-text) w-9 h-9 sm:w-auto sm:px-5 sm:py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 outline-none"
                        >
                            <PlayCircle size={16} />
                            <span className="hidden sm:inline">Run Payroll</span>
                        </button>
                    </div>
                </div>

                {/* TABLE CARD */}
                <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden">
                    <div className="flex items-center gap-4 px-4 sm:px-6 py-3 border-b border-(--border-subtle) bg-(--bg-app)/30 shrink-0">
                        <div className="flex items-center px-3 py-1.5 bg-(--bg-surface) border border-(--border-subtle) rounded-lg shadow-sm">
                            <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">
                                {runs.length} Report{runs.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>

                    {/* MOBILE CARD LIST — hidden on sm+ */}
                    <div className="sm:hidden flex-1 overflow-y-auto divide-y divide-(--border-subtle)">
                        {loading ? (
                            <div className="py-10 text-center text-xs text-(--text-muted) uppercase tracking-widest font-bold">Loading payroll runs...</div>
                        ) : paginatedRuns.length > 0 ? (
                            paginatedRuns.map(row => {
                                const badge = STATUS_BADGE[row.status] || STATUS_BADGE.DRAFT;
                                return (
                                    <div key={row.id}
                                        onClick={rowOpen(() => handleViewRun(row))}
                                        className="px-4 py-3.5 hover:bg-(--bg-app) transition-colors cursor-pointer">
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-bold text-(--text-main) truncate">{row.period_label}</p>
                                                <p className="text-[9px] text-(--text-muted) font-mono mt-0.5 truncate">{fmtDate(row.period_start)} — {fmtDate(row.period_end)}</p>
                                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold border inline-flex items-center gap-1 ${badge.cls}`}>
                                                        {row.status === 'SUBMITTED' ? <CheckCircle size={9} /> : <Clock size={9} />}
                                                        {badge.label}
                                                    </span>
                                                    <span className="text-[9px] text-(--text-muted) font-mono">
                                                        {row.total_items ?? 0} emp · {row.approved_count ?? 0} approved
                                                    </span>
                                                </div>
                                            </div>
                                            {/* The whole card opens the run, so this is an affordance
                                                rather than a control — same as the Reconcile cards. */}
                                            <ChevronRight size={14} className="text-(--text-muted) shrink-0 mt-1" />
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="py-12 text-center text-(--text-muted) font-bold uppercase tracking-widest text-xs px-4">
                                No payroll runs yet. Tap "Run Payroll" to get started.
                            </div>
                        )}
                    </div>

                    {/* DESKTOP TABLE — hidden on mobile */}
                    <div className="hidden sm:flex flex-col flex-1 overflow-hidden">
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left table-fixed">
                                <thead className="bg-(--bg-app) text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) sticky top-0 z-10">
                                    <tr>
                                        <th className="px-6 py-3 sm:py-3.5">Period</th>
                                        <th className="px-6 py-3 sm:py-3.5 text-center">Run Date</th>
                                        <th className="px-6 py-3 sm:py-3.5 text-center">Employees</th>
                                        <th className="px-6 py-3 sm:py-3.5 text-center">Approved</th>
                                        <th className="px-6 py-3 sm:py-3.5 text-center">Rejected</th>
                                        <th className="px-6 py-3 sm:py-3.5 text-center">Status</th>
                                        <th className="px-6 py-3 sm:py-3.5 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm divide-y divide-(--border-subtle)">
                                    {loading ? (
                                        <tr>
                                            <td colSpan="7" className="p-16 text-center text-(--text-muted) font-bold uppercase tracking-widest text-xs">
                                                Loading payroll runs...
                                            </td>
                                        </tr>
                                    ) : paginatedRuns.length > 0 ? (
                                        paginatedRuns.map(row => {
                                            const badge = STATUS_BADGE[row.status] || STATUS_BADGE.DRAFT;
                                            return (
                                                <tr key={row.id}
                                                    onClick={rowOpen(() => handleViewRun(row))}
                                                    title="View Payroll Run"
                                                    className="hover:bg-(--bg-app) transition-colors group cursor-pointer">
                                                    <td className="px-6 py-3 sm:py-3.5">
                                                        <div className="text-xs font-bold text-(--text-main)">{row.period_label}</div>
                                                        <div className="text-[10px] text-(--text-muted) font-mono mt-0.5">
                                                            {fmtDate(row.period_start)} — {fmtDate(row.period_end)}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 sm:py-3.5 text-center">
                                                        <div className="inline-flex items-center gap-1.5 text-xs text-(--text-muted) font-bold">
                                                            <CalendarDays size={12} className="text-(--brand-primary)" />
                                                            {fmtDate(row.run_date)}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-3 sm:py-3.5 text-center font-bold text-(--text-main)">{row.total_items ?? 0}</td>
                                                    <td className="px-6 py-3 sm:py-3.5 text-center">
                                                        <span className="font-bold text-emerald-600">{row.approved_count ?? 0}</span>
                                                    </td>
                                                    <td className="px-6 py-3 sm:py-3.5 text-center">
                                                        <span className="font-bold text-red-500">{row.rejected_count ?? 0}</span>
                                                    </td>
                                                    <td className="px-6 py-3 sm:py-3.5 text-center">
                                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border inline-flex items-center gap-1.5 shadow-sm ${badge.cls}`}>
                                                            {row.status === 'SUBMITTED' ? <CheckCircle size={11} /> : <Clock size={11} />}
                                                            {badge.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-3 sm:py-3.5 text-right">
                                                        <button
                                                            onClick={() => handleViewRun(row)}
                                                            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest bg-(--bg-surface) text-(--text-main) hover:bg-(--brand-primary) hover:text-(--brand-primary-text) hover:border-(--brand-primary) px-4 py-2 rounded-lg border border-(--border-subtle) transition-all shadow-sm outline-none"
                                                        >
                                                            View <ChevronRight size={12} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan="7" className="p-16 text-center text-(--text-muted) font-bold uppercase tracking-widest text-xs">
                                                No payroll runs yet. Click "Run Payroll" to get started.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <Pagination
                        currentPage={currentPage}
                        totalItems={runs.length}
                        onPageChange={setCurrentPage}
                    />
                </div>
            </div>

            <AuditLogPanel module="payroll" />

            {isRunModalOpen && (
                <RunPayrollModal onClose={() => setIsRunModalOpen(false)} onGenerated={handlePayrollGenerated} />
            )}
            {selectedRun && (
                <PayrollDetailModal run={selectedRun.run} readOnly={selectedRun.readOnly} onClose={handleDetailClose} onSubmitted={handleDetailClose} />
            )}
        </div>
    );
};

export default Payroll;
