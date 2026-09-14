import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { PlayCircle, X, Loader2 } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import { getEasternDateString } from '../../../utils/dateUtils';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

// The 24 semi-monthly periods for a given year.
//
// Derived from the year rather than hard-coded, because February's second half
// is 28 days in most years and 29 in a leap year. The previous fixed 'Feb 16-28'
// definition meant no payroll period ever covered February 29th, so hours worked
// that day could not be paid at all. Building the end day from the year closes
// that, and keeps these labels identical to the ones the backend derives in
// services/payrollService.js.
const buildPeriods = (year) => {
    const y = parseInt(year, 10);
    const out = [];
    for (let m = 1; m <= 12; m++) {
        const lastDay = new Date(y, m, 0).getDate();
        out.push({ label: `${MONTH_ABBR[m - 1]} 1-15`,          startMD: `${pad(m)}-01`,  endMD: `${pad(m)}-15` });
        out.push({ label: `${MONTH_ABBR[m - 1]} 16-${lastDay}`, startMD: `${pad(m)}-16`,  endMD: `${pad(m)}-${pad(lastDay)}` });
    }
    return out;
};

const currentYear = parseInt(getEasternDateString().slice(0, 4), 10);

// Ten years back, two forward. The backend puts no bound on how far back a run may
// be generated -- the only guard is the duplicate check -- so the old three-year
// window was a UI-only ceiling that made older periods unreachable even though they
// were perfectly valid. Catching up a period that was never run is now the ONLY way
// to pay its hours, since arrears no longer reaches into unrun periods.
const YEAR_OPTIONS = Array.from({ length: 13 }, (_, i) => currentYear - 10 + i);

const RunPayrollModal = ({ onClose, onGenerated }) => {
    const [selectedPeriodIdx, setSelectedPeriodIdx] = useState('');
    const [year, setYear] = useState(String(currentYear));
    const periods = useMemo(() => buildPeriods(year), [year]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (selectedPeriodIdx === '') return setError('Please select a pay period.');
        if (!year) return setError('Please enter a year.');

        const period = periods[parseInt(selectedPeriodIdx)];
        const periodStart = `${year}-${period.startMD}`;
        const periodEnd = `${year}-${period.endMD}`;

        setLoading(true);
        try {
            const res = await managementAPI.generatePayrollRun({
                period_label: period.label,
                period_start: periodStart,
                period_end: periodEnd,
                year: parseInt(year),
            });
            onGenerated(res.data);
        } catch (err) {
            setError(err.response?.data?.error || 'Failed to generate payroll. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-(--bg-surface) w-full max-w-md rounded-2xl shadow-2xl border border-(--border-subtle) overflow-hidden animate-in fade-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-(--border-subtle) bg-(--bg-app)">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-(--brand-primary) rounded-xl flex items-center justify-center text-(--brand-primary-text) shadow-sm">
                            <PlayCircle size={16} />
                        </div>
                        <div>
                            <h2 className="font-bold uppercase tracking-tight text-(--text-main) leading-none text-base">
                                Run Payroll
                            </h2>
                            <p className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest mt-0.5">
                                Select pay period
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="text-(--text-muted) hover:text-(--text-main) transition-colors outline-none"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <p className="text-xs text-(--text-muted) font-medium">
                        Select the 15-day pay period and year. If payroll for this period was already generated it will be shown; otherwise a new run will be created.
                    </p>

                    {error && (
                        <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 font-bold">
                            {error}
                        </div>
                    )}

                    {/* Period dropdown */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">
                            Pay Period
                        </label>
                        <select
                            value={selectedPeriodIdx}
                            onChange={(e) => setSelectedPeriodIdx(e.target.value)}
                            disabled={loading}
                            className="w-full px-3 py-2.5 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl text-sm font-bold focus:border-(--brand-primary) outline-none shadow-sm"
                        >
                            <option value="">— Select a period —</option>
                            {periods.map((p, i) => (
                                <option key={i} value={i}>{p.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Year input */}
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">
                            Year
                        </label>
                        <select
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            disabled={loading}
                            className="w-full px-3 py-2.5 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl text-sm font-bold focus:border-(--brand-primary) outline-none shadow-sm"
                        >
                            {YEAR_OPTIONS.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    {/* Footer */}
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-(--text-main) bg-(--bg-app) border border-(--border-subtle) rounded-xl hover:opacity-80 outline-none transition-all disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-(--brand-primary-text) bg-(--brand-primary) rounded-xl hover:opacity-90 outline-none transition-all disabled:opacity-50 shadow-sm active:scale-95"
                        >
                            {loading ? (
                                <><Loader2 size={14} className="animate-spin" /> Generating...</>
                            ) : (
                                <><PlayCircle size={14} /> Generate</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default RunPayrollModal;
