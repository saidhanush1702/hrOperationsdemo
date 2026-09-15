import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Timer, AlertCircle, FileEdit, CheckCircle, XCircle, Layers, Hourglass, ClipboardCheck, Eye, Handshake } from 'lucide-react';
import { timesheetAPI } from '../../../api/apiService';
import SubmitTimesheetModal from './SubmitTimesheetModal';
import { fmtDateGB, isBeforeEasternToday } from '../../../utils/dateUtils';
import { rowOpen } from '../../../utils/rowClick';
import { PageHero, StatRail, StatTile, SelectInput, Btn, Chip, RecordCard, EmptyState, LoadingState } from '../../../components/ui/kit';

const TABS = [
    { key: 'ALL',              label: 'All logs',  icon: Layers },
    { key: 'NOT_SUBMITTED',    label: 'To submit', icon: Hourglass },
    { key: 'PENDING_APPROVAL', label: 'In review', icon: ClipboardCheck },
    { key: 'APPROVED',         label: 'Approved',  icon: CheckCircle },
    { key: 'REJECTED',         label: 'Sent back', icon: XCircle },
    { key: 'PAST_DUE',         label: 'Overdue',   icon: AlertCircle },
];

const EmployeeTimesheets = () => {
    const [searchParams] = useSearchParams();
    const [timesheets, setTimesheets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTimesheet, setSelectedTimesheet] = useState(null);

    // Filters
    const [filterTab, setFilterTab] = useState(() => {
        const t = searchParams.get('tab');
        const valid = ['NOT_SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAST_DUE'];
        return valid.includes(t) ? t : 'ALL';
    });
    const [selectedClient, setSelectedClient] = useState('ALL');

    const fetchMyTimesheets = async () => {
        setLoading(true);
        try {
            const res = await timesheetAPI.getEmployeeTimesheets();
            setTimesheets(res.data);
        } catch (err) {
            console.error("Failed to fetch time logs:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMyTimesheets();
    }, []);

    // Unique partner names for the filter
    const uniqueClients = Array.from(
        new Set(timesheets.map(t => t.client_name))
    ).filter(Boolean);

    const isPastDue = (ts) => ts.status_id === 1 && isBeforeEasternToday(ts.end_date);

    const filteredTimesheets = timesheets.filter(t => {
        if (filterTab === 'NOT_SUBMITTED' && (t.status_id !== 1 || isPastDue(t))) return false;
        if (filterTab === 'PENDING_APPROVAL' && t.status_id !== 2) return false;
        if (filterTab === 'APPROVED' && t.status_id !== 3) return false;
        if (filterTab === 'REJECTED' && t.status_id !== 4) return false;
        if (filterTab === 'PAST_DUE' && !isPastDue(t)) return false;

        if (selectedClient !== 'ALL' && t.client_name !== selectedClient) return false;
        return true;
    });

    const tabCounts = {
        ALL: timesheets.length,
        NOT_SUBMITTED: timesheets.filter(t => t.status_id === 1 && !isPastDue(t)).length,
        PENDING_APPROVAL: timesheets.filter(t => t.status_id === 2).length,
        APPROVED: timesheets.filter(t => t.status_id === 3).length,
        REJECTED: timesheets.filter(t => t.status_id === 4).length,
        PAST_DUE: timesheets.filter(t => isPastDue(t)).length
    };

    const getStatusChip = (ts) => {
        if (ts.status_id === 2) return <Chip tone="amber" icon={ClipboardCheck}>In review</Chip>;
        if (ts.status_id === 3) return <Chip tone="green" icon={CheckCircle}>Approved</Chip>;
        if (ts.status_id === 4) return <Chip tone="rose" icon={XCircle}>Sent back</Chip>;
        if (isPastDue(ts)) return <Chip tone="rose" icon={AlertCircle}>Overdue</Chip>;
        return <Chip tone="slate" icon={Hourglass}>To submit</Chip>;
    };

    return (
        <div className="mx-auto max-w-[1400px] space-y-6">
            <PageHero
                icon={Timer}
                eyebrow="My work"
                title="My time logs"
                description="Log your hours day by day and attach your partner's approval."
            >
                <StatRail>
                    {TABS.map(tab => (
                        <StatTile key={tab.key} label={tab.label} icon={tab.icon} value={tabCounts[tab.key]} active={filterTab === tab.key} onClick={() => setFilterTab(tab.key)} />
                    ))}
                </StatRail>
            </PageHero>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-(--text-muted)"><span className="font-semibold text-(--text-main)">{filteredTimesheets.length}</span> time log{filteredTimesheets.length !== 1 ? 's' : ''}</p>
                {uniqueClients.length > 0 && (
                    <SelectInput value={selectedClient} onChange={setSelectedClient} className="w-full sm:w-64">
                        <option value="ALL">All partners</option>
                        {uniqueClients.map(clientName => (
                            <option key={clientName} value={clientName}>{clientName}</option>
                        ))}
                    </SelectInput>
                )}
            </div>

            {loading ? (
                <LoadingState text="Loading time logs…" />
            ) : filteredTimesheets.length === 0 ? (
                <div className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface)">
                    <EmptyState icon={CheckCircle} title="You're all caught up" text="No time logs in this view." />
                </div>
            ) : (
                <div className="space-y-2.5">
                    {filteredTimesheets.map(t => {
                        const editable = t.status_id === 1 || t.status_id === 4;
                        return (
                            <RecordCard
                                key={t.id}
                                onClick={rowOpen(() => setSelectedTimesheet(t))}
                                title={editable ? 'Fill time log' : 'View details'}
                            >
                                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                                    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-[16px] text-white" style={{ background: 'var(--brand-gradient)' }}>
                                        <span className="text-lg font-semibold leading-none" style={{ fontFamily: 'var(--font-display)' }}>{Number(t.total_hours)}</span>
                                        <span className="text-[10px] text-white/80">hrs</span>
                                    </div>
                                    <div className="min-w-[180px] flex-1">
                                        <p className="text-sm font-semibold text-(--text-main)">{fmtDateGB(t.start_date)} → {fmtDateGB(t.end_date)}</p>
                                        <p className="flex items-center gap-1.5 truncate text-xs text-(--text-muted)"><Handshake size={12} /> {t.client_name}</p>
                                    </div>
                                    {getStatusChip(t)}
                                    <div className="ml-auto">
                                        {editable ? (
                                            <Btn size="sm" variant="primary" icon={FileEdit} onClick={() => setSelectedTimesheet(t)}>Fill</Btn>
                                        ) : (
                                            <Btn size="sm" icon={Eye} onClick={() => setSelectedTimesheet(t)}>View</Btn>
                                        )}
                                    </div>
                                </div>
                            </RecordCard>
                        );
                    })}
                </div>
            )}

            {selectedTimesheet && <SubmitTimesheetModal timesheet={selectedTimesheet} onClose={() => setSelectedTimesheet(null)} onRefresh={fetchMyTimesheets} />}
        </div>
    );
};

export default EmployeeTimesheets;
