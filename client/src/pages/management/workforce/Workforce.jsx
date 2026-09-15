import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { UserPlus, Users, Globe, Download, UserCheck, UserX, ArrowUpRight, Briefcase } from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import AddEmployeeModal from './AddEmployeeModal';
import EmployeeDetailModal from './EmployeeDetailModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import { exportToExcel } from '../../../utils/exportToExcel';
import { fmtDate } from '../../../utils/dateUtils';
import { rowOpen } from '../../../utils/rowClick';
import { matchesSearch } from '../../../utils/searchMatch';
import {
    PageHero, StatRail, StatTile, Workbench, FilterDock, DockField, SearchInput, SelectInput,
    Btn, Chip, Avatar, EmptyState, LoadingState,
} from '../../../components/ui/kit';

const Workforce = () => {
    const location = useLocation();
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lookups, setLookups] = useState({ payTypes: [], countries: [], employeeTypes: [] });
    const [isEmpModalOpen, setIsEmpModalOpen] = useState(false);
    const [selectedEmp, setSelectedEmp] = useState(null);

    const [filterStatus, setFilterStatus] = useState(() => {
        const s = new URLSearchParams(location.search).get('status');
        return ['ACTIVE', 'TERMINATED'].includes(s) ? s : 'ALL';
    });
    const [filterPayType, setFilterPayType] = useState('ALL');
    const [filterCountry, setFilterCountry] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const fetchEmployees = async () => {
        setLoading(true);
        try {
            const res = await managementAPI.getEmployees();
            setEmployees(res.data);
        } catch (err) { console.error("Workforce fetch error:", err); }
        finally { setLoading(false); }
    };

    // Refresh list AND sync the open detail view with the updated record
    const refreshAndSyncEmp = async () => {
        try {
            const res = await managementAPI.getEmployees();
            setEmployees(res.data);
            setSelectedEmp(prev => {
                if (!prev) return prev;
                const fresh = res.data.find(e => e.id === prev.id);
                return fresh || prev;
            });
        } catch (err) { console.error("Workforce fetch error:", err); }
    };

    const fetchLookups = async () => {
        try {
            const res = await commonAPI.getLookups();
            setLookups(res.data);
        } catch (err) { console.error("Lookups fetch error:", err); }
    };

    useEffect(() => { fetchEmployees(); fetchLookups(); }, []);

    // Reset page whenever any filter changes
    useEffect(() => { setCurrentPage(1); }, [filterStatus, filterPayType, filterCountry, searchQuery]);

    const baseFilteredEmployees = employees.filter(emp => {
        if (emp.role !== 'EMPLOYEE') return false;
        if (filterPayType !== 'ALL' && String(emp.pay_type_id) !== String(filterPayType)) return false;
        if (filterCountry !== 'ALL' && String(emp.country_id) !== String(filterCountry)) return false;
        return matchesSearch(searchQuery,
            emp.first_name, emp.last_name, emp.employee_code, emp.title);
    });

    const tabCounts = {
        ALL:        baseFilteredEmployees.length,
        ACTIVE:     baseFilteredEmployees.filter(e => e.is_active === 1 || e.is_active === true).length,
        TERMINATED: baseFilteredEmployees.filter(e => e.is_active !== 1 && e.is_active !== true).length,
    };

    const filteredEmployees = baseFilteredEmployees.filter(emp => {
        const isActive = emp.is_active === 1 || emp.is_active === true;
        if (filterStatus === 'ACTIVE' && !isActive) return false;
        if (filterStatus === 'TERMINATED' && isActive) return false;
        return true;
    });

    const paginatedEmployees = filteredEmployees.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    const activeFilterCount = [filterCountry !== 'ALL', filterPayType !== 'ALL', !!searchQuery].filter(Boolean).length;

    const resetFilters = () => {
        setFilterCountry('ALL');
        setFilterPayType('ALL');
        setSearchQuery('');
    };

    const handleExport = () => {
        const headers = [
            'First Name', 'Last Name', 'Birth Date', 'Gender', 'Marital Status',
            'Consultant ID', 'Job Title', 'Employment Type', 'Start Date',
            'SSN', 'Personal Email', 'Phone Number', 'Country of Origin',
            'E-Verify Code', 'Documents',
        ];
        const keys = [
            'first_name', 'last_name', 'birth_date_fmt', 'gender_name', 'marital_status_name',
            'employee_code', 'title', 'employee_type_name', 'joining_date_fmt',
            'ssn', 'personal_email', 'phone_full', 'country_name',
            'e_verification_code', 'document_names_str',
        ];
        const rows = filteredEmployees.map(e => {
            let docNames = '';
            try {
                const parsed = typeof e.document_names === 'string'
                    ? JSON.parse(e.document_names)
                    : (e.document_names || []);
                docNames = Array.isArray(parsed) ? parsed.filter(Boolean).join(', ') : '';
            } catch { docNames = ''; }
            return {
                ...e,
                birth_date_fmt:     fmtDate(e.birth_date),
                joining_date_fmt:   fmtDate(e.joining_date),
                phone_full:         e.phone_number
                    ? `${e.phone_dial_code || ''}${e.phone_number}`
                    : '',
                document_names_str: docNames,
            };
        });
        exportToExcel(rows, headers, keys, 'talent-roster');
    };

    return (
        <div className="mx-auto max-w-[1600px] space-y-6">
            <PageHero
                icon={Users}
                eyebrow="Talent"
                title="Talent roster"
                description="Every consultant on your bench — profile, pay model, origin and portal access."
                actions={
                    <>
                        <Btn variant="success" icon={Download} onClick={handleExport} title="Export to Excel">Export</Btn>
                        <Btn variant="primary" icon={UserPlus} onClick={() => setIsEmpModalOpen(true)}>Add consultant</Btn>
                    </>
                }
            >
                <StatRail>
                    <StatTile label="Everyone" icon={Users} value={tabCounts.ALL} hint="matching filters" active={filterStatus === 'ALL'} onClick={() => setFilterStatus('ALL')} />
                    <StatTile label="On the bench" icon={UserCheck} value={tabCounts.ACTIVE} hint="active consultants" active={filterStatus === 'ACTIVE'} onClick={() => setFilterStatus('ACTIVE')} />
                    <StatTile label="Offboarded" icon={UserX} value={tabCounts.TERMINATED} hint="inactive or offboarded" active={filterStatus === 'TERMINATED'} onClick={() => setFilterStatus('TERMINATED')} />
                </StatRail>
            </PageHero>

            <Workbench
                dock={
                    <FilterDock activeCount={activeFilterCount} onReset={resetFilters}>
                        <DockField label="Find">
                            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Name or consultant ID…" />
                        </DockField>
                        <DockField label="Origin">
                            <SelectInput value={filterCountry} onChange={setFilterCountry}>
                                <option value="ALL">All origins</option>
                                {lookups.countries.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                            </SelectInput>
                        </DockField>
                        <DockField label="Pay model">
                            <SelectInput value={filterPayType} onChange={setFilterPayType}>
                                <option value="ALL">All pay models</option>
                                {lookups.payTypes.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                            </SelectInput>
                        </DockField>
                    </FilterDock>
                }
            >
                <div className="flex items-center justify-between">
                    <p className="text-sm text-(--text-muted)">
                        <span className="font-semibold text-(--text-main)">{filteredEmployees.length}</span> consultants
                    </p>
                </div>

                {loading ? (
                    <LoadingState text="Loading consultants…" />
                ) : paginatedEmployees.length === 0 ? (
                    <EmptyState icon={Users} title="No consultants match" text="Try a different search or clear the filters." />
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                        {paginatedEmployees.map(emp => {
                            const isActive = emp.is_active === 1 || emp.is_active === true;
                            return (
                                <div
                                    key={emp.id}
                                    onClick={rowOpen(() => setSelectedEmp(emp))}
                                    title="Open consultant profile"
                                    className="group relative cursor-pointer overflow-hidden rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5 transition-all hover:-translate-y-1 hover:border-(--brand-primary)/45 hover:shadow-[0_22px_44px_-28px_var(--brand-glow)]"
                                >
                                    <div aria-hidden="true" className="absolute -right-8 -top-8 h-24 w-24 rounded-full border border-(--brand-primary)/10" />
                                    <div className="relative flex items-start gap-3">
                                        <div className="relative">
                                            <Avatar name={`${emp.first_name || ''} ${emp.last_name || ''}`} size={46} />
                                            <span
                                                className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-(--bg-surface) ${isActive ? 'bg-emerald-500' : 'bg-rose-500'}`}
                                                title={isActive ? 'Active' : 'Offboarded'}
                                            />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className={`truncate text-base font-semibold ${isActive ? 'text-(--text-main)' : 'text-rose-500'}`}>
                                                {emp.first_name} {emp.last_name}
                                            </p>
                                            <p className="truncate font-mono text-[11px] text-(--text-muted)">{emp.employee_code || '—'}</p>
                                        </div>
                                        <ArrowUpRight size={17} className="shrink-0 text-(--text-muted) transition-colors group-hover:text-(--brand-primary)" />
                                    </div>

                                    <div className="relative mt-4 flex items-center gap-2 text-sm text-(--text-main)">
                                        <Briefcase size={14} className="shrink-0 text-(--brand-primary)" />
                                        <span className="truncate">{emp.title || '—'}</span>
                                    </div>
                                    <p className="relative mt-0.5 pl-[22px] text-xs text-(--text-muted)">{emp.employee_type_name || 'Full Time'}</p>

                                    <div className="relative mt-4 flex items-center justify-between gap-2 border-t border-(--border-subtle) pt-3">
                                        <span className="flex min-w-0 items-center gap-1.5 text-xs text-(--text-muted)">
                                            <Globe size={13} className="shrink-0" />
                                            <span className="truncate">{emp.country_name || 'N/A'}</span>
                                        </span>
                                        <Chip tone="brand">{emp.pay_type_name || '—'}</Chip>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="overflow-hidden rounded-[20px] border border-(--border-subtle)">
                    <Pagination
                        currentPage={currentPage}
                        totalItems={filteredEmployees.length}
                        onPageChange={setCurrentPage}
                    />
                </div>
            </Workbench>

            <AuditLogPanel module="workforce" />

            <AddEmployeeModal isOpen={isEmpModalOpen} onClose={() => setIsEmpModalOpen(false)} onRefresh={fetchEmployees} />
            {selectedEmp && <EmployeeDetailModal employee={selectedEmp} onClose={() => setSelectedEmp(null)} onRefresh={refreshAndSyncEmp} />}
        </div>
    );
};

export default Workforce;
