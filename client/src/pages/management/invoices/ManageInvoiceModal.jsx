import { useState, useEffect } from 'react';
import {
    Receipt, AlertTriangle, Download, Info, CheckCircle2, XCircle, FileType2, Mail, CalendarDays, Clock,
    AlertCircle as AlertCircleIcon, Send, Loader2, CreditCard, PlusCircle, Banknote, Trash2, ArrowUpCircle,
    ArrowDownCircle, Handshake, User, Calendar, Scale, FileText, X,
} from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import AmountInput from '../../../components/ui/AmountInput';
import SendEmailModal from './SendEmailModal';
import { fmtDate, fmtDateTime, getEasternDateString } from '../../../utils/dateUtils';
import { resolveFileUrl } from '../../../utils/fileUrl';
import { DetailLayout, SectionTitle, Btn, Chip, Fact, Notice, EmptyState, Field, cx } from '../../../components/ui/kit';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const todayISO = () => getEasternDateString();

// Lifecycle rail shown in the summary column. Each stage covers one or more status ids.
const STAGES = [
    { label: 'Draft', ids: [1] },
    { label: 'Ready', ids: [2, 3] },
    { label: 'Open',  ids: [4, 5] },
    { label: 'Paid',  ids: [6] },
];

const STATUS_CHIP = {
    1: <Chip tone="slate">Draft</Chip>,
    2: <Chip tone="sky">Ready to send</Chip>,
    3: <Chip tone="amber">Ready to invoice</Chip>,
    4: <Chip tone="fuchsia">Open</Chip>,
    5: <Chip tone="rose" icon={AlertCircleIcon}>Overdue</Chip>,
    6: <Chip tone="green" icon={CheckCircle2}>Paid</Chip>,
};

const PaymentItem = ({ p }) => (
    <div className="relative pl-10">
        <span className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
            <Banknote size={13} />
        </span>
        <div className="rounded-[16px] border border-(--border-subtle) bg-(--bg-surface) px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-emerald-500" style={{ fontFamily: 'var(--font-display)' }}>${parseFloat(p.amount).toFixed(2)}</span>
                <Chip tone="green">{p.payment_type_name}</Chip>
                <span className="ml-auto flex items-center gap-1 text-xs text-(--text-muted)"><CalendarDays size={11} /> {fmtDate(p.payment_date)}</span>
            </div>
            {p.comment && <p className="mt-1 text-sm text-(--text-main)">{p.comment}</p>}
            {p.recorded_by_name?.trim() && <p className="mt-0.5 text-xs text-(--text-muted)">Recorded by {p.recorded_by_name.trim()}</p>}
        </div>
    </div>
);

