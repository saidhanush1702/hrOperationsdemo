import { useState, useEffect } from 'react';
import { Send, UploadCloud, CheckCircle, AlertTriangle, ExternalLink, Timer, Info, FileText, User, Handshake, Rocket, CalendarRange, ShieldCheck } from 'lucide-react';
import { timesheetAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import { fmtDateGB, getEasternDayOfWeek, getEasternDate, buildDailyLogSlots } from '../../../utils/dateUtils';
import { Btn, Chip, Fact, Notice, cx } from '../../../components/ui/kit';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const STATUS_TONE = { 2: 'amber', 3: 'green', 4: 'rose' };

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
    const employeeName = timesheet.first_name ? `${timesheet.first_name} ${timesheet.last_name}` : user.name || 'Consultant';

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await timesheetAPI.getTimesheetDetails(timesheet.id);
                setDetails(res.data);
                setEntries(res.data.entries || []);
            } catch {
                setError("Failed to load time log entries.");
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
        if (!attachment && !details.attachment_url) return setError("You MUST upload the mandatory partner approval document.");

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
            setError(err.response?.data?.error || "Failed to submit time log.");
            setSubmitting(false);
        }
    };

    if (loading) return null;

    const isEditable = details?.status_id === 1 || details?.status_id === 4;

    const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const cycleName = details?.cycle_name || '';
    const isWeeklyCycle = /^(weekly|semi-weekly)$/i.test(cycleName.trim());
    const weekStartDayName = isWeeklyCycle ? (details?.week_start_day || 'Sunday') : 'Sunday';
    const weekStartIdx = Math.max(0, DAY_FULL.indexOf(weekStartDayName));
    const weekDays = Array.from({ length: 7 }, (_, i) => DAY_ABBR[(weekStartIdx + i) % 7]);
    const dailyLogSlots = buildDailyLogSlots(entries, weekStartIdx);

    const uploadInput = (
        <input type="file" id="clientUpload" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls" onChange={(e) => setAttachment(e.target.files[0])} />
    );

    const modalFooter = isEditable ? (
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
                {error ? (
                    <Notice tone="rose" icon={AlertTriangle}>{error}</Notice>
                ) : (
                    <span className="text-sm text-(--text-muted)"><b className="text-(--text-main)">{calculateTotalHours()} hrs</b> logged</span>
                )}
            </div>
            <Btn variant="primary" icon={Send} onClick={handleSubmit} disabled={submitting || (!attachment && !details?.attachment_url)}>
                {submitting ? 'Submitting…' : 'Submit time log'}
            </Btn>
        </div>
    ) : null;

    return (
        <BaseModal
            isOpen={true}
            onClose={onClose}
            icon={<Timer size={18} />}
            title="Time log"
            subtitle={`${fmtDateGB(timesheet.start_date)} → ${fmtDateGB(timesheet.end_date)} · ${timesheet.client_name || ''}`}
            footer={modalFooter}
            noPadding
        >
            <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_400px]">
                {/* Daily log */}
                <div className="min-w-0 space-y-5 p-4 sm:p-6 lg:p-8">
                    {details?.status_id === 4 && details?.rejection_reason && (
                        <Notice tone="rose" icon={AlertTriangle}>
                            <b>Sent back:</b> {details.rejection_reason}
                            <span className="mt-1 block">Please correct the entries below and re-submit.</span>
                        </Notice>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-(--brand-primary)">Daily log</p>
                            <p className="text-sm text-(--text-muted)">{fmtDateGB(timesheet.start_date)} – {fmtDateGB(timesheet.end_date)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            {isEditable && (
                                <label className="flex cursor-pointer select-none items-center gap-2 rounded-full border border-(--border-subtle) px-3 py-1.5 text-xs text-(--text-main)">
                                    <input type="checkbox" checked={regularHours} onChange={(e) => handleRegularHours(e.target.checked)} className="h-3.5 w-3.5 cursor-pointer" />
                                    Regular hours
                                </label>
                            )}
                            <span className="rounded-full px-3 py-1.5 text-sm font-semibold text-white" style={{ background: 'var(--brand-gradient)' }}>
                                {calculateTotalHours()} hrs
                            </span>
                        </div>
                    </div>

                    <div className="overflow-x-auto pb-2">
                        <div className="grid min-w-[560px] grid-cols-7 gap-2">
                            {weekDays.map(day => (
                                <div key={day} className="py-1 text-center text-xs font-semibold text-(--text-muted)">{day}</div>
                            ))}

                            {dailyLogSlots.map((slot, slotIdx) => {
                                if (!slot) return <div key={`blank-${slotIdx}`} className="h-[104px] rounded-[16px] bg-(--bg-app)/40" />;
                                const { entry, index: idx } = slot;
                                const d = getEasternDate(entry.work_date);
                                const dayOfWeek = getEasternDayOfWeek(entry.work_date);

                                const hrsStr = entry.hours;
                                const actualHrs = (hrsStr === '' || hrsStr === null || isNaN(parseInt(hrsStr, 10))) ? 0 : parseInt(hrsStr, 10);

                                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                                const needsNote = isWeekend ? actualHrs !== 0 : actualHrs !== 8;
                                const noteMissing = needsNote && (!entry.notes || entry.notes.trim() === '');
                                const tooltipText = isWeekend ? "Weekends expect 0 hours. Please add a note." : "Weekdays expect exactly 8 hours. Please add a note.";

                                return (
                                    <div
                                        key={entry.id}
                                        className={cx(
                                            'relative flex h-[104px] flex-col rounded-[16px] border p-2 transition-colors',
                                            isEditable && noteMissing ? 'border-amber-500/50 bg-amber-500/5'
                                                : actualHrs > 0 ? 'border-(--brand-primary)/30 bg-(--brand-primary)/5'
                                                : 'border-(--border-subtle) bg-(--bg-surface)',
                                            isWeekend && actualHrs === 0 && 'opacity-80',
                                        )}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={cx('text-xs font-semibold', actualHrs > 0 ? 'text-(--brand-primary)' : 'text-(--text-muted)')}>{d}</span>
                                            {isEditable && needsNote && (
                                                <span className="cursor-help text-amber-500" title={tooltipText}><Info size={12} /></span>
                                            )}
                                        </div>

                                        <div className="flex flex-1 flex-col items-center justify-center gap-1">
                                            {isEditable ? (
                                                <>
                                                    <div className="flex items-baseline justify-center gap-0.5">
                                                        <input
                                                            type="number" step="1" min="0" max="24" placeholder="0"
                                                            value={entry.hours !== '' && entry.hours !== null ? Number(entry.hours) : ''}
                                                            onChange={(e) => handleEntryChange(idx, 'hours', e.target.value)}
                                                            className="w-10 border-b border-transparent bg-transparent text-center text-lg font-semibold text-(--text-main) outline-none transition-colors focus:border-(--brand-primary)"
                                                        />
                                                        <span className="text-[10px] text-(--text-muted)">h</span>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder={needsNote ? "Note needed" : "Note"}
                                                        value={entry.notes || ''}
                                                        onChange={(e) => handleEntryChange(idx, 'notes', e.target.value)}
                                                        className={cx(
                                                            'w-full rounded-md bg-transparent px-1 text-center text-[11px] outline-none transition-colors',
                                                            noteMissing ? 'text-amber-600 placeholder:text-amber-500' : 'text-(--text-muted) focus:bg-(--bg-app)',
                                                        )}
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <span className={cx('text-lg font-semibold', actualHrs > 0 ? 'text-(--brand-primary)' : 'text-(--text-muted) opacity-40')}>{actualHrs}h</span>
                                                    {entry.notes && (
                                                        <span className="line-clamp-2 w-full text-center text-[11px] text-(--text-muted)" title={entry.notes}>{entry.notes}</span>
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

                {/* Summary + approval document */}
                <aside className="space-y-5 border-t border-(--border-subtle) bg-(--bg-app)/40 p-5 xl:border-l xl:border-t-0 xl:p-6">
                    <div className="space-y-3 rounded-[20px] border border-(--border-subtle) bg-(--bg-surface) p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-(--text-muted)">Status</span>
                            <Chip tone={STATUS_TONE[details?.status_id] || 'slate'}>{details?.status_name || 'Loading'}</Chip>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <Fact icon={User} label="Consultant" value={employeeName} />
                            <Fact icon={Handshake} label="Partner" value={timesheet.client_name} />
                            <Fact icon={Rocket} label="Engagement ID" value={timesheet.placement_code || '—'} mono />
                            <Fact icon={CalendarRange} label="Cycle" value={cycleName || '—'} />
                        </div>
                    </div>

                    <div>
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-(--text-main)">
                            <ShieldCheck size={15} className="text-emerald-500" /> Partner approval <span className="text-xs font-normal text-(--text-muted)">· required</span>
                        </p>

                        {previewUrl ? (
                            <div className="overflow-hidden rounded-[20px] border border-(--border-subtle) bg-(--bg-surface)">
                                <div className="flex items-center justify-between border-b border-(--border-subtle) px-3 py-2">
                                    <span className="text-xs font-semibold text-(--text-main)">{attachment ? 'Staged preview' : 'Document preview'}</span>
                                    <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-semibold text-(--brand-primary) outline-none hover:underline">
                                        Fullscreen <ExternalLink size={11} />
                                    </a>
                                </div>

                                <div className="relative flex h-[380px] items-center justify-center overflow-hidden bg-(--bg-app)">
                                    {isPdf ? (
                                        <iframe src={previewUrl} className="h-full w-full border-0" title="Document preview" />
                                    ) : isImage ? (
                                        <img src={previewUrl} alt="Approval document" className="max-h-full max-w-full object-contain p-2" />
                                    ) : (
                                        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
                                            <FileText size={32} className="text-(--text-muted)" />
                                            <p className="break-all text-xs font-semibold text-(--text-main)">{attachment?.name}</p>
                                            <p className="text-[11px] text-(--text-muted)">Will be converted to PDF on save</p>
                                        </div>
                                    )}
                                </div>

                                {isEditable && (
                                    <div className="flex justify-center border-t border-(--border-subtle) p-3">
                                        {uploadInput}
                                        <label htmlFor="clientUpload" className="flex cursor-pointer items-center gap-2 rounded-full border border-(--border-subtle) px-4 py-1.5 text-xs font-semibold text-(--text-main) outline-none transition-colors hover:border-(--brand-primary)/50">
                                            <UploadCloud size={14} /> Replace file
                                        </label>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-(--border-subtle) bg-(--bg-surface) p-8 text-center">
                                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-(--brand-primary)/10 text-(--brand-primary)">
                                    <UploadCloud size={22} />
                                </span>
                                <p className="text-sm font-semibold text-(--text-main)">Upload proof of approval</p>
                                <p className="mb-4 mt-1 max-w-[240px] text-xs text-(--text-muted)">An email screenshot or signed PDF from your partner verifying these hours.</p>

                                {isEditable && (
                                    <>
                                        {uploadInput}
                                        <label htmlFor="clientUpload" className="flex cursor-pointer items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold text-white outline-none" style={{ background: 'var(--brand-gradient)' }}>
                                            <UploadCloud size={15} /> Select file
                                        </label>
                                    </>
                                )}
                            </div>
                        )}
                        {!isEditable && details?.status_id === 3 && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-500"><CheckCircle size={13} /> Approved — no further action needed.</p>
                        )}
                    </div>
                </aside>
            </div>
        </BaseModal>
    );
};

export default SubmitTimesheetModal;
