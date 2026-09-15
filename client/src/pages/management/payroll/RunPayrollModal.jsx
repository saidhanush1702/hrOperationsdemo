import { useState, useMemo } from 'react';
import { PlayCircle, Loader2, AlertTriangle, CalendarRange } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import { getEasternDateString } from '../../../utils/dateUtils';
import BaseModal from '../../../components/ui/BaseModal';
import { Btn, Notice, cx } from '../../../components/ui/kit';

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
            setError(err.response?.data?.error || 'Failed to generate the pay run. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const selected = selectedPeriodIdx !== '' ? periods[parseInt(selectedPeriodIdx)] : null;

    const footer = (
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-(--text-muted)">
                {selected ? <>Period <b className="text-(--text-main)">{selected.label}, {year}</b></> : 'Pick a half-month period'}
            </span>
            <div className="flex gap-2">
                <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
                <Btn type="submit" form="runPayForm" variant="primary" icon={loading ? Loader2 : PlayCircle} disabled={loading}>
                    {loading ? 'Generating…' : 'Generate'}
                </Btn>
            </div>
        </div>
    );

    return (
        <BaseModal
            isOpen={true}
            onClose={loading ? undefined : onClose}
            icon={<PlayCircle size={18} />}
            title="Start a pay run"
            subtitle="An existing run for the period opens instead of creating a new one"
            footer={footer}
        >
            <form id="runPayForm" onSubmit={handleSubmit} className="space-y-6">
                {error && <Notice tone="rose" icon={AlertTriangle}>{error}</Notice>}

                <div>
                    <p className="nx-label">Year</p>
                    <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        {YEAR_OPTIONS.map(y => {
                            const on = String(y) === year;
                            return (
                                <button
                                    key={y}
                                    type="button"
                                    disabled={loading}
                                    onClick={() => setYear(String(y))}
                                    className={cx('h-9 shrink-0 rounded-full border px-4 font-mono text-sm outline-none transition-colors', on ? 'border-transparent text-white' : 'border-(--border-subtle) text-(--text-main) hover:border-(--brand-primary)/45')}
                                    style={on ? { background: 'var(--brand-gradient)' } : undefined}
                                >
                                    {y}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <p className="nx-label flex items-center gap-1.5"><CalendarRange size={13} /> Pay period</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {MONTH_ABBR.map((month, m) => (
                            <div key={month} className="rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) p-2">
                                <p className="px-1.5 pb-1.5 text-xs font-semibold text-(--text-muted)">{month}</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[m * 2, m * 2 + 1].map(idx => {
                                        const on = String(idx) === selectedPeriodIdx;
                                        const p = periods[idx];
                                        return (
                                            <button
                                                key={idx}
                                                type="button"
                                                disabled={loading}
                                                onClick={() => setSelectedPeriodIdx(String(idx))}
                                                className={cx('rounded-[12px] px-2 py-2 text-xs font-semibold outline-none transition-colors', on ? 'text-white' : 'bg-(--bg-app)/60 text-(--text-main) hover:bg-(--brand-primary)/10')}
                                                style={on ? { background: 'var(--brand-gradient)' } : undefined}
                                                title={p.label}
                                            >
                                                {p.label.replace(`${month} `, '')}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </form>
        </BaseModal>
    );
};

export default RunPayrollModal;
