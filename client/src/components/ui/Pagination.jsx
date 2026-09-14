import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

const PAGE_SIZE = 20;

/**
 * Reusable pagination bar.
 *
 * Props:
 *   currentPage  – 1-based current page number
 *   totalItems   – total count of items (after filtering)
 *   pageSize     – items per page (default 20)
 *   onPageChange – (newPage: number) => void
 */
const Pagination = ({ currentPage, totalItems, pageSize = PAGE_SIZE, onPageChange }) => {
    const totalPages = Math.ceil(totalItems / pageSize);
    if (totalPages <= 1 && totalItems <= pageSize) return null;

    const from = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const to   = Math.min(currentPage * pageSize, totalItems);

    // Build the page number list with ellipsis
    const getPageNumbers = () => {
        if (totalPages <= 7) {
            return Array.from({ length: totalPages }, (_, i) => i + 1);
        }
        const pages = [];
        pages.push(1);
        if (currentPage > 3)  pages.push('...');
        const start = Math.max(2, currentPage - 1);
        const end   = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) pages.push(i);
        if (currentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
        return pages;
    };

    const btnBase = 'h-7 min-w-[28px] px-2 rounded-full text-xs font-semibold tabular-nums transition-all outline-none inline-flex items-center justify-center';
    const btnIdle = `${btnBase} text-(--text-muted) hover:text-(--text-main) hover:bg-(--text-main)/5`;
    const btnActive = `${btnBase} text-white`;
    const btnDisabled = `${btnBase} text-(--text-muted) opacity-30 cursor-not-allowed`;
    const activeStyle = { background: 'var(--brand-gradient)', boxShadow: '0 6px 16px -6px var(--brand-glow)' };

    return (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-(--border-subtle) bg-(--bg-surface) px-4 py-2.5 sm:px-6">
            {/* Result count */}
            <div className="flex items-center gap-2 whitespace-nowrap text-xs text-(--text-muted)">
                <span className="inline-flex h-6 items-center rounded-full border border-(--border-subtle) px-2.5 font-mono text-[11px] text-(--text-main)">
                    {from}–{to}
                </span>
                <span>
                    of <span className="font-semibold text-(--text-main)">{totalItems}</span>
                    <span className="hidden sm:inline"> records</span>
                </span>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-0.5 rounded-full border border-(--border-subtle) bg-(--bg-app)/60 p-1">
                <button
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                    className={currentPage === 1 ? btnDisabled : btnIdle}
                    title="First page"
                >
                    <ChevronsLeft size={14} />
                </button>

                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={currentPage === 1 ? btnDisabled : btnIdle}
                    title="Previous page"
                >
                    <ChevronLeft size={14} />
                </button>

                {/* Page numbers — hidden on very small screens, show on sm+ */}
                <div className="hidden items-center gap-0.5 sm:flex">
                    {getPageNumbers().map((page, i) =>
                        page === '...' ? (
                            <span key={`e${i}`} className="w-6 select-none text-center text-xs text-(--text-muted)">…</span>
                        ) : (
                            <button
                                key={page}
                                onClick={() => onPageChange(page)}
                                className={currentPage === page ? btnActive : btnIdle}
                                style={currentPage === page ? activeStyle : undefined}
                            >
                                {page}
                            </button>
                        )
                    )}
                </div>

                {/* Mobile: just show "3 / 12" */}
                <span className="select-none px-2 font-mono text-[11px] text-(--text-muted) sm:hidden">
                    <span className="text-(--text-main)">{currentPage}</span> / {totalPages}
                </span>

                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={currentPage === totalPages ? btnDisabled : btnIdle}
                    title="Next page"
                >
                    <ChevronRight size={14} />
                </button>

                <button
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className={currentPage === totalPages ? btnDisabled : btnIdle}
                    title="Last page"
                >
                    <ChevronsRight size={14} />
                </button>
            </div>
        </div>
    );
};

export { PAGE_SIZE };
export default Pagination;
