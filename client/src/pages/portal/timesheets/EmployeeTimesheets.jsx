import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, AlertCircle, FileEdit, CheckCircle, XCircle, Filter } from 'lucide-react';
import { timesheetAPI } from '../../../api/apiService';
import SubmitTimesheetModal from './SubmitTimesheetModal';
import { fmtDateGB, isBeforeEasternToday } from '../../../utils/dateUtils';
import { rowOpen } from '../../../utils/rowClick';

const EmployeeTimesheets = () => {
    const [searchParams] = useSearchParams();
    const [timesheets, setTimesheets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTimesheet, setSelectedTimesheet] = useState(null);

    // Filters
    const [filterTab, setFilterTab] = useState(() => {
        const t = searchParams.get('tab');
        const valid = ['NOT_SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAST_DUE'];
        return valid.includes(t) ? t : 'ALL';
    });
    const [selectedClient, setSelectedClient] = useState('ALL');

    const fetchMyTimesheets = async () => {
        setLoading(true);
        try {
            const res = await timesheetAPI.getEmployeeTimesheets();
            setTimesheets(res.data);
        } catch (err) {
            console.error("Failed to fetch timesheets:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMyTimesheets();
    }, []);

    // Extract unique client names directly
    const uniqueClients = Array.from(
        new Set(timesheets.map(t => t.client_name))
    ).filter(Boolean); 

    const isPastDue = (ts) => ts.status_id === 1 && isBeforeEasternToday(ts.end_date);

    const filteredTimesheets = timesheets.filter(t => {
        // Uniform status filters
        if (filterTab === 'NOT_SUBMITTED' && (t.status_id !== 1 || isPastDue(t))) return false;
        if (filterTab === 'PENDING_APPROVAL' && t.status_id !== 2) return false;
        if (filterTab === 'APPROVED' && t.status_id !== 3) return false;
        if (filterTab === 'REJECTED' && t.status_id !== 4) return false;
        if (filterTab === 'PAST_DUE' && !isPastDue(t)) return false;
        
        // Filter exactly by client_name
        if (selectedClient !== 'ALL' && t.client_name !== selectedClient) return false;
        return true;
    });

    // Tab Counts Calculation
    const tabCounts = {
        ALL: timesheets.length,
        NOT_SUBMITTED: timesheets.filter(t => t.status_id === 1 && !isPastDue(t)).length,
        PENDING_APPROVAL: timesheets.filter(t => t.status_id === 2).length,
        APPROVED: timesheets.filter(t => t.status_id === 3).length,
        REJECTED: timesheets.filter(t => t.status_id === 4).length,
        PAST_DUE: timesheets.filter(t => isPastDue(t)).length
    };

    const getStatusBadge = (ts) => {
        if (ts.status_id === 2) return <span className="text-[10px] bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-orange-500/20">Pending Approval</span>;
        if (ts.status_id === 3) return <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-green-500/20">Approved</span>;
        if (ts.status_id === 4) return <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-red-500/20 flex items-center gap-1 w-max"><XCircle size={10}/> Rejected</span>;
        if (isPastDue(ts)) return <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-red-500/20 flex items-center gap-1 w-max"><AlertCircle size={10}/> Past Due</span>;
        return <span className="text-[10px] bg-(--bg-surface) text-(--text-muted) px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-(--border-subtle)">Not Submitted</span>;
    };

    return (
        <div className="-mt-4 lg:-mt-8 -mx-4 lg:-mx-8 -mb-4 lg:-mb-8 flex flex-col h-[calc(100vh-4rem)] gap-2 animate-in fade-in duration-500">
            
            <div className="bg-(--bg-surface) px-4 sm:px-6 py-3 sm:py-3.5 rounded-2xl border border-(--border-subtle) shadow-sm flex items-center shrink-0">
                <div className="h-9 w-9 sm:h-10 sm:w-10 bg-(--brand-primary)/10 rounded-xl flex items-center justify-center text-(--brand-primary) shrink-0 mr-3">
                    <Clock size={18} className="sm:w-5 sm:h-5" />
                </div>
                <div>
                    <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-(--text-main) leading-none">My Timesheets</h1>
                    <p className="hidden sm:block text-[10px] text-(--text-muted) mt-1 uppercase tracking-widest font-bold">Log your hours and upload client approvals</p>
                </div>
            </div>

            <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden">
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 px-4 sm:px-6 py-4 lg:py-3 border-b border-(--border-subtle) bg-(--bg-app)/30 shrink-0">
                    
                    <div className="flex p-1 bg-(--bg-surface) rounded-xl lg:rounded-lg border border-(--border-subtle) w-full lg:w-auto shadow-sm overflow-x-auto hide-scrollbar">
                        {[
                            { key: 'ALL', label: 'All' },
                            { key: 'NOT_SUBMITTED', label: 'Not Submitted' },
                            { key: 'PENDING_APPROVAL', label: 'Pending Approval' },
                            { key: 'APPROVED', label: 'Approved' },
                            { key: 'REJECTED', label: 'Rejected' },
                            { key: 'PAST_DUE', label: 'Past Due' }
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setFilterTab(tab.key)}
                                className={`flex-1 lg:flex-none whitespace-nowrap px-3 sm:px-4 py-2 lg:py-1.5 rounded-lg lg:rounded-md text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-1.5 outline-none ${filterTab === tab.key ? 'bg-(--brand-primary)/10 text-(--brand-primary)' : 'text-(--text-muted) hover:text-(--text-main)'}`}
                            >
                                {tab.label}
                                <span className={`px-1.5 py-0.5 rounded-md text-[9px] leading-none transition-colors ${filterTab === tab.key ? 'bg-(--brand-primary) text-(--brand-primary-text)' : 'bg-(--border-subtle) text-(--text-muted)'}`}>
                                    {tabCounts[tab.key]}
                                </span>
                            </button>
                        ))}
                    </div>

                    {uniqueClients.length > 0 && (
                        <div className="relative w-full sm:w-50 shrink-0 group">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted) group-focus-within:text-(--brand-primary) transition-colors">
                                <Filter size={14} />
                            </div>
                            <select 
                                value={selectedClient}
                                onChange={(e) => setSelectedClient(e.target.value)}
                                className="w-full pl-9 pr-8 py-2.5 sm:py-1.5 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl sm:rounded-lg text-xs font-bold focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) outline-none shadow-sm appearance-none cursor-pointer"
                            >
                                <option value="ALL">All Clients</option>
                                {uniqueClients.map(clientName => (
                                    <option key={clientName} value={clientName}>{clientName}</option>
                                ))}
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-(--text-muted)">
                                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    <table className="w-full text-left table-fixed">
                        <thead className="bg-(--bg-app) text-[9px] sm:text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) sticky top-0 z-10">
                            <tr>
                                <th className="px-4 sm:px-6 py-3 w-[28%] sm:w-[25%]">Period</th>
                                <th className="px-4 py-3 w-[27%] sm:w-[30%]">Client</th>
                                <th className="hidden sm:table-cell px-4 py-3 sm:w-[15%]">Total Hours</th>
                                <th className="px-4 py-3 w-[25%] sm:w-[15%]">Status</th>
                                <th className="px-4 sm:px-6 py-3 w-[20%] sm:w-[15%] text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-(--border-subtle)">
                            {loading ? <tr><td colSpan="5" className="text-center py-10 text-xs text-(--text-muted)">Loading timesheets...</td></tr> : filteredTimesheets.length > 0 ? (
                                filteredTimesheets.map(t => (
                                    <tr key={t.id}
                                        onClick={rowOpen(() => setSelectedTimesheet(t))}
                                        title={t.status_id === 1 || t.status_id === 4 ? 'Fill Timesheet' : 'View Details'}
                                        className="hover:bg-(--bg-app) transition-colors group cursor-pointer">
                                        <td className="px-4 sm:px-6 py-3 sm:py-3.5">
                                            <div className="text-[10px] font-bold uppercase text-(--text-main) tracking-wider">
                                                <p>{fmtDateGB(t.start_date)}</p>
                                                <p className="mt-0.5 text-(--text-muted)">to {fmtDateGB(t.end_date)}</p>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 sm:py-3.5">
                                            <div className="min-w-0">
                                                <p className="text-xs sm:text-sm font-bold tracking-tight text-(--text-main) truncate">{t.client_name}</p>
                                            </div>
                                        </td>
                                        <td className="hidden sm:table-cell px-4 py-3 sm:py-3.5">
                                            <span className="text-xs font-bold text-(--text-main) bg-(--bg-app) px-2 py-1 rounded border border-(--border-subtle)">
                                                {Number(t.total_hours)} hrs
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 sm:py-3.5">{getStatusBadge(t)}</td>
                                        <td className="px-4 sm:px-6 py-3 sm:py-3.5 text-right">
                                            {t.status_id === 1 || t.status_id === 4 ? (
                                                <button onClick={() => setSelectedTimesheet(t)} className="inline-flex items-center justify-center p-2 sm:px-3 sm:py-1.5 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest rounded-lg bg-(--brand-primary) text-white shadow-sm hover:opacity-90 transition-all outline-none gap-1.5">
                                                    <FileEdit size={12} className="hidden sm:block"/> Fill
                                                </button>
                                            ) : (
                                                // Hidden on mobile — tapping the row shows the same thing.
                                                <button onClick={() => setSelectedTimesheet(t)} className="hidden sm:inline-flex items-center justify-center px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) hover:bg-(--brand-primary) hover:text-white transition-all outline-none">
                                                    View Details
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : <tr><td colSpan="5" className="px-4 py-12 text-center text-(--text-muted) text-xs font-bold uppercase tracking-widest">You are all caught up! No timesheets found.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {selectedTimesheet && <SubmitTimesheetModal timesheet={selectedTimesheet} onClose={() => setSelectedTimesheet(null)} onRefresh={fetchMyTimesheets} />}
        </div>
    );
};

export default EmployeeTimesheets;