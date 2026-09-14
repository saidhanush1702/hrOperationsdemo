import { X } from 'lucide-react';
import { getEasternDateString, getEasternDateMinus } from '../../utils/dateUtils';

/**
 * From/To date range picker with quick presets, sized for the filter drawers.
 *
 * Props:
 *   from     – 'YYYY-MM-DD' or '' (no lower bound)
 *   to       – 'YYYY-MM-DD' or '' (no upper bound)
 *   onChange – ({ from, to }) => void
 *   hint     – short line explaining what the range matches against
 */

const pad = (n) => String(n).padStart(2, '0');

// Last calendar day of a 1-based month, via UTC so no local-timezone rollover.
const monthEnd = (y, m) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;

// Presets are built off "today" in Eastern time so they line up with every other
// date the app displays.
const buildPresets = () => {
    const today = getEasternDateString();
    const [y, m] = today.split('-').map(Number);
    const prevY = m === 1 ? y - 1 : y;
    const prevM = m === 1 ? 12 : m - 1;

    return [
        { label: '7 Days',     from: getEasternDateMinus(6),      to: today },
        { label: '30 Days',    from: getEasternDateMinus(29),     to: today },
        { label: 'This Month', from: `${y}-${pad(m)}-01`,         to: monthEnd(y, m) },
        { label: 'Last Month', from: `${prevY}-${pad(prevM)}-01`, to: monthEnd(prevY, prevM) },
        { label: 'This Year',  from: `${y}-01-01`,                to: `${y}-12-31` },
    ];
};

const inputClass = 'w-full px-2.5 py-2 bg-(--bg-app) text-(--text-main) border border-(--border-subtle) rounded-xl text-[11px] font-bold focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) outline-none transition-all';

const DateRangeFilter = ({ from = '', to = '', onChange, hint }) => {
    const presets  = buildPresets();
    const invalid  = from && to && from > to;
    const isActive = (p) => p.from === from && p.to === to;

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1.5 block">
                    <span className="block text-[9px] font-bold uppercase tracking-widest text-(--text-muted)">From</span>
                    <input
                        type="date"
                        value={from}
                        max={to || undefined}
                        onChange={e => onChange({ from: e.target.value, to })}
                        className={inputClass}
                    />
                </label>
                <label className="space-y-1.5 block">
                    <span className="block text-[9px] font-bold uppercase tracking-widest text-(--text-muted)">To</span>
                    <input
                        type="date"
                        value={to}
                        min={from || undefined}
                        onChange={e => onChange({ from, to: e.target.value })}
                        className={inputClass}
                    />
                </label>
            </div>

            {invalid && (
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">
                    "From" must be on or before "To"
                </p>
            )}

            <div className="flex flex-wrap gap-1.5">
                {presets.map(p => (
                    <button
                        key={p.label}
                        type="button"
                        onClick={() => onChange({ from: p.from, to: p.to })}
                        className={`px-2 py-1 rounded-lg border text-[9px] font-bold uppercase tracking-wider transition-all outline-none ${
                            isActive(p)
                                ? 'bg-(--brand-primary) text-(--brand-primary-text) border-(--brand-primary)'
                                : 'bg-(--bg-surface) text-(--text-muted) border-(--border-subtle) hover:border-(--brand-primary) hover:text-(--brand-primary)'
                        }`}
                    >
                        {p.label}
                    </button>
                ))}
                {(from || to) && (
                    <button
                        type="button"
                        onClick={() => onChange({ from: '', to: '' })}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-red-500/25 bg-red-500/10 text-red-500 text-[9px] font-bold uppercase tracking-wider hover:bg-red-500/20 transition-all outline-none"
                    >
                        <X size={9} /> Clear
                    </button>
                )}
            </div>

            {hint && (
                <p className="text-[10px] text-(--text-muted) font-bold uppercase tracking-wider">{hint}</p>
            )}
        </div>
    );
};

export default DateRangeFilter;
