import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, ChevronDown, ChevronUp, RefreshCw, Loader2, User, Clock } from 'lucide-react';
import { managementAPI } from '../../api/apiService';
import { fmtDateTime } from '../../utils/dateUtils';

const ROLE_COLORS = {
    ORG_ADMIN: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
    HR:        'bg-blue-500/10   text-blue-600   border-blue-500/20',
    EMPLOYEE:  'bg-green-500/10  text-green-600  border-green-500/20',
};

const ACTION_COLORS = {
    Added:     'bg-green-500/10  text-green-700  border-green-500/20',
    Created:   'bg-green-500/10  text-green-700  border-green-500/20',
    Generated: 'bg-blue-500/10   text-blue-700   border-blue-500/20',
    Updated:   'bg-amber-500/10  text-amber-700  border-amber-500/20',
    Ran:       'bg-amber-500/10  text-amber-700  border-amber-500/20',
    Submitted: 'bg-amber-500/10  text-amber-700  border-amber-500/20',
    Approved:  'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    Enabled:   'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
    Rejected:  'bg-red-500/10    text-red-700    border-red-500/20',
    Deleted:   'bg-red-500/10    text-red-700    border-red-500/20',
    Removed:   'bg-red-500/10    text-red-700    border-red-500/20',
    Disabled:  'bg-red-500/10    text-red-700    border-red-500/20',
    Terminated:'bg-red-500/10    text-red-700    border-red-500/20',
    Sent:      'bg-sky-500/10    text-sky-700    border-sky-500/20',
};

const actionColor = (action = '') => {
    const first = action.split(' ')[0];
    return ACTION_COLORS[first] || 'bg-(--border-subtle) text-(--text-muted) border-(--border-subtle)';
};

const PAGE_SIZE = 10;

