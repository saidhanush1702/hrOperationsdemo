import { useState, useEffect, useCallback } from 'react';
import { History, ChevronDown, RefreshCw, Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
import { managementAPI } from '../../api/apiService';
import { fmtDateTime } from '../../utils/dateUtils';
import { roleLabel } from '../../utils/constants';
import { Avatar, Chip, cx } from '../ui/kit';

// Tone per action verb (first word of the logged action).
const ACTION_TONES = {
    Added: 'green', Created: 'green', Generated: 'sky', Updated: 'amber', Ran: 'amber',
    Submitted: 'amber', Approved: 'green', Enabled: 'green', Rejected: 'rose', Deleted: 'rose',
    Removed: 'rose', Disabled: 'rose', Terminated: 'rose', Sent: 'cyan',
};
const DOT = { green: 'bg-emerald-500', sky: 'bg-sky-500', amber: 'bg-amber-500', rose: 'bg-rose-500', cyan: 'bg-cyan-500', slate: 'bg-(--text-muted)' };

const toneFor = (action = '') => ACTION_TONES[action.split(' ')[0]] || 'slate';

const PAGE_SIZE = 10;

/** Collapsible activity timeline for one module (workspace admins only). */
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
        <section className="mt-6 overflow-hidden rounded-[24px] border border-(--border-subtle) bg-(--bg-surface)">
            <div
                role="button"
                tabIndex={0}
                onClick={() => setOpen(o => !o)}
                onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}
                className="flex w-full cursor-pointer select-none items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-(--text-main)/[0.03]"
            >
                <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-[12px] text-white" style={{ background: 'var(--brand-gradient)' }}>
                        <History size={16} />
                    </span>
                    <div>
                        <p className="text-sm font-semibold text-(--text-main)">Activity trail</p>
                        <p className="text-xs text-(--text-muted)">Who changed what, and when</p>
                    </div>
                    {total > 0 && open && <Chip tone="brand">{total} events</Chip>}
                </div>
                <div className="flex items-center gap-2">
                    {open && (
                        <button
                            onClick={e => { e.stopPropagation(); setRefreshKey(k => k + 1); }}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-(--border-subtle) text-(--text-muted) outline-none transition-colors hover:text-(--text-main)"
                            title="Refresh"
                        >
                            <RefreshCw size={13} />
                        </button>
                    )}
                    <ChevronDown size={17} className={cx('text-(--text-muted) transition-transform', open && 'rotate-180')} />
                </div>
            </div>

            {open && (
                <div className="border-t border-(--border-subtle) px-5 py-5">
                    {loading ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm text-(--text-muted)">
                            <Loader2 size={16} className="animate-spin text-(--brand-primary)" /> Loading activity…
                        </div>
                    ) : logs.length === 0 ? (
                        <p className="py-10 text-center text-sm text-(--text-muted)">No activity recorded yet.</p>
                    ) : (
                        <>
                            <ol className="relative space-y-4 pl-6">
                                <span aria-hidden="true" className="absolute bottom-2 left-[7px] top-2 w-px bg-(--border-subtle)" />
                                {logs.map(log => {
                                    const tone = toneFor(log.action);
                                    return (
                                        <li key={log.id} className="relative">
                                            <span className={cx('absolute -left-6 top-3 h-3.5 w-3.5 rounded-full ring-4 ring-(--bg-surface)', DOT[tone])} />
                                            <div className="rounded-[18px] border border-(--border-subtle) bg-(--bg-app)/40 px-4 py-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Chip tone={tone}>{log.action}</Chip>
                                                    <span className="text-sm font-semibold text-(--text-main)">{log.entity_name || log.entity_type}</span>
                                                    {log.entity_name && <span className="text-xs text-(--text-muted)">· {log.entity_type}</span>}
                                                    <span className="ml-auto font-mono text-[11px] text-(--text-muted)">{fmtDateTime(log.created_at)}</span>
                                                </div>
                                                {log.description && <p className="mt-1.5 text-xs leading-relaxed text-(--text-muted)">{log.description}</p>}
                                                <div className="mt-2 flex items-center gap-2">
                                                    <Avatar name={log.performed_by_name || ''} size={22} />
                                                    <span className="text-xs font-medium text-(--text-main)">{log.performed_by_name}</span>
                                                    <span className="text-[11px] text-(--text-muted)">{roleLabel(log.performed_by_role)}</span>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>

                            {totalPages > 1 && (
                                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-xs text-(--text-muted)">Page {currentPage} of {totalPages} · {total} events</p>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => fetchLogs(offset - PAGE_SIZE)}
                                            disabled={offset === 0}
                                            className="flex h-8 items-center gap-1.5 rounded-full border border-(--border-subtle) px-3 text-xs font-semibold text-(--text-muted) outline-none transition-colors hover:text-(--text-main) disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            <ArrowLeft size={13} /> Newer
                                        </button>
                                        <button
                                            onClick={() => fetchLogs(offset + PAGE_SIZE)}
                                            disabled={offset + PAGE_SIZE >= total}
                                            className="flex h-8 items-center gap-1.5 rounded-full border border-(--border-subtle) px-3 text-xs font-semibold text-(--text-muted) outline-none transition-colors hover:text-(--text-main) disabled:cursor-not-allowed disabled:opacity-40"
                                        >
                                            Older <ArrowRight size={13} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </section>
    );
};

export default AuditLogPanel;
