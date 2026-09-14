import { useEffect, useState, useSyncExternalStore } from 'react';
import { subscribe, isLoading } from '../../utils/loadingBus';

/**
 * Thin progress bar pinned to the top of the viewport, shown whenever the app is
 * waiting on the API or moving between pages.
 *
 * Real progress is unknowable for a plain XHR, so the bar creeps toward 90% while
 * work is outstanding and snaps to 100% once it clears — enough to acknowledge a
 * click immediately and show that something is still happening.
 */
const TopProgressBar = () => {
    const busy = useSyncExternalStore(subscribe, isLoading);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        if (busy) {
            // Ease toward 90% without ever reaching it, so the bar keeps moving
            // for as long as the request takes but never claims to be finished.
            const id = setInterval(() => setProgress(p => {
                const from = Math.max(p, 8);
                return from + (90 - from) * 0.12;
            }), 130);
            return () => clearInterval(id);
        }
        // Idle: hold at 100% briefly so the completion is visible, then reset.
        const id = setTimeout(() => setProgress(0), 320);
        return () => clearTimeout(id);
    }, [busy]);

    if (!busy && progress === 0) return null;

    const width = busy ? Math.max(progress, 8) : 100;

    return (
        <div className="fixed top-0 left-0 right-0 h-[3px] z-100 pointer-events-none" aria-hidden="true">
            <div
                className="relative h-full rounded-r-full transition-all ease-out"
                style={{
                    width: `${width}%`,
                    opacity: busy ? 1 : 0,
                    transitionDuration: busy ? '200ms' : '300ms',
                    background: 'var(--brand-gradient)',
                    boxShadow: '0 0 14px var(--brand-glow), 0 0 4px var(--brand-secondary)',
                }}
            >
                <span className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_10px_4px_var(--brand-glow)]" />
            </div>
        </div>
    );
};

export default TopProgressBar;
