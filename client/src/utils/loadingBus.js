// Tracks how many API requests are in flight so a single global indicator can
// show whenever the app is busy — no per-page wiring needed.
//
// axios.js increments on every request and decrements on every response, so any
// call made through the shared `api` instance feeds this automatically.

let pending = 0;
const listeners = new Set();

// Only notify on the 0↔1 boundary — subscribers care about "busy or not", not
// about the exact request count.
const emit = () => listeners.forEach(fn => fn(pending > 0));

export const startLoading = () => {
    pending += 1;
    if (pending === 1) emit();
};

export const stopLoading = () => {
    if (pending === 0) return;
    pending -= 1;
    if (pending === 0) emit();
};

// Shows the indicator for a fixed stretch even when no request is involved —
// used on route changes so a click registers instantly, before (or without) any
// network call of its own.
export const pulseLoading = (ms = 400) => {
    startLoading();
    setTimeout(stopLoading, ms);
};

export const isLoading = () => pending > 0;

export const subscribe = (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
};
