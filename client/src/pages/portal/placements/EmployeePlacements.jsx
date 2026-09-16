import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Rocket, Handshake, Clock, Layers, PlayCircle, CheckCircle2, CalendarDays } from 'lucide-react';
import { portalAPI } from '../../../api/apiService';
import { fmtDate } from '../../../utils/dateUtils';
import { PageHero, StatRail, StatTile, SearchInput, Chip, EmptyState, LoadingState, cx } from '../../../components/ui/kit';

const PAY_TONE = { C2C: 'fuchsia', W2: 'sky', '1099': 'amber' };

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDateDisplay = (d) => d ? fmtDate(d) : 'Ongoing';

const EngagementCard = ({ placement }) => {
    const effectivePay = placement.current_pay_rate_override != null
        ? (placement.pay_rate_type === 'Percentage'
            ? parseFloat(placement.bill_rate) * (parseFloat(placement.current_pay_rate_override) / 100)
            : parseFloat(placement.current_pay_rate_override))
        : parseFloat(placement.pay_rate);

    const isActive = placement.status === 'Active';

    return (
        <article className={cx(
            'relative overflow-hidden rounded-[26px] border bg-(--bg-surface) p-5 transition-all hover:-translate-y-0.5',
            isActive ? 'border-(--brand-primary)/35' : 'border-(--border-subtle)',
        )}>
            {isActive && <span aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-20 blur-2xl" style={{ background: 'var(--brand-gradient)' }} />}

            <div className="relative flex items-start justify-between gap-3">
                <span
                    className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px]', isActive ? 'text-white' : 'bg-(--text-muted)/10 text-(--text-muted)')}
                    style={isActive ? { background: 'var(--brand-gradient)' } : undefined}
                >
                    <Rocket size={20} />
                </span>
                <div className="flex flex-wrap justify-end gap-1.5">
                    {placement.pay_type_name && <Chip tone={PAY_TONE[placement.pay_type_name] || 'slate'}>{placement.pay_type_name}</Chip>}
                    <Chip tone={isActive ? 'green' : 'slate'}>{placement.status}</Chip>
                </div>
            </div>

            <h3 className="relative mt-4 text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{placement.job_title}</h3>
            <p className="relative flex items-center gap-1.5 truncate text-sm text-(--text-muted)"><Handshake size={14} /> {placement.client_name}</p>

            <div className="relative mt-5 rounded-[18px] bg-(--bg-app)/60 p-4">
                <p className="text-[11px] text-(--text-muted)">Pay rate</p>
                <p className="text-2xl font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>
                    {fmt$(effectivePay)}<span className="text-sm font-normal text-(--text-muted)">/hr</span>
                </p>
                {placement.pay_rate_type === 'Percentage' && (
                    <p className="text-xs text-(--text-muted)">{parseFloat(placement.current_pay_rate_override || placement.pay_rate)}% of bill rate</p>
                )}
            </div>

            <div className="relative mt-4 flex items-center gap-2 text-sm">
                <CalendarDays size={14} className="shrink-0 text-(--brand-primary)" />
                <span className="text-(--text-main)">{fmtDateDisplay(placement.start_date)}</span>
                <span className="h-px flex-1 bg-(--border-subtle)" />
                <span className="text-(--text-main)">{fmtDateDisplay(placement.end_date)}</span>
            </div>

            <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-(--border-subtle) pt-3 text-xs text-(--text-muted)">
                <span className="font-mono">{placement.placement_code}</span>
                {placement.has_timesheets === 1 && (
                    <span className="flex items-center gap-1 text-amber-500"><Clock size={12} /> {placement.timesheet_cycle_name || 'Weekly'} time logs</span>
                )}
            </div>

            {placement.status === 'Completed' && (
                <p className="relative mt-2 text-xs text-(--text-muted)">Completed on {fmtDateDisplay(placement.end_date)}</p>
            )}
        </article>
    );
};

const EmployeePlacements = () => {
    const [searchParams] = useSearchParams();
    const [placements, setPlacements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState(() => {
        const p = searchParams.get('filter');
        return p === 'ACTIVE' || p === 'COMPLETED' ? p : 'ALL';
    });

    useEffect(() => {
        portalAPI.getMyPlacements()
            .then(res => setPlacements(res.data))
            .catch(err => console.error('Engagements fetch error:', err))
            .finally(() => setLoading(false));
    }, []);

    const filtered = placements.filter(p => {
        if (filterStatus === 'ACTIVE'    && p.status !== 'Active')    return false;
        if (filterStatus === 'COMPLETED' && p.status !== 'Completed') return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            return `${p.job_title} ${p.client_name} ${p.placement_code}`.toLowerCase().includes(q);
        }
        return true;
    });

    const counts = {
        ALL:       placements.length,
        ACTIVE:    placements.filter(p => p.status === 'Active').length,
        COMPLETED: placements.filter(p => p.status === 'Completed').length,
    };

    return (
        <div className="mx-auto max-w-[1600px] space-y-4">
            <PageHero
                icon={Rocket}
                eyebrow="My work"
                title="My engagements"
                description="Every assignment you're on — partner, pay rate, dates and time log cycle."
            >
                <StatRail>
                    <StatTile label="All" icon={Layers} value={counts.ALL} active={filterStatus === 'ALL'} onClick={() => setFilterStatus('ALL')} />
                    <StatTile label="Running" icon={PlayCircle} value={counts.ACTIVE} active={filterStatus === 'ACTIVE'} onClick={() => setFilterStatus('ACTIVE')} />
                    <StatTile label="Completed" icon={CheckCircle2} value={counts.COMPLETED} active={filterStatus === 'COMPLETED'} onClick={() => setFilterStatus('COMPLETED')} />
                </StatRail>
            </PageHero>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-(--text-muted)"><span className="font-semibold text-(--text-main)">{filtered.length}</span> engagement{filtered.length !== 1 ? 's' : ''}</p>
                <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search title, partner or ID…" className="w-full sm:w-80" />
            </div>

            {loading ? (
                <LoadingState text="Loading engagements…" />
            ) : filtered.length === 0 ? (
                <div className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface)">
                    <EmptyState icon={Rocket} title={placements.length === 0 ? 'No engagements found' : 'No results match your filters'} />
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {filtered.map(p => <EngagementCard key={p.id} placement={p} />)}
                </div>
            )}
        </div>
    );
};

export default EmployeePlacements;
