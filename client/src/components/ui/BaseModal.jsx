import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 transition-opacity duration-300">
            <div className="bg-(--bg-surface) w-[96vw] sm:w-[99vw] h-[92vh] sm:h-[90vh] flex flex-col rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-(--border-subtle) transition-colors duration-300">

                {/* HEADER */}
                <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-(--border-subtle) flex items-center gap-2 sm:gap-3 bg-(--bg-app) transition-colors duration-300 shrink-0">

                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        {icon && (
                            <div className="h-7 w-7 sm:h-8 sm:w-8 bg-(--brand-primary) rounded-xl flex items-center justify-center shadow-sm text-(--brand-primary-text) shrink-0">
                                {icon}
                            </div>
                        )}
                        <div className="flex flex-col min-w-0">
                            <h2 className="font-bold uppercase tracking-tighter text-sm sm:text-lg text-(--text-main) leading-none mb-0.5 truncate">
                                {title}
                            </h2>
                            {subtitle && (
                                <div className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest">
                                    {subtitle}
                                </div>
                            )}
                        </div>
                    </div>

                    {headerRight && (
                        <div className="shrink-0 flex items-center">
                            {headerRight}
                        </div>
                    )}

                    <button onClick={onClose} className="text-(--text-muted) hover:text-(--text-main) transition-colors duration-300 shrink-0 ml-1">
                        <X size={18} className="sm:w-5 sm:h-5" />
                    </button>
                </div>

                {/* SCROLLABLE BODY */}
                <div className={`flex-1 overflow-y-auto ${noPadding ? '' : 'p-4 sm:p-8'}`}>
                    {children}
                </div>

                {/* FOOTER */}
                {footer && (
                    <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-(--border-subtle) bg-(--bg-app) flex justify-between items-center transition-colors duration-300 shrink-0">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default BaseModal;
