import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, FileText, AlertTriangle, ExternalLink, Edit3, UploadCloud, Timer, RefreshCw, Info, Handshake, CalendarDays, ShieldCheck } from 'lucide-react';
import { timesheetAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import { fmtDateGB, getEasternDayOfWeek, getEasternDate, buildDailyLogSlots } from '../../../utils/dateUtils';
import { Btn, Chip, Avatar, Notice, cx } from '../../../components/ui/kit';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const ReviewTimesheetModal = ({ timesheet, onClose, onRefresh }) => {
    const [details, setDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [actionError, setActionError] = useState('');

    const [isRejecting, setIsRejecting] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isReopened, setIsReopened] = useState(false);

    const [isOverrideMode, setIsOverrideMode] = useState(false);
    const [originalEntries, setOriginalEntries] = useState([]);
    const [overrideEntries, setOverrideEntries] = useState([]);
    const [overrideFile, setOverrideFile] = useState(null);
    const [regularHours, setRegularHours] = useState(false);

    const [previewUrl, setPreviewUrl] = useState(null);
    const [isPdf, setIsPdf] = useState(false);
    const [isImage, setIsImage] = useState(false);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await timesheetAPI.getTimesheetDetails(timesheet.id);
                setDetails(res.data);
                setOriginalEntries(JSON.parse(JSON.stringify(res.data.entries || [])));
                setOverrideEntries(JSON.parse(JSON.stringify(res.data.entries || [])));
            } catch {
                setActionError("Failed to load details.");
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [timesheet.id]);

    useEffect(() => {
        if (overrideFile) {
            const url = URL.createObjectURL(overrideFile);
            setPreviewUrl(url);
            setIsPdf(overrideFile.type === 'application/pdf');
            setIsImage(overrideFile.type.startsWith('image/'));
            return () => URL.revokeObjectURL(url);
        } else if (details?.attachment_url) {
            const cleanPath = details.attachment_url.replace(/\?/g, '_');
            const normalized = cleanPath.startsWith('http')
                ? cleanPath
                : `${API_BASE}/${cleanPath.replace(/^\/+/, '').split('/').map(seg => encodeURIComponent(seg)).join('/')}`;
            // Backend always converts saved attachments to PDF, so a saved file is always a PDF.
            setIsPdf(true);
            setIsImage(false);
            setPreviewUrl(normalized);
        } else {
            setPreviewUrl(null);
            setIsPdf(false);
            setIsImage(false);
        }
    }, [overrideFile, details?.attachment_url]);

    const handleEntryChange = (index, field, value) => {
        const newEntries = [...overrideEntries];

        if (field === 'hours' && value !== '') {
            let intVal = parseInt(value, 10);
            if (isNaN(intVal)) intVal = 0;

            if (intVal > 24) {
                intVal = 24;
                setActionError("Hours cannot be greater than 24.");
            } else if (intVal < 0) {
                intVal = 0;
                setActionError('');
            } else {
                setActionError('');
            }
            value = String(intVal);
        }

        newEntries[index][field] = value;
        setOverrideEntries(newEntries);
    };

    const calculateOverrideTotal = () => {
        return overrideEntries.reduce((sum, e) => sum + (parseInt(e.hours, 10) || 0), 0);
    };

    const handleSaveOverrideLocal = () => {
        const missingNotes = overrideEntries.some(e => {
            const hrsStr = e.hours;
            const actualHrs = (hrsStr === '' || hrsStr === null || isNaN(parseInt(hrsStr, 10))) ? 0 : parseInt(hrsStr, 10);

            const dow = getEasternDayOfWeek(e.work_date);
            const isWeekend = dow === 0 || dow === 6;

            const needsNote = isWeekend ? actualHrs !== 0 : actualHrs !== 8;
            return needsNote && (!e.notes || e.notes.trim() === '');
        });

        if (missingNotes) {
            return setActionError("Notes are mandatory for deviations from standard hours (8 for weekdays, 0 for weekends).");
        }
        setIsOverrideMode(false);
        setActionError('');
    };

    const handleCancelOverride = () => {
        setOverrideEntries(JSON.parse(JSON.stringify(originalEntries)));
        setOverrideFile(null);
        setIsOverrideMode(false);
        setRegularHours(false);
        setActionError('');
    };

    const handleRegularHours = (checked) => {
        setRegularHours(checked);
        if (checked) {
            setOverrideEntries(overrideEntries.map(e => {
                const dow = getEasternDayOfWeek(e.work_date);
                const isWeekend = dow === 0 || dow === 6;
                return { ...e, hours: isWeekend ? '0' : '8' };
            }));
        }
    };

    const handleAction = async (actionType) => {
        setActionError('');

        if (actionType === 'reject' && !rejectionReason.trim()) {
            return setActionError("Please provide a reason for sending this time log back.");
        }

        setSubmitting(true);
        const hasModifications = JSON.stringify(overrideEntries) !== JSON.stringify(originalEntries) || overrideFile !== null;

        try {
            if (hasModifications) {
                const formData = new FormData();
                formData.append('action', actionType);
                formData.append('entries', JSON.stringify(overrideEntries));
                if (actionType === 'reject') formData.append('rejection_reason', rejectionReason);
                if (overrideFile) formData.append('attachment', overrideFile);

                await timesheetAPI.adminOverrideTimesheet(timesheet.id, formData);
            } else {
                await timesheetAPI.reviewTimesheet(timesheet.id, {
                    action: actionType,
                    rejection_reason: actionType === 'reject' ? rejectionReason : null
                });
            }
            onRefresh();
            onClose();
        } catch (err) {
            setActionError(err.response?.data?.error || `Failed to ${actionType} time log.`);
            setSubmitting(false);
        }
    };

    if (loading) return null;

    const isFinalized = (details?.status_id === 3 || details?.status_id === 4) && !isReopened;
    const isUnsubmittedOrPastDue = details?.status_id === 1 || details?.status_id === 5;
    const hasModifications = JSON.stringify(overrideEntries) !== JSON.stringify(originalEntries) || overrideFile !== null;

    // Approve / send back are offered once there is something to decide on.
    const canFinalize = !isUnsubmittedOrPastDue || hasModifications;

    const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const cycleName = details?.cycle_name || '';
    const isWeeklyCycle = /^(weekly|semi-weekly)$/i.test(cycleName.trim());
    const weekStartDayName = isWeeklyCycle ? (details?.week_start_day || 'Sunday') : 'Sunday';
    const weekStartIdx = Math.max(0, DAY_FULL.indexOf(weekStartDayName));
    const weekDays = Array.from({ length: 7 }, (_, i) => DAY_ABBR[(weekStartIdx + i) % 7]);
    const dailyLogSlots = buildDailyLogSlots(overrideEntries, weekStartIdx);

    const statusTone = details?.status_id === 2 ? 'amber' : details?.status_id === 3 ? 'green' : details?.status_id === 4 ? 'rose' : 'slate';

    const uploadControl = (label) => (
        <div className="flex flex-col items-center">
            <input type="file" id="hrUpload" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" onChange={(e) => setOverrideFile(e.target.files[0])} />
            <label htmlFor="hrUpload" className="flex cursor-pointer items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-5 py-2 text-xs font-semibold text-amber-600 transition-colors hover:bg-amber-500/20">
                <UploadCloud size={14} /> {label}
            </label>
            <p className="mt-2 text-[11px] text-(--text-muted)">Saved when you approve or send back</p>
        </div>
    );

    return (
        <BaseModal
            isOpen={true}
            onClose={onClose}
            icon={<Timer size={18} />}
            title="Time log review"
            subtitle={`${timesheet.first_name} ${timesheet.last_name} · ${timesheet.client_name}`}
            headerRight={isOverrideMode ? <Chip tone="amber" icon={Edit3}>Override mode</Chip> : null}
            noPadding
        >
            <div className="grid min-h-full lg:grid-cols-[320px_minmax(0,1fr)]">
                {/* Decision column */}
                <aside className="space-y-4 border-b border-(--border-subtle) bg-(--bg-app)/40 p-5 lg:border-b-0 lg:border-r lg:p-6">
                    <div className="flex items-center gap-3">
                        <Avatar name={`${timesheet.first_name} ${timesheet.last_name}`} size={48} ring />
                        <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-(--text-main)">{timesheet.first_name} {timesheet.last_name}</p>
                            <p className="flex items-center gap-1.5 truncate text-xs text-(--text-muted)"><Handshake size={12} /> {timesheet.client_name}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        <Chip tone={statusTone}>{details?.status_name || 'Loading'}</Chip>
                        <Chip tone="brand">{timesheet.placement_code}</Chip>
                    </div>

                    <div className="rounded-[20px] border border-(--border-subtle) bg-(--bg-surface) p-4">
                        <p className="flex items-center gap-1.5 text-[11px] text-(--text-muted)"><CalendarDays size={12} /> Period</p>
                        <p className="mt-0.5 text-sm font-semibold text-(--text-main)">{fmtDateGB(timesheet.start_date)} – {fmtDateGB(timesheet.end_date)}</p>
                        <div className="mt-4 flex items-end justify-between">
                            <div>
                                <p className="text-[11px] text-(--text-muted)">Total hours</p>
                                <p className={cx('text-4xl font-semibold', hasModifications ? 'text-amber-500' : 'text-(--text-main)')} style={{ fontFamily: 'var(--font-display)' }}>
                                    {calculateOverrideTotal()}
                                </p>
                            </div>
                            {hasModifications && <Chip tone="amber">Edited</Chip>}
                        </div>
                    </div>

                    {details?.status_id === 4 && details?.rejection_reason && (
                        <Notice tone="rose" icon={XCircle}><b>Previous reason:</b> {details.rejection_reason}</Notice>
                    )}

                    {isFinalized ? (
                        <div className="space-y-3 rounded-[20px] border border-(--border-subtle) bg-(--bg-surface) p-4">
                            <p className="text-sm text-(--text-muted)">
                                This time log has already been {details?.status_id === 3 ? 'approved' : 'sent back'}.
                            </p>
                            <Btn variant="primary" icon={RefreshCw} className="w-full" onClick={() => setIsReopened(true)}>Modify decision</Btn>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {actionError && <Notice tone="rose" icon={AlertTriangle}>{actionError}</Notice>}

                            {isRejecting ? (
                                <div className="space-y-3 rounded-[20px] border border-rose-500/25 bg-rose-500/5 p-4">
                                    <p className="text-sm font-semibold text-rose-500">Send back with a reason</p>
                                    <textarea
                                        placeholder="Reason for sending back…"
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        className="nx-input h-24 resize-none"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <Btn onClick={() => setIsRejecting(false)}>Cancel</Btn>
                                        <Btn variant="danger" icon={XCircle} onClick={() => handleAction('reject')} disabled={submitting || !rejectionReason.trim()}>
                                            {submitting ? 'Processing…' : 'Confirm'}
                                        </Btn>
                                    </div>
                                </div>
                            ) : isOverrideMode ? (
                                <div className="space-y-3 rounded-[20px] border border-amber-500/25 bg-amber-500/5 p-4">
                                    <p className="text-sm font-semibold text-amber-600">Override mode</p>
                                    <p className="text-xs text-(--text-muted)">Edit hours and notes on the calendar, or replace the approval file.</p>
                                    <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-(--text-main)">
                                        <input type="checkbox" checked={regularHours} onChange={(e) => handleRegularHours(e.target.checked)} className="h-4 w-4 cursor-pointer" />
                                        Fill regular hours
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <Btn onClick={handleCancelOverride}>Cancel</Btn>
                                        <Btn variant="warn" onClick={handleSaveOverrideLocal}>Save changes</Btn>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {hasModifications && (
                                        <Notice tone="amber" icon={Edit3}>Changes saved locally — approve or send back to submit them.</Notice>
                                    )}
                                    {canFinalize && (
                                        <>
                                            <Btn variant="success" icon={CheckCircle} className="w-full" onClick={() => handleAction('approve')} disabled={submitting}>
                                                {submitting ? 'Processing…' : 'Approve'}
                                            </Btn>
                                            <Btn variant="danger" icon={XCircle} className="w-full" onClick={() => setIsRejecting(true)}>Send back</Btn>
                                        </>
                                    )}
                                    <Btn icon={Edit3} className="w-full" onClick={() => setIsOverrideMode(true)}>Override</Btn>
                                </div>
                            )}
                        </div>
                    )}
                </aside>

                {/* Work area */}
                <div className="min-w-0 space-y-5 p-4 sm:p-6 lg:p-8">
                    {/* Daily log */}
                    <section className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-semibold text-(--text-main)">Daily log</h3>
                                <p className="text-xs text-(--text-muted)">{fmtDateGB(timesheet.start_date)} – {fmtDateGB(timesheet.end_date)}</p>
                            </div>
                            <span className={cx('rounded-full px-3 py-1 font-mono text-xs font-semibold', hasModifications ? 'bg-amber-500/10 text-amber-500' : 'bg-(--bg-app) text-(--text-main)')}>
                                {calculateOverrideTotal()} h
                            </span>
                        </div>

                        <div className="grid grid-cols-7 gap-1.5">
                            {weekDays.map(day => (
                                <div key={day} className="pb-1 text-center text-[11px] font-semibold text-(--text-muted)">{day}</div>
                            ))}

                            {dailyLogSlots.map((slot, slotIdx) => {
                                if (!slot) return <div key={`blank-${slotIdx}`} className="h-[84px] rounded-[14px] bg-(--bg-app)/30" />;
                                const { entry, index: idx } = slot;
                                const d = getEasternDate(entry.work_date);
                                const dayOfWeek = getEasternDayOfWeek(entry.work_date);

                                const hrsStr = entry.hours;
                                const actualHrs = (hrsStr === '' || hrsStr === null || isNaN(parseInt(hrsStr, 10))) ? 0 : parseInt(hrsStr, 10);

                                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                                const needsNote = isWeekend ? actualHrs !== 0 : actualHrs !== 8;
                                const tooltipText = isWeekend ? "Weekends expect 0 hours. Please add a note." : "Weekdays expect exactly 8 hours. Please add a note.";

                                return (
                                    <div
                                        key={entry.id}
                                        className={cx(
                                            'relative flex h-[84px] flex-col rounded-[14px] border p-1.5 transition-colors',
                                            actualHrs > 0 ? 'border-(--brand-primary)/30 bg-(--brand-primary)/5' : 'border-(--border-subtle) bg-(--bg-app)/40',
                                            isOverrideMode && 'hover:border-amber-500/50',
                                        )}
                                    >
                                        <div className="relative flex w-full items-center justify-center">
                                            <span className={cx('text-[11px] font-semibold', actualHrs > 0 ? 'text-(--brand-primary)' : 'text-(--text-muted)')}>{d}</span>
                                            {isOverrideMode && needsNote && (
                                                <span className="absolute right-0 top-0 cursor-help text-amber-500" title={tooltipText}><Info size={11} /></span>
                                            )}
                                        </div>

                                        <div className="flex flex-1 flex-col items-center justify-center gap-0.5">
                                            {isOverrideMode ? (
                                                <>
                                                    <input
                                                        type="number" step="1" min="0" max="24" placeholder="0"
                                                        value={entry.hours !== '' && entry.hours !== null ? Number(entry.hours) : ''}
                                                        onChange={(e) => handleEntryChange(idx, 'hours', e.target.value)}
                                                        className="w-full border-b border-transparent bg-transparent text-center text-sm font-semibold text-(--text-main) outline-none focus:border-amber-500"
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder={needsNote ? "Note req…" : "Note"}
                                                        value={entry.notes || ''}
                                                        onChange={(e) => handleEntryChange(idx, 'notes', e.target.value)}
                                                        className={cx(
                                                            'w-full border-b bg-transparent px-0.5 text-center text-[10px] outline-none',
                                                            needsNote && (!entry.notes || entry.notes.trim() === '') ? 'border-amber-500/50 text-amber-600 placeholder-amber-400 focus:border-amber-500' : 'border-transparent text-(--text-muted) focus:border-amber-500',
                                                        )}
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <span className={cx('text-sm font-semibold', actualHrs > 0 ? 'text-(--text-main)' : 'text-(--text-muted) opacity-40')}>{actualHrs}h</span>
                                                    {entry.notes && (
                                                        <span className="line-clamp-2 w-full px-0.5 text-center text-[10px] text-(--text-muted)" title={entry.notes}>{entry.notes}</span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    {/* Approval document */}
                    <section className="flex min-h-[380px] flex-col rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-5">
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="flex items-center gap-2 text-base font-semibold text-(--text-main)">
                                <ShieldCheck size={17} className="text-emerald-500" /> Partner approval
                            </h3>
                            {previewUrl && (
                                <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-semibold text-(--brand-primary) outline-none hover:underline">
                                    Open full screen <ExternalLink size={12} />
                                </a>
                            )}
                        </div>

                        {previewUrl ? (
                            <div className="flex flex-1 flex-col overflow-hidden rounded-[18px] border border-(--border-subtle)">
                                <div className="flex items-center justify-between border-b border-(--border-subtle) bg-(--bg-app)/60 px-4 py-2 text-xs font-semibold text-(--text-muted)">
                                    {overrideFile ? 'Staged replacement' : 'Stored document'}
                                </div>
                                <div className="relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden bg-[#0a0c16]">
                                    {isPdf ? (
                                        <iframe src={previewUrl} className="h-full min-h-[300px] w-full border-0 bg-white" title="Document Preview" />
                                    ) : isImage ? (
                                        <img src={previewUrl} alt="Approval document" className="max-h-full max-w-full object-contain p-2" />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
                                            <FileText size={32} className="text-white/50" />
                                            <p className="break-all text-xs font-semibold text-white">{overrideFile?.name}</p>
                                            <p className="text-[11px] text-white/60">Will be converted to PDF on save</p>
                                        </div>
                                    )}
                                </div>
                                {isOverrideMode && (
                                    <div className="border-t border-(--border-subtle) p-3">{uploadControl('Replace file')}</div>
                                )}
                            </div>
                        ) : (
                            <div className={cx('flex flex-1 flex-col items-center justify-center rounded-[18px] border-2 border-dashed p-6 text-center', isOverrideMode ? 'border-amber-500/50 bg-amber-500/5' : 'border-(--border-subtle)')}>
                                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500"><AlertTriangle size={22} /></span>
                                <p className="text-sm font-semibold text-rose-500">Approval missing</p>
                                <p className="mb-4 mt-1 max-w-[240px] text-xs text-(--text-muted)">No partner approval document has been uploaded yet.</p>
                                {isOverrideMode && uploadControl('Upload file')}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </BaseModal>
    );
};

export default ReviewTimesheetModal;