const ManageInvoiceModal = ({ invoice, onClose, onRefresh }) => {
    const [statusId, setStatusId] = useState(invoice.status_id);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [regenerateOnSend, setRegenerateOnSend] = useState(false);
    const [emailType, setEmailType] = useState('INVOICE_SENT');
    const [emailLogs, setEmailLogs] = useState([]);
    const [draftStatus, setDraftStatus] = useState(null);
    const [lineItems, setLineItems] = useState(null);
    const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [wasGeneratedOpen, setWasGeneratedOpen] = useState(false);
    const [section, setSection] = useState('document');

    // Adjustment state
    const [adjustments, setAdjustments] = useState([]);
    const [showAdjForm, setShowAdjForm] = useState(false);
    const [adjType, setAdjType] = useState('deduction');
    const [adjInputMode, setAdjInputMode] = useState('fixed'); // 'fixed' | 'percentage'
    const [adjAmount, setAdjAmount] = useState('');
    const [adjPercent, setAdjPercent] = useState('');
    const [adjDate, setAdjDate] = useState(todayISO());
    const [adjDesc, setAdjDesc] = useState('');
    const [adjSubmitting, setAdjSubmitting] = useState(false);
    const [adjError, setAdjError] = useState('');

    // Payment state
    const [payments, setPayments] = useState([]);
    const [totalPaid, setTotalPaid] = useState(0);
    const [paymentsLoading, setPaymentsLoading] = useState(false);
    const [showPaymentForm, setShowPaymentForm] = useState(false);
    const [paymentTypes, setPaymentTypes] = useState([]);
    const [payAmount, setPayAmount] = useState('');
    const [payDate, setPayDate] = useState(todayISO());
    const [payTypeId, setPayTypeId] = useState('');
    const [payComment, setPayComment] = useState('');
    const [paySubmitting, setPaySubmitting] = useState(false);
    const [payError, setPayError] = useState('');

    const fetchAdjustments = () => {
        managementAPI.getInvoiceAdjustments(invoice.id)
            .then(res => setAdjustments(res.data || []))
            .catch(() => {});
    };

    const fetchPayments = () => {
        if (invoice.status_id < 4) return;
        setPaymentsLoading(true);
        managementAPI.getInvoicePayments(invoice.id)
            .then(res => {
                setPayments(res.data.payments || []);
                setTotalPaid(parseFloat(res.data.total_paid) || 0);
            })
            .catch(() => {})
            .finally(() => setPaymentsLoading(false));
    };

    useEffect(() => {
        if (invoice.status_id >= 4) {
            managementAPI.getInvoiceEmailLogs(invoice.id)
                .then(res => setEmailLogs(res.data || []))
                .catch(() => {});

            setPdfLoading(true);
            managementAPI.downloadInvoicePDF(invoice.id)
                .then(res => {
                    const blob = new Blob([res.data], { type: 'application/pdf' });
                    setPdfBlobUrl(URL.createObjectURL(blob));
                })
                .catch(() => {})
                .finally(() => setPdfLoading(false));

            fetchPayments();
        }
        if (invoice.status_id === 1) {
            managementAPI.getInvoiceDraftStatus(invoice.id)
                .then(res => setDraftStatus(res.data))
                .catch(() => {});
        }
        managementAPI.getInvoiceLineItems(invoice.id)
            .then(res => setLineItems(res.data || []))
            .catch(() => {});

        fetchAdjustments();

        commonAPI.getLookups()
            .then(res => setPaymentTypes(res.data.paymentTypes || []))
            .catch(() => {});
    }, [invoice.id, invoice.status_id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (paymentTypes.length > 0 && !payTypeId) {
            setPayTypeId(String(paymentTypes[0].id));
        }
    }, [paymentTypes]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl); };
    }, [pdfBlobUrl]);

    // regenerate=true forces a fresh invoice PDF before the modal loads. Used by
    // "Generate & send" so the attachment always reflects the invoice as it
    // stands now; the plain resend buttons reuse the stored file.
    const openEmailModal = (type, regenerate = false) => {
        setEmailType(type);
        setRegenerateOnSend(regenerate);
        setShowEmailModal(true);
    };

    const handleGenerateAndSend = async () => {
        setSubmitting(true);
        setError('');
        try {
            await managementAPI.updateInvoiceStatus(invoice.id, { status_id: 4 });
            onRefresh();
            setWasGeneratedOpen(true);
            openEmailModal('INVOICE_SENT', true);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to move invoice to Open status.');
        } finally {
            setSubmitting(false);
        }
    };

    const activeStatuses = [
        { id: 4, name: 'Open',    desc: 'Sent to the partner, awaiting payment' },
        { id: 5, name: 'Overdue', desc: 'Payment terms exceeded, automated reminders active' },
    ];

    const handleSubmit = async (overrideStatusId = null) => {
        const targetStatusId = overrideStatusId || statusId;
        if (targetStatusId === invoice.status_id) return onClose();
        setSubmitting(true);
        setError('');
        try {
            await managementAPI.updateInvoiceStatus(invoice.id, { status_id: targetStatusId });
            onRefresh();
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to update status.');
            setSubmitting(false);
        }
    };

    const handleRecordPayment = async () => {
        setPayError('');
        if (!payAmount || parseFloat(payAmount) <= 0) return setPayError('Enter a valid amount.');
        if (!payTypeId) return setPayError('Select a payment type.');
        if (!payDate) return setPayError('Select a payment date.');
        if (!payComment.trim()) return setPayError('Comment is required.');

        setPaySubmitting(true);
        try {
            const res = await managementAPI.addInvoicePayment(invoice.id, {
                amount: parseFloat(payAmount),
                payment_type_id: parseInt(payTypeId),
                payment_date: payDate,
                comment: payComment.trim(),
            });
            setPayAmount('');
            setPayComment('');
            setPayDate(todayISO());
            setShowPaymentForm(false);
            fetchPayments();
            onRefresh();
            if (res.data.fully_paid) {
                onClose();
            }
        } catch (err) {
            setPayError(err.response?.data?.error || 'Failed to record payment.');
        } finally {
            setPaySubmitting(false);
        }
    };

    const handleAddAdjustment = async () => {
        setAdjError('');
        const resolvedAmount = adjInputMode === 'percentage'
            ? displayTotal * (parseFloat(adjPercent) / 100)
            : parseFloat(adjAmount);
        if (adjInputMode === 'percentage') {
            if (!adjPercent || parseFloat(adjPercent) <= 0) return setAdjError('Enter a valid percentage.');
        } else {
            if (!adjAmount || parseFloat(adjAmount) <= 0) return setAdjError('Enter a valid amount.');
        }
        if (!adjDesc.trim()) return setAdjError('Description is required.');
        if (!adjDate) return setAdjError('Date is required.');
        setAdjSubmitting(true);
        try {
            await managementAPI.addInvoiceAdjustment(invoice.id, {
                type: adjType,
                amount: parseFloat(resolvedAmount.toFixed(2)),
                description: adjDesc.trim(),
                date: adjDate,
            });
            setAdjAmount('');
            setAdjPercent('');
            setAdjDesc('');
            setAdjType('deduction');
            setAdjInputMode('fixed');
            setAdjDate(todayISO());
            setShowAdjForm(false);
            fetchAdjustments();
            onRefresh();
        } catch (err) {
            setAdjError(err.response?.data?.error || 'Failed to add adjustment.');
        } finally {
            setAdjSubmitting(false);
        }
    };

    const handleDeleteAdjustment = async (adjId) => {
        try {
            await managementAPI.deleteInvoiceAdjustment(invoice.id, adjId);
            fetchAdjustments();
            onRefresh();
        } catch {
            // silently ignore
        }
    };

    const handleDownloadPDF = () => {
        window.open(`${BACKEND_URL}/api/management/invoices/${invoice.id}/pdf`, '_blank');
    };

    const amount = parseFloat(invoice.total_amount) || 0;
    const adjTotal = adjustments.reduce((sum, adj) => {
        return adj.type === 'addition' ? sum + parseFloat(adj.amount) : sum - parseFloat(adj.amount);
    }, 0);
    const displayTotal = (lineItems && lineItems.length > 0
        ? lineItems.reduce((sum, li) => sum + parseFloat(li.amount || 0), 0)
        : amount) + adjTotal;
    const remaining = Math.max(0, parseFloat((displayTotal - totalPaid).toFixed(2)));

    const periodStart = fmtDate(invoice.period_start);
    const periodEnd   = fmtDate(invoice.period_end);
    const issueDate   = invoice.issue_date ? fmtDate(invoice.issue_date) : fmtDate(getEasternDateString());
    const dueDate     = invoice.due_date ? fmtDate(invoice.due_date) : 'TBD';
    const termsDisplay = invoice.pay_when_paid ? 'Pay when paid' : `Net ${invoice.settings_net_terms || 30}`;

    const orgAddressLines = (invoice.org_address || '').split('\n').filter(Boolean);

    const isOpen   = invoice.status_id === 4;
    const isPastDue = invoice.status_id === 5;
    const isPaid   = invoice.status_id === 6;
    const isActive = isOpen || isPastDue;
    const paidPct  = displayTotal > 0 ? Math.min(100, (totalPaid / displayTotal) * 100) : 0;

    // ─── Footer (actions depend on status) ────────────────────────────────────
    let modalFooter = null;
    if (invoice.status_id === 1) {
        modalFooter = (
            <div className="flex w-full items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-xs text-(--text-muted)"><Info size={14} /> Locked while in draft</span>
                <Btn onClick={onClose}>Close</Btn>
            </div>
        );
    } else if (invoice.status_id === 2) {
        modalFooter = (
            <div className="flex w-full items-center justify-between gap-3">
                <span className="text-xs text-(--text-muted)">Ready for the partner</span>
                <Btn variant="primary" icon={Mail} onClick={handleGenerateAndSend} disabled={submitting}>
                    {submitting ? 'Opening…' : 'Generate & send'}
                </Btn>
            </div>
        );
    } else if (isPastDue) {
        modalFooter = (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <Btn variant="danger" icon={AlertCircleIcon} onClick={() => openEmailModal('PAST_DUE_REMINDER')}>Send overdue reminder</Btn>
                <Btn variant="primary" onClick={() => handleSubmit(statusId)} disabled={submitting || statusId === invoice.status_id}>
                    {submitting ? 'Saving…' : 'Update status'}
                </Btn>
            </div>
        );
    } else if (isPaid) {
        modalFooter = (
            <div className="flex w-full items-center justify-between gap-3">
                <Btn icon={Mail} onClick={() => openEmailModal('INVOICE_SENT')}>Resend email</Btn>
                <Btn onClick={onClose}>Close</Btn>
            </div>
        );
    } else {
        const isOverdue = invoice.due_date && invoice.due_date < todayISO();
        modalFooter = (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <Btn icon={Mail} onClick={() => openEmailModal('INVOICE_SENT')}>Resend email</Btn>
                <div className="flex items-center gap-2">
                    {isOverdue && (
                        <Btn variant="danger" icon={AlertCircleIcon} onClick={() => handleSubmit(5)} disabled={submitting}>Mark overdue</Btn>
                    )}
                    <Btn variant="primary" onClick={() => handleSubmit(statusId)} disabled={submitting || statusId === invoice.status_id}>
                        {submitting ? 'Saving…' : 'Update status'}
                    </Btn>
                </div>
            </div>
        );
    }

    const sections = [
        { key: 'document',    label: 'Document',     icon: FileText },
        { key: 'adjustments', label: 'Adjustments',  icon: Scale, count: adjustments.length, hidden: invoice.status_id !== 2 },
        { key: 'payments',    label: 'Collections',  icon: CreditCard, count: payments.length, hidden: invoice.status_id < 4 },
        { key: 'emails',      label: 'Email trail',  icon: Send, count: emailLogs.length, hidden: invoice.status_id < 4 },
    ];

    const stageIndex = STAGES.findIndex(s => s.ids.includes(invoice.status_id));

    // ─── Summary column ───────────────────────────────────────────────────────
    const aside = (
        <div className="space-y-5">
            <div className="rounded-[22px] p-5 text-white" style={{ background: 'var(--brand-gradient)', boxShadow: '0 20px 40px -24px var(--brand-glow)' }}>
                <p className="flex items-center gap-1.5 text-xs text-white/80"><Receipt size={13} /> {invoice.invoice_number}</p>
                <p className="mt-2 text-3xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>${displayTotal.toFixed(2)}</p>
                <p className="text-xs text-white/80">{Number(invoice.total_hours || 0)} hours billed</p>
                {invoice.status_id >= 4 && (
                    <div className="mt-4">
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
                            <div className="h-full rounded-full bg-white" style={{ width: `${paidPct}%` }} />
                        </div>
                        <div className="mt-1.5 flex justify-between text-[11px] text-white/85">
                            <span>Paid ${totalPaid.toFixed(2)}</span>
                            <span>Left ${remaining.toFixed(2)}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Lifecycle rail */}
            <div className="flex items-center gap-1">
                {STAGES.map((s, i) => {
                    const done = i < stageIndex;
                    const current = i === stageIndex;
                    const overdue = current && isPastDue;
                    return (
                        <div key={s.label} className="flex flex-1 flex-col items-center gap-1.5">
                            <span
                                className={cx('h-1.5 w-full rounded-full', !current && !done && 'bg-(--border-subtle)', overdue && 'bg-rose-500', done && 'bg-emerald-500')}
                                style={current && !overdue ? { background: 'var(--brand-gradient)' } : undefined}
                            />
                            <span className={cx('text-[11px]', current ? (overdue ? 'font-semibold text-rose-500' : 'font-semibold text-(--text-main)') : 'text-(--text-muted)')}>
                                {overdue ? 'Overdue' : s.label}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-wrap gap-2">{STATUS_CHIP[invoice.status_id]}</div>

            <div className="grid grid-cols-2 gap-4 rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) p-4">
                <Fact icon={Handshake} label="Partner" value={invoice.client_name} className="col-span-2" />
                <Fact icon={User} label="Consultant" value={`${invoice.emp_first || ''} ${invoice.emp_last || ''}`.trim()} className="col-span-2" />
                <Fact icon={Calendar} label="Period" value={`${periodStart} – ${periodEnd}`} className="col-span-2" />
                <Fact label="Issued" value={issueDate} />
                <Fact label={invoice.pay_when_paid ? 'Terms' : 'Due'} value={invoice.pay_when_paid ? termsDisplay : dueDate} />
            </div>

            {error && <Notice tone="rose" icon={AlertTriangle}>{error}</Notice>}

            {isActive && (
                <div className="space-y-2">
                    <p className="text-xs font-semibold text-(--text-muted)">Set status</p>
                    {activeStatuses.map(s => (
                        <label
                            key={s.id}
                            className={cx('flex cursor-pointer items-start gap-3 rounded-[14px] border px-3.5 py-2.5 transition-colors', statusId === s.id ? 'border-(--brand-primary) bg-(--brand-primary)/8' : 'border-(--border-subtle) bg-(--bg-surface) hover:border-(--brand-primary)/40')}
                        >
                            <input type="radio" name="status" value={s.id} checked={statusId === s.id} onChange={() => setStatusId(s.id)} className="mt-1 h-3.5 w-3.5" />
                            <span>
                                <span className="block text-sm font-semibold text-(--text-main)">{s.name}</span>
                                <span className="block text-[11px] text-(--text-muted)">{s.desc}</span>
                            </span>
                        </label>
                    ))}
                </div>
            )}

            {invoice.status_id === 1 && (
                <div className="space-y-2.5 rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) p-4">
                    <p className="text-xs font-semibold text-(--text-muted)">Before this can go out</p>
                    {draftStatus ? (
                        <ul className="space-y-2">
                            {[
                                [draftStatus.period_ended, draftStatus.period_ended ? 'Billing period has ended' : `Billing period ends ${fmtDate(draftStatus.period_end)}`, 'amber'],
                                [draftStatus.pending_timesheets === 0, draftStatus.pending_timesheets === 0 ? 'All time logs in period approved' : `${draftStatus.pending_timesheets} time log${draftStatus.pending_timesheets > 1 ? 's' : ''} still awaiting approval`, 'amber'],
                                [draftStatus.has_bill_rate, draftStatus.has_bill_rate ? 'Bill rate configured for this period' : 'No bill rate — add one effective on or before the period start', 'rose'],
                                [true, `Due date will be ${fmtDate(draftStatus.period_end)} + Net ${draftStatus.net_terms} days when promoted`, 'green'],
                            ].map(([ok, text, badTone], i) => (
                                <li key={i} className="flex items-start gap-2 text-xs">
                                    {ok
                                        ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                                        : <XCircle size={14} className={cx('mt-0.5 shrink-0', badTone === 'rose' ? 'text-rose-500' : 'text-amber-500')} />}
                                    <span className={ok ? 'text-(--text-main)' : badTone === 'rose' ? 'text-rose-500' : 'text-(--text-main)'}>{text}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs text-(--text-muted)">Checking prerequisites…</p>
                    )}
                </div>
            )}

            {invoice.status_id === 2 && (
                <Notice tone="sky" icon={Info}>
                    “Generate &amp; send” sets the issue date to today, calculates the due date from the partner's payment terms, builds the PDF and emails it — moving the invoice to Open.
                </Notice>
            )}
        </div>
    );

    // ─── Document: paper preview (draft/ready) or stored PDF (open onwards) ──
    const renderDocument = () => {
        if (invoice.status_id <= 2) {
            return (
                <div className="rounded-[26px] border border-(--border-subtle) bg-(--bg-app) p-3 sm:p-6">
                    <div className="relative mx-auto max-w-2xl overflow-hidden rounded-[6px] bg-white p-6 font-sans text-black shadow-xl sm:p-10">
                        <div className="mb-10 flex items-start justify-between">
                            <div>
                                {invoice.org_logo_url && (
                                    <img src={resolveFileUrl(invoice.org_logo_url)} alt="Logo" className="mb-2 max-h-16 max-w-[200px] object-contain" />
                                )}
                                <h2 className="text-xl font-bold text-gray-900">{invoice.org_name || 'YOUR ORGANIZATION'}</h2>
                                {orgAddressLines.length > 0 && (
                                    <p className="mt-1 text-xs text-gray-600">
                                        {orgAddressLines.map((line, i) => (
                                            <span key={i}>{line}{i < orgAddressLines.length - 1 && <br />}</span>
                                        ))}
                                    </p>
                                )}
                            </div>
                            <h1 className="text-3xl font-light text-gray-300">INVOICE</h1>
                        </div>

                        <div className="mb-8">
                            <h3 className="mb-2 inline-block border-b-2 border-gray-800 text-sm font-bold">Bill To</h3>
                            <p className="text-sm font-medium">{invoice.client_name}</p>
                            <p className="mt-0.5 text-xs text-gray-600">Accounts Payable</p>
                            {invoice.client_address && <p className="text-xs text-gray-600">{invoice.client_address}</p>}
                        </div>

                        <div className="mb-8 flex flex-wrap gap-8">
                            <table className="w-48 border-collapse text-center text-sm">
                                <thead>
                                    <tr>
                                        <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-xs font-semibold">Date</th>
                                        <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-xs font-semibold">Invoice #</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="border border-gray-300 px-2 py-1 text-xs">{issueDate}</td>
                                        <td className="border border-gray-300 px-2 py-1 text-xs font-medium">{invoice.invoice_number}</td>
                                    </tr>
                                </tbody>
                            </table>
                            {/* Due Date is hidden when the terms are Pay When Paid */}
                            <table className="w-48 border-collapse text-center text-sm">
                                <thead>
                                    <tr>
                                        <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-xs font-semibold">Terms</th>
                                        {!invoice.pay_when_paid && <th className="border border-gray-300 bg-gray-100 px-2 py-1 text-xs font-semibold">Due Date</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="border border-gray-300 px-2 py-1 text-xs">{termsDisplay}</td>
                                        {!invoice.pay_when_paid && <td className="border border-gray-300 px-2 py-1 text-xs">{dueDate}</td>}
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <table className="mb-6 w-full border-collapse text-left">
                            <thead>
                                <tr>
                                    <th className="w-[50%] border border-gray-300 bg-gray-100 px-3 py-2 text-xs font-semibold">Description</th>
                                    <th className="w-[15%] border border-gray-300 bg-gray-100 px-3 py-2 text-center text-xs font-semibold">Qty. (Hrs)</th>
                                    <th className="w-[15%] border border-gray-300 bg-gray-100 px-3 py-2 text-center text-xs font-semibold">Bill Rate</th>
                                    <th className="w-[20%] border border-gray-300 bg-gray-100 px-3 py-2 text-right text-xs font-semibold">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lineItems && lineItems.length > 0 ? lineItems.map((li, idx) => (
                                    <tr key={idx}>
                                        <td className="border border-gray-300 px-3 py-3 text-xs">
                                            <span className="font-semibold">{li.emp_first} {li.emp_last}</span><br />
                                            <span className="text-gray-600">{fmtDate(li.period_start)} – {fmtDate(li.period_end)}</span>
                                        </td>
                                        <td className="border border-gray-300 px-3 py-3 text-center text-xs">{parseFloat(li.hours).toFixed(2)}</td>
                                        <td className="border border-gray-300 px-3 py-3 text-center text-xs">${parseFloat(li.bill_rate).toFixed(2)}</td>
                                        <td className="border border-gray-300 px-3 py-3 text-right text-sm font-semibold">${parseFloat(li.amount).toFixed(2)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td className="border border-gray-300 px-3 py-3 text-xs">
                                            <span className="font-semibold">{invoice.emp_first} {invoice.emp_last}</span><br />
                                            <span className="text-gray-600">{periodStart} – {periodEnd}</span>
                                        </td>
                                        <td className="border border-gray-300 px-3 py-3 text-center text-xs">{parseFloat(invoice.total_hours || 0).toFixed(2)}</td>
                                        <td className="border border-gray-300 px-3 py-3 text-center text-xs text-gray-400">—</td>
                                        <td className="border border-gray-300 px-3 py-3 text-right text-sm font-semibold">${amount.toFixed(2)}</td>
                                    </tr>
                                )}
                                {adjustments.map((adj) => (
                                    <tr key={adj.id} className={adj.type === 'addition' ? 'bg-green-50' : 'bg-red-50'}>
                                        <td className="border border-gray-300 px-3 py-2.5 text-xs">
                                            <span className={`mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${adj.type === 'addition' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {adj.type === 'addition' ? 'Addition' : 'Deduction'}
                                            </span>
                                            <span className="text-gray-700">{adj.description}</span>
                                            <br />
                                            <span className="text-[10px] text-gray-400">{fmtDate(adj.date)}</span>
                                        </td>
                                        <td className="border border-gray-300 px-3 py-2.5 text-center text-xs text-gray-400">—</td>
                                        <td className="border border-gray-300 px-3 py-2.5 text-center text-xs text-gray-400">—</td>
                                        <td className={`border border-gray-300 px-3 py-2.5 text-right text-sm font-semibold ${adj.type === 'addition' ? 'text-green-700' : 'text-red-600'}`}>
                                            {adj.type === 'addition' ? '+' : '-'}${parseFloat(adj.amount).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                                {invoice.custom_notes_1 && (
                                    <tr>
                                        <td colSpan="4" className="border border-gray-300 bg-gray-50/50 px-4 py-3 text-xs italic text-gray-700">
                                            <span className="font-semibold not-italic">Note:</span> {invoice.custom_notes_1}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <div className="mb-8 flex w-full justify-end">
                            <div className="w-1/2 sm:w-1/3">
                                <div className="mb-1 flex justify-between border-b-2 border-gray-800 pb-1 text-sm font-bold">
                                    <span>Total:</span>
                                    <span>${displayTotal.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 border-t border-gray-200 px-4 pt-4 text-center text-xs italic text-gray-500">
                            {invoice.custom_notes_2 || 'Thank you for your business. If you have any questions about this invoice, please contact us.'}
                        </div>

                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-10">
                            <span className="rotate-[-30deg] text-8xl font-black">DRAFT</span>
                        </div>
                    </div>
                </div>
            );
        }

        if (invoice.status_id >= 4) {
            return (
                <div className="overflow-hidden rounded-[22px] border border-(--border-subtle) bg-(--bg-surface)">
                    <div className="flex items-center justify-between border-b border-(--border-subtle) px-4 py-2.5">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-(--text-muted)"><FileType2 size={13} /> Invoice PDF</span>
                        <Btn size="sm" variant="subtle" icon={Download} onClick={handleDownloadPDF}>Open in new tab</Btn>
                    </div>
                    {pdfLoading ? (
                        <div className="flex h-[650px] flex-col items-center justify-center gap-3 bg-(--bg-app) text-(--text-muted)">
                            <Loader2 size={28} className="animate-spin text-(--brand-primary)" />
                            <span className="text-sm">Loading invoice PDF…</span>
                        </div>
                    ) : pdfBlobUrl ? (
                        <iframe src={pdfBlobUrl} className="h-[650px] w-full border-0" title="Invoice PDF" />
                    ) : (
                        <EmptyState
                            icon={FileType2}
                            title="Could not load PDF preview"
                            action={<Btn size="sm" icon={Download} onClick={handleDownloadPDF}>Open in new tab instead</Btn>}
                        />
                    )}
                </div>
            );
        }

        return <EmptyState icon={FileText} title="No preview at this stage" text="The document becomes available once the invoice is opened." />;
    };

    // ─── Adjustments (ready to send only) ─────────────────────────────────────
    const renderAdjustments = () => (
        <div className="space-y-5">
            <SectionTitle
                icon={Scale}
                title="Adjustments"
                subtitle="Manual deductions or additions applied to the invoice total"
                actions={
                    <Btn size="sm" variant={showAdjForm ? 'ghost' : 'primary'} icon={showAdjForm ? X : PlusCircle} onClick={() => { setShowAdjForm(v => !v); setAdjError(''); }}>
                        {showAdjForm ? 'Cancel' : 'Add adjustment'}
                    </Btn>
                }
            />

            {showAdjForm && (
                <div className="space-y-4 rounded-[22px] border border-(--brand-primary)/25 bg-(--bg-surface) p-5">
                    {adjError && <Notice tone="rose" icon={AlertTriangle}>{adjError}</Notice>}

                    <div className="grid grid-cols-2 gap-2">
                        {[['deduction', 'Deduction', ArrowDownCircle, 'rose'], ['addition', 'Addition', ArrowUpCircle, 'green']].map(([val, label, Icon, tone]) => (
                            <button
                                key={val}
                                type="button"
                                onClick={() => setAdjType(val)}
                                className={cx(
                                    'flex items-center justify-center gap-2 rounded-[14px] border px-3 py-3 text-sm font-semibold outline-none transition-colors',
                                    adjType === val
                                        ? tone === 'rose' ? 'border-rose-500 bg-rose-500/10 text-rose-500' : 'border-emerald-500 bg-emerald-500/10 text-emerald-500'
                                        : 'border-(--border-subtle) text-(--text-muted) hover:text-(--text-main)',
                                )}
                            >
                                <Icon size={16} /> {label}
                            </button>
                        ))}
                    </div>

                    <div className="inline-flex rounded-full border border-(--border-subtle) p-1">
                        {[['fixed', '$ Fixed'], ['percentage', '% Percent']].map(([mode, label]) => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => { setAdjInputMode(mode); if (mode === 'fixed') setAdjPercent(''); else setAdjAmount(''); }}
                                className={cx('rounded-full px-3.5 py-1 text-xs font-semibold outline-none', adjInputMode === mode ? 'text-white' : 'text-(--text-muted)')}
                                style={adjInputMode === mode ? { background: 'var(--brand-gradient)' } : undefined}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {adjInputMode === 'fixed' ? (
                            <Field label="Amount ($)" required>
                                <AmountInput value={adjAmount} onChange={v => setAdjAmount(v)} className="nx-input" />
                            </Field>
                        ) : (
                            <Field label="Percentage (%)" required hint={adjPercent && parseFloat(adjPercent) > 0 ? `= $${(displayTotal * parseFloat(adjPercent) / 100).toFixed(2)}` : '= $0.00'}>
                                <input
                                    type="number"
                                    min="0.01"
                                    max="100"
                                    step="0.01"
                                    placeholder="e.g. 5"
                                    value={adjPercent}
                                    onChange={e => setAdjPercent(e.target.value)}
                                    onWheel={e => e.target.blur()}
                                    className="nx-input"
                                />
                            </Field>
                        )}
                        <Field label="Date" required>
                            <input type="date" value={adjDate} onChange={e => setAdjDate(e.target.value)} className="nx-input" />
                        </Field>
                        <Field label="Description" required className="sm:col-span-2">
                            <input type="text" placeholder="e.g. Late delivery penalty" value={adjDesc} onChange={e => setAdjDesc(e.target.value)} className="nx-input" />
                        </Field>
                    </div>

                    <div className="flex justify-end">
                        <Btn
                            variant={adjType === 'deduction' ? 'danger' : 'success'}
                            icon={adjType === 'deduction' ? ArrowDownCircle : ArrowUpCircle}
                            onClick={handleAddAdjustment}
                            disabled={adjSubmitting}
                        >
                            {adjSubmitting ? 'Adding…' : `Add ${adjType === 'deduction' ? 'deduction' : 'addition'}`}
                        </Btn>
                    </div>
                </div>
            )}

            {adjustments.length === 0 ? (
                <EmptyState icon={Scale} title="No adjustments" text="The invoice total matches the billed hours." />
            ) : (
                <div className="space-y-2.5">
                    {adjustments.map(adj => {
                        const add = adj.type === 'addition';
                        return (
                            <div key={adj.id} className="flex items-center gap-3 rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) px-4 py-3">
                                <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', add ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500')}>
                                    {add ? <ArrowUpCircle size={16} /> : <ArrowDownCircle size={16} />}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-semibold text-(--text-main)">{adj.description}</p>
                                    <p className="text-xs text-(--text-muted)">{fmtDate(adj.date)}</p>
                                </div>
                                <span className={cx('text-sm font-semibold', add ? 'text-emerald-500' : 'text-rose-500')}>
                                    {add ? '+' : '-'}${parseFloat(adj.amount).toFixed(2)}
                                </span>
                                <Btn size="icon" variant="subtle" icon={Trash2} onClick={() => handleDeleteAdjustment(adj.id)} title="Remove adjustment" />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    // ─── Collections (open, overdue, paid) ────────────────────────────────────
    const renderPayments = () => (
        <div className="space-y-5">
            <SectionTitle
                icon={CreditCard}
                title="Collections"
                subtitle={isPaid ? 'This invoice is fully paid' : 'Record payments received from the partner'}
                actions={isActive && (
                    <Btn size="sm" variant={showPaymentForm ? 'ghost' : 'primary'} icon={showPaymentForm ? X : PlusCircle} onClick={() => setShowPaymentForm(v => !v)}>
                        {showPaymentForm ? 'Cancel' : 'Record payment'}
                    </Btn>
                )}
            />

            <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) px-4 py-3">
                    <p className="text-xs text-(--text-muted)">Invoice total</p>
                    <p className="text-xl font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>${displayTotal.toFixed(2)}</p>
                </div>
                <div className={cx('rounded-[18px] border border-emerald-500/25 bg-emerald-500/5 px-4 py-3', isPaid && 'sm:col-span-2')}>
                    <p className="text-xs text-emerald-600">{isPaid ? 'Fully paid' : 'Collected'}</p>
                    <p className="text-xl font-semibold text-emerald-500" style={{ fontFamily: 'var(--font-display)' }}>${totalPaid.toFixed(2)}</p>
                </div>
                {!isPaid && (
                    <div className="rounded-[18px] border border-rose-500/25 bg-rose-500/5 px-4 py-3">
                        <p className="text-xs text-rose-500">Outstanding</p>
                        <p className="text-xl font-semibold text-rose-500" style={{ fontFamily: 'var(--font-display)' }}>${remaining.toFixed(2)}</p>
                    </div>
                )}
            </div>

            {isActive && showPaymentForm && (
                <div className="space-y-4 rounded-[22px] border border-(--brand-primary)/25 bg-(--bg-surface) p-5">
                    <p className="flex items-center gap-2 text-sm font-semibold text-(--text-main)"><Banknote size={16} className="text-(--brand-primary)" /> New payment</p>
                    {payError && <Notice tone="rose" icon={AlertTriangle}>{payError}</Notice>}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Amount" required>
                            <AmountInput value={payAmount} onChange={v => setPayAmount(v)} placeholder={`Max $${remaining.toFixed(2)}`} className="nx-input" />
                        </Field>
                        <Field label="Payment type" required>
                            <select value={payTypeId} onChange={e => setPayTypeId(e.target.value)} className="nx-input cursor-pointer">
                                {paymentTypes.map(pt => (
                                    <option key={pt.id} value={String(pt.id)}>{pt.name}</option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Payment date" required>
                            <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="nx-input" />
                        </Field>
                        <Field label="Comment" required>
                            <input type="text" placeholder="e.g. Cheque #1234, reference no." value={payComment} onChange={e => setPayComment(e.target.value)} className="nx-input" />
                        </Field>
                    </div>
                    <div className="flex justify-end">
                        <Btn variant="primary" icon={CreditCard} onClick={handleRecordPayment} disabled={paySubmitting}>
                            {paySubmitting ? 'Saving…' : 'Save payment'}
                        </Btn>
                    </div>
                </div>
            )}

            {paymentsLoading ? (
                <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-(--brand-primary)" /></div>
            ) : payments.length === 0 ? (
                <EmptyState icon={Banknote} title={isPaid ? 'No payment records found' : 'No payments recorded yet'} />
            ) : (
                <div className="space-y-3">
                    {payments.map(p => <PaymentItem key={p.id} p={p} />)}
                </div>
            )}
        </div>
    );

    // ─── Email trail (open onwards) ───────────────────────────────────────────
    const renderEmails = () => (
        <div className="space-y-5">
            <SectionTitle icon={Send} title="Email trail" subtitle="Every invoice and reminder sent for this invoice" />
            {emailLogs.length === 0 ? (
                <EmptyState icon={Mail} title="No emails sent yet" />
            ) : (
                <div className="space-y-3">
                    {emailLogs.map(log => {
                        const isPD = log.email_type === 'PAST_DUE_REMINDER';
                        return (
                            <div key={log.id} className="relative pl-10">
                                <span className={cx('absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full border', isPD ? 'border-rose-500/30 bg-rose-500/10 text-rose-500' : 'border-(--brand-primary)/30 bg-(--brand-primary)/10 text-(--brand-primary)')}>
                                    {isPD ? <AlertCircleIcon size={13} /> : <Mail size={13} />}
                                </span>
                                <div className="rounded-[16px] border border-(--border-subtle) bg-(--bg-surface) px-4 py-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Chip tone={isPD ? 'rose' : 'brand'}>{isPD ? 'Overdue reminder' : 'Invoice sent'}</Chip>
                                        <span className="ml-auto flex items-center gap-1 text-xs text-(--text-muted)"><Clock size={11} /> {fmtDateTime(log.sent_at)}</span>
                                    </div>
                                    <p className="mt-1.5 truncate text-sm text-(--text-main)">To: {log.sent_to}</p>
                                    {log.sent_by_name?.trim() && <p className="mt-0.5 text-xs text-(--text-muted)">by {log.sent_by_name.trim()}</p>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );

    return (
        <>
            <BaseModal
                isOpen={true}
                onClose={onClose}
                icon={<Receipt size={18} />}
                title="Invoice"
                subtitle={`${invoice.invoice_number} · ${invoice.client_name || ''}`}
                footer={modalFooter}
                noPadding
            >
                <DetailLayout aside={aside} sections={sections} active={section} onSelect={setSection}>
                    {section === 'adjustments' && invoice.status_id === 2 ? renderAdjustments()
                        : section === 'payments' && invoice.status_id >= 4 ? renderPayments()
                        : section === 'emails' && invoice.status_id >= 4 ? renderEmails()
                        : renderDocument()}
                </DetailLayout>
            </BaseModal>

            {showEmailModal && (
                <SendEmailModal
                    invoice={invoice}
                    emailType={emailType}
                    regenerate={regenerateOnSend}
                    onClose={() => {
                        setShowEmailModal(false);
                        if (wasGeneratedOpen) onClose();
                    }}
                    onSuccess={() => {
                        setShowEmailModal(false);
                        if (wasGeneratedOpen) {
                            onClose();
                        } else {
                            managementAPI.getInvoiceEmailLogs(invoice.id)
                                .then(res => setEmailLogs(res.data || []))
                                .catch(() => {});
                            onRefresh();
                        }
                    }}
                />
            )}
        </>
    );
};

export default ManageInvoiceModal;
