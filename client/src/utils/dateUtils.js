// All date/time display and comparison in this app uses US Eastern timezone.
// Browser local timezone is intentionally ignored everywhere.

const TZ = 'America/New_York';

// Parse a date-only string (YYYY-MM-DD) as noon UTC so day never shifts in any timezone.
const _parse = (dateStr) => {
    if (!dateStr) return null;
    const s = typeof dateStr === 'string' ? dateStr.split('T')[0] : null;
    return s ? new Date(s + 'T12:00:00Z') : new Date(dateStr);
};

// Returns today's date as "YYYY-MM-DD" in Eastern timezone.
export const getEasternDateString = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    return `${y}-${m}-${d}`;
};

// Returns today minus N calendar days as "YYYY-MM-DD" in Eastern timezone.
export const getEasternDateMinus = (days) => {
    const today = _parse(getEasternDateString());
    today.setUTCDate(today.getUTCDate() - days);
    return today.toISOString().slice(0, 10);
};

// Standard date display: mm/dd/yyyy (e.g. 01/15/2024)
export const fmtDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = _parse(dateStr);
    if (!d || isNaN(d.getTime())) return '—';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const month = parts.find(p => p.type === 'month').value;
    const day   = parts.find(p => p.type === 'day').value;
    const year  = parts.find(p => p.type === 'year').value;
    return `${month}/${day}/${year}`;
};

// Standard datetime display: mm/dd/yyyy HH:MM
export const fmtDateTime = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const month  = parts.find(p => p.type === 'month').value;
    const day    = parts.find(p => p.type === 'day').value;
    const year   = parts.find(p => p.type === 'year').value;
    const hour   = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    return `${month}/${day}/${year} ${hour}:${minute}`;
};

// fmtDateUS — alias for fmtDate, always returns mm/dd/yyyy.
export const fmtDateUS = (dateStr, _options = {}) => fmtDate(dateStr);

// Format a date-only string as mm/dd/yyyy (used in employee portal).
export const fmtDateGB = (dateStr) => {
    if (!dateStr) return '—';
    const d = _parse(dateStr);
    if (!d || isNaN(d.getTime())) return '—';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const month = parts.find(p => p.type === 'month').value;
    const day   = parts.find(p => p.type === 'day').value;
    const year  = parts.find(p => p.type === 'year').value;
    return `${month}/${day}/${year}`;
};

// Day of week (0 = Sunday … 6 = Saturday) for a date-only string in Eastern timezone.
export const getEasternDayOfWeek = (dateStr) => {
    if (!dateStr) return 0;
    const MAP = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const abbr = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(_parse(dateStr));
    return MAP[abbr] ?? 0;
};

// Day-of-month number for a date-only string in Eastern timezone.
export const getEasternDate = (dateStr) => {
    if (!dateStr) return 0;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, day: 'numeric' }).formatToParts(_parse(dateStr));
    return parseInt(parts.find(p => p.type === 'day').value, 10);
};

// Whole number of calendar days between two date-only strings (b - a). Both parsed as noon UTC
// so DST transitions never throw the count off by one.
export const diffEasternDays = (dateStrA, dateStrB) => {
    const a = _parse(dateStrA);
    const b = _parse(dateStrB);
    if (!a || !b || isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
};

// Places a chronologically-ordered list of timesheet entries into weekly grid columns by each
// entry's ACTUAL calendar date, rather than by array position. Returns one array item per grid
// cell in row order: either `{ entry, index }` (index = the entry's position in the original
// `entries` array, for callers that edit state by index) or `null` for a day with no entry
// (weekend, absence, not-yet-generated day, etc). This guarantees a day with no entry never
// shifts later entries into the wrong weekday column.
// weekStartIdx: 0=Sunday..6=Saturday — the day-of-week shown in the grid's first column.
export const buildDailyLogSlots = (entries, weekStartIdx = 0) => {
    if (!entries || entries.length === 0) return [];
    const getColIdx = (dow) => (dow - weekStartIdx + 7) % 7;

    const slots = [];
    const firstColIdx = getColIdx(getEasternDayOfWeek(entries[0].work_date));
    for (let i = 0; i < firstColIdx; i++) slots.push(null);

    entries.forEach((entry, index) => {
        if (index > 0) {
            const gapDays = diffEasternDays(entries[index - 1].work_date, entry.work_date);
            for (let i = 1; i < gapDays; i++) slots.push(null);
        }
        slots.push({ entry, index });
    });

    const lastColIdx = getColIdx(getEasternDayOfWeek(entries[entries.length - 1].work_date));
    for (let i = lastColIdx; i < 6; i++) slots.push(null);

    return slots;
};

// Normalise any date value the API returns ('YYYY-MM-DD' or a serialised Date)
// down to a plain 'YYYY-MM-DD' day, so date ranges compare lexicographically.
export const toDay = (v) => (v ? String(v).slice(0, 10) : '');

// Human label for a date range filter — either bound may be left open.
export const formatRangeLabel = (from, to) => {
    if (from && to) return `${fmtDate(from)} – ${fmtDate(to)}`;
    if (from)       return `From ${fmtDate(from)}`;
    return `Until ${fmtDate(to)}`;
};

// True when dateStr (YYYY-MM-DD) is strictly before today in Eastern timezone.
export const isBeforeEasternToday = (dateStr) => {
    if (!dateStr) return false;
    return dateStr.slice(0, 10) < getEasternDateString();
};

// True when dateStr (YYYY-MM-DD) is today or earlier in Eastern timezone.
export const isOnOrBeforeEasternToday = (dateStr) => {
    if (!dateStr) return false;
    return dateStr.slice(0, 10) <= getEasternDateString();
};
