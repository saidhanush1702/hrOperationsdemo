import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { UserPlus, Fingerprint, Search, Filter, Globe, X, Download } from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import AddEmployeeModal from './AddEmployeeModal';
import EmployeeDetailModal from './EmployeeDetailModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import { exportToExcel } from '../../../utils/exportToExcel';
import { fmtDate } from '../../../utils/dateUtils';
import { rowOpen } from '../../../utils/rowClick';
import { matchesSearch } from '../../../utils/searchMatch';

const SelectFilter = ({ value, onChange, options, icon: Icon, placeholder }) => (
    <div className="relative group shrink-0 w-full sm:w-auto lg:w-32 xl:w-40">
        <div className="absolute left-3 sm:left-2.5 top-1/2 -translate-y-1/2 text-(--text-muted) group-focus-within:text-(--brand-primary) transition-colors pointer-events-none">
            <Icon size={14} />
        </div>
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 sm:py-1.5 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl sm:rounded-lg text-xs font-bold focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) outline-none transition-all appearance-none cursor-pointer shadow-sm truncate"
        >
            <option value="ALL">{placeholder}</option>
            {options.map(opt => (
                <option key={opt.id} value={opt.id}>{opt.name}</option>
            ))}
        </select>
        <div className="absolute right-3 sm:right-2.5 top-1/2 -translate-y-1/2 text-(--text-muted) pointer-events-none">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
        </div>
    </div>
);

