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

    const btnBase = 'h-8 min-w-[32px] px-2 rounded-lg border text-[10px] font-bold tracking-widest transition-all outline-none inline-flex items-center justify-center';
    const btnIdle = `${btnBase} border-(--border-subtle) text-(--text-muted) hover:text-(--text-main) hover:border-(--brand-primary)/40 hover:bg-(--bg-app)`;
    const btnActive = `${btnBase} bg-(--brand-primary) text-(--brand-primary-text) border-(--brand-primary) shadow-sm`;
    const btnDisabled = `${btnBase} border-(--border-subtle) text-(--text-muted) opacity-35 cursor-not-allowed`;

    return (
        <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 border-t border-(--border-subtle) bg-(--bg-app)/60 shrink-0">
            {/* Result count */}
            <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest whitespace-nowrap">
                <span className="hidden sm:inline">Showing </span>
                <span className="text-(--text-main)">{from}–{to}</span>
                <span className="hidden sm:inline"> of </span>
                <span className="sm:hidden">/</span>
                <span className="text-(--text-main)">{totalItems}</span>
                <span className="hidden sm:inline"> results</span>
            </p>

            {/* Controls */}
            <div className="flex items-center gap-1">
                {/* First page */}
                <button
                    onClick={() => onPageChange(1)}
                    disabled={currentPage === 1}
                    className={currentPage === 1 ? btnDisabled : btnIdle}
                    title="First page"
                >
                    <ChevronsLeft size={13} />
                </button>

                {/* Previous */}
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={currentPage === 1 ? btnDisabled : btnIdle}
                    title="Previous page"
                >
                    <ChevronLeft size={13} />
                </button>

                {/* Page numbers — hidden on very small screens, show on sm+ */}
                <div className="hidden sm:flex items-center gap-1">
                    {getPageNumbers().map((page, i) =>
                        page === '...' ? (
                            <span key={`e${i}`} className="w-6 text-center text-[10px] text-(--text-muted) select-none">…</span>
                        ) : (
                            <button
                                key={page}
                                onClick={() => onPageChange(page)}
                                className={currentPage === page ? btnActive : btnIdle}
                            >
                                {page}
                            </button>
                        )
                    )}
                </div>

                {/* Mobile: just show "3 / 12" */}
                <span className="sm:hidden text-[10px] font-bold text-(--text-muted) px-2 select-none">
                    <span className="text-(--text-main)">{currentPage}</span> / {totalPages}
                </span>

                {/* Next */}
                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={currentPage === totalPages ? btnDisabled : btnIdle}
                    title="Next page"
                >
                    <ChevronRight size={13} />
                </button>

                {/* Last page */}
                <button
                    onClick={() => onPageChange(totalPages)}
                    disabled={currentPage === totalPages}
                    className={currentPage === totalPages ? btnDisabled : btnIdle}
                    title="Last page"
                >
                    <ChevronsRight size={13} />
                </button>
            </div>
        </div>
    );
};

export { PAGE_SIZE };
export default Pagination;
