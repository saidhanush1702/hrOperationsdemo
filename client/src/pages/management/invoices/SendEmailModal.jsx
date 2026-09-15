import { useState, useEffect } from 'react';
import { Mail, Send, Loader2, FileText, AlertTriangle, X, ChevronDown, Plus, ExternalLink, Eye, EyeOff, Paperclip } from 'lucide-react';
import BaseModal from '../../../components/ui/BaseModal';
import { managementAPI } from '../../../api/apiService';
import { Btn, Notice, LoadingState, cx } from '../../../components/ui/kit';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const Row = ({ label, hint, children }) => (
    <div className="flex items-start gap-3 border-b border-(--border-subtle) px-4 py-3 last:border-b-0">
        <span className="w-14 shrink-0 pt-1.5 text-xs font-semibold text-(--text-muted)">{label}</span>
        <div className="min-w-0 flex-1">{children}</div>
        {hint && <span className="hidden shrink-0 pt-1.5 text-[11px] text-(--text-muted) sm:block">{hint}</span>}
    </div>
);

const SendEmailModal = ({ invoice, emailType = 'INVOICE_SENT', regenerate = false, onClose, onSuccess }) => {
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');

    const [availableContacts, setAvailableContacts] = useState([]);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    // Input buffers for manual typing
    const [manualToInput, setManualToInput] = useState('');
    const [manualCcInput, setManualCcInput] = useState('');

    // Inline preview of the combined PDF, held only in this tab's memory.
    const [previewUrl, setPreviewUrl]         = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError]     = useState('');

    // Form state — BCC is populated from the workspace billing email via API
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
                setError("Failed to load email template. Make sure partner contacts are set up.");
            } finally {
                setLoading(false);
            }
        };
        fetchEmailData();
    }, [invoice.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Revoke object URLs whenever the preview is dropped or replaced, and on unmount.
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
            // Force the PDF type so the browser renders it instead of downloading.
            const blob = new Blob([res.data], { type: 'application/pdf' });
            setPreviewUrl(URL.createObjectURL(blob));
        } catch {
            setPreviewError('Could not build the combined PDF preview. Try opening it in a new tab.');
        } finally {
            setPreviewLoading(false);
        }
    };

    // --- Chip management ---
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
        <div className="flex w-full items-center justify-between gap-3">
            <Btn onClick={onClose} disabled={sending}>Discard</Btn>
            <Btn variant="primary" icon={sending ? Loader2 : Send} onClick={handleSend} disabled={sending || loading || formData.to.length === 0}>
                {sending ? 'Sending…' : 'Send email'}
            </Btn>
        </div>
    );

    const chip = (email, field, tone) => (
        <span key={email} className={cx('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium', tone)}>
            {email}
            <button onClick={() => removeEmail(field, email)} className="rounded-full p-0.5 outline-none hover:bg-black/10">
                <X size={12} />
            </button>
        </span>
    );

    return (
        <BaseModal
            isOpen={true}
            onClose={!sending ? onClose : undefined}
            icon={<Mail size={18} />}
            title={emailType === 'PAST_DUE_REMINDER' ? 'Overdue reminder' : 'Compose invoice email'}
            subtitle={invoice.invoice_number}
            footer={footer}
            noPadding
        >
            <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                {/* Composer */}
                <div className="space-y-4 p-4 sm:p-6 lg:p-8">
                    {error && <Notice tone="rose" icon={AlertTriangle}>{error}</Notice>}

                    {loading ? (
                        <LoadingState text="Preparing email…" />
                    ) : (
                        <>
                            <section className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface)">
                                <Row label="To" hint="Enter to add">
                                    <div className="relative">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {formData.to.map(email => chip(email, 'to', 'border-(--brand-primary)/30 bg-(--brand-primary)/10 text-(--brand-primary)'))}
                                            <input
                                                type="text"
                                                value={manualToInput}
                                                onChange={(e) => setManualToInput(e.target.value)}
                                                onKeyDown={(e) => handleManualInputKeyDown(e, 'to', manualToInput, setManualToInput)}
                                                placeholder={formData.to.length === 0 ? 'Add email or pick a contact…' : 'Add another…'}
                                                className="min-w-[150px] flex-1 bg-transparent py-1 text-sm text-(--text-main) outline-none"
                                            />
                                            {unselectedContacts.length > 0 && (
                                                <button
                                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                                    className="ml-auto flex items-center gap-1 rounded-full bg-(--brand-primary)/10 px-3 py-1.5 text-xs font-semibold text-(--brand-primary) outline-none hover:bg-(--brand-primary)/20"
                                                >
                                                    <Plus size={12} /> Partner contacts <ChevronDown size={12} className={cx('transition-transform', isDropdownOpen && 'rotate-180')} />
                                                </button>
                                            )}
                                        </div>

                                        {isDropdownOpen && unselectedContacts.length > 0 && (
                                            <div className="nx-pop absolute left-0 right-0 top-full z-50 mt-2 max-h-56 overflow-y-auto rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) p-1.5" style={{ boxShadow: 'var(--shadow-floating)' }}>
                                                {unselectedContacts.map(contact => (
                                                    <div
                                                        key={contact.id}
                                                        onClick={() => addEmailFromDropdown(contact.email)}
                                                        className="flex cursor-pointer flex-col rounded-[12px] px-3 py-2 hover:bg-(--text-main)/5"
                                                    >
                                                        <span className="text-sm font-semibold text-(--text-main)">{contact.name}</span>
                                                        <span className="text-xs text-(--text-muted)">{contact.email}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </Row>

                                <Row label="Cc">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {formData.cc.map(email => chip(email, 'cc', 'border-(--border-subtle) bg-(--bg-app) text-(--text-main)'))}
                                        <input
                                            type="text"
                                            value={manualCcInput}
                                            onChange={(e) => setManualCcInput(e.target.value)}
                                            onKeyDown={(e) => handleManualInputKeyDown(e, 'cc', manualCcInput, setManualCcInput)}
                                            placeholder="Add CC email…"
                                            className="min-w-[150px] flex-1 bg-transparent py-1 text-sm text-(--text-main) outline-none"
                                        />
                                    </div>
                                </Row>

                                <Row label="Bcc">
                                    <div className="flex flex-wrap items-center gap-2 py-1">
                                        {formData.bcc.length > 0 ? formData.bcc.map(email => (
                                            <span key={email} className="cursor-not-allowed rounded-full border border-(--border-subtle) bg-(--bg-app) px-2.5 py-1 text-xs text-(--text-muted)">{email}</span>
                                        )) : (
                                            <span className="text-xs text-(--text-muted)">No billing BCC email configured in Workspace settings.</span>
                                        )}
                                    </div>
                                </Row>

                                <Row label="Subject">
                                    <input
                                        type="text"
                                        value={formData.subject}
                                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                        className="w-full bg-transparent py-1 text-sm font-semibold text-(--text-main) outline-none"
                                    />
                                </Row>
                            </section>

                            <section className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-4">
                                <textarea
                                    value={formData.body}
                                    onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                                    rows="12"
                                    className="w-full resize-none bg-transparent text-sm leading-relaxed text-(--text-main) outline-none"
                                />
                            </section>
                        </>
                    )}
                </div>

                {/* Attachment */}
                <aside className="border-t border-(--border-subtle) bg-(--bg-app)/40 p-5 xl:border-l xl:border-t-0 xl:p-6">
                    <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-(--brand-primary)"><Paperclip size={12} /> Attachment</p>

                    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[20px] border border-(--border-subtle) bg-(--bg-surface) p-4">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-rose-500/10 text-rose-500"><FileText size={22} /></span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-(--text-main)">{invoice.invoice_number}_Combined.pdf</p>
                            <p className="text-xs text-(--text-muted)">Invoice + approved time logs</p>
                        </div>
                        <div className="flex gap-2">
                            <Btn size="sm" icon={ExternalLink} onClick={() => window.open(`${BACKEND_URL}/api/management/invoices/${invoice.id}/combined-pdf`, '_blank')} title="Open the combined PDF in a new tab">Open</Btn>
                            <Btn
                                size="sm"
                                variant={previewUrl ? 'primary' : 'ghost'}
                                icon={previewLoading ? Loader2 : previewUrl ? EyeOff : Eye}
                                onClick={togglePreview}
                                disabled={previewLoading}
                                aria-expanded={!!previewUrl}
                            >
                                {previewUrl ? 'Hide' : 'Preview'}
                            </Btn>
                        </div>
                    </div>

                    {previewError && <Notice tone="rose" icon={AlertTriangle} className="mt-3">{previewError}</Notice>}

                    <div className="mt-4 overflow-hidden rounded-[20px] border border-(--border-subtle) bg-(--bg-surface)">
                        {previewUrl ? (
                            <iframe src={previewUrl} title="Combined invoice PDF preview" className="h-[560px] w-full bg-white" />
                        ) : (
                            <div className="flex h-[360px] flex-col items-center justify-center gap-2 p-6 text-center">
                                <Eye size={28} className="text-(--text-muted) opacity-50" />
                                <p className="text-sm text-(--text-muted)">Preview shows exactly what will be attached.</p>
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </BaseModal>
    );
};

export default SendEmailModal;
