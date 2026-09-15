import { useState } from 'react';
import { PlayCircle, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import { Btn, Field, Notice } from '../../../components/ui/kit';

const RunPayrollModal = ({ isOpen, onClose, onPayrollComplete }) => {
    const [periodStart, setPeriodStart] = useState('');
    const [periodEnd, setPeriodEnd] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [successMsg, setSuccessMsg] = useState(null);

    const handleRunPayroll = async (e) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);

        if (!periodStart || !periodEnd) {
            return setError("Please select both start and end dates.");
        }
        if (new Date(periodStart) > new Date(periodEnd)) {
            return setError("Start date cannot be after the end date.");
        }

        setIsLoading(true);
        try {
            const result = await managementAPI.runW2Payroll({ periodStart, periodEnd });
            const data = result.data;
            setSuccessMsg(`Processed ${data.placementsProcessed} W2 engagements for the period: ${data.period}.`);
            setPeriodStart('');
            setPeriodEnd('');
            if (onPayrollComplete) onPayrollComplete();
            setTimeout(() => { setSuccessMsg(null); onClose(); }, 2500);
        } catch (err) {
            setError(err.response?.data?.error || "Failed to run the pay run. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const footer = (
        <div className="flex w-full justify-end gap-2">
            <Btn onClick={onClose} disabled={isLoading}>Cancel</Btn>
            <Btn type="submit" form="w2RunForm" variant="primary" icon={isLoading ? Loader2 : PlayCircle} disabled={isLoading}>
                {isLoading ? 'Running…' : 'Run W2 pay'}
            </Btn>
        </div>
    );

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={!isLoading ? onClose : undefined}
            icon={<PlayCircle size={18} />}
            title="Run W2 pay"
            subtitle="Post earnings to the ledger for the selected period"
            footer={footer}
        >
            <form id="w2RunForm" onSubmit={handleRunPayroll} className="mx-auto max-w-xl space-y-5">
                <p className="text-sm text-(--text-muted)">Select the 15-day time log period to calculate and post W2 earnings.</p>

                {error && <Notice tone="rose" icon={AlertTriangle}>{error}</Notice>}
                {successMsg && <Notice tone="green" icon={CheckCircle}>{successMsg}</Notice>}

                <div className="grid gap-4 rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5 sm:grid-cols-2">
                    <Field label="Period start">
                        <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} disabled={isLoading} className="nx-input" />
                    </Field>
                    <Field label="Period end">
                        <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} disabled={isLoading} className="nx-input" />
                    </Field>
                </div>
            </form>
        </BaseModal>
    );
};

export default RunPayrollModal;
