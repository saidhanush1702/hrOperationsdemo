import { useState, useEffect, useCallback } from 'react';
import { Timer, Plus, AlertTriangle, CheckCircle2, XCircle, Hourglass, ClipboardCheck, User, Rocket } from 'lucide-react';
import { timesheetAPI, managementAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import { fmtDate } from '../../../utils/dateUtils';
import { Btn, Chip, Field, Notice, EmptyState, LoadingState, cx } from '../../../components/ui/kit';

const getStatusChip = (name) => {
    if (name === 'Pending Approval') return <Chip tone="amber" icon={ClipboardCheck}>Needs review</Chip>;
    if (name === 'Approved') return <Chip tone="green" icon={CheckCircle2}>Approved</Chip>;
    if (name === 'Rejected') return <Chip tone="rose" icon={XCircle}>Sent back</Chip>;
    return <Chip tone="slate" icon={Hourglass}>Awaiting</Chip>;
};

const Node = ({ tone = 'slate', icon: Icon, last, children }) => (
    <div className="relative pl-12">
        <span
            className={cx(
                'absolute left-0 top-1 flex h-9 w-9 items-center justify-center rounded-full border',
                tone === 'brand' ? 'border-transparent text-white' : tone === 'green' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500' : 'border-(--border-subtle) bg-(--bg-app) text-(--text-muted)',
            )}
            style={tone === 'brand' ? { background: 'var(--brand-gradient)' } : undefined}
        >
            <Icon size={15} />
        </span>
        {!last && <span className="absolute -bottom-3 left-[17px] top-11 w-px bg-(--border-subtle)" />}
        {children}
    </div>
);

const ManualTimesheetModal = ({ onClose, onRefresh }) => {
    const [employees,  setEmployees]  = useState([]);
    const [placements, setPlacements] = useState([]);

    const [selectedEmployee,  setSelectedEmployee]  = useState('');
    const [selectedPlacement, setSelectedPlacement] = useState('');

    const [existingTimesheets, setExistingTimesheets] = useState([]);
    const [allMissing,         setAllMissing]         = useState([]); // full list from backend
    const [stagedCount,        setStagedCount]        = useState(0);  // how many the user has queued

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

    // ── Reload existing time logs + all missing periods for the engagement ────
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
            setError('Failed to load time log periods.');
        } finally {
            setLoadingPeriods(false);
        }
    }, []);

    useEffect(() => { loadPlacementData(selectedPlacement); }, [selectedPlacement, loadPlacementData]);

    // Staged periods are the first `stagedCount` items from allMissing
    const stagedPeriods = allMissing.slice(0, stagedCount);
    // The next period the add button will stage
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
            setError(err.response?.data?.error || 'Failed to create time logs.');
        } finally {
            setCreating(false);
        }
    };

    const modalFooter = stagedPeriods.length > 0 ? (
        <div className="flex w-full items-center justify-between gap-3">
            <span className="text-sm text-(--text-muted)">
                <b className="text-(--text-main)">{stagedPeriods.length}</b> period{stagedPeriods.length !== 1 ? 's' : ''} queued
            </span>
            <Btn variant="primary" icon={creating ? Timer : Plus} onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating…' : `Create ${stagedPeriods.length} time log${stagedPeriods.length !== 1 ? 's' : ''}`}
            </Btn>
        </div>
    ) : null;

    if (initialLoading) {
        return (
            <BaseModal isOpen={true} onClose={onClose} icon={<Timer size={18} />} title="Log time manually">
                <LoadingState />
            </BaseModal>
        );
    }

    const filteredPlacements = placements.filter(p => p.employee_id == selectedEmployee);

    return (
        <BaseModal isOpen={true} onClose={onClose} icon={<Timer size={18} />} title="Log time manually" subtitle="Queue missing periods for an engagement" footer={modalFooter} noPadding>
            <div className="grid min-h-full lg:grid-cols-[340px_minmax(0,1fr)]">
                <aside className="space-y-4 border-b border-(--border-subtle) bg-(--bg-app)/40 p-5 lg:border-b-0 lg:border-r lg:p-6">
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-(--brand-primary)">Choose engagement</p>
                    {error && <Notice tone="rose" icon={AlertTriangle}>{error}</Notice>}

                    <Field label="Consultant">
                        <div className="relative">
                            <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                            <select
                                value={selectedEmployee}
                                onChange={e => { setSelectedEmployee(e.target.value); setSelectedPlacement(''); }}
                                className="nx-input cursor-pointer pl-9"
                            >
                                <option value="">Select consultant…</option>
                                {employees.map(e => (
                                    <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                                ))}
                            </select>
                        </div>
                    </Field>

                    <Field label="Partner engagement">
                        <div className="relative">
                            <Rocket size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                            <select
                                value={selectedPlacement}
                                onChange={e => setSelectedPlacement(e.target.value)}
                                disabled={!selectedEmployee}
                                className="nx-input cursor-pointer pl-9"
                            >
                                <option value="">{selectedEmployee ? 'Select partner…' : 'Select a consultant first'}</option>
                                {filteredPlacements.map(p => (
                                    <option key={p.id} value={p.id}>{p.client_name}</option>
                                ))}
                            </select>
                        </div>
                    </Field>

                    <p className="text-xs leading-relaxed text-(--text-muted)">
                        Add missing periods one at a time from the top of the timeline, then create them together.
                    </p>
                </aside>

                <div className="min-w-0 p-4 sm:p-6 lg:p-8">
                    {!selectedPlacement ? (
                        <EmptyState icon={Timer} title="Pick a consultant and partner" text="Their time log timeline will appear here." />
                    ) : loadingPeriods ? (
                        <LoadingState text="Loading periods…" />
                    ) : (
                        <div className="space-y-4">
                            {nextToStage ? (
                                <Node tone="brand" icon={Plus} last={stagedPeriods.length === 0 && existingTimesheets.length === 0}>
                                    <button
                                        type="button"
                                        onClick={handleStage}
                                        className="w-full rounded-[18px] border-2 border-dashed border-(--brand-primary)/40 bg-(--brand-primary)/5 px-4 py-3 text-left outline-none transition-colors hover:border-(--brand-primary)"
                                    >
                                        <p className="text-sm font-semibold text-(--brand-primary)">{fmtDate(nextToStage.start)} — {fmtDate(nextToStage.end)}</p>
                                        <p className="text-xs text-(--text-muted)">Click to queue this period</p>
                                    </button>
                                </Node>
                            ) : (
                                <Node tone="green" icon={CheckCircle2} last={stagedPeriods.length === 0 && existingTimesheets.length === 0}>
                                    <div className="rounded-[18px] border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
                                        <p className="text-sm font-semibold text-emerald-600">All periods queued or up to date</p>
                                        <p className="text-xs text-(--text-muted)">{stagedPeriods.length > 0 ? 'Press create below to save' : 'No missing time logs'}</p>
                                    </div>
                                </Node>
                            )}

                            {[...stagedPeriods].reverse().map((p, i) => (
                                <Node key={`staged-${i}`} tone="brand" icon={Hourglass} last={i === stagedPeriods.length - 1 && existingTimesheets.length === 0}>
                                    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-(--brand-primary)/30 bg-(--bg-surface) px-4 py-3">
                                        <div>
                                            <p className="text-sm font-semibold text-(--text-main)">{fmtDate(p.start)} — {fmtDate(p.end)}</p>
                                            <p className="text-xs text-(--text-muted)">Queued</p>
                                        </div>
                                        <Chip tone="brand">Queued</Chip>
                                    </div>
                                </Node>
                            ))}

                            {existingTimesheets.map((t, i) => (
                                <Node key={t.id} tone="green" icon={CheckCircle2} last={i === existingTimesheets.length - 1}>
                                    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) px-4 py-3">
                                        <div>
                                            <p className="text-sm font-semibold text-(--text-main)">{fmtDate(t.start_date)} — {fmtDate(t.end_date)}</p>
                                            <p className="font-mono text-xs text-(--text-muted)">{Number(t.total_hours) || 0} h</p>
                                        </div>
                                        {getStatusChip(t.status_name)}
                                    </div>
                                </Node>
                            ))}

                            {existingTimesheets.length === 0 && stagedPeriods.length === 0 && !nextToStage && (
                                <p className="py-6 text-center text-sm text-(--text-muted)">No time logs for this engagement yet.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </BaseModal>
    );
};

export default ManualTimesheetModal;
