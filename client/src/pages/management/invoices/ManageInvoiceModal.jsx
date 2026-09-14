import { useState, useEffect } from 'react';
import { DollarSign, AlertTriangle, Download, Info, CheckCircle2, XCircle, FileType2, Mail, CalendarDays, Clock, AlertCircle as AlertCircleIcon, Send, Loader2, CreditCard, PlusCircle, ChevronDown, ChevronUp, Banknote, Trash2, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import AmountInput from '../../../components/ui/AmountInput';
import SendEmailModal from './SendEmailModal';
import { fmtDate, fmtDateTime, getEasternDateString } from '../../../utils/dateUtils';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const todayISO = () => getEasternDateString();

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
    }, [invoice.id, invoice.status_id]);

    useEffect(() => {
        if (paymentTypes.length > 0 && !payTypeId) {
            setPayTypeId(String(paymentTypes[0].id));
        }
    }, [paymentTypes]);

    useEffect(() => {
        return () => { if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl); };
    }, [pdfBlobUrl]);

    // regenerate=true forces a fresh invoice PDF before the modal loads. Used by
    // "Generate & Send Email" so the attachment always reflects the invoice as it
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
        { id: 4, name: 'Open',     desc: 'Sent to client, awaiting payment' },
        { id: 5, name: 'Past Due', desc: 'Net terms exceeded, automated reminders active' },
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

    let modalFooter = null;
    if (invoice.status_id === 1) {
        modalFooter = (
            <div className="flex justify-between items-center w-full">
                <span className="text-[10px] text-(--text-muted) uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <Info size={14} /> Locked in Draft Mode
                </span>
                <button onClick={onClose} className="bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-(--bg-app) transition-all outline-none">
                    Close
                </button>
            </div>
        );
    } else if (invoice.status_id === 2) {
        modalFooter = (
            <div className="flex justify-between items-center w-full">
                <span className="text-[10px] text-(--text-muted) uppercase tracking-wider font-bold">Ready for client</span>
                <button
                    onClick={handleGenerateAndSend}
                    disabled={submitting}
                    className="bg-(--brand-primary) text-white px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:shadow-lg hover:opacity-90 disabled:opacity-50 transition-all outline-none"
                >
                    <Mail size={14}/> {submitting ? 'Opening…' : 'Generate & Send Email'}
                </button>
            </div>
        );
    } else if (isPastDue) {
        modalFooter = (
            <div className="flex justify-between w-full items-center gap-2 flex-wrap">
                <button
                    onClick={() => openEmailModal('PAST_DUE_REMINDER')}
                    className="bg-red-500/10 border border-red-500/20 text-red-600 px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:bg-red-500/20 transition-all outline-none"
                >
                    <AlertCircleIcon size={14}/> Send Past Due Reminder
                </button>
                <button
                    onClick={() => handleSubmit(statusId)}
                    disabled={submitting || statusId === invoice.status_id}
                    className="bg-(--brand-primary) text-white px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:opacity-90 disabled:opacity-50 transition-all outline-none"
                >
                    {submitting ? 'Saving...' : 'Update Status'}
                </button>
            </div>
        );
    } else if (isPaid) {
        modalFooter = (
            <div className="flex justify-between w-full items-center">
                <button
                    onClick={() => openEmailModal('INVOICE_SENT')}
                    className="bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:border-(--brand-primary) hover:text-(--brand-primary) transition-all outline-none"
                >
                    <Mail size={14}/> Resend Email
                </button>
                <button onClick={onClose} className="bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-(--bg-app) transition-all outline-none">
                    Close
                </button>
            </div>
        );
    } else {
        const isOverdue = invoice.due_date && invoice.due_date < todayISO();
        modalFooter = (
            <div className="flex justify-between w-full items-center gap-2">
                <button
                    onClick={() => openEmailModal('INVOICE_SENT')}
                    className="bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:border-(--brand-primary) hover:text-(--brand-primary) transition-all outline-none"
                >
                    <Mail size={14}/> Resend Email
                </button>
                <div className="flex items-center gap-2">
                    {isOverdue && (
                        <button
                            onClick={() => handleSubmit(5)}
                            disabled={submitting}
                            className="bg-red-500/10 border border-red-500/20 text-red-600 px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-red-500/20 disabled:opacity-50 transition-all outline-none"
                        >
                            <AlertCircleIcon size={14}/> Mark Past Due
                        </button>
                    )}
                    <button
                        onClick={() => handleSubmit(statusId)}
                        disabled={submitting || statusId === invoice.status_id}
                        className="bg-(--brand-primary) text-white px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:opacity-90 disabled:opacity-50 transition-all outline-none"
                    >
                        {submitting ? 'Saving...' : 'Update Status'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <BaseModal isOpen={true} onClose={onClose} icon={<DollarSign size={16} />} title="Invoice Preview & Management" footer={modalFooter}>
                <div className="space-y-6">

                    {error && (
                        <div className="w-full bg-red-500/10 border border-red-500/30 text-red-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
                            <AlertTriangle size={14} className="shrink-0" /><span>{error}</span>
                        </div>
                    )}

                    {/* ── DRAFT / READY-TO-SEND: HTML invoice preview ──────────────── */}
                    {invoice.status_id <= 2 && (
                        <div className="bg-white text-black p-6 sm:p-8 rounded shadow-md border border-gray-300 font-sans mx-auto max-w-2xl relative">
                            <div className="flex justify-between items-start mb-10">
                                <div>
                                    {invoice.org_logo_url && (
                                        <img
                                            src={`${BACKEND_URL}${invoice.org_logo_url}`}
                                            alt="Logo"
                                            className="max-h-16 max-w-[200px] object-contain mb-2"
                                        />
                                    )}
                                    <h2 className="text-xl font-bold tracking-tight text-gray-900">
                                        {invoice.org_name || 'YOUR ORGANIZATION'}
                                    </h2>
                                    {orgAddressLines.length > 0 && (
                                        <p className="text-xs text-gray-600 mt-1">
                                            {orgAddressLines.map((line, i) => (
                                                <span key={i}>{line}{i < orgAddressLines.length - 1 && <br />}</span>
                                            ))}
                                        </p>
                                    )}
                                </div>
                                <div className="text-right">
                                    <h1 className="text-3xl font-light text-gray-300 uppercase tracking-widest">Invoice</h1>
                                </div>
                            </div>

                            <div className="mb-8">
                                <h3 className="text-sm font-bold border-b-2 border-gray-800 inline-block mb-2">Bill To</h3>
                                <p className="text-sm font-medium">{invoice.client_name}</p>
                                <p className="text-xs text-gray-600 mt-0.5">Accounts Payable</p>
                                {invoice.client_address && (
                                    <p className="text-xs text-gray-600">{invoice.client_address}</p>
                                )}
                            </div>

                            <div className="flex gap-8 mb-8">
                                <table className="w-48 text-center text-sm border-collapse">
                                    <thead>
                                        <tr>
                                            <th className="bg-gray-100 border border-gray-300 py-1 px-2 font-semibold text-xs">Date</th>
                                            <th className="bg-gray-100 border border-gray-300 py-1 px-2 font-semibold text-xs">Invoice #</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="border border-gray-300 py-1 px-2 text-xs">{issueDate}</td>
                                            <td className="border border-gray-300 py-1 px-2 text-xs font-medium">{invoice.invoice_number}</td>
                                        </tr>
                                    </tbody>
                                </table>
                                {/* Feature 1: hide Due Date when Pay When Paid */}
                                {invoice.pay_when_paid ? (
                                    <table className="w-48 text-center text-sm border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="bg-gray-100 border border-gray-300 py-1 px-2 font-semibold text-xs">Terms</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td className="border border-gray-300 py-1 px-2 text-xs">{termsDisplay}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                ) : (
                                    <table className="w-48 text-center text-sm border-collapse">
                                        <thead>
                                            <tr>
                                                <th className="bg-gray-100 border border-gray-300 py-1 px-2 font-semibold text-xs">Terms</th>
                                                <th className="bg-gray-100 border border-gray-300 py-1 px-2 font-semibold text-xs">Due Date</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td className="border border-gray-300 py-1 px-2 text-xs">{termsDisplay}</td>
                                                <td className="border border-gray-300 py-1 px-2 text-xs">{dueDate}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            <table className="w-full text-left border-collapse mb-6">
                                <thead>
                                    <tr>
                                        <th className="bg-gray-100 border border-gray-300 py-2 px-3 font-semibold text-xs w-[50%]">Description</th>
                                        <th className="bg-gray-100 border border-gray-300 py-2 px-3 font-semibold text-xs text-center w-[15%]">Qty. (Hrs)</th>
                                        <th className="bg-gray-100 border border-gray-300 py-2 px-3 font-semibold text-xs text-center w-[15%]">Bill Rate</th>
                                        <th className="bg-gray-100 border border-gray-300 py-2 px-3 font-semibold text-xs text-right w-[20%]">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lineItems && lineItems.length > 0 ? lineItems.map((li, idx) => (
                                        <tr key={idx}>
                                            <td className="border border-gray-300 py-3 px-3 text-xs">
                                                <span className="font-semibold">{li.emp_first} {li.emp_last}</span><br />
                                                <span className="text-gray-600">{fmtDate(li.period_start)} – {fmtDate(li.period_end)}</span>
                                            </td>
                                            <td className="border border-gray-300 py-3 px-3 text-xs text-center">{parseFloat(li.hours).toFixed(2)}</td>
                                            <td className="border border-gray-300 py-3 px-3 text-xs text-center">${parseFloat(li.bill_rate).toFixed(2)}</td>
                                            <td className="border border-gray-300 py-3 px-3 text-sm font-semibold text-right">${parseFloat(li.amount).toFixed(2)}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td className="border border-gray-300 py-3 px-3 text-xs">
                                                <span className="font-semibold">{invoice.emp_first} {invoice.emp_last}</span><br />
                                                <span className="text-gray-600">{periodStart} – {periodEnd}</span>
                                            </td>
                                            <td className="border border-gray-300 py-3 px-3 text-xs text-center">{parseFloat(invoice.total_hours || 0).toFixed(2)}</td>
                                            <td className="border border-gray-300 py-3 px-3 text-xs text-center text-gray-400">—</td>
                                            <td className="border border-gray-300 py-3 px-3 text-sm font-semibold text-right">${amount.toFixed(2)}</td>
                                        </tr>
                                    )}
                                    {/* Feature 2: adjustment rows */}
                                    {adjustments.map((adj) => (
                                        <tr key={adj.id} className={adj.type === 'addition' ? 'bg-green-50' : 'bg-red-50'}>
                                            <td className="border border-gray-300 py-2.5 px-3 text-xs">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase mr-1.5 ${adj.type === 'addition' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                            {adj.type}
                                                        </span>
                                                        <span className="text-gray-700">{adj.description}</span>
                                                        <br />
                                                        <span className="text-gray-400 text-[10px]">{fmtDate(adj.date)}</span>
                                                    </div>
                                                    {invoice.status_id === 2 && (
                                                        <button
                                                            onClick={() => handleDeleteAdjustment(adj.id)}
                                                            className="text-red-400 hover:text-red-600 shrink-0 mt-0.5 outline-none"
                                                            title="Remove adjustment"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="border border-gray-300 py-2.5 px-3 text-xs text-center text-gray-400">—</td>
                                            <td className="border border-gray-300 py-2.5 px-3 text-xs text-center text-gray-400">—</td>
                                            <td className={`border border-gray-300 py-2.5 px-3 text-sm font-semibold text-right ${adj.type === 'addition' ? 'text-green-700' : 'text-red-600'}`}>
                                                {adj.type === 'addition' ? '+' : '-'}${parseFloat(adj.amount).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                    {invoice.custom_notes_1 && (
                                        <tr>
                                            <td colSpan="4" className="border border-gray-300 py-3 px-4 text-xs italic text-gray-700 bg-gray-50/50">
                                                <span className="font-semibold not-italic">Note:</span> {invoice.custom_notes_1}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>

                            <div className="flex justify-end w-full mb-8">
                                <div className="w-1/3">
                                    <div className="flex justify-between font-bold text-sm border-b-2 border-gray-800 pb-1 mb-1">
                                        <span>Total:</span>
                                        <span>${displayTotal.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="text-xs text-gray-500 text-center italic mt-12 border-t border-gray-200 pt-4 px-4">
                                {invoice.custom_notes_2 || 'Thank you for your business. If you have any questions about this invoice, please contact us.'}
                            </div>

                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                                <span className="text-8xl font-black rotate-[-30deg] tracking-widest">DRAFT</span>
                            </div>
                        </div>
                    )}

                    {/* ── READY-TO-SEND: Add Manual Adjustment ─────────────────────── */}
                    {invoice.status_id === 2 && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1.5">
                                    <PlusCircle size={12} /> Manual Adjustments
                                </label>
                                <button
                                    onClick={() => { setShowAdjForm(v => !v); setAdjError(''); }}
                                    className="flex items-center gap-1.5 text-[10px] font-bold text-(--brand-primary) uppercase tracking-widest hover:underline outline-none"
                                >
                                    {showAdjForm
                                        ? <><ChevronUp size={12} /> Cancel</>
                                        : <><PlusCircle size={12} /> Add Adjustment</>}
                                </button>
                            </div>

                            {showAdjForm && (
                                <div className="p-4 border border-(--border-subtle) rounded-xl bg-(--bg-app) space-y-4">
                                    <p className="text-[10px] font-bold text-(--text-main) uppercase tracking-widest flex items-center gap-1.5">
                                        <ArrowDownCircle size={13} className="text-red-500" /> Add Deduction or Addition
                                    </p>
                                    {adjError && (
                                        <div className="bg-red-500/10 border border-red-500/30 text-red-600 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
                                            <AlertTriangle size={12} className="shrink-0" />{adjError}
                                        </div>
                                    )}
                                    {/* Type + Input mode row */}
                                    <div className="flex flex-wrap items-center gap-6">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" name="adjType" value="deduction" checked={adjType === 'deduction'} onChange={() => setAdjType('deduction')} className="accent-red-600 w-3.5 h-3.5" />
                                            <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Deduction</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" name="adjType" value="addition" checked={adjType === 'addition'} onChange={() => setAdjType('addition')} className="accent-green-600 w-3.5 h-3.5" />
                                            <span className="text-xs font-bold text-green-700 uppercase tracking-wider">Addition</span>
                                        </label>
                                        <div className="flex items-center gap-1 ml-auto">
                                            <button
                                                type="button"
                                                onClick={() => { setAdjInputMode('fixed'); setAdjPercent(''); }}
                                                className={`px-2.5 py-1 rounded-l-lg text-[10px] font-bold uppercase tracking-widest border transition-all outline-none ${adjInputMode === 'fixed' ? 'bg-(--brand-primary) text-(--brand-primary-text) border-(--brand-primary)' : 'bg-(--bg-surface) text-(--text-muted) border-(--border-subtle) hover:border-(--brand-primary)/50'}`}
                                            >$ Fixed</button>
                                            <button
                                                type="button"
                                                onClick={() => { setAdjInputMode('percentage'); setAdjAmount(''); }}
                                                className={`px-2.5 py-1 rounded-r-lg text-[10px] font-bold uppercase tracking-widest border-t border-r border-b transition-all outline-none ${adjInputMode === 'percentage' ? 'bg-(--brand-primary) text-(--brand-primary-text) border-(--brand-primary)' : 'bg-(--bg-surface) text-(--text-muted) border-(--border-subtle) hover:border-(--brand-primary)/50'}`}
                                            >% Percent</button>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1">
                                            {adjInputMode === 'fixed' ? (
                                                <>
                                                    <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Amount ($) *</label>
                                                    <AmountInput
                                                        value={adjAmount}
                                                        onChange={v => setAdjAmount(v)}
                                                        className="px-3 py-2 text-sm font-bold bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none"
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Percentage (%) *</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            min="0.01"
                                                            max="100"
                                                            step="0.01"
                                                            placeholder="e.g. 5"
                                                            value={adjPercent}
                                                            onChange={e => setAdjPercent(e.target.value)}
                                                            onWheel={e => e.target.blur()}
                                                            className="flex-1 px-3 py-2 text-sm font-bold bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none"
                                                        />
                                                        <span className="text-xs font-bold text-(--text-muted) shrink-0">
                                                            {adjPercent && parseFloat(adjPercent) > 0
                                                                ? `= $${(displayTotal * parseFloat(adjPercent) / 100).toFixed(2)}`
                                                                : '= $0.00'}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Date *</label>
                                            <input
                                                type="date"
                                                value={adjDate}
                                                onChange={e => setAdjDate(e.target.value)}
                                                className="px-3 py-2 text-sm font-bold bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Description *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Late delivery penalty"
                                            value={adjDesc}
                                            onChange={e => setAdjDesc(e.target.value)}
                                            className="px-3 py-2 text-sm font-bold bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none"
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleAddAdjustment}
                                            disabled={adjSubmitting}
                                            className={`px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all outline-none shadow-sm text-white ${adjType === 'deduction' ? 'bg-red-500' : 'bg-green-600'}`}
                                        >
                                            {adjType === 'deduction'
                                                ? <ArrowDownCircle size={13} />
                                                : <ArrowUpCircle size={13} />}
                                            {adjSubmitting ? 'Adding…' : `Add ${adjType === 'deduction' ? 'Deduction' : 'Addition'}`}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── OPEN / PAST DUE / PAID: Embedded PDF ─────────────────────── */}
                    {invoice.status_id >= 4 && (
                        <div className="rounded-xl overflow-hidden border border-(--border-subtle) shadow-sm">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-(--bg-surface) border-b border-(--border-subtle)">
                                <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1.5">
                                    <FileType2 size={12} /> Invoice PDF
                                </span>
                                <button
                                    onClick={handleDownloadPDF}
                                    className="flex items-center gap-1.5 text-[10px] font-bold text-(--brand-primary) uppercase tracking-widest hover:underline outline-none"
                                >
                                    <Download size={12} /> Open in new tab
                                </button>
                            </div>
                            {pdfLoading ? (
                                <div className="flex items-center justify-center bg-(--bg-app)" style={{ height: '650px' }}>
                                    <div className="flex flex-col items-center gap-3 text-(--text-muted)">
                                        <Loader2 size={28} className="animate-spin text-(--brand-primary)" />
                                        <span className="text-xs font-bold uppercase tracking-widest">Loading invoice PDF…</span>
                                    </div>
                                </div>
                            ) : pdfBlobUrl ? (
                                <iframe
                                    src={pdfBlobUrl}
                                    className="w-full"
                                    style={{ height: '650px', border: 'none' }}
                                    title="Invoice PDF"
                                />
                            ) : (
                                <div className="flex items-center justify-center bg-(--bg-app)" style={{ height: '200px' }}>
                                    <div className="text-center space-y-2">
                                        <p className="text-xs font-bold text-(--text-muted) uppercase tracking-widest">Could not load PDF preview</p>
                                        <button onClick={handleDownloadPDF} className="text-[10px] font-bold text-(--brand-primary) uppercase tracking-widest hover:underline flex items-center gap-1 mx-auto">
                                            <Download size={12} /> Open in new tab instead
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STATUS UPDATE (Open / Past Due only) ─────────────────────── */}
                    {isActive && (
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Update Status</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {activeStatuses.map(s => (
                                    <label key={s.id} className={`p-3.5 rounded-xl border flex flex-col gap-1.5 cursor-pointer transition-all ${statusId === s.id ? 'bg-(--brand-primary)/10 border-(--brand-primary) shadow-sm' : 'bg-(--bg-surface) border-(--border-subtle) hover:border-(--brand-primary)/50 hover:shadow-sm'}`}>
                                        <div className="flex items-center gap-2.5">
                                            <input type="radio" name="status" value={s.id} checked={statusId === s.id} onChange={() => setStatusId(s.id)} className="accent-blue-600 w-3.5 h-3.5" />
                                            <span className={`text-xs font-bold uppercase tracking-wider ${statusId === s.id ? 'text-(--brand-primary)' : 'text-(--text-main)'}`}>{s.name}</span>
                                            {statusId === s.id && <CheckCircle2 size={14} className="text-(--brand-primary) ml-auto" />}
                                        </div>
                                        <span className="text-[10px] text-(--text-muted) leading-relaxed">{s.desc}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── PAYMENT SECTION (Open / Past Due) ────────────────────────── */}
                    {isActive && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1.5">
                                    <CreditCard size={12} /> Payment History
                                </label>
                                <button
                                    onClick={() => setShowPaymentForm(v => !v)}
                                    className="flex items-center gap-1.5 text-[10px] font-bold text-(--brand-primary) uppercase tracking-widest hover:underline outline-none"
                                >
                                    <PlusCircle size={13} />
                                    {showPaymentForm ? 'Cancel' : 'Record Payment'}
                                    {showPaymentForm ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                            </div>

                            {/* Balance summary */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 bg-(--bg-app) border border-(--border-subtle) rounded-xl text-center">
                                    <p className="text-[10px] text-(--text-muted) font-bold uppercase tracking-wider mb-1">Invoice Total</p>
                                    <p className="text-sm font-bold text-(--text-main)">${displayTotal.toFixed(2)}</p>
                                </div>
                                <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center">
                                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mb-1">Amount Paid</p>
                                    <p className="text-sm font-bold text-emerald-600">${totalPaid.toFixed(2)}</p>
                                </div>
                                <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-center">
                                    <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider mb-1">Remaining</p>
                                    <p className="text-sm font-bold text-red-500">${remaining.toFixed(2)}</p>
                                </div>
                            </div>

                            {/* Record payment form */}
                            {showPaymentForm && (
                                <div className="p-4 border border-(--border-subtle) rounded-xl bg-(--bg-app) space-y-4">
                                    <p className="text-[10px] font-bold text-(--text-main) uppercase tracking-widest flex items-center gap-1.5">
                                        <Banknote size={13} className="text-(--brand-primary)" /> Record New Payment
                                    </p>
                                    {payError && (
                                        <div className="bg-red-500/10 border border-red-500/30 text-red-600 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
                                            <AlertTriangle size={12} className="shrink-0" />{payError}
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Amount *</label>
                                            <AmountInput
                                                value={payAmount}
                                                onChange={v => setPayAmount(v)}
                                                placeholder={`Max $${remaining.toFixed(2)}`}
                                                className="px-3 py-2 text-sm font-bold bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Payment Type *</label>
                                            <select
                                                value={payTypeId}
                                                onChange={e => setPayTypeId(e.target.value)}
                                                className="px-3 py-2 text-sm font-bold bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none"
                                            >
                                                {paymentTypes.map(pt => (
                                                    <option key={pt.id} value={String(pt.id)}>{pt.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Payment Date *</label>
                                            <input
                                                type="date"
                                                value={payDate}
                                                onChange={e => setPayDate(e.target.value)}
                                                className="px-3 py-2 text-sm font-bold bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Comment *</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. Cheque #1234, Reference No."
                                                value={payComment}
                                                onChange={e => setPayComment(e.target.value)}
                                                className="px-3 py-2 text-sm font-bold bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={handleRecordPayment}
                                            disabled={paySubmitting}
                                            className="bg-(--brand-primary) text-white px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 hover:opacity-90 disabled:opacity-50 transition-all outline-none shadow-sm"
                                        >
                                            <CreditCard size={13} />
                                            {paySubmitting ? 'Saving…' : 'Submit Payment'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Payment history list */}
                            {paymentsLoading ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 size={18} className="animate-spin text-(--brand-primary)" />
                                </div>
                            ) : payments.length === 0 ? (
                                <div className="bg-(--bg-app) border border-(--border-subtle) rounded-xl px-4 py-3 text-[10px] text-(--text-muted) font-bold uppercase tracking-widest">
                                    No payments recorded yet.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {payments.map(p => (
                                        <div key={p.id} className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-emerald-500/5 border-emerald-500/20">
                                            <div className="shrink-0 mt-0.5 text-emerald-600">
                                                <Banknote size={14} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                                        {p.payment_type_name}
                                                    </span>
                                                    <span className="text-xs font-bold text-emerald-700">${parseFloat(p.amount).toFixed(2)}</span>
                                                    <span className="text-[10px] text-(--text-muted) font-bold uppercase tracking-wider flex items-center gap-1">
                                                        <CalendarDays size={9} />
                                                        {fmtDate(p.payment_date)}
                                                    </span>
                                                </div>
                                                {p.comment && (
                                                    <p className="text-[10px] text-(--text-main) font-bold mt-1">{p.comment}</p>
                                                )}
                                                {p.recorded_by_name?.trim() && (
                                                    <p className="text-[10px] text-(--text-muted) mt-0.5">recorded by {p.recorded_by_name.trim()}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── PAYMENT HISTORY (Paid invoice — read-only view) ───────────── */}
                    {isPaid && (
                        <div className="space-y-3">
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1.5">
                                <CreditCard size={12} /> Payment History
                            </label>
                            <div className="grid grid-cols-3 gap-3">
                                <div className="p-3 bg-(--bg-app) border border-(--border-subtle) rounded-xl text-center">
                                    <p className="text-[10px] text-(--text-muted) font-bold uppercase tracking-wider mb-1">Invoice Total</p>
                                    <p className="text-sm font-bold text-(--text-main)">${displayTotal.toFixed(2)}</p>
                                </div>
                                <div className="col-span-2 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center">
                                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mb-1">Fully Paid</p>
                                    <p className="text-sm font-bold text-emerald-600">${totalPaid.toFixed(2)}</p>
                                </div>
                            </div>
                            {paymentsLoading ? (
                                <div className="flex items-center justify-center py-4">
                                    <Loader2 size={18} className="animate-spin text-(--brand-primary)" />
                                </div>
                            ) : payments.length === 0 ? (
                                <div className="bg-(--bg-app) border border-(--border-subtle) rounded-xl px-4 py-3 text-[10px] text-(--text-muted) font-bold uppercase tracking-widest">
                                    No payment records found.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {payments.map(p => (
                                        <div key={p.id} className="flex items-start gap-3 px-4 py-3 rounded-xl border bg-emerald-500/5 border-emerald-500/20">
                                            <div className="shrink-0 mt-0.5 text-emerald-600">
                                                <Banknote size={14} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                                        {p.payment_type_name}
                                                    </span>
                                                    <span className="text-xs font-bold text-emerald-700">${parseFloat(p.amount).toFixed(2)}</span>
                                                    <span className="text-[10px] text-(--text-muted) font-bold uppercase tracking-wider flex items-center gap-1">
                                                        <CalendarDays size={9} />
                                                        {fmtDate(p.payment_date)}
                                                    </span>
                                                </div>
                                                {p.comment && (
                                                    <p className="text-[10px] text-(--text-main) font-bold mt-1">{p.comment}</p>
                                                )}
                                                {p.recorded_by_name?.trim() && (
                                                    <p className="text-[10px] text-(--text-muted) mt-0.5">recorded by {p.recorded_by_name.trim()}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── EMAIL ACTIVITY (Open+) ────────────────────────────────────── */}
                    {invoice.status_id >= 4 && (
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1.5">
                                <Send size={12} /> Email Activity
                            </label>
                            {emailLogs.length === 0 ? (
                                <div className="bg-(--bg-app) border border-(--border-subtle) rounded-xl px-4 py-3 text-[10px] text-(--text-muted) font-bold uppercase tracking-widest">
                                    No emails sent yet.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {emailLogs.map(log => {
                                        const isPD = log.email_type === 'PAST_DUE_REMINDER';
                                        return (
                                            <div key={log.id} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${isPD ? 'bg-red-500/5 border-red-500/20' : 'bg-(--bg-app) border-(--border-subtle)'}`}>
                                                <div className={`shrink-0 mt-0.5 ${isPD ? 'text-red-500' : 'text-(--brand-primary)'}`}>
                                                    {isPD ? <AlertCircleIcon size={14} /> : <Mail size={14} />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${isPD ? 'bg-red-500/10 text-red-600 border-red-500/20' : 'bg-(--brand-primary)/10 text-(--brand-primary) border-(--brand-primary)/20'}`}>
                                                            {isPD ? 'Past Due Reminder' : 'Invoice Sent'}
                                                        </span>
                                                        <span className="text-[10px] text-(--text-muted) font-bold uppercase tracking-wider flex items-center gap-1">
                                                            <Clock size={9} />
                                                            {fmtDateTime(log.sent_at)}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-(--text-main) font-bold mt-1 truncate">To: {log.sent_to}</p>
                                                    {log.sent_by_name?.trim() && (
                                                        <p className="text-[10px] text-(--text-muted) mt-0.5">by {log.sent_by_name.trim()}</p>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── DRAFT: prerequisites checklist ───────────────────────────── */}
                    {invoice.status_id === 1 && (
                        <div className="bg-(--bg-app) border border-(--border-subtle) p-4 rounded-xl space-y-3">
                            <div className="flex items-center gap-2">
                                <Info size={14} className="text-(--text-muted) shrink-0" />
                                <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Draft — Pending Prerequisites</p>
                            </div>
                            {draftStatus ? (
                                <ul className="space-y-2">
                                    <li className="flex items-start gap-2.5">
                                        {draftStatus.period_ended
                                            ? <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
                                            : <XCircle size={14} className="text-orange-500 shrink-0 mt-0.5" />}
                                        <span className={`text-[10px] font-bold leading-relaxed ${draftStatus.period_ended ? 'text-green-600' : 'text-(--text-main)'}`}>
                                            {draftStatus.period_ended
                                                ? 'Billing period has ended'
                                                : `Billing period not yet ended — ends ${fmtDate(draftStatus.period_end)}`}
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-2.5">
                                        {draftStatus.pending_timesheets === 0
                                            ? <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
                                            : <XCircle size={14} className="text-orange-500 shrink-0 mt-0.5" />}
                                        <span className={`text-[10px] font-bold leading-relaxed ${draftStatus.pending_timesheets === 0 ? 'text-green-600' : 'text-(--text-main)'}`}>
                                            {draftStatus.pending_timesheets === 0
                                                ? 'All timesheets in period are approved'
                                                : `${draftStatus.pending_timesheets} timesheet${draftStatus.pending_timesheets > 1 ? 's' : ''} still pending approval`}
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-2.5">
                                        {draftStatus.has_bill_rate
                                            ? <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
                                            : <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />}
                                        <span className={`text-[10px] font-bold leading-relaxed ${draftStatus.has_bill_rate ? 'text-green-600' : 'text-red-600'}`}>
                                            {draftStatus.has_bill_rate
                                                ? 'Bill rate is configured for this period'
                                                : 'Bill rate not given — add a bill rate effective on or before the period start'}
                                        </span>
                                    </li>
                                    <li className="flex items-start gap-2.5">
                                        <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
                                        <span className="text-[10px] font-bold leading-relaxed text-green-600">
                                            Due date will be set to {fmtDate(draftStatus.period_end)} + Net {draftStatus.net_terms} days when promoted
                                        </span>
                                    </li>
                                </ul>
                            ) : (
                                <p className="text-[10px] text-(--text-muted) font-bold">Checking prerequisites…</p>
                            )}
                        </div>
                    )}

                    {/* ── READY-TO-SEND info banner ─────────────────────────────────── */}
                    {invoice.status_id === 2 && (
                        <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl flex items-start gap-2">
                            <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
                            <p className="text-[10px] font-bold text-blue-700 leading-relaxed tracking-wide">
                                This invoice is ready! Click "Generate &amp; Send Email" to set the Issue Date to today, calculate the Due Date based on the client's Net Terms, generate the PDF, and email the invoice — moving it to Open status.
                            </p>
                        </div>
                    )}

                </div>
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
