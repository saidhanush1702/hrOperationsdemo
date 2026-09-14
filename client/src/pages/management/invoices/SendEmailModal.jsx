import { useState, useEffect } from 'react';
import { Mail, Send, Loader2, FileText, AlertTriangle, X, ChevronDown, Plus, ExternalLink, Eye, EyeOff } from 'lucide-react';
import BaseModal from '../../../components/ui/BaseModal';
import { managementAPI } from '../../../api/apiService';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const SendEmailModal = ({ invoice, emailType = 'INVOICE_SENT', regenerate = false, onClose, onSuccess }) => {
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    
    const [availableContacts, setAvailableContacts] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    
    // Input buffers for manual typing
    const [manualToInput, setManualToInput] = useState('');
    const [manualCcInput, setManualCcInput] = useState('');

    // Inline preview of the combined PDF. The blob lives only in this tab's memory
    // for as long as the preview is open -- nothing is written server-side (the
    // endpoint builds the buffer per request) and nothing is downloaded.
    const [previewUrl, setPreviewUrl]         = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError]     = useState('');
    
    // Form state — BCC is populated from org accounts_email via API
    const [formData, setFormData] = useState({
        to: [],
        cc: [],
        bcc: [],
        subject: '',
        body: ''
    });

    useEffect(() => {
        const fetchEmailData = async () => {
            try {
                const res = await managementAPI.getInvoiceEmailInfo(invoice.id, emailType, regenerate);
                setFormData(prev => ({
                    ...prev,
                    to: res.data.to || [],
                    bcc: res.data.accounts_email ? [res.data.accounts_email] : [],
                    subject: res.data.subject || '',
                    body: res.data.body || ''
                }));
                setAvailableContacts(res.data.availableContacts || []);
            } catch (err) {
                console.error(err);
                setError("Failed to load email template. Ensure client contacts are configured.");
            } finally {
                setLoading(false);
            }
        };
        fetchEmailData();
    }, [invoice.id]);

    // Object URLs are a leak if they outlive their use, so every path that drops the
    // preview revokes first: collapsing it, replacing it, and unmounting.
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    const togglePreview = async () => {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
            setPreviewError('');
            return;
        }
        setPreviewLoading(true);
        setPreviewError('');
        try {
            const res  = await managementAPI.getCombinedInvoicePDF(invoice.id);
            // Force the PDF type: a blob typed application/octet-stream makes the
            // browser offer a download instead of rendering it in the frame.
            const blob = new Blob([res.data], { type: 'application/pdf' });
            setPreviewUrl(URL.createObjectURL(blob));
        } catch {
            setPreviewError('Could not build the combined PDF preview. Try opening it in a new tab.');
        } finally {
            setPreviewLoading(false);
        }
    };

    // --- Tag/Chip Management ---
    const removeEmail = (field, emailToRemove) => {
        setFormData({
            ...formData,
            [field]: formData[field].filter(e => e !== emailToRemove)
        });
    };

    const addEmailFromDropdown = (emailToAdd) => {
        if (!formData.to.includes(emailToAdd)) {
            setFormData({
                ...formData,
                to: [...formData.to, emailToAdd]
            });
        }
        setIsDropdownOpen(false);
    };

    const handleManualInputKeyDown = (e, field, inputValue, setInputValue) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const trimmed = inputValue.trim();
            if (trimmed && !formData[field].includes(trimmed)) {
                if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
                    setFormData({
                        ...formData,
                        [field]: [...formData[field], trimmed]
                    });
                    setInputValue('');
                } else {
                    setError("Please enter a valid email address.");
                    setTimeout(() => setError(''), 3000);
                }
            }
        }
    };

    const unselectedContacts = availableContacts.filter(c => !formData.to.includes(c.email));

    // --- Submission ---
    const handleSend = async () => {
        if (formData.to.length === 0) return setError("Please specify at least one 'To' recipient email.");
        setSending(true);
        setError('');

        try {
            // Convert arrays to comma-separated strings for the backend
            const payload = {
                ...formData,
                to: formData.to.join(', '),
                cc: formData.cc.join(', '),
                bcc: formData.bcc.join(', '),
                email_type: emailType,
            };
            
            await managementAPI.sendInvoiceEmail(invoice.id, payload);
            onSuccess();
        } catch (err) {
            setError(err.response?.data?.error || "Failed to send email.");
            setSending(false);
        }
    };

    const footer = (
        <div className="flex justify-between items-center w-full">
            <button onClick={onClose} disabled={sending} className="bg-(--bg-app) text-(--text-main) border border-(--border-subtle) px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-(--bg-surface) transition-all outline-none">
                Cancel
            </button>
            <button onClick={handleSend} disabled={sending || loading || formData.to.length === 0} className="bg-(--brand-primary) text-white px-8 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:shadow-lg hover:opacity-90 disabled:opacity-50 transition-all outline-none">
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? 'Sending...' : 'Send Email'}
            </button>
        </div>
    );

    return (
        <BaseModal isOpen={true} onClose={!sending ? onClose : undefined} icon={<Mail size={16} />} title={emailType === 'PAST_DUE_REMINDER' ? 'Send Past Due Reminder' : 'Review & Send Email'} footer={footer}>
            <div className="space-y-4">
                {error && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
                        <AlertTriangle size={14} className="shrink-0" /><span>{error}</span>
                    </div>
                )}

                {loading ? (
                    <div className="p-10 flex justify-center"><Loader2 size={32} className="animate-spin text-(--brand-primary)" /></div>
                ) : (
                    <div className="flex flex-col gap-5">
                        
                        {/* --- TO FIELD --- */}
                        <div className="flex flex-col gap-1.5 relative">
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider flex justify-between">
                                <span>To Recipients *</span>
                                <span className="text-(--text-muted) font-normal normal-case">Press Enter to add</span>
                            </label>
                            
                            <div className="min-h-[46px] p-2 bg-(--bg-app) border border-(--border-subtle) rounded-xl flex flex-wrap items-center gap-2 shadow-sm focus-within:border-(--brand-primary) transition-colors">
                                {formData.to.map((email, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5 bg-blue-500/10 text-blue-500 border border-blue-500/20 px-2.5 py-1 rounded-lg text-xs font-medium">
                                        {email}
                                        <button onClick={() => removeEmail('to', email)} className="hover:bg-blue-500/20 p-0.5 rounded-full transition-colors outline-none">
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}

                                <input 
                                    type="text" 
                                    value={manualToInput}
                                    onChange={(e) => setManualToInput(e.target.value)}
                                    onKeyDown={(e) => handleManualInputKeyDown(e, 'to', manualToInput, setManualToInput)}
                                    placeholder={formData.to.length === 0 ? "Add email or select from list..." : "Add another..."}
                                    className="flex-1 min-w-[150px] bg-transparent outline-none text-sm text-(--text-main)"
                                />

                                {unselectedContacts.length > 0 && (
                                    <button 
                                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                        className="ml-auto flex items-center gap-1 text-[10px] font-bold text-(--brand-primary) bg-(--brand-primary)/10 px-2.5 py-1.5 rounded-lg hover:bg-(--brand-primary)/20 transition-colors outline-none"
                                    >
                                        <Plus size={12} /> Client Contacts <ChevronDown size={12} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                                    </button>
                                )}
                            </div>

                            {isDropdownOpen && unselectedContacts.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-(--bg-surface) border border-(--border-subtle) rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto custom-scrollbar">
                                    {unselectedContacts.map(contact => (
                                        <div
                                            key={contact.id}
                                            onClick={() => addEmailFromDropdown(contact.email)}
                                            className="px-4 py-2.5 hover:bg-(--bg-app) cursor-pointer border-b border-(--border-subtle) last:border-0 flex flex-col"
                                        >
                                            <span className="text-sm font-bold text-(--text-main)">{contact.name}</span>
                                            <span className="text-xs text-(--text-muted)">{contact.email}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* --- CC FIELD --- */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider flex justify-between">
                                <span>CC (Optional)</span>
                            </label>
                            
                            <div className="min-h-[46px] p-2 bg-(--bg-app) border border-(--border-subtle) rounded-xl flex flex-wrap items-center gap-2 shadow-sm focus-within:border-(--brand-primary) transition-colors">
                                {formData.cc.map((email, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) px-2.5 py-1 rounded-lg text-xs font-medium">
                                        {email}
                                        <button onClick={() => removeEmail('cc', email)} className="hover:bg-(--border-subtle) p-0.5 rounded-full transition-colors outline-none">
                                            <X size={12} />
                                        </button>
                                    </div>
                                ))}

                                <input 
                                    type="text" 
                                    value={manualCcInput}
                                    onChange={(e) => setManualCcInput(e.target.value)}
                                    onKeyDown={(e) => handleManualInputKeyDown(e, 'cc', manualCcInput, setManualCcInput)}
                                    placeholder="Add CC email..."
                                    className="flex-1 min-w-[150px] bg-transparent outline-none text-sm text-(--text-main)"
                                />
                            </div>
                        </div>

                        {/* --- BCC FIELD (Read Only — from Org accounts_email) --- */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">BCC (Org Accounts Email)</label>
                            <div className="min-h-[46px] p-2 bg-(--bg-app)/50 border border-(--border-subtle) rounded-xl flex flex-wrap items-center gap-2 shadow-sm">
                                {formData.bcc.length > 0 ? formData.bcc.map((email, idx) => (
                                    <div key={idx} className="flex items-center gap-1.5 bg-(--bg-app) text-(--text-muted) border border-(--border-subtle) px-2.5 py-1 rounded-lg text-xs font-medium cursor-not-allowed">
                                        {email}
                                    </div>
                                )) : (
                                    <span className="text-[10px] text-(--text-muted) italic px-1">No accounts BCC email configured in Organisation Settings.</span>
                                )}
                            </div>
                        </div>

                        {/* --- SUBJECT & BODY --- */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Subject</label>
                            <input
                                type="text"
                                value={formData.subject}
                                onChange={(e) => setFormData({...formData, subject: e.target.value})}
                                className="w-full p-3 bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-xl text-sm outline-none focus:border-(--brand-primary) transition-colors shadow-sm"
                            />
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Message Body</label>
                            <textarea
                                value={formData.body}
                                onChange={(e) => setFormData({...formData, body: e.target.value})}
                                rows="6"
                                className="w-full p-3 bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-xl text-sm outline-none focus:border-(--brand-primary) transition-colors shadow-sm resize-none"
                            />
                        </div>

                        {/* --- ATTACHMENT PREVIEW --- */}
                        <div className="flex flex-col gap-1.5 mt-2">
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Attachments</label>
                            <div className="flex items-center gap-2 bg-(--bg-app) border border-(--border-subtle) p-3 rounded-xl w-max max-w-full">
                                <button
                                    type="button"
                                    onClick={() => window.open(`${BACKEND_URL}/api/management/invoices/${invoice.id}/combined-pdf`, '_blank')}
                                    className="flex items-center gap-4 text-left outline-none group cursor-pointer min-w-0"
                                    title="Open the combined PDF in a new tab"
                                >
                                    <FileText size={24} className="text-red-500 group-hover:scale-110 transition-transform shrink-0" />
                                    <div className="flex flex-col pr-2 min-w-0">
                                        <span className="text-xs font-bold text-(--text-main) group-hover:text-blue-700 transition-colors flex items-center gap-1.5 truncate">
                                            {invoice.invoice_number}_Combined.pdf
                                            <ExternalLink size={12} className="opacity-50 shrink-0" />
                                        </span>
                                        <span className="text-[10px] text-(--text-muted) uppercase tracking-widest mt-0.5 truncate">
                                            Invoice + Approved Timesheets
                                        </span>
                                    </div>
                                </button>

                                {/* Inline preview toggle, kept as its own control so the
                                    card can still open the PDF in a new tab. */}
                                <button
                                    type="button"
                                    onClick={togglePreview}
                                    disabled={previewLoading}
                                    title={previewUrl ? 'Hide preview' : 'Preview the combined PDF here'}
                                    aria-label={previewUrl ? 'Hide combined PDF preview' : 'Show combined PDF preview'}
                                    aria-expanded={!!previewUrl}
                                    className={`shrink-0 p-2 rounded-lg border transition-all active:scale-95 outline-none disabled:opacity-50 disabled:cursor-wait ${
                                        previewUrl
                                            ? 'bg-(--brand-primary) text-white border-(--brand-primary)'
                                            : 'bg-(--bg-surface) text-(--text-muted) border-(--border-subtle) hover:text-(--brand-primary) hover:border-(--brand-primary)/40'
                                    }`}
                                >
                                    {previewLoading ? <Loader2 size={16} className="animate-spin" />
                                        : previewUrl ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>

                            {previewError && (
                                <div className="flex items-center gap-2 text-[10px] font-bold text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mt-1">
                                    <AlertTriangle size={12} className="shrink-0" /> {previewError}
                                </div>
                            )}

                            {previewUrl && (
                                <div className="mt-2 rounded-xl border border-(--border-subtle) overflow-hidden bg-(--bg-app) animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center justify-between px-3 py-2 border-b border-(--border-subtle) bg-(--bg-surface)">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">
                                            Preview — exactly what will be attached
                                        </span>
                                        <button
                                            type="button"
                                            onClick={togglePreview}
                                            title="Close preview"
                                            className="p-1 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--bg-app) transition-colors outline-none"
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                    <iframe
                                        src={previewUrl}
                                        title="Combined invoice PDF preview"
                                        className="w-full h-[420px] sm:h-[520px] bg-white"
                                    />
                                </div>
                            )}

                            <p className="text-[10px] text-(--text-muted) mt-1 italic">
                                Press the eye to preview the exact PDF that will be sent, or click the file to open it in a new tab.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </BaseModal>
    );
};

export default SendEmailModal;