/**
 * Placeholder rows shown while a table's data is in flight.
 *
 * Mirroring the real column layout (including any responsive `hidden`/`table-cell`
 * classes) keeps the header from shifting when the data lands.
 *
 * Props:
 *   rows    – how many placeholder rows to render
 *   columns – one entry per <th>, in order:
 *               { lines: ['70%', '45%'], className: 'hidden sm:table-cell', align: 'right' }
 *             `lines` may also be a bare width string for a single-line cell.
 */
const TableSkeleton = ({ rows = 8, columns }) => (
    <>
        {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="animate-pulse">
                {columns.map((col, c) => {
                    const lines = Array.isArray(col.lines) ? col.lines : [col.lines];
                    return (
                        <td key={c} className={`px-4 py-3.5 ${col.className || ''}`}>
                            <div className={`space-y-1.5 ${col.align === 'right' ? 'flex flex-col items-end' : ''}`}>
                                {lines.map((w, i) => (
                                    <div key={i} className="h-2.5 rounded bg-(--text-muted)/15" style={{ width: w }} />
                                ))}
                            </div>
                        </td>
                    );
                })}
            </tr>
        ))}
    </>
);

export default TableSkeleton;
