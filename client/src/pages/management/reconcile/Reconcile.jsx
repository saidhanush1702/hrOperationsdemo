import { useState, useEffect } from 'react';
import { ScanSearch, Download, AlertTriangle, Users, UserCheck, UserX } from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import ReconcileDetailModal from './ReconcileDetailModal';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import { exportToExcel } from '../../../utils/exportToExcel';
import { rowOpen } from '../../../utils/rowClick';
import { matchesSearch } from '../../../utils/searchMatch';
import {
    PageHero, StatRail, StatTile, Workbench, FilterDock, DockField, DockOptions, SearchInput, SelectInput,
    Btn, Chip, Avatar, Notice, RecordCard, EmptyState, LoadingState, cx,
} from '../../../components/ui/kit';

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A difference is only meaningful past a cent — floating-point noise from
// hours x rate should not paint a row as out of balance.
const isBalanced = (diff) => Math.abs(parseFloat(diff || 0)) < 0.01;

const Reconcile = () => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lookups, setLookups] = useState({ payTypes: [], countries: [] });

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
                console.error('Failed to load pay audit', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    useEffect(() => { setCurrentPage(1); }, [filterStatus, filterPayType, filterCountry, filterBalance, searchQuery]);

    // Search and non-status filters first, so the status tile counts describe the
    // set the user is currently looking at — same ordering as Talent.
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

    // Approved hours on engagements with no pay rate cannot be priced, so they
    // contribute $0 to every total. Without calling that out, those consultants
    // read as perfectly settled.
    const totals = filtered.reduce(
        (acc, r) => ({ unpriced: acc.unpriced + parseFloat(r.unpriced_hours || 0) }),
        { unpriced: 0 }
    );

    const activeCount = [filterCountry, filterPayType, filterBalance].filter(v => v !== 'ALL').length + (searchQuery ? 1 : 0);
    const clearAll = () => { setFilterCountry('ALL'); setFilterPayType('ALL'); setFilterBalance('ALL'); setSearchQuery(''); };

    const handleExport = () => {
        const headers = ['Consultant Code', 'Consultant', 'Pay Model', 'Status', 'Approved Hours', 'Hours With No Pay Rate', 'Expected Amount', 'Paid Hours', 'Paid Amount', 'Difference'];
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
        exportToExcel(rows, headers, keys, 'pay_audit');
    };

    return (
        <div className="mx-auto max-w-[1800px] space-y-4">
            <PageHero
                icon={ScanSearch}
                eyebrow="Money"
                title="Pay audit"
                description="Approved time logs against what was actually paid — find every gap before it becomes a problem."
                actions={<Btn variant="success" icon={Download} onClick={handleExport} title="Export to Excel">Export</Btn>}
            >
                <StatRail>
                    <StatTile label="All consultants" icon={Users} value={tabCounts.ALL} active={filterStatus === 'ALL'} onClick={() => setFilterStatus('ALL')} />
                    <StatTile label="Active" icon={UserCheck} value={tabCounts.ACTIVE} active={filterStatus === 'ACTIVE'} onClick={() => setFilterStatus('ACTIVE')} />
                    <StatTile label="Terminated" icon={UserX} value={tabCounts.TERMINATED} active={filterStatus === 'TERMINATED'} onClick={() => setFilterStatus('TERMINATED')} />
                </StatRail>
            </PageHero>

            {totals.unpriced > 0 && (
                <Notice tone="amber" icon={AlertTriangle}>
                    <b>{totals.unpriced.toLocaleString('en-US', { maximumFractionDigits: 2 })} approved hours sit on engagements with no pay rate on file.</b>{' '}
                    They price at $0, so they are excluded from Expected, Paid and Difference, and pay runs cannot pay them. Add a pay rate to the engagement to bring them in.
                </Notice>
            )}

            <Workbench
                dock={
                    <FilterDock activeCount={activeCount} onReset={clearAll}>
                        <DockField label="Find">
                            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Name or consultant code…" />
                        </DockField>
                        <DockField label="Balance">
                            <DockOptions
                                value={filterBalance}
                                onChange={setFilterBalance}
                                options={[{ value: 'ALL', label: 'Everyone' }, { value: 'OUTSTANDING', label: 'Unbalanced only' }]}
                            />
                        </DockField>
                        <DockField label="Origin">
                            <SelectInput value={filterCountry} onChange={setFilterCountry}>
                                <option value="ALL">All origins</option>
                                {(lookups.countries || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </SelectInput>
                        </DockField>
                        <DockField label="Pay model">
                            <SelectInput value={filterPayType} onChange={setFilterPayType}>
                                <option value="ALL">All pay models</option>
                                {(lookups.payTypes || []).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </SelectInput>
                        </DockField>
                    </FilterDock>
                }
            >
                <p className="text-sm text-(--text-muted)"><span className="font-semibold text-(--text-main)">{filtered.length}</span> consultant{filtered.length !== 1 ? 's' : ''}</p>

                {loading ? (
                    <LoadingState text="Loading pay audit…" />
                ) : paginated.length === 0 ? (
                    <EmptyState icon={ScanSearch} title="No consultants match these filters" />
                ) : (
                    <div className="space-y-2.5">
                        {paginated.map(row => {
                            const balanced = isBalanced(row.difference);
                            const expected = parseFloat(row.expected_amount || 0);
                            const paid     = parseFloat(row.paid_amount || 0);
                            const paidPct  = expected > 0 ? Math.min(100, (paid / expected) * 100) : (paid > 0 ? 100 : 0);
                            return (
                                <RecordCard key={row.employee_id} onClick={rowOpen(() => setSelectedEmployee(row))} title="Open pay audit">
                                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                                        <div className="flex min-w-[200px] flex-1 items-center gap-3">
                                            <span className="relative">
                                                <Avatar name={`${row.first_name} ${row.last_name}`} size={42} />
                                                <span className={cx('absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-(--bg-surface)', row.is_active ? 'bg-emerald-500' : 'bg-rose-500')} title={row.is_active ? 'Active' : 'Terminated'} />
                                            </span>
                                            <div className="min-w-0">
                                                <p className={cx('truncate text-sm font-semibold', row.is_active ? 'text-(--text-main)' : 'text-rose-500/80')}>{row.first_name} {row.last_name}</p>
                                                <p className="font-mono text-[11px] text-(--text-muted)">{row.employee_code || '—'}</p>
                                            </div>
                                            <Chip tone="brand" className="ml-1">{row.pay_type_name || '—'}</Chip>
                                        </div>

                                        <div className="grid flex-[2] grid-cols-2 gap-3 sm:grid-cols-4">
                                            <div>
                                                <p className="text-[11px] text-(--text-muted)">Approved hrs</p>
                                                <p className="text-sm font-semibold text-(--text-main)">{parseFloat(row.expected_hours || 0).toFixed(2)}</p>
                                                {parseFloat(row.unpriced_hours || 0) > 0 && (
                                                    <p className="text-[11px] font-medium text-amber-600" title="Approved hours on an engagement with no pay rate on file. They cannot be priced or paid.">
                                                        {parseFloat(row.unpriced_hours).toFixed(2)} no rate
                                                    </p>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-[11px] text-(--text-muted)">Expected</p>
                                                <p className="text-sm font-semibold text-(--text-main)">{fmt$(row.expected_amount)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[11px] text-(--text-muted)">Paid</p>
                                                <p className="text-sm font-semibold text-emerald-500">{fmt$(row.paid_amount)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[11px] text-(--text-muted)">Difference</p>
                                                <p className={cx('text-sm font-semibold', balanced ? 'text-(--text-muted)' : 'text-amber-500')}>{fmt$(row.difference)}</p>
                                                {!balanced && <Chip tone="amber">Unbalanced</Chip>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-(--text-main)/5">
                                        <div className={cx('h-full rounded-full', balanced ? 'bg-emerald-500' : 'bg-amber-500')} style={{ width: `${paidPct}%` }} />
                                    </div>
                                </RecordCard>
                            );
                        })}
                    </div>
                )}

                <div className="overflow-hidden rounded-[20px] border border-(--border-subtle)">
                    <Pagination currentPage={currentPage} totalItems={filtered.length} onPageChange={setCurrentPage} />
                </div>
            </Workbench>

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
