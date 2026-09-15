import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Rocket, ArrowUpRight, Loader2, CalendarRange } from 'lucide-react';
import { managementAPI } from '../../api/apiService';
import { fmtDate } from '../../utils/dateUtils';
import { rowOpen } from '../../utils/rowClick';
import { PATHS } from '../../utils/constants';
import { Chip, Avatar, EmptyState } from '../ui/kit';

/**
 * Every engagement belonging to one consultant or one partner, shown inside the
 * Talent and Partners detail views.
 *
 * Exactly one of employeeId / clientId is passed, and that also decides the headline
 * on each card: inside a consultant you want to see WHICH PARTNER, inside a partner
 * you want to see WHICH CONSULTANT.
 *
 * Opening a card hands off to the Engagements page via ?engagement=, which opens that
 * engagement's detail view. The parent view is closed first so it does not stay
 * mounted behind the navigation.
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
                if (!cancelled) setError('Could not load engagement history.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        if (employeeId || clientId) load();
        else setLoading(false);
        return () => { cancelled = true; };
    }, [employeeId, clientId, byEmployee]);

    const openPlacement = (p) => {
        onNavigate?.();
        navigate(`${PATHS.engagements}?engagement=${p.id}`);
    };

    const primaryLabel = (p) => (byEmployee ? p.client_name : `${p.first_name} ${p.last_name}`);
    const secondaryLabel = (p) => (byEmployee ? (p.job_title || '').trim() : p.employee_code);

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-(--text-muted)">
                <Loader2 size={16} className="animate-spin text-(--brand-primary)" /> Loading engagements…
            </div>
        );
    }
    if (error) return <p className="py-10 text-center text-sm text-rose-500">{error}</p>;
    if (rows.length === 0) {
        return <EmptyState icon={Rocket} title="No engagements yet" text="Engagements will appear here once they are created." />;
    }

    return (
        <div className="grid gap-3 md:grid-cols-2">
            {rows.map(p => {
                const active = p.status === 'Active';
                return (
                    <div
                        key={p.id}
                        onClick={rowOpen(() => openPlacement(p))}
                        title="Open this engagement"
                        className="group relative cursor-pointer overflow-hidden rounded-[20px] border border-(--border-subtle) bg-(--bg-surface) p-4 transition-all hover:-translate-y-0.5 hover:border-(--brand-primary)/45"
                    >
                        <div className="flex items-start gap-3">
                            <Avatar name={primaryLabel(p)} size={38} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-(--text-main)">{primaryLabel(p)}</p>
                                {secondaryLabel(p) && <p className="truncate text-xs text-(--text-muted)">{secondaryLabel(p)}</p>}
                            </div>
                            <ArrowUpRight size={16} className="shrink-0 text-(--text-muted) transition-colors group-hover:text-(--brand-primary)" />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Chip tone={active ? 'green' : 'slate'}>{p.status || '—'}</Chip>
                            {p.pay_type_name && <Chip tone="brand">{p.pay_type_name}</Chip>}
                            <span className="ml-auto font-mono text-[11px] text-(--text-muted)">{p.placement_code || '—'}</span>
                        </div>
                        <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-(--bg-app)/60 px-3 py-2 text-xs text-(--text-muted)">
                            <CalendarRange size={13} className="shrink-0 text-(--brand-primary)" />
                            <span>{fmtDate(p.start_date)}</span>
                            <span className="h-px flex-1 bg-(--border-subtle)" />
                            <span>{p.end_date ? fmtDate(p.end_date) : 'Ongoing'}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default PlacementHistoryPanel;