const AuditLogPanel = ({ module }) => {
    const userRole = localStorage.getItem('userRole');
    const [open, setOpen]           = useState(false);
    const [logs, setLogs]           = useState([]);
    const [total, setTotal]         = useState(0);
    const [offset, setOffset]       = useState(0);
    const [loading, setLoading]     = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const fetchLogs = useCallback(async (off = 0) => {
        setLoading(true);
        try {
            const res = await managementAPI.getAuditLogs(module, PAGE_SIZE, off);
            setLogs(res.data.logs);
            setTotal(res.data.total);
            setOffset(off);
        } catch (err) {
            console.error('Audit log fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [module, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (open) fetchLogs(0);
    }, [open, fetchLogs]);

    if (userRole !== 'ORG_ADMIN') return null;

    const totalPages  = Math.ceil(total / PAGE_SIZE);
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

    return (
        <div className="mt-6 bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm overflow-hidden">

            {/* Header bar */}
            <div
                role="button"
                tabIndex={0}
                onClick={() => setOpen(o => !o)}
                onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-(--bg-app)/40 transition-colors cursor-pointer select-none"
            >
                <div className="flex items-center gap-2.5">
                    <div className="h-7 w-7 rounded-lg bg-(--brand-primary)/10 flex items-center justify-center text-(--brand-primary)">
                        <ClipboardList size={14} />
                    </div>
                    <span className="text-xs font-bold text-(--text-main) uppercase tracking-widest">
                        Audit Log
                    </span>
                    {total > 0 && open && (
                        <span className="px-1.5 py-0.5 rounded-md bg-(--brand-primary)/10 text-(--brand-primary) text-[9px] font-bold">
                            {total}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {open && (
                        <button
                            onClick={e => { e.stopPropagation(); setRefreshKey(k => k + 1); }}
                            className="p-1.5 rounded-lg hover:bg-(--bg-app) transition-colors text-(--text-muted) outline-none"
                            title="Refresh"
                        >
                            <RefreshCw size={13} />
                        </button>
                    )}
                    {open ? <ChevronUp size={15} className="text-(--text-muted)" /> : <ChevronDown size={15} className="text-(--text-muted)" />}
                </div>
            </div>

            {/* Log list */}
            {open && (
                <div className="border-t border-(--border-subtle)">
                    {loading ? (
                        <div className="flex items-center justify-center py-10 gap-2 text-(--text-muted)">
                            <Loader2 size={16} className="animate-spin text-(--brand-primary)" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Loading audit log…</span>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 gap-2 text-(--text-muted)">
                            <ClipboardList size={24} className="opacity-20" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">No activity recorded yet.</p>
                        </div>
                    ) : (
                        <>
                            {/* MOBILE CARD LIST — hidden on sm+ */}
                            <div className="sm:hidden divide-y divide-(--border-subtle)/60">
                                {logs.map(log => (
                                    <div key={log.id} className="px-4 py-2.5">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`shrink-0 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider border ${actionColor(log.action)}`}>
                                                {log.action}
                                            </span>
                                            <p className="text-[11px] font-bold text-(--text-main) truncate">
                                                {log.entity_name || log.entity_type}
                                            </p>
                                        </div>

                                        {log.description && (
                                            <p className="text-[10px] text-(--text-muted) leading-snug line-clamp-2 mt-1">
                                                {log.description}
                                            </p>
                                        )}

                                        <div className="flex items-center gap-1.5 mt-1.5 text-[9px] font-bold text-(--text-muted) min-w-0">
                                            <Clock size={9} className="shrink-0" />
                                            <span className="shrink-0">{fmtDateTime(log.created_at)}</span>
                                            <span className="opacity-40 shrink-0">·</span>
                                            <User size={9} className="shrink-0 text-(--brand-primary)" />
                                            <span className="truncate">{log.performed_by_name}</span>
                                            <span className={`shrink-0 text-[8px] font-bold uppercase px-1 py-px rounded border ${ROLE_COLORS[log.performed_by_role] || ROLE_COLORS.EMPLOYEE}`}>
                                                {log.performed_by_role?.replace('_', ' ')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* DESKTOP TABLE — hidden on mobile */}
                            <div className="hidden sm:block overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="bg-(--bg-app)/50 border-b border-(--border-subtle)">
                                            {['Timestamp', 'Action', 'Entity', 'Performed By', 'Description'].map(h => (
                                                <th key={h} className="px-4 py-2.5 text-left text-[9px] font-bold text-(--text-muted) uppercase tracking-widest whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log, i) => (
                                            <tr
                                                key={log.id}
                                                className={`border-b border-(--border-subtle)/60 transition-colors hover:bg-(--bg-app)/30 ${i % 2 === 0 ? '' : 'bg-(--bg-app)/20'}`}
                                            >
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5 text-(--text-muted)">
                                                        <Clock size={11} className="shrink-0" />
                                                        <span className="text-[10px] font-bold">{fmtDateTime(log.created_at)}</span>
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border ${actionColor(log.action)}`}>
                                                        {log.action}
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <p className="font-bold text-(--text-main) text-[10px] truncate max-w-[140px]">
                                                        {log.entity_name || log.entity_type}
                                                    </p>
                                                    {log.entity_name && (
                                                        <p className="text-[9px] text-(--text-muted) mt-0.5">{log.entity_type}</p>
                                                    )}
                                                </td>

                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="h-5 w-5 rounded-full bg-(--brand-primary)/10 flex items-center justify-center shrink-0">
                                                            <User size={10} className="text-(--brand-primary)" />
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-bold text-(--text-main) truncate max-w-[120px]">{log.performed_by_name}</p>
                                                            <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${ROLE_COLORS[log.performed_by_role] || ROLE_COLORS.EMPLOYEE}`}>
                                                                {log.performed_by_role?.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <p className="text-[10px] text-(--text-muted) max-w-[260px] leading-relaxed">{log.description || '—'}</p>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {totalPages > 1 && (
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-5 py-3 border-t border-(--border-subtle) bg-(--bg-app)/30">
                                    <p className="text-[10px] text-(--text-muted) font-bold">
                                        Page {currentPage} of {totalPages} &nbsp;·&nbsp; {total} total entries
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => fetchLogs(offset - PAGE_SIZE)}
                                            disabled={offset === 0}
                                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-(--border-subtle) text-(--text-muted) hover:bg-(--bg-app) disabled:opacity-40 disabled:cursor-not-allowed transition-colors outline-none"
                                        >
                                            Previous
                                        </button>
                                        <button
                                            onClick={() => fetchLogs(offset + PAGE_SIZE)}
                                            disabled={offset + PAGE_SIZE >= total}
                                            className="px-3 py-1.5 rounded-lg text-[10px] font-bold border border-(--border-subtle) text-(--text-muted) hover:bg-(--bg-app) disabled:opacity-40 disabled:cursor-not-allowed transition-colors outline-none"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default AuditLogPanel;
