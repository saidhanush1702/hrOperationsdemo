import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Shared dialog, presented as a full-height panel that slides in from the right.
 * The props are unchanged, so every existing caller keeps working.
 */
const BaseModal = ({
    isOpen,
    onClose,
    icon,
    title,
    subtitle,
    headerRight,
    footer,
    children,
    noPadding = false
}) => {
    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="nx-drawer-scrim absolute inset-0" aria-hidden="true" />

            <section
                role="dialog"
                aria-modal="true"
                className="nx-drawer relative flex h-full w-full flex-col overflow-hidden border-l border-(--border-subtle) bg-(--bg-surface) transition-colors duration-300 lg:w-[calc(100vw-4.5rem)] lg:rounded-l-[28px] 2xl:w-[calc(100vw-9rem)]"
            >
                {/* HEADER */}
                <header
                    className="relative shrink-0 border-b border-(--border-subtle) px-4 py-3 sm:px-6 sm:py-3.5"
                    style={{ background: 'linear-gradient(110deg, color-mix(in srgb, var(--brand-primary) 10%, var(--bg-surface)), var(--bg-surface) 60%)' }}
                >
                    <div className="flex items-center gap-3 sm:gap-4">
                        {icon && (
                            <div
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-white sm:h-10 sm:w-10"
                                style={{ background: 'var(--brand-gradient)', boxShadow: '0 10px 28px -10px var(--brand-glow)' }}
                            >
                                {icon}
                            </div>
                        )}
                        <div className="min-w-0 flex-1">
                            <h2 className="truncate text-base font-semibold leading-tight text-(--text-main) sm:text-xl" style={{ fontFamily: 'var(--font-display)' }}>
                                {title}
                            </h2>
                            {subtitle && (
                                <div className="mt-0.5 truncate text-xs text-(--text-muted) sm:text-sm">
                                    {subtitle}
                                </div>
                            )}
                        </div>

                        {headerRight && (
                            <div className="flex shrink-0 items-center">
                                {headerRight}
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-full border border-(--border-subtle) bg-(--bg-surface) text-(--text-muted) outline-none transition-colors hover:border-(--brand-primary)/50 hover:text-(--text-main) sm:w-auto sm:px-3.5"
                        >
                            <X size={16} />
                            <span className="hidden text-xs font-semibold sm:inline">Close</span>
                        </button>
                    </div>
                </header>

                {/* SCROLLABLE BODY */}
                <div className={`flex-1 overflow-y-auto ${noPadding ? '' : 'p-4 sm:p-8'}`}>
                    {children}
                </div>

                {/* FOOTER */}
                {footer && (
                    <div className="flex shrink-0 items-center justify-between border-t border-(--border-subtle) bg-(--bg-app)/60 px-4 py-2.5 backdrop-blur transition-colors duration-300 sm:px-6 sm:py-3">
                        {footer}
                    </div>
                )}
            </section>
        </div>,
        document.body
    );
};

export default BaseModal;
