import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, FileText, AlertTriangle, ExternalLink, Edit3, UploadCloud, X, Clock, RefreshCw, Info } from 'lucide-react';
import { timesheetAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import { fmtDateGB, getEasternDayOfWeek, getEasternDate, buildDailyLogSlots } from '../../../utils/dateUtils';

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
            } catch (err) {
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
            return setActionError("Please provide a reason for rejecting this timesheet.");
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
            setActionError(err.response?.data?.error || `Failed to ${actionType} timesheet.`);
            setSubmitting(false);
        }
    };

    if (loading) return null;

    const isFinalized = (details?.status_id === 3 || details?.status_id === 4) && !isReopened;
    const isUnsubmittedOrPastDue = details?.status_id === 1 || details?.status_id === 5;
    const documentUrl = details?.attachment_url
        ? (details.attachment_url.startsWith('http') ? details.attachment_url : `${API_BASE}/${details.attachment_url.replace(/^\/+/, '')}`)
        : null;
    const hasModifications = JSON.stringify(overrideEntries) !== JSON.stringify(originalEntries) || overrideFile !== null;
    
    // Determine if Approve/Reject should be shown. 
    const canFinalize = !isUnsubmittedOrPastDue || hasModifications;

    const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const cycleName = details?.cycle_name || '';
    const isWeeklyCycle = /^(weekly|semi-weekly)$/i.test(cycleName.trim());
    const weekStartDayName = isWeeklyCycle ? (details?.week_start_day || 'Sunday') : 'Sunday';
    const weekStartIdx = Math.max(0, DAY_FULL.indexOf(weekStartDayName));
    const weekDays = Array.from({ length: 7 }, (_, i) => DAY_ABBR[(weekStartIdx + i) % 7]);
    const dailyLogSlots = buildDailyLogSlots(overrideEntries, weekStartIdx);

    const modalFooter = isFinalized ? (
        <div className="flex justify-between items-center w-full">
            <span className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest">
                This timesheet has already been {details?.status_id === 3 ? 'Approved' : 'Rejected'}.
            </span>
            <button onClick={() => setIsReopened(true)} className="bg-(--brand-primary)/10 text-(--brand-primary) border border-(--brand-primary)/20 px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm hover:bg-(--brand-primary) hover:text-white transition-all outline-none">
                <RefreshCw size={14} /> Modify Decision
            </button>
        </div>
    ) : (
        <div className="flex flex-col w-full gap-3">
            {actionError && (
                <div className="w-full bg-red-500/10 border border-red-500/30 text-red-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
                    <AlertTriangle size={14} className="shrink-0" /><span>{actionError}</span>
                </div>
            )}
            
            {isRejecting ? (
                <div className="w-full space-y-3 animate-in fade-in slide-in-from-bottom-2">
                    <textarea 
                        placeholder="Reason for rejection..." 
                        value={rejectionReason} 
                        onChange={(e) => setRejectionReason(e.target.value)} 
                        className="w-full p-3 bg-(--input-bg) text-(--input-text) border border-red-500/40 focus:border-red-500 rounded-lg text-xs outline-none transition-all resize-none h-24" 
                    />
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setIsRejecting(false)} className="px-4 py-2 text-[10px] font-bold uppercase text-(--text-muted) hover:text-(--text-main) outline-none">Cancel</button>
                        <button onClick={() => handleAction('reject')} disabled={submitting || !rejectionReason.trim()} className="bg-red-500 text-white px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm hover:bg-red-600 disabled:opacity-50 outline-none">
                            {submitting ? 'Processing...' : <><XCircle size={14}/> Confirm Rejection</>}
                        </button>
                    </div>
                </div>
            ) : isOverrideMode ? (
                <div className="flex justify-between items-center w-full animate-in fade-in">
                    <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest bg-orange-500/10 px-3 py-1 rounded border border-orange-500/20">
                        Override Mode Active
                    </span>
                    <div className="flex gap-3">
                        <button onClick={handleCancelOverride} className="px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-all outline-none">
                            Cancel
                        </button>
                        <button onClick={handleSaveOverrideLocal} className="bg-orange-500 text-white px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm hover:bg-orange-600 transition-all outline-none">
                            Save Changes
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex justify-between items-center w-full">
                    <div>
                        {hasModifications && (
                            <span className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">
                                Modifications saved locally.
                            </span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => setIsOverrideMode(true)} className="px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) hover:bg-(--brand-primary) hover:text-white transition-all outline-none flex items-center gap-1.5">
                            <Edit3 size={14} /> Override
                        </button>
                        {canFinalize && (
                            <>
                                <button onClick={() => setIsRejecting(true)} className="px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest text-red-500 hover:bg-red-500/10 border border-red-500/20 transition-all outline-none flex items-center gap-1.5">
                                    <XCircle size={14} /> Reject
                                </button>
                                <button onClick={() => handleAction('approve')} disabled={submitting} className="bg-green-500 text-white px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm hover:bg-green-600 transition-all disabled:opacity-50 outline-none">
                                    {submitting ? 'Processing...' : <><CheckCircle size={14} /> Approve</>}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <BaseModal
            isOpen={true} onClose={onClose} icon={<Clock size={16} />}
            title="Timesheet Review"
            footer={modalFooter}
        >
            <div className="space-y-6">
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-(--bg-surface) rounded-xl border border-(--border-subtle) shadow-sm">
                    <div className="sm:col-span-1">
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider mb-0.5">Status</p>
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            details?.status_id === 2 ? 'bg-orange-500/10 text-orange-600 border border-orange-500/20' : 
                            details?.status_id === 3 ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 
                            details?.status_id === 4 ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 
                            'bg-(--bg-app) text-(--text-muted) border border-(--border-subtle)'
                        }`}>
                            {details?.status_name || 'Loading'}
                        </span>
                    </div>
                    <div className="sm:col-span-1">
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider mb-0.5">Employee</p>
                        <p className="text-[11px] font-bold text-(--text-main) truncate">{timesheet.first_name} {timesheet.last_name}</p>
                    </div>
                    <div className="sm:col-span-1">
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider mb-0.5">Client</p>
                        <p className="text-[11px] font-bold text-(--text-main) truncate">{timesheet.client_name}</p>
                    </div>
                    <div className="sm:col-span-1">
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider mb-0.5">Placement ID</p>
                        <p className="text-[11px] font-bold text-(--text-main) truncate">{timesheet.placement_code}</p>
                    </div>
                </div>

                {details?.status_id === 4 && details?.rejection_reason && (
                    <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Previous Rejection Reason</span>
                        <span className="text-xs font-bold text-(--text-main)">{details.rejection_reason}</span>
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    
                    <div className="lg:col-span-2 bg-(--bg-app)/50 p-4 rounded-xl border border-(--border-subtle) flex flex-col">
                        <div className="flex justify-between items-start border-b border-(--border-subtle) pb-2 mb-3">
                            <div>
                                <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Daily Log</h3>
                                <p className="text-[10px] font-bold text-(--brand-primary) mt-1">
                                    {fmtDateGB(timesheet.start_date)} - {fmtDateGB(timesheet.end_date)}
                                </p>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                                {isOverrideMode && (
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={regularHours}
                                            onChange={(e) => handleRegularHours(e.target.checked)}
                                            className="w-3 h-3 cursor-pointer accent-orange-500"
                                        />
                                        <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Regular Hours</span>
                                    </label>
                                )}
                                <span className={`text-xs font-bold px-2 py-0.5 rounded border border-(--border-subtle) shadow-sm ${hasModifications ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' : 'bg-(--bg-surface) text-(--text-main)'}`}>
                                    {calculateOverrideTotal()} hrs
                                </span>
                            </div>
                        </div>
                        
                        <div className="bg-(--border-subtle) grid grid-cols-7 gap-[1px] border border-(--border-subtle) rounded-lg overflow-hidden flex-none custom-scrollbar">
                            {weekDays.map(day => <div key={day} className="bg-(--bg-app) py-1.5 text-center text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">{day}</div>)}
                            
                            {dailyLogSlots.map((slot, slotIdx) => {
                                if (!slot) return <div key={`blank-${slotIdx}`} className="bg-(--bg-app)/30 h-[60px]"></div>;
                                const { entry, index: idx } = slot;
                                const d = getEasternDate(entry.work_date);
                                const dayOfWeek = getEasternDayOfWeek(entry.work_date);
                                
                                const hrsStr = entry.hours;
                                const actualHrs = (hrsStr === '' || hrsStr === null || isNaN(parseInt(hrsStr, 10))) ? 0 : parseInt(hrsStr, 10);
                                
                                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                                
                                const needsNote = isWeekend ? actualHrs !== 0 : actualHrs !== 8;
                                const tooltipText = isWeekend ? "Weekends expect 0 hours. Please add a note." : "Weekdays expect exactly 8 hours. Please add a note.";

                                return (
                                    <div key={entry.id} className={`bg-(--bg-surface) h-[60px] relative p-1 flex flex-col transition-colors group ${isOverrideMode ? 'hover:bg-(--bg-app)' : ''}`}>
                                        
                                        <div className="flex justify-center items-center relative mb-0.5 w-full">
                                            <span className={`text-[10px] font-bold text-center ${actualHrs > 0 ? 'text-(--brand-primary)' : 'text-(--text-muted)'}`}>
                                                {d}
                                            </span>
                                            {isOverrideMode && needsNote && (
                                                <div className="absolute right-0 top-0 text-orange-500 cursor-help" title={tooltipText}>
                                                    <Info size={10} />
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="flex-1 flex flex-col justify-center items-center gap-0.5">
                                            {isOverrideMode ? (
                                                <>
                                                    <div className="relative w-full px-1 flex justify-center">
                                                        <input 
                                                            type="number" step="1" min="0" max="24" placeholder="0" 
                                                            value={entry.hours !== '' && entry.hours !== null ? Number(entry.hours) : ''} 
                                                            onChange={(e) => handleEntryChange(idx, 'hours', e.target.value)} 
                                                            className="w-full bg-transparent border-b border-transparent focus:border-orange-500 text-[10px] font-bold text-center outline-none transition-colors" 
                                                        />
                                                    </div>
                                                    <input 
                                                        type="text" 
                                                        placeholder={needsNote ? "Note req..." : "Note"} 
                                                        value={entry.notes || ''} 
                                                        onChange={(e) => handleEntryChange(idx, 'notes', e.target.value)} 
                                                        className={`w-full bg-transparent border-b text-[10px] text-center outline-none transition-colors px-0.5 ${needsNote && (!entry.notes || entry.notes.trim() === '') ? 'border-orange-500/50 text-orange-600 placeholder-orange-400 focus:border-orange-500' : 'border-transparent focus:border-orange-500 text-(--text-muted)'}`}
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <span className={`text-[10px] font-bold ${actualHrs > 0 ? 'text-(--brand-primary) bg-(--brand-primary)/10 px-1.5 rounded' : 'text-(--text-muted) opacity-30'}`}>
                                                        {actualHrs}h
                                                    </span>
                                                    {entry.notes && (
                                                        <span className="text-[10px] text-(--text-muted) text-center w-full px-0.5 line-clamp-2" title={entry.notes}>
                                                            {entry.notes}
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="lg:col-span-3 bg-(--bg-app)/50 p-4 rounded-xl border border-(--border-subtle) flex flex-col min-h-[300px]">
                        <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) pb-2 mb-3 flex items-center gap-1.5">
                            <CheckCircle size={12} className="text-green-500" /> Mandatory Client Approval
                        </h3>
                        
                        {previewUrl ? (
                            <div className="flex flex-col border border-(--border-subtle) rounded-lg bg-(--bg-surface) overflow-hidden shadow-sm flex-1">
                                <div className="bg-(--bg-app) px-3 py-2 flex justify-between items-center border-b border-(--border-subtle)">
                                    <span className="text-[10px] font-bold text-(--text-main) uppercase tracking-widest">
                                        {overrideFile ? 'Staged Preview' : 'Document Preview'}
                                    </span>
                                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-(--brand-primary) flex items-center gap-1 hover:underline outline-none">
                                        Fullscreen <ExternalLink size={10} />
                                    </a>
                                </div>
                                
                                <div className="bg-(--bg-app) flex justify-center items-center relative flex-1 min-h-[200px] overflow-hidden">
                                    {isPdf ? (
                                        <iframe src={previewUrl} className="w-full h-full border-0" title="Document Preview" />
                                    ) : isImage ? (
                                        <img src={previewUrl} alt="Approval Document" className="max-h-full max-w-full object-contain p-2" />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
                                            <FileText size={32} className="text-(--text-muted)" />
                                            <p className="text-[10px] font-bold text-(--text-main) break-all">{overrideFile?.name}</p>
                                            <p className="text-[10px] text-(--text-muted) uppercase tracking-widest">Will be converted to PDF on save</p>
                                        </div>
                                    )}
                                </div>

                                {isOverrideMode && (
                                    <div className="p-3 border-t border-(--border-subtle) flex flex-col items-center bg-(--bg-surface)">
                                        <input type="file" id="hrUpload" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" onChange={(e) => setOverrideFile(e.target.files[0])} />
                                        <label htmlFor="hrUpload" className="cursor-pointer bg-orange-500 text-white border border-orange-600 px-6 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-orange-600 transition-all outline-none shadow-sm">
                                            <UploadCloud size={14} /> Replace File
                                        </label>
                                        <p className="text-[10px] text-(--text-muted) mt-2 uppercase tracking-widest">
                                            Will be saved upon Approval/Rejection
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg bg-(--bg-surface) p-6 text-center transition-colors ${isOverrideMode ? 'border-orange-500/50 bg-orange-500/5' : 'border-(--border-subtle)'}`}>
                                <div className="h-10 w-10 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-3">
                                    <AlertTriangle size={20} />
                                </div>
                                <p className="text-[11px] font-bold text-red-500 mb-1">Missing Attachment</p>
                                <p className="text-[10px] text-(--text-muted) max-w-[200px] leading-relaxed mb-4">No approval document has been uploaded yet.</p>
                                
                                {isOverrideMode && (
                                    <div>
                                        <input type="file" id="hrUpload" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" onChange={(e) => setOverrideFile(e.target.files[0])} />
                                        <label htmlFor="hrUpload" className="cursor-pointer bg-orange-500 text-white border border-orange-600 px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-orange-600 transition-all outline-none shadow-sm">
                                            <UploadCloud size={14} /> Upload File
                                        </label>
                                        <p className="text-[10px] text-(--text-muted) mt-2 uppercase tracking-widest">
                                            Will be saved upon Approval/Rejection
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </BaseModal>
    );
};

export default ReviewTimesheetModal;