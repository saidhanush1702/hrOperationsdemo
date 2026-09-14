/**
 * nameCase.js
 *
 * One place that decides how a name is capitalised, so the value stored in the
 * database is already display-ready and the UI never has to re-case anything.
 *
 * The rule is plain title case: first letter of each word up, the rest down.
 * Applied on the way IN (every controller that writes a name) and by the
 * scripts/normalize_names.js backfill, which imports these same functions —
 * that shared import is what stops existing rows and new rows drifting apart.
 *
 * Word boundaries include spaces, hyphens, apostrophes, periods and slashes, so
 * "MARY-JANE O'BRIEN" becomes "Mary-Jane O'Brien" rather than "Mary-jane O'brien".
 *
 * Two escape hatches, because blind title case produces obvious nonsense:
 *
 *   toCompanyName  keeps legal suffixes upper — "DISYS LLC" -> "Disys LLC",
 *                  not "Disys Llc".
 *   toTitleText    keeps common role acronyms upper — "QA ENGINEER" ->
 *                  "QA Engineer", not "Qa Engineer".
 *
 * toPersonName deliberately has NO preserve list. A person's surname is not an
 * acronym, and a list would mangle real names (someone called Pa, Co or Ap).
 */

// Legal / entity suffixes that read wrong in title case.
// Only true initialisms belong here. Inc, Ltd, Corp and Co are ordinary words and
// read correctly in title case, so they are deliberately absent.
const COMPANY_UPPER = new Set([
    'LLC', 'L.L.C.', 'LLP', 'PLLC', 'LP', 'PC', 'PLC', 'USA', 'US', 'UK',
]);

// Role/skill acronyms that appear in job titles and contact titles.
// Sr/Jr and mixed-case brands (DevOps, iOS, .NET) are excluded: they are not
// all-caps words, and forcing them upper is as wrong as forcing them lower.
const TITLE_UPPER = new Set([
    'IT', 'HR', 'QA', 'QC', 'AP', 'AR', 'UI', 'UX', 'API', 'AWS', 'GCP', 'SQL',
    'ETL', 'BI', 'ERP', 'CRM', 'SAP', 'ML', 'AI', 'PM', 'BA', 'DBA', 'SDET',
    'NOC', 'SRE', 'CEO', 'CTO', 'CFO', 'COO', 'VP', 'II', 'III', 'IV',
    'PHP', 'CSS', 'HTML', 'C2C', 'W2', 'RPA', 'SFDC', 'SAP', 'EDI',
]);

// Split on the separators, capitalise each fragment, put the separators back.
// Commas and ampersands are included so "Strive Consulting,LLC" is two words and
// not one unsplittable blob.
const SEPARATORS = /([\s\-'\u2019./,&]+)/;

const hasLetters  = (s) => /[a-zA-Z]/.test(s);
const isAllUpper  = (s) => hasLetters(s) && s === s.toUpperCase();
const isAllLower  = (s) => hasLetters(s) && s === s.toLowerCase();

const capitalize = (frag) => frag.charAt(0).toUpperCase() + frag.slice(1).toLowerCase();

/**
 * The casing rule.
 *
 * Blind title case is destructive: it turns "TekisHub" into "Tekishub", "BVM" into
 * "Bvm" and "DevOps" into "Devops". Those capitals were deliberate, and a name the
 * user typed correctly should survive being saved.
 *
 * So the value is judged as a whole first:
 *
 *   ENTIRELY UPPER or entirely lower  -> the casing carries no information, so
 *                                        every word is title-cased.
 *   Already mixed                     -> the capitals are intentional; only the
 *                                        words that are entirely lowercase get
 *                                        fixed, everything else is left untouched.
 *
 * That fixes "SAI NIKHIL", "yerra" and "Ravi shankar" while leaving
 * "BVM Technology Associates Inc" and "TekisHub Consulting Services LLC" alone.
 *
 * `keepShortAcronym` additionally leaves a lone short all-caps token as-is, so a
 * client called "CYMA" or a job title of "RPA" is not flattened to "Cyma" / "Rpa".
 * It is off for people, where a three-letter surname in caps is far more likely to
 * be shouting than an acronym.
 *
 * Whitespace is always collapsed and trimmed — that is never wrong.
 */
const applyCase = (value, preserve, { keepShortAcronym = false } = {}) => {
    if (value === null || value === undefined) return value;
    const str = String(value).trim().replace(/\s+/g, ' ');
    if (!str) return str;

    const letters = str.replace(/[^a-zA-Z]/g, '');
    if (!letters) return str;

    // A lone short all-caps token: "RPA", "AP", "CYMA", "LLC".
    if (keepShortAcronym && isAllUpper(str) && !/[\s]/.test(str) && letters.length <= 4) return str;

    // When the whole value is one case, its casing tells us nothing — rebuild it.
    const rebuildAll = isAllUpper(letters) || isAllLower(letters);

    return str
        .split(SEPARATORS)
        .map((part, i) => {
            if (i % 2 === 1) return part;            // separator, keep verbatim
            if (!hasLetters(part)) return part;      // numbers, symbols
            const bare = part.replace(/[^A-Za-z0-9.]/g, '');
            if (preserve && bare && preserve.has(bare.toUpperCase())) return bare.toUpperCase();
            if (rebuildAll) return capitalize(part);
            // Mixed-case value: only repair the words that are entirely lowercase.
            return isAllLower(part) ? capitalize(part) : part;
        })
        .join('');
};

/** People: employees, users, client contacts. No acronym preservation. */
export const toPersonName = (value) => applyCase(value, null);

/** Organisations that are not the tenant: clients. Keeps LLC / INC / LTD upper. */
export const toCompanyName = (value) => applyCase(value, COMPANY_UPPER, { keepShortAcronym: true });

/** Job titles and contact titles. Keeps role acronyms upper. */
export const toTitleText = (value) => applyCase(value, TITLE_UPPER, { keepShortAcronym: true });

/**
 * Convenience for controllers: returns a copy of `obj` with the listed keys
 * normalised, leaving keys that are absent or empty untouched so an UPDATE that
 * omits a field does not blank it.
 */
export const normalizeNameFields = (obj, fields, fn = toPersonName) => {
    if (!obj) return obj;
    const out = { ...obj };
    for (const f of fields) {
        if (out[f] !== undefined && out[f] !== null && String(out[f]).trim() !== '') {
            out[f] = fn(out[f]);
        }
    }
    return out;
};

export default { toPersonName, toCompanyName, toTitleText, normalizeNameFields };
