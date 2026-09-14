/**
 * searchMatch.js
 *
 * One definition of "does this row match what was typed", shared by every list
 * page so the search box behaves the same everywhere.
 *
 * Two things it fixes over the hand-rolled predicates it replaces:
 *
 *   1. Codes are searchable, not just names. Each page passes its ID fields
 *      (employee_code, placement_code, invoice_number) alongside the names.
 *
 *   2. Terms are matched independently. Typing "sruthi 1087" finds the row whose
 *      name matches one term and whose code matches the other — the old single
 *      substring test could never match across two different fields.
 *
 * Null/undefined fields are dropped rather than stringified, so a missing value
 * cannot turn into the literal text "undefined" and match a search for "und".
 */

/** Build a lowercase haystack from a row's searchable fields. */
export const haystack = (...fields) =>
    fields
        .filter(v => v !== null && v !== undefined && v !== '')
        .join(' ')
        .toLowerCase();

/**
 * True when every whitespace-separated term in `query` appears somewhere in
 * `fields`. An empty query matches everything, which is what a blank search box
 * should do.
 */
export const matchesSearch = (query, ...fields) => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return true;
    const hay = haystack(...fields);
    return q.split(/\s+/).every(term => hay.includes(term));
};

export default matchesSearch;
