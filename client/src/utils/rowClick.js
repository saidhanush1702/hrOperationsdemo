/**
 * Row-level click-through helper.
 *
 * Wraps a table row (or a mobile card) so a single click anywhere on it opens
 * the same detail view its "View / Manage / Review" action button opens, while
 * leaving every nested control — buttons, links, checkboxes, inputs — working
 * exactly as before.
 *
 * Usage:
 *   <tr onClick={rowOpen(() => setSelected(item))} className="... cursor-pointer">
 */

// Anything matching this stays in charge of its own click.
const INTERACTIVE = 'button, a, input, select, textarea, label, [role="button"], [data-no-row-click]';

export const rowOpen = (open) => (e) => {
    if (typeof open !== 'function') return;

    // A click that landed on a nested control belongs to that control.
    if (e.target?.closest?.(INTERACTIVE)) return;

    // Don't hijack a click that was really the end of a text selection.
    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed && selection.toString().trim()) return;

    open(e);
};

export default rowOpen;
