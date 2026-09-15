import { useState, useEffect } from 'react';
import { Banknote, PlayCircle, CheckCircle, Clock, CalendarDays, Download, Layers, ArrowUpRight, Users, XCircle } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import RunPayrollModal from './RunPayrollModal';
import PayrollDetailModal from './PayrollDetailModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import { fmtDate } from '../../../utils/dateUtils';
import { exportToExcel } from '../../../utils/exportToExcel';
import { rowOpen } from '../../../utils/rowClick';
import { PageHero, StatRail, StatTile, Btn, Chip, EmptyState, LoadingState } from '../../../components/ui/kit';

const STATUS_BADGE = {
    DRAFT:     { label: 'Draft',     tone: 'amber', icon: Clock },
    SUBMITTED: { label: 'Submitted', tone: 'green', icon: CheckCircle },
};

const Payroll = () => {
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRunModalOpen, setIsRunModalOpen] = useState(false);
    const [selectedRun, setSelectedRun] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [statusFilter, setStatusFilter] = useState('ALL');

    const fetchRuns = async () => {
        setLoading(true);
        try {
            const res = await managementAPI.getPayrollRuns();
            setRuns(res.data);
        } catch (err) {
            console.error('Failed to load pay runs', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchRuns(); }, []);

    const visibleRuns = statusFilter === 'ALL' ? runs : runs.filter(r => r.status === statusFilter);
    const paginatedRuns = visibleRuns.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const changeFilter = (key) => { setStatusFilter(key); setCurrentPage(1); };

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
            console.error('Failed to load pay run detail', err);
        }
    };

    const handleDetailClose = () => {
        setSelectedRun(null);
        fetchRuns();
    };

    const handleExport = () => {
        const headers = ['Period', 'Period Start', 'Period End', 'Run Date', 'Consultants', 'Approved', 'Rejected', 'Status'];
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
        exportToExcel(rows, headers, keys, 'pay_runs');
    };

    const draftCount = runs.filter(r => r.status === 'DRAFT').length;

    return (
        <div className="mx-auto max-w-[1600px] space-y-6">
            <PageHero
                icon={Banknote}
                eyebrow="Money"
                title="Pay runs"
                description="Semi-monthly W2 pay runs — generate a period, review every pay line, then lock it in."
                actions={
                    <>
                        <Btn variant="success" icon={Download} onClick={handleExport} title="Export to Excel">Export</Btn>
                        <Btn variant="primary" icon={PlayCircle} onClick={() => setIsRunModalOpen(true)}>Start pay run</Btn>
                    </>
                }
            >
                <StatRail>
                    <StatTile label="All runs" icon={Layers} value={runs.length} active={statusFilter === 'ALL'} onClick={() => changeFilter('ALL')} />
                    <StatTile label="In review" icon={Clock} value={draftCount} active={statusFilter === 'DRAFT'} onClick={() => changeFilter('DRAFT')} />
                    <StatTile label="Locked" icon={CheckCircle} value={runs.length - draftCount} active={statusFilter === 'SUBMITTED'} onClick={() => changeFilter('SUBMITTED')} />
                </StatRail>
            </PageHero>

            {loading ? (
                <LoadingState text="Loading pay runs…" />
            ) : paginatedRuns.length === 0 ? (
                <div className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface)">
                    <EmptyState
                        icon={Banknote}
                        title="No pay runs yet"
                        text="Start a pay run to generate the lines for a period."
                        action={<Btn variant="primary" size="sm" icon={PlayCircle} onClick={() => setIsRunModalOpen(true)}>Start pay run</Btn>}
                    />
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {paginatedRuns.map(row => {
                        const badge = STATUS_BADGE[row.status] || STATUS_BADGE.DRAFT;
                        return (
                            <div
                                key={row.id}
                                onClick={rowOpen(() => handleViewRun(row))}
                                title="Open pay run"
                                className="group relative cursor-pointer overflow-hidden rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-5 transition-all hover:-translate-y-1 hover:border-(--brand-primary)/45"
                            >
                                <span aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-15 blur-2xl" style={{ background: 'var(--brand-gradient)' }} />
                                <div className="relative flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-xl font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{row.period_label}</p>
                                        <p className="font-mono text-[11px] text-(--text-muted)">{fmtDate(row.period_start)} — {fmtDate(row.period_end)}</p>
                                    </div>
                                    <Chip tone={badge.tone} icon={badge.icon}>{badge.label}</Chip>
                                </div>

                                <div className="relative mt-5 grid grid-cols-3 gap-2">
                                    {[
                                        [Users, 'Lines', row.total_items ?? 0, 'text-(--text-main)'],
                                        [CheckCircle, 'Approved', row.approved_count ?? 0, 'text-emerald-500'],
                                        [XCircle, 'Rejected', row.rejected_count ?? 0, 'text-rose-500'],
                                    ].map(([Icon, label, val, tone]) => (
                                        <div key={label} className="rounded-[14px] bg-(--bg-app)/60 px-3 py-2">
                                            <p className="flex items-center gap-1 text-[11px] text-(--text-muted)"><Icon size={11} /> {label}</p>
                                            <p className={`text-lg font-semibold ${tone}`} style={{ fontFamily: 'var(--font-display)' }}>{val}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="relative mt-4 flex items-center justify-between border-t border-(--border-subtle) pt-3 text-xs text-(--text-muted)">
                                    <span className="flex items-center gap-1.5"><CalendarDays size={13} className="text-(--brand-primary)" /> Run {fmtDate(row.run_date)}</span>
                                    <span className="flex items-center gap-1 font-semibold text-(--brand-primary)">Open <ArrowUpRight size={13} /></span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="overflow-hidden rounded-[20px] border border-(--border-subtle)">
                <Pagination currentPage={currentPage} totalItems={visibleRuns.length} onPageChange={setCurrentPage} />
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
