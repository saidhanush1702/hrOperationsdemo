import { useState, useEffect } from 'react';
import { PlusCircle, Loader2, AlertTriangle, ArrowUpCircle, ArrowDownCircle, User, SlidersHorizontal } from 'lucide-react';
import BaseModal from '../../../components/ui/BaseModal';
import { managementAPI } from '../../../api/apiService';
import AmountInput from '../../../components/ui/AmountInput';
import { getEasternDateString, fmtDate } from '../../../utils/dateUtils';
import { Btn, Field, Notice, Avatar, cx } from '../../../components/ui/kit';

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AddAdjustmentModal = ({ onClose, onRefresh }) => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        employee_id: '',
        type: 'PAYOUT', // 'PAYOUT' or 'DEDUCTION'
        amount: '',
        adjustment_date: getEasternDateString(),
        description: ''
    });

    useEffect(() => {
        // Fetch consultants to populate the picker
        const fetchEmployees = async () => {
            try {
                const res = await managementAPI.getEmployees();
                // Standard consultants only
                setEmployees(res.data.filter(e => e.role === 'EMPLOYEE' && e.is_active));
            } catch (err) {
                console.error("Failed to load consultants", err);
            }
        };
        fetchEmployees();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.employee_id || !formData.amount || !formData.description) {
            return setError("Please fill out all required fields.");
        }

        setLoading(true);
        setError('');

        try {
            await managementAPI.addBalanceAdjustment(formData);
            onRefresh();
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || "Failed to add adjustment.");
            setLoading(false);
        }
    };

    const chosen = employees.find(emp => String(emp.id) === String(formData.employee_id));
    const isPayout = formData.type === 'PAYOUT';

    const footer = (
        <div className="flex w-full justify-end gap-2">
            <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
            <Btn type="submit" form="ledgerAdjForm" variant="primary" icon={loading ? Loader2 : PlusCircle} disabled={loading}>
                Add adjustment
            </Btn>
        </div>
    );

    return (
        <BaseModal
            isOpen={true}
            onClose={!loading ? onClose : undefined}
            icon={<SlidersHorizontal size={18} />}
            title="Ledger adjustment"
            subtitle="Record a payout or deduction against a consultant's balance"
            footer={footer}
            noPadding
        >
            <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_340px]">
                <form id="ledgerAdjForm" onSubmit={handleSubmit} className="space-y-6 p-4 sm:p-6 lg:p-8">
                    {error && <Notice tone="rose" icon={AlertTriangle}>{error}</Notice>}

                    <Field label="Consultant" required>
                        <div className="relative">
                            <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                            <select
                                value={formData.employee_id}
                                onChange={(e) => setFormData({...formData, employee_id: e.target.value})}
                                className="nx-input cursor-pointer pl-9"
                            >
                                <option value="">Select a consultant…</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.employee_code})</option>
                                ))}
                            </select>
                        </div>
                    </Field>

                    <div>
                        <p className="nx-label">Adjustment type</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {[
                                ['PAYOUT', 'Payout', 'Reimbursement or bonus', ArrowUpCircle, 'emerald'],
                                ['DEDUCTION', 'Deduction', 'Advance or fee', ArrowDownCircle, 'rose'],
                            ].map(([val, label, hint, Icon, tone]) => {
                                const on = formData.type === val;
                                return (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => setFormData({...formData, type: val})}
                                        className={cx(
                                            'flex items-center gap-3 rounded-[18px] border p-4 text-left outline-none transition-colors',
                                            on
                                                ? tone === 'emerald' ? 'border-emerald-500 bg-emerald-500/10' : 'border-rose-500 bg-rose-500/10'
                                                : 'border-(--border-subtle) hover:border-(--brand-primary)/40',
                                        )}
                                    >
                                        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tone === 'emerald' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500')}>
                                            <Icon size={18} />
                                        </span>
                                        <span>
                                            <span className="block text-sm font-semibold text-(--text-main)">{label}</span>
                                            <span className="block text-xs text-(--text-muted)">{hint}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Amount ($)" required>
                            <AmountInput
                                value={formData.amount}
                                onChange={v => setFormData({...formData, amount: v})}
                                className="nx-input text-lg font-semibold"
                            />
                        </Field>
                        <Field label="Date" required>
                            <input
                                type="date"
                                value={formData.adjustment_date}
                                onChange={(e) => setFormData({...formData, adjustment_date: e.target.value})}
                                className="nx-input"
                            />
                        </Field>
                    </div>

                    <Field label="Description" required>
                        <textarea
                            rows="3"
                            placeholder="e.g. Travel reimbursement, visa fee deduction…"
                            value={formData.description}
                            onChange={(e) => setFormData({...formData, description: e.target.value})}
                            className="nx-input resize-none"
                        />
                    </Field>
                </form>

                <aside className="border-t border-(--border-subtle) bg-(--bg-app)/40 p-5 lg:border-l lg:border-t-0 lg:p-6">
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-(--brand-primary)">Ledger impact</p>
                    <div className="mt-4 rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5">
                        {chosen ? (
                            <div className="flex items-center gap-3">
                                <Avatar name={`${chosen.first_name} ${chosen.last_name}`} size={40} />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-(--text-main)">{chosen.first_name} {chosen.last_name}</p>
                                    <p className="font-mono text-[11px] text-(--text-muted)">{chosen.employee_code}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-(--text-muted)">No consultant selected</p>
                        )}
                        <p className={cx('mt-5 text-3xl font-semibold', isPayout ? 'text-emerald-500' : 'text-rose-500')} style={{ fontFamily: 'var(--font-display)' }}>
                            {isPayout ? '+' : '−'}{fmt$(formData.amount)}
                        </p>
                        <p className="text-xs text-(--text-muted)">{isPayout ? 'Raises' : 'Lowers'} the net balance · {fmtDate(formData.adjustment_date)}</p>
                        {formData.description && (
                            <p className="mt-4 border-t border-(--border-subtle) pt-3 text-sm text-(--text-main)">{formData.description}</p>
                        )}
                    </div>
                </aside>
            </div>
        </BaseModal>
    );
};

export default AddAdjustmentModal;
