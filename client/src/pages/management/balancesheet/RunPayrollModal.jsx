import { useState } from 'react';
import { PlayCircle, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';

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
            setSuccessMsg(`Successfully processed ${data.placementsProcessed} W2 placements for the period: ${data.period}.`);
            setPeriodStart('');
            setPeriodEnd('');
            if (onPayrollComplete) onPayrollComplete();
            setTimeout(() => { setSuccessMsg(null); onClose(); }, 2500);
        } catch (err) {
            setError(err.response?.data?.error || "Failed to run payroll. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const footer = (
        <div className="flex justify-end gap-3 w-full">
            <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-5 py-2.5 text-xs font-bold text-(--text-main) bg-(--bg-surface) border border-(--border-subtle) rounded-xl uppercase tracking-widest hover:opacity-80 transition-all outline-none disabled:opacity-50"
            >
                Cancel
            </button>
            <button
                type="submit"
                onClick={handleRunPayroll}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-(--brand-primary-text) bg-(--brand-primary) rounded-xl uppercase tracking-widest hover:opacity-90 transition-all outline-none shadow-sm active:scale-95 disabled:opacity-50"
            >
                {isLoading ? <><Loader2 size={14} className="animate-spin" /> Running...</> : <><PlayCircle size={14} /> Run Payroll</>}
            </button>
        </div>
    );

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={!isLoading ? onClose : undefined}
            icon={<PlayCircle size={16} />}
            title="Run W2 Payroll"
            subtitle="Post earnings to the balance sheet for the selected period"
            footer={footer}
        >
            <div className="space-y-4">
                <p className="text-xs text-(--text-muted) font-bold uppercase tracking-widest">
                    Select the 15-day timesheet period to calculate and post W2 earnings.
                </p>

                {error && (
                    <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 font-bold flex items-center gap-2">
                        <AlertTriangle size={14} /> {error}
                    </div>
                )}
                {successMsg && (
                    <div className="p-3 bg-emerald-50 text-emerald-700 text-xs rounded-xl border border-emerald-200 font-bold flex items-center gap-2">
                        <CheckCircle size={14} /> {successMsg}
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Period Start</label>
                        <input
                            type="date"
                            required
                            value={periodStart}
                            onChange={(e) => setPeriodStart(e.target.value)}
                            disabled={isLoading}
                            className="w-full px-3 py-2.5 bg-(--bg-surface) border border-(--border-subtle) rounded-xl text-sm text-(--text-main) focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) outline-none transition-all disabled:opacity-50"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Period End</label>
                        <input
                            type="date"
                            required
                            value={periodEnd}
                            onChange={(e) => setPeriodEnd(e.target.value)}
                            disabled={isLoading}
                            className="w-full px-3 py-2.5 bg-(--bg-surface) border border-(--border-subtle) rounded-xl text-sm text-(--text-main) focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) outline-none transition-all disabled:opacity-50"
                        />
                    </div>
                </div>
            </div>
        </BaseModal>
    );
};

export default RunPayrollModal;
