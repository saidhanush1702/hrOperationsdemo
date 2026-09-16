import { useState, useEffect } from 'react';
import { BookOpen, Plus, Download, Users, UserCheck, UserX, ArrowUpRight } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import BalanceSheetDetailModal from './BalanceSheetDetailModal';
import AddAdjustmentModal from './AddAdjustmentModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import { exportToExcel } from '../../../utils/exportToExcel';
import { fmtDate } from '../../../utils/dateUtils';
import { rowOpen } from '../../../utils/rowClick';
import { matchesSearch } from '../../../utils/searchMatch';
import { PageHero, StatRail, StatTile, SearchInput, Btn, Avatar, EmptyState, LoadingState, cx } from '../../../components/ui/kit';

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FlowRow = ({ label, value, sign, tone, bar, max }) => (
    <div>
        <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="text-(--text-muted)">{label}</span>
            <span className={cx('font-semibold', tone)}>{sign}{fmt$(value)}</span>
        </div>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-(--text-main)/5">
            <div className={cx('h-full rounded-full', bar)} style={{ width: `${Math.min(100, (Math.abs(parseFloat(value) || 0) / max) * 100)}%` }} />
        </div>
    </div>
);

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
            console.error("Failed to load the earnings ledger", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);
    useEffect(() => { setCurrentPage(1); }, [searchTerm, filterStatus]);

    // Search first, so the tile counts reflect the current search the way the
    // Talent page does — tiles narrow the searched set, not the other way round.
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
                const headers = ['Consultant Code', 'Name', 'Engagement Earnings', 'Manual Additions', 'Manual Deductions', 'Fixed Pay Paid', 'Net Balance'];
                const keys    = ['employee_code', 'full_name', 'placement_earnings', 'manual_additions', 'manual_deductions', 'c2c_fixed_payouts', 'net_balance'];
                const rows = filteredData.map(r => ({ ...r, full_name: `${r.first_name} ${r.last_name}` }));
                exportToExcel(rows, headers, keys, 'earnings_ledger');
                return;
            }

            const headers = [
                'Consultant Code', 'Consultant Name', 'Section', 'Engagement Code',
                'Partner', 'Pay Type', 'Transaction Type',
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
            exportToExcel(rows, headers, keys, 'earnings_ledger_detail');
        } catch (err) {
            console.error('Earnings ledger export failed:', err);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="mx-auto max-w-[1800px] space-y-4">
            <PageHero
                icon={BookOpen}
                eyebrow="Money"
                title="Earnings ledger"
                description="What every consultant has earned, been paid and still carries — engagement by engagement."
                actions={
                    <>
                        <Btn variant="success" icon={Download} onClick={handleExport} disabled={exporting} title="Export to Excel">
                            {exporting ? 'Preparing…' : 'Export'}
                        </Btn>
                        <Btn variant="primary" icon={Plus} onClick={() => setIsAddModalOpen(true)}>Add adjustment</Btn>
                    </>
                }
            >
                <StatRail>
                    <StatTile label="All consultants" icon={Users} value={tabCounts.ALL} active={filterStatus === 'ALL'} onClick={() => setFilterStatus('ALL')} />
                    <StatTile label="Active" icon={UserCheck} value={tabCounts.ACTIVE} active={filterStatus === 'ACTIVE'} onClick={() => setFilterStatus('ACTIVE')} />
                    <StatTile label="Completed" icon={UserX} value={tabCounts.COMPLETED} active={filterStatus === 'COMPLETED'} onClick={() => setFilterStatus('COMPLETED')} />
                </StatRail>
            </PageHero>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-(--text-muted)"><span className="font-semibold text-(--text-main)">{filteredData.length}</span> consultant{filteredData.length !== 1 ? 's' : ''}</p>
                <SearchInput value={searchTerm} onChange={setSearchTerm} placeholder="Search name or consultant code…" className="w-full sm:w-80" />
            </div>

            {loading ? (
                <LoadingState text="Loading ledger…" />
            ) : paginatedData.length === 0 ? (
                <div className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface)">
                    <EmptyState icon={BookOpen} title="No ledger records found" />
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {paginatedData.map(row => {
                        const net = parseFloat(row.net_balance) || 0;
                        const max = Math.max(
                            Math.abs(parseFloat(row.placement_earnings) || 0),
                            Math.abs(parseFloat(row.manual_additions) || 0),
                            Math.abs(parseFloat(row.manual_deductions) || 0),
                            Math.abs(parseFloat(row.c2c_fixed_payouts) || 0),
                            1,
                        );
                        return (
                            <div
                                key={row.employee_id}
                                onClick={rowOpen(() => setSelectedEmployee(row))}
                                title="Open ledger"
                                className="group cursor-pointer rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-5 transition-all hover:-translate-y-1 hover:border-(--brand-primary)/45"
                            >
                                <div className="flex items-center gap-3">
                                    <Avatar name={`${row.first_name} ${row.last_name}`} size={42} />
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-(--text-main)">{row.first_name} {row.last_name}</p>
                                        <p className="font-mono text-[11px] text-(--text-muted)">{row.employee_code}</p>
                                    </div>
                                    <ArrowUpRight size={16} className="text-(--text-muted) transition-colors group-hover:text-(--brand-primary)" />
                                </div>

                                <div className="mt-4">
                                    <p className="text-[11px] text-(--text-muted)">Net balance</p>
                                    <p className={cx('text-2xl font-semibold', net >= 0 ? 'text-(--text-main)' : 'text-rose-500')} style={{ fontFamily: 'var(--font-display)' }}>
                                        {net >= 0 ? '' : '-'}{fmt$(Math.abs(net))}
                                    </p>
                                </div>

                                <div className="mt-4 space-y-2.5 border-t border-(--border-subtle) pt-4">
                                    <FlowRow label="Engagement earnings" value={row.placement_earnings} sign="" tone="text-(--text-main)" bar="bg-(--brand-primary)" max={max} />
                                    <FlowRow label="Additions" value={row.manual_additions} sign="+" tone="text-emerald-500" bar="bg-emerald-500" max={max} />
                                    <FlowRow label="Deductions" value={row.manual_deductions} sign="-" tone="text-rose-500" bar="bg-rose-500" max={max} />
                                    {row.c2c_fixed_payouts > 0 && (
                                        <FlowRow label="Fixed pay drawn" value={row.c2c_fixed_payouts} sign="-" tone="text-amber-500" bar="bg-amber-500" max={max} />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="overflow-hidden rounded-[20px] border border-(--border-subtle)">
                <Pagination currentPage={currentPage} totalItems={filteredData.length} onPageChange={setCurrentPage} />
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
