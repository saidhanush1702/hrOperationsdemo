import { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, AlertTriangle, CheckCircle, XCircle, User, Briefcase, ChevronRight } from 'lucide-react';
import { timesheetAPI, managementAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import { fmtDate } from '../../../utils/dateUtils';

const STATUS_BADGE = {
    'Pending Approval': <span className="text-[10px] bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-orange-500/20">Pending</span>,
    'Approved':  <span className="text-[10px] bg-green-500/10 text-green-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-green-500/20 inline-flex items-center gap-1"><CheckCircle size={9}/>Approved</span>,
    'Rejected':  <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-red-500/20 inline-flex items-center gap-1"><XCircle size={9}/>Rejected</span>,
};
const getStatusBadge = (name) =>
    STATUS_BADGE[name] ?? <span className="text-[10px] bg-(--bg-app) text-(--text-muted) px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-(--border-subtle)">Not Submitted</span>;

const ManualTimesheetModal = ({ onClose, onRefresh }) => {
    const [employees,  setEmployees]  = useState([]);
    const [placements, setPlacements] = useState([]);

    const [selectedEmployee,  setSelectedEmployee]  = useState('');
    const [selectedPlacement, setSelectedPlacement] = useState('');

    const [existingTimesheets, setExistingTimesheets] = useState([]);
    const [allMissing,         setAllMissing]         = useState([]); // full list from backend
    const [stagedCount,        setStagedCount]        = useState(0);  // how many the user has queued via +

    const [initialLoading, setInitialLoading] = useState(true);
    const [loadingPeriods, setLoadingPeriods] = useState(false);
    const [creating,       setCreating]       = useState(false);
    const [error,          setError]          = useState('');

    // ── Load master lists once ────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const [empRes, placeRes] = await Promise.all([
                    managementAPI.getEmployees(),
                    managementAPI.getPlacements(),
                ]);
                setEmployees(empRes.data.filter(e => e.is_active === 1 || e.is_active === true));
                setPlacements(placeRes.data.filter(p => p.status === 'Active'));
            } catch {
                setError('Failed to load data.');
            } finally {
                setInitialLoading(false);
            }
        })();
    }, []);

    // ── Reload existing timesheets + all missing periods for the placement ────
    const loadPlacementData = useCallback(async (placementId) => {
        if (!placementId) {
            setExistingTimesheets([]); setAllMissing([]); setStagedCount(0);
            return;
        }
        setLoadingPeriods(true);
        setError('');
        try {
            const [tsRes, missingRes] = await Promise.all([
                timesheetAPI.getManagementTimesheets(),
                timesheetAPI.getMissingPeriods(placementId, 52),
            ]);
            const existing = tsRes.data
                .filter(t => t.placement_id == placementId)
                .sort((a, b) => b.start_date.localeCompare(a.start_date)); // newest first
            setExistingTimesheets(existing);
            setAllMissing(missingRes.data);
            setStagedCount(0);
        } catch {
            setError('Failed to load timesheet periods.');
        } finally {
            setLoadingPeriods(false);
        }
    }, []);

    useEffect(() => { loadPlacementData(selectedPlacement); }, [selectedPlacement, loadPlacementData]);

    // Derived: staged periods are the first `stagedCount` items from allMissing
    const stagedPeriods = allMissing.slice(0, stagedCount);
    // The next period the + button will stage
    const nextToStage   = allMissing[stagedCount] ?? null;

    const handleStage = () => {
        if (nextToStage) setStagedCount(c => c + 1);
    };

    // ── Commit all staged periods ─────────────────────────────────────────────
    const handleCreate = async () => {
        if (stagedPeriods.length === 0 || creating) return;
        setCreating(true);
        setError('');
        try {
            for (const p of stagedPeriods) {
                await timesheetAPI.createManualTimesheet({
                    placement_id: selectedPlacement,
                    start_date:   p.start,
                    end_date:     p.end,
                });
            }
            onRefresh();
            await loadPlacementData(selectedPlacement);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to create timesheets.');
        } finally {
            setCreating(false);
        }
    };

    // ── Footer: Create button ─────────────────────────────────────────────────
    const modalFooter = stagedPeriods.length > 0 ? (
        <div className="flex items-center justify-between w-full">
            <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">
                {stagedPeriods.length} period{stagedPeriods.length !== 1 ? 's' : ''} queued
            </span>
            <button
                onClick={handleCreate}
                disabled={creating}
                className="bg-(--brand-primary) text-white px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:bg-(--brand-primary)/90 disabled:opacity-50 transition-all outline-none"
            >
                {creating
                    ? <><Clock size={13} className="animate-spin" /> Creating…</>
                    : <><Plus size={13} /> Create {stagedPeriods.length} Timesheet{stagedPeriods.length !== 1 ? 's' : ''}</>
                }
            </button>
        </div>
    ) : null;

    if (initialLoading) {
        return (
            <BaseModal isOpen={true} onClose={onClose} icon={<Clock size={16} />} title="Add Timesheet">
                <div className="p-8 text-center text-xs font-bold text-(--text-muted) animate-pulse uppercase tracking-widest">Loading…</div>
            </BaseModal>
        );
    }

    const filteredPlacements = placements.filter(p => p.employee_id == selectedEmployee);

    return (
        <BaseModal isOpen={true} onClose={onClose} icon={<Clock size={16} />} title="Add Timesheet" footer={modalFooter}>
            <div className="space-y-4">

                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
                        <AlertTriangle size={14} className="shrink-0" /><span>{error}</span>
                    </div>
                )}

                {/* ── Selectors ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-(--bg-app)/50 p-4 rounded-xl border border-(--border-subtle)">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1.5">
                            <User size={11}/> Employee
                        </label>
                        <select
                            value={selectedEmployee}
                            onChange={e => { setSelectedEmployee(e.target.value); setSelectedPlacement(''); }}
                            className="w-full p-2.5 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg text-xs font-bold focus:border-(--brand-primary) outline-none cursor-pointer"
                        >
                            <option value="">-- Select Employee --</option>
                            {employees.map(e => (
                                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1.5">
                            <Briefcase size={11}/> Client / Placement
                        </label>
                        <select
                            value={selectedPlacement}
                            onChange={e => setSelectedPlacement(e.target.value)}
                            disabled={!selectedEmployee}
                            className="w-full p-2.5 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg text-xs font-bold focus:border-(--brand-primary) outline-none disabled:opacity-50 cursor-pointer"
                        >
                            <option value="">{selectedEmployee ? '-- Select Client --' : 'Select Employee First'}</option>
                            {filteredPlacements.map(p => (
                                <option key={p.id} value={p.id}>{p.client_name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* ── Timeline ── */}
                {selectedPlacement ? (
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">
                            Timesheet Timeline
                        </label>

                        {loadingPeriods ? (
                            <div className="p-6 text-center text-xs font-bold text-(--brand-primary) animate-pulse uppercase tracking-widest bg-(--bg-surface) border border-(--border-subtle) rounded-xl">
                                Loading periods…
                            </div>
                        ) : (
                            <div className="max-h-90 overflow-y-auto custom-scrollbar pr-1 space-y-2">

                                {/* ── + button: stage the next period ── */}
                                {nextToStage ? (
                                    <button
                                        onClick={handleStage}
                                        className="w-full p-3 rounded-xl border-2 border-dashed border-(--brand-primary)/40 bg-(--brand-primary)/5 hover:bg-(--brand-primary)/10 hover:border-(--brand-primary) transition-all flex items-center gap-3 group outline-none"
                                    >
                                        <div className="h-9 w-9 rounded-lg bg-(--brand-primary)/10 group-hover:bg-(--brand-primary) border border-(--brand-primary)/20 flex items-center justify-center transition-all shrink-0">
                                            <Plus size={16} className="text-(--brand-primary) group-hover:text-white transition-colors"/>
                                        </div>
                                        <div className="text-left flex-1 min-w-0">
                                            <p className="text-[11px] font-bold text-(--brand-primary) truncate">
                                                {fmtDate(nextToStage.start)} — {fmtDate(nextToStage.end)}
                                            </p>
                                            <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest mt-0.5">
                                                Click to queue this period
                                            </p>
                                        </div>
                                        <ChevronRight size={14} className="text-(--brand-primary) shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"/>
                                    </button>
                                ) : (
                                    <div className="w-full p-3 rounded-xl border border-green-500/20 bg-green-500/5 flex items-center gap-3">
                                        <div className="h-9 w-9 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                                            <CheckCircle size={15} className="text-green-500"/>
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-bold text-green-600">All periods queued or up to date</p>
                                            <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest mt-0.5">
                                                {stagedPeriods.length > 0 ? 'Press Create below to save' : 'No missing timesheets'}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {/* ── Staged (queued) periods ── */}
                                {stagedPeriods.length > 0 && (
                                    <div className="space-y-1.5">
                                        {[...stagedPeriods].reverse().map((p, i) => (
                                            <div key={`staged-${i}`} className="p-3 rounded-xl border border-(--brand-primary)/30 bg-(--brand-primary)/5 flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-lg bg-(--brand-primary)/10 border border-(--brand-primary)/20 flex items-center justify-center shrink-0">
                                                    <Clock size={13} className="text-(--brand-primary)"/>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-bold text-(--brand-primary)">
                                                        {fmtDate(p.start)} — {fmtDate(p.end)}
                                                    </p>
                                                    <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest mt-0.5">Queued</p>
                                                </div>
                                                <span className="text-[10px] font-bold bg-(--brand-primary)/10 text-(--brand-primary) px-2 py-0.5 rounded border border-(--brand-primary)/20 uppercase tracking-wider">
                                                    Pending
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* ── Already created timesheets ── */}
                                {existingTimesheets.map(t => (
                                    <div key={t.id} className="p-3 rounded-xl border border-(--border-subtle) bg-(--bg-surface) flex items-center gap-3">
                                        <div className="h-9 w-9 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
                                            <CheckCircle size={15} className="text-green-500"/>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-bold text-(--text-main)">
                                                {fmtDate(t.start_date)} — {fmtDate(t.end_date)}
                                            </p>
                                            <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest mt-0.5">
                                                {Number(t.total_hours) || 0} hrs
                                            </p>
                                        </div>
                                        {getStatusBadge(t.status_name)}
                                    </div>
                                ))}

                                {existingTimesheets.length === 0 && stagedPeriods.length === 0 && !nextToStage && (
                                    <div className="p-6 text-center text-xs font-bold text-(--text-muted) uppercase tracking-widest">
                                        No timesheets for this placement yet.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-12 bg-(--bg-app)/50 rounded-xl border border-(--border-subtle) border-dashed">
                        <Clock size={26} className="text-(--text-muted) mb-2 opacity-40"/>
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">
                            Select an employee and client to begin
                        </p>
                    </div>
                )}
            </div>
        </BaseModal>
    );
};

export default ManualTimesheetModal;
