// All backend date operations must reflect US Eastern time.
// process.env.TZ = 'America/New_York' is set in db.js before any module runs,
// so native Date methods (getFullYear, getMonth, getDate, toLocaleDateString)
// already return Eastern values throughout the backend.

// Returns today's date as "YYYY-MM-DD" in US Eastern timezone.
// toISOString() is always UTC, so we read from Eastern-aware Date methods instead.
export const getEasternDateString = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// Parse a YYYY-MM-DD string as local midnight (Eastern midnight with TZ set).
// ECMAScript parses bare "YYYY-MM-DD" as UTC midnight; appending T00:00:00 forces
// local-time interpretation, which is Eastern when process.env.TZ is set.
export const parseDateStr = (dateStr) => {
    if (!dateStr) return null;
    const s = typeof dateStr === 'string' ? dateStr.split('T')[0] : null;
    if (!s) return new Date(dateStr);
    return new Date(s + 'T00:00:00');
};

// Subtracts one calendar day from a YYYY-MM-DD string; returns YYYY-MM-DD.
export const dateMinus1 = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// Normalise any date value (string, Date object) to a YYYY-MM-DD string.
export const normDateStr = (d) => {
    if (!d) return '';
    if (typeof d === 'string') return d.split('T')[0];
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
};