const Workforce = () => {
    const location = useLocation();
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
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

    // Refresh list AND sync the open modal with the updated employee record
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

    const isFilterActive = filterCountry !== 'ALL' || filterPayType !== 'ALL' || filterStatus !== 'ALL' || searchQuery;

    const handleExport = () => {
        const headers = [
            'First Name', 'Last Name', 'Birth Date', 'Gender', 'Marital Status',
            'Employee Code', 'Job Title', 'Employment Type', 'Joining Date',
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
        exportToExcel(rows, headers, keys, 'workforce');
    };

    return (
        <div className="-mt-4 lg:-mt-8 -mx-4 lg:-mx-8 flex flex-col gap-2 animate-in fade-in duration-500">
        <div className="flex flex-col h-[calc(100vh-4rem)] gap-2">

            {/* HEADER */}
            <div className="bg-(--bg-surface) px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-(--border-subtle) shadow-sm flex justify-between items-center shrink-0 transition-colors duration-300">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 bg-(--brand-primary)/10 rounded-xl flex items-center justify-center text-(--brand-primary) transition-colors shrink-0">
                        <Fingerprint size={18} className="sm:w-5 sm:h-5" />
                    </div>
                    <div>
                        <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-(--text-main) leading-none">Workforce</h1>
                        <p className="hidden sm:block text-[10px] text-(--text-muted) mt-1 uppercase tracking-widest font-bold">Manage employee records & access</p>
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
                        onClick={() => setIsEmpModalOpen(true)}
                        className="bg-(--brand-primary) text-(--brand-primary-text) w-9 h-9 sm:w-auto sm:px-5 sm:py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 shrink-0 outline-none"
                        title="Add Employee"
                    >
                        <UserPlus size={16} /> <span className="hidden sm:inline">Add Employee</span>
                    </button>
                </div>
            </div>

            {/* MAIN CARD */}
            <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden transition-colors duration-300">

                {/* Mobile filter toggle */}
                <div className="lg:hidden px-4 py-3 border-b border-(--border-subtle) bg-(--bg-app)/30 flex justify-between items-center shrink-0">
                    <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">
                        {filteredEmployees.length} Records Found
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
                        <div className="relative w-full sm:w-48 lg:w-56 xl:w-64 shrink-0 group">
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

                {/* Table */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    <table className="w-full text-left table-fixed">
                        <thead className="bg-(--bg-app) text-[9px] sm:text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) sticky top-0 z-10 transition-colors duration-300">
                            <tr>
                                <th className="px-4 sm:px-6 py-3 sm:py-4 w-[50%] sm:w-[30%]">Employee</th>
                                <th className="hidden sm:table-cell px-4 sm:px-6 py-3 sm:py-4 sm:w-[20%]">Role</th>
                                <th className="hidden lg:table-cell px-4 sm:px-6 py-3 sm:py-4 lg:w-[15%]">Origin</th>
                                <th className="px-2 sm:px-6 py-3 sm:py-4 w-[25%] sm:w-[12%]">Pay Type</th>
                                <th className="hidden sm:table-cell px-4 sm:px-6 py-3 sm:py-4 sm:w-[10%] text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-(--border-subtle)">
                            {loading ? (
                                <tr>
                                    <td colSpan="6" className="text-center py-10 text-xs text-(--text-muted)">Loading employees…</td>
                                </tr>
                            ) : paginatedEmployees.length > 0 ? (
                                paginatedEmployees.map(emp => {
                                    const isActive = emp.is_active === 1 || emp.is_active === true;
                                    return (
                                        <tr key={emp.id}
                                            onClick={rowOpen(() => setSelectedEmp(emp))}
                                            title="View Employee"
                                            className="hover:bg-(--bg-app) transition-colors group cursor-pointer">
                                            <td className="px-4 sm:px-6 py-3 sm:py-3.5 overflow-hidden">
                                                <div className="flex items-center gap-2.5 sm:gap-3">
                                                    <div className="relative shrink-0">
                                                        <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-(--bg-surface) border border-(--border-subtle) flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-(--text-muted) uppercase shadow-sm">
                                                            {emp.first_name?.[0] || '?'}{emp.last_name?.[0] || '?'}
                                                        </div>
                                                        <div className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-(--bg-surface) ${isActive ? 'bg-green-500' : 'bg-red-500'}`} title={isActive ? "Active" : "Terminated"} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className={`text-xs sm:text-sm font-bold tracking-tight leading-none truncate transition-colors ${isActive ? 'text-(--text-main)' : 'text-red-500/80'}`}>
                                                            {emp.first_name} {emp.last_name}
                                                        </p>
                                                        <p className="text-[9px] sm:text-[10px] text-(--text-muted) font-mono tracking-tighter mt-1 uppercase truncate">{emp.employee_code || '---'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="hidden sm:table-cell px-4 sm:px-6 py-3 sm:py-3.5 overflow-hidden">
                                                <p className="text-xs font-bold text-(--text-main) tracking-tight truncate">{emp.title || '---'}</p>
                                                <p className="text-[10px] font-bold uppercase text-(--text-muted) tracking-wider mt-1 truncate">{emp.employee_type_name || 'Full Time'}</p>
                                            </td>
                                            <td className="hidden lg:table-cell px-4 sm:px-6 py-3 sm:py-3.5 overflow-hidden">
                                                <span className="text-xs font-bold text-(--text-main) truncate block">{emp.country_name || 'N/A'}</span>
                                            </td>
                                            <td className="px-2 sm:px-6 py-3 sm:py-3.5 overflow-hidden">
                                                <span className="px-2 py-1 sm:py-0.5 bg-(--brand-primary)/10 text-(--brand-primary) rounded text-[9px] sm:text-[10px] font-bold border border-(--brand-primary)/20 truncate inline-block max-w-full">
                                                    {emp.pay_type_name || '---'}
                                                </span>
                                            </td>
                                            
                                            {/* Hidden on mobile — the row itself opens this employee. */}
                                            <td className="hidden sm:table-cell px-4 sm:px-6 py-3 sm:py-3.5 text-right">
                                                <button
                                                    onClick={() => setSelectedEmp(emp)}
                                                    className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest bg-(--bg-surface) text-(--text-main) hover:bg-(--brand-primary) hover:text-(--brand-primary-text) hover:border-(--brand-primary) px-3 py-1.5 rounded-lg border border-(--border-subtle) transition-all active:scale-95 shadow-sm outline-none"
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            ) : (
                                <tr>
                                    <td colSpan="6" className="px-4 sm:px-6 py-16 text-center text-(--text-muted) text-xs font-bold uppercase tracking-widest">
                                        No employees found matching your criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <Pagination
                    currentPage={currentPage}
                    totalItems={filteredEmployees.length}
                    onPageChange={setCurrentPage}
                />
            </div>
        </div>

            <AuditLogPanel module="workforce" />

            <AddEmployeeModal isOpen={isEmpModalOpen} onClose={() => setIsEmpModalOpen(false)} onRefresh={fetchEmployees} />
            {selectedEmp && <EmployeeDetailModal employee={selectedEmp} onClose={() => setSelectedEmp(null)} onRefresh={refreshAndSyncEmp} />}
        </div>
    );
};

export default Workforce;
