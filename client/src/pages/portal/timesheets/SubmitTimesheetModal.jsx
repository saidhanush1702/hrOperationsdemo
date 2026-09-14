import { useState, useEffect } from 'react';
import { Send, UploadCloud, CheckCircle, AlertTriangle, ExternalLink, Clock, Info, FileText } from 'lucide-react';
import { timesheetAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import { fmtDateGB, getEasternDayOfWeek, getEasternDate, buildDailyLogSlots } from '../../../utils/dateUtils';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const SubmitTimesheetModal = ({ timesheet, onClose, onRefresh }) => {
    const [details, setDetails] = useState(null);
    const [entries, setEntries] = useState([]);
    const [attachment, setAttachment] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [regularHours, setRegularHours] = useState(false);

    const [previewUrl, setPreviewUrl] = useState(null);
    const [isPdf, setIsPdf] = useState(false);
    const [isImage, setIsImage] = useState(false);

    const user = JSON.parse(localStorage.getItem('user')) || {};
    const employeeName = timesheet.first_name ? `${timesheet.first_name} ${timesheet.last_name}` : user.name || 'Employee';

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await timesheetAPI.getTimesheetDetails(timesheet.id);
                setDetails(res.data);
                setEntries(res.data.entries || []);
            } catch (err) {
                setError("Failed to load timesheet entries.");
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [timesheet.id]);

    useEffect(() => {
        if (attachment) {
            const url = URL.createObjectURL(attachment);
            setPreviewUrl(url);
            setIsPdf(attachment.type === 'application/pdf');
            setIsImage(attachment.type.startsWith('image/'));
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
    }, [attachment, details?.attachment_url]);

    const handleEntryChange = (index, field, value) => {
        const newEntries = [...entries];
        
        if (field === 'hours' && value !== '') {
            let intVal = parseInt(value, 10);
            if (isNaN(intVal)) intVal = 0;
            if (intVal > 24) intVal = 24;
            if (intVal < 0) intVal = 0;
            value = String(intVal);
        }
        
        newEntries[index][field] = value;
        setEntries(newEntries);
    };

    const calculateTotalHours = () => {
        return entries.reduce((sum, e) => sum + (parseInt(e.hours, 10) || 0), 0);
    };

    const handleRegularHours = (checked) => {
        setRegularHours(checked);
        if (checked) {
            setEntries(entries.map(e => {
                const dow = getEasternDayOfWeek(e.work_date);
                const isWeekend = dow === 0 || dow === 6;
                return { ...e, hours: isWeekend ? '0' : '8' };
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const hasWeekdays = entries.some(e => { const d = getEasternDayOfWeek(e.work_date); return d !== 0 && d !== 6; });
        if (hasWeekdays && calculateTotalHours() === 0) return setError("You must log at least some hours before submitting.");
        if (!attachment && !details.attachment_url) return setError("You MUST upload the mandatory client approval document.");

        const missingNotes = entries.some(e => {
            const hrsStr = e.hours;
            const actualHrs = (hrsStr === '' || hrsStr === null || isNaN(parseInt(hrsStr, 10))) ? 0 : parseInt(hrsStr, 10);

            const dow = getEasternDayOfWeek(e.work_date);
            const isWeekend = dow === 0 || dow === 6;

            const needsNote = isWeekend ? actualHrs !== 0 : actualHrs !== 8;
            return needsNote && (!e.notes || e.notes.trim() === '');
        });

        if (missingNotes) {
            return setError("Notes are mandatory for deviations from standard hours (8 for weekdays, 0 for weekends).");
        }

        setSubmitting(true);
        try {
            const formData = new FormData();
            formData.append('entries', JSON.stringify(entries));
            if (attachment) formData.append('attachment', attachment);

            await timesheetAPI.submitTimesheet(timesheet.id, formData);
            onRefresh();
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || "Failed to submit timesheet.");
            setSubmitting(false);
        }
    };

    if (loading) return null;

    const isEditable = details?.status_id === 1 || details?.status_id === 4; 

    const DAY_ABBR = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const cycleName = details?.cycle_name || '';
    const isWeeklyCycle = /^(weekly|semi-weekly)$/i.test(cycleName.trim());
    const weekStartDayName = isWeeklyCycle ? (details?.week_start_day || 'Sunday') : 'Sunday';
    const weekStartIdx = Math.max(0, DAY_FULL.indexOf(weekStartDayName));
    const weekDays = Array.from({ length: 7 }, (_, i) => DAY_ABBR[(weekStartIdx + i) % 7]);
    const dailyLogSlots = buildDailyLogSlots(entries, weekStartIdx);

    const modalFooter = isEditable ? (
        <div className="flex flex-col w-full gap-3">
            {error && (
                <div className="w-full bg-red-500/10 border border-red-500/30 text-red-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
                    <AlertTriangle size={14} className="shrink-0" /><span>{error}</span>
                </div>
            )}
            <div className="flex justify-end w-full">
                <button onClick={handleSubmit} disabled={submitting || (!attachment && !details?.attachment_url)} className="bg-(--brand-primary) text-(--brand-primary-text) w-full sm:w-auto px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-all active:scale-95 disabled:opacity-50 outline-none">
                    {submitting ? 'Submitting...' : <><Send size={14} /> Submit Timesheet</>}
                </button>
            </div>
        </div>
    ) : null;

    return (
        <BaseModal isOpen={true} onClose={onClose} icon={<Clock size={16} />} title="Timesheet Details" footer={modalFooter}>
            <div className="space-y-4 sm:space-y-6">
                
                {/* ROW 1: META INFO GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-(--bg-surface) rounded-xl border border-(--border-subtle) shadow-sm">
                    <div className="flex flex-col">
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider mb-0.5">Status</p>
                        <span className={`inline-block w-max px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            details?.status_id === 2 ? 'bg-orange-500/10 text-orange-600 border border-orange-500/20' : 
                            details?.status_id === 3 ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 
                            details?.status_id === 4 ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 
                            'bg-(--bg-app) text-(--text-muted) border border-(--border-subtle)'
                        }`}>
                            {details?.status_name || 'Loading'}
                        </span>
                    </div>
                    <div className="flex flex-col">
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider mb-0.5">Employee</p>
                        <p className="text-[11px] font-bold text-(--text-main) truncate">{employeeName}</p>
                    </div>
                    <div className="flex flex-col">
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider mb-0.5">Client</p>
                        <p className="text-[11px] font-bold text-(--text-main) truncate">{timesheet.client_name}</p>
                    </div>
                    <div className="flex flex-col">
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider mb-0.5">Placement ID</p>
                        <p className="text-[11px] font-bold text-(--text-main) font-mono truncate">{timesheet.placement_code || '—'}</p>
                    </div>
                </div>

                {details?.status_id === 4 && details?.rejection_reason && (
                    <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-xl flex flex-col gap-1">
                        <span className="text-[10px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1.5"><AlertTriangle size={12}/> Rejection Reason</span>
                        <span className="text-xs font-bold text-(--text-main) leading-relaxed">{details.rejection_reason}</span>
                        <span className="text-[10px] text-red-600 mt-1">Please correct the entries below and re-submit.</span>
                    </div>
                )}

                {/* ROW 2: SIDE-BY-SIDE LAYOUT (Becomes stacked on mobile) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    
                    {/* LEFT COLUMN: CALENDAR LOG */}
                    <div className="bg-(--bg-app)/50 p-4 rounded-xl border border-(--border-subtle) flex flex-col w-full overflow-hidden">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-(--border-subtle) pb-2 mb-3 gap-2">
                            <div>
                                <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Daily Log</h3>
                                <p className="text-[10px] font-bold text-(--brand-primary) mt-1">
                                    {fmtDateGB(timesheet.start_date)} - {fmtDateGB(timesheet.end_date)}
                                </p>
                            </div>
                            <div className="flex items-center gap-3 mt-1 sm:mt-0">
                                {isEditable && (
                                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={regularHours}
                                            onChange={(e) => handleRegularHours(e.target.checked)}
                                            className="w-3 h-3 cursor-pointer accent-(--brand-primary)"
                                        />
                                        <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Regular Hours</span>
                                    </label>
                                )}
                                <span className="text-xs font-bold text-(--text-main) bg-(--bg-surface) px-2 py-0.5 rounded border border-(--border-subtle) shadow-sm">
                                    {calculateTotalHours()} hrs
                                </span>
                            </div>
                        </div>
                        
                        {/* Horizontal scrolling wrapper to protect calendar on tiny screens */}
                        <div className="w-full overflow-x-auto custom-scrollbar pb-2">
                            <div className="min-w-[320px] bg-(--border-subtle) grid grid-cols-7 gap-[1px] border border-(--border-subtle) rounded-lg overflow-hidden flex-none">
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
                                        <div key={entry.id} className={`bg-(--bg-surface) h-[60px] relative p-1 flex flex-col transition-colors group ${isEditable ? 'hover:bg-(--bg-app)' : ''}`}>
                                            
                                            <div className="flex justify-center items-center relative mb-0.5 w-full">
                                                <span className={`text-[10px] font-bold text-center ${actualHrs > 0 ? 'text-(--brand-primary)' : 'text-(--text-muted)'}`}>
                                                    {d}
                                                </span>
                                                {isEditable && needsNote && (
                                                    <div className="absolute right-0 top-0 text-orange-500 cursor-help" title={tooltipText}>
                                                        <Info size={10} />
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="flex-1 flex flex-col justify-center items-center gap-0.5">
                                                {isEditable ? (
                                                    <>
                                                        <div className="relative w-full px-1 flex justify-center">
                                                            <input 
                                                                type="number" step="1" min="0" max="24" placeholder="0" 
                                                                value={entry.hours !== '' && entry.hours !== null ? Number(entry.hours) : ''} 
                                                                onChange={(e) => handleEntryChange(idx, 'hours', e.target.value)} 
                                                                className="w-full bg-transparent border-b border-transparent focus:border-(--brand-primary) text-[10px] font-bold text-center outline-none transition-colors" 
                                                            />
                                                        </div>
                                                        <input 
                                                            type="text" 
                                                            placeholder={needsNote ? "Note req..." : "Note"} 
                                                            value={entry.notes || ''} 
                                                            onChange={(e) => handleEntryChange(idx, 'notes', e.target.value)} 
                                                            className={`w-full bg-transparent border-b text-[10px] text-center outline-none transition-colors px-0.5 ${needsNote && (!entry.notes || entry.notes.trim() === '') ? 'border-orange-500/50 text-orange-600 placeholder-orange-400 focus:border-orange-500' : 'border-transparent focus:border-(--brand-primary) text-(--text-muted)'}`}
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
                    </div>

                    {/* RIGHT COLUMN: PREVIEW / UPLOAD */}
                    <div className="bg-(--bg-app)/50 p-4 rounded-xl border border-(--border-subtle) flex flex-col min-h-[300px]">
                        <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) pb-2 mb-3 flex items-center gap-1.5">
                            <CheckCircle size={12} className="text-green-500" /> Mandatory Client Approval
                        </h3>
                        
                        {previewUrl ? (
                            <div className="flex flex-col border border-(--border-subtle) rounded-lg bg-(--bg-surface) overflow-hidden shadow-sm flex-1">
                                <div className="bg-(--bg-app) px-3 py-2 flex justify-between items-center border-b border-(--border-subtle)">
                                    <span className="text-[10px] font-bold text-(--text-main) uppercase tracking-widest">
                                        {attachment ? 'Staged Preview' : 'Document Preview'}
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
                                            <p className="text-[10px] font-bold text-(--text-main) break-all">{attachment?.name}</p>
                                            <p className="text-[10px] text-(--text-muted) uppercase tracking-widest">Will be converted to PDF on save</p>
                                        </div>
                                    )}
                                </div>

                                {isEditable && (
                                    <div className="p-3 border-t border-(--border-subtle) flex flex-col items-center bg-(--bg-surface)">
                                        <input type="file" id="clientUpload" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" onChange={(e) => setAttachment(e.target.files[0])} />
                                        <label htmlFor="clientUpload" className="cursor-pointer bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) w-full sm:w-auto px-6 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-(--brand-primary) hover:text-white hover:border-(--brand-primary) transition-all outline-none shadow-sm">
                                            <UploadCloud size={14} /> Replace File
                                        </label>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg bg-(--bg-surface) p-6 text-center transition-colors ${isEditable ? 'border-(--border-subtle) hover:bg-(--bg-app)' : 'border-(--border-subtle)'}`}>
                                <div className="h-10 w-10 bg-(--bg-app) text-(--text-muted) rounded-full flex items-center justify-center mb-3">
                                    <UploadCloud size={20} />
                                </div>
                                <p className="text-[11px] font-bold text-(--text-main) mb-1">Upload Proof of Approval</p>
                                <p className="text-[10px] text-(--text-muted) max-w-[200px] leading-relaxed mb-4">Please upload an email screenshot or signed PDF from your client verifying these hours.</p>
                                
                                {isEditable && (
                                    <div className="w-full sm:w-auto">
                                        <input type="file" id="clientUpload" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" onChange={(e) => setAttachment(e.target.files[0])} />
                                        <label htmlFor="clientUpload" className="cursor-pointer bg-(--brand-primary) text-white w-full px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 transition-all outline-none shadow-sm">
                                            <UploadCloud size={14} /> Select File
                                        </label>
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

export default SubmitTimesheetModal;