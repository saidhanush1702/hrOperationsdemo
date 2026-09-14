import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, ChevronRight, Loader2 } from 'lucide-react';
import { managementAPI } from '../../api/apiService';
import { fmtDate } from '../../utils/dateUtils';
import { rowOpen } from '../../utils/rowClick';

/**
 * Every placement belonging to one employee or one client, shown as the last
 * section of the Workforce and Clients detail modals.
 *
 * Lives in components/ rather than under either page because both own it equally —
 * the same precedent AuditLogPanel set. Exactly one of employeeId / clientId is
 * passed, and that also decides the first column: inside an employee you want to
 * see WHICH CLIENT, inside a client you want to see WHICH EMPLOYEE. Repeating the
 * record you already have open would waste the widest column.
 *
 * Clicking a row hands off to the Placements page via ?placementId=, which opens
 * that placement's detail modal. The parent modal is closed first so the user does
 * not land on a new page with a stale modal still mounted behind the navigation.
 */
const PlacementHistoryPanel = ({ employeeId, clientId, onNavigate }) => {
    const navigate = useNavigate();
    const [rows, setRows]       = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');

    const byEmployee = !!employeeId;

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const res = await managementAPI.getPlacementHistory(
                    byEmployee ? { employee_id: employeeId } : { client_id: clientId }
                );
                if (!cancelled) setRows(res.data || []);
            } catch {
                if (!cancelled) setError('Could not load placement history.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        if (employeeId || clientId) load();
        else setLoading(false);
        return () => { cancelled = true; };
    }, [employeeId, clientId, byEmployee]);

    const openPlacement = (p) => {
        // Close the modal we are inside before the route changes, otherwise it stays
        // mounted over the Placements page it just navigated to.
        onNavigate?.();
        navigate(`/management/placements?placementId=${p.id}`);
    };

    // ─── The label that changes with context ─────────────────────────────────
    const primaryLabel = (p) => (byEmployee
        ? p.client_name
        : `${p.first_name} ${p.last_name}`);
    // Rendered only when present. job_title is blank on almost every placement in
    // practice, so an unconditional line would be a column of dashes; employee_code
    // on the client side is always set.
    const secondaryLabel = (p) => (byEmployee
        ? (p.job_title || '').trim()
        : p.employee_code);

    const StatusPill = ({ status }) => {
        const active = status === 'Active';
        return (
            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border whitespace-nowrap ${
                active ? 'bg-green-500/10 text-green-600 border-green-500/20'
                       : 'bg-(--text-muted)/10 text-(--text-muted) border-(--border-subtle)'
            }`}>
                {status || '—'}
            </span>
        );
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-1.5 border-b border-(--border-subtle) pb-1 transition-colors duration-300">
                <span className="text-(--text-muted) transition-colors duration-300"><Briefcase size={12} /></span>
                <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest transition-colors duration-300">
                    Placement History
                </h3>
                {!loading && rows.length > 0 && (
                    <span className="ml-auto text-[9px] font-bold bg-(--brand-primary)/10 text-(--brand-primary) px-2 py-0.5 rounded-full border border-(--brand-primary)/20">
                        {rows.length}
                    </span>
                )}
            </div>

            <div className="bg-(--bg-app)/50 rounded-xl border border-(--border-subtle) overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center gap-2 py-6 text-(--text-muted)">
                        <Loader2 size={14} className="animate-spin text-(--brand-primary)" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Loading placements…</span>
                    </div>
                ) : error ? (
                    <div className="py-6 text-center text-[10px] font-bold uppercase tracking-widest text-red-500">{error}</div>
                ) : rows.length === 0 ? (
                    <div className="py-6 text-center text-[10px] font-bold uppercase tracking-widest text-(--text-muted)">
                        No placements on record.
                    </div>
                ) : (
                    <>
                        {/* MOBILE CARD LIST — hidden on sm+ */}
                        <div className="sm:hidden divide-y divide-(--border-subtle)">
                            {rows.map(p => (
                                <div key={p.id}
                                    onClick={rowOpen(() => openPlacement(p))}
                                    className="px-3 py-2.5 hover:bg-(--bg-surface) transition-colors cursor-pointer">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-(--text-main) truncate">{primaryLabel(p)}</p>
                                            {secondaryLabel(p) && (
                                                <p className="text-[9px] text-(--text-muted) font-bold uppercase tracking-wider truncate mt-0.5">
                                                    {secondaryLabel(p)}
                                                </p>
                                            )}
                                            <p className="text-[9px] text-(--text-muted) font-mono mt-1">{p.placement_code || '—'}</p>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <StatusPill status={p.status} />
                                                {p.pay_type_name && (
                                                    <span className="text-[9px] font-bold bg-(--brand-primary)/10 text-(--brand-primary) px-1.5 py-0.5 rounded border border-(--brand-primary)/20">
                                                        {p.pay_type_name}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[9px] text-(--text-muted) font-bold mt-1.5">
                                                {fmtDate(p.start_date)} → {p.end_date ? fmtDate(p.end_date) : 'Ongoing'}
                                            </p>
                                        </div>
                                        <ChevronRight size={14} className="text-(--text-muted) shrink-0 mt-1" />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* DESKTOP TABLE — hidden on mobile */}
                        <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-(--bg-surface) text-[9px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                                    <tr>
                                        <th className="px-3 py-2">{byEmployee ? 'Client' : 'Employee'}</th>
                                        <th className="px-3 py-2">Placement ID</th>
                                        <th className="px-3 py-2">Type</th>
                                        <th className="px-3 py-2">Start Date</th>
                                        <th className="px-3 py-2">End Date</th>
                                        <th className="px-3 py-2">Status</th>
                                        <th className="px-3 py-2 w-8" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-(--border-subtle)">
                                    {rows.map(p => (
                                        <tr key={p.id}
                                            onClick={rowOpen(() => openPlacement(p))}
                                            title="Open this placement"
                                            className="hover:bg-(--bg-surface) transition-colors cursor-pointer group">
                                            <td className="px-3 py-2.5">
                                                <p className="text-xs font-bold text-(--text-main) truncate max-w-[180px]">{primaryLabel(p)}</p>
                                                {secondaryLabel(p) && (
                                                    <p className="text-[9px] text-(--text-muted) font-bold uppercase tracking-wider truncate max-w-[180px] mt-0.5">
                                                        {secondaryLabel(p)}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <span className="text-[10px] font-mono font-bold text-(--text-main)">{p.placement_code || '—'}</span>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                {p.pay_type_name ? (
                                                    <span className="text-[9px] font-bold bg-(--brand-primary)/10 text-(--brand-primary) px-1.5 py-0.5 rounded border border-(--brand-primary)/20">
                                                        {p.pay_type_name}
                                                    </span>
                                                ) : <span className="text-(--text-muted) text-xs">—</span>}
                                            </td>
                                            <td className="px-3 py-2.5 text-[10px] font-bold text-(--text-muted) whitespace-nowrap">
                                                {fmtDate(p.start_date)}
                                            </td>
                                            <td className="px-3 py-2.5 text-[10px] font-bold text-(--text-muted) whitespace-nowrap">
                                                {p.end_date ? fmtDate(p.end_date) : 'Ongoing'}
                                            </td>
                                            <td className="px-3 py-2.5"><StatusPill status={p.status} /></td>
                                            <td className="px-3 py-2.5 text-right">
                                                <ChevronRight size={14} className="text-(--text-muted) group-hover:text-(--brand-primary) transition-colors" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default PlacementHistoryPanel;
