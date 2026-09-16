import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Rocket, CalendarDays, Hourglass, AlertCircle, TrendingUp, Gauge,
    User, ChevronDown, Phone, Mail, Globe, BadgeCheck, Cake, Briefcase, MapPin, Heart, Users,
} from 'lucide-react';
import { portalAPI } from '../../../api/apiService';
import { fmtDate } from '../../../utils/dateUtils';
import { PATHS } from '../../../utils/constants';
import { PageHero, StatRail, StatTile, Panel, Fact, Btn, Chip, Avatar, EmptyState, LoadingState } from '../../../components/ui/kit';

const EmployeeDashboard = () => {
    const [stats, setStats]               = useState(null);
    const [loading, setLoading]           = useState(true);
    const [profileOpen, setProfileOpen]   = useState(false);
    const [profile, setProfile]           = useState(null);
    const [profileLoading, setProfileLoading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        portalAPI.getDashboardStats()
            .then(res => setStats(res.data))
            .catch(err => console.error('Overview stats error:', err))
            .finally(() => setLoading(false));
    }, []);

    const handleProfileToggle = () => {
        const next = !profileOpen;
        setProfileOpen(next);
        if (next && !profile) {
            setProfileLoading(true);
            portalAPI.getMyProfile()
                .then(res => setProfile(res.data))
                .catch(err => console.error('Profile fetch error:', err))
                .finally(() => setProfileLoading(false));
        }
    };

    const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const cards = [
        {
            label: 'Running engagements',
            value: stats ? `${stats.active_placements}` : '0',
            hint: stats?.active_placements === 1 ? 'engagement' : 'engagements',
            icon: Rocket,
            onClick: () => navigate(`${PATHS.myEngagements}?filter=ACTIVE`),
        },
        {
            label: 'Hours this week',
            value: stats ? `${stats.hours_this_week}` : '0',
            hint: 'hrs logged (Mon–Sun)',
            icon: CalendarDays,
            onClick: () => navigate(PATHS.myTimeLogs),
        },
        {
            label: 'Time logs to submit',
            value: stats ? `${stats.pending_timesheets}` : '0',
            hint: stats?.pending_timesheets > 0 ? 'need attention' : 'all up to date',
            icon: stats?.pending_timesheets > 0 ? AlertCircle : Hourglass,
            onClick: () => navigate(`${PATHS.myTimeLogs}?tab=NOT_SUBMITTED`),
        },
        {
            label: 'Net balance',
            value: stats ? fmt$(stats.net_balance) : '$0.00',
            hint: 'from your earnings ledger',
            icon: TrendingUp,
            onClick: () => navigate(PATHS.myLedger),
        },
    ];

    const immigrations = profile?.immigrations || [];

    return (
        <div className="mx-auto max-w-[1600px] space-y-4">
            <PageHero
                icon={Gauge}
                eyebrow="My work"
                title="My overview"
                description="Your engagements, hours and balance at a glance."
                actions={
                    <Btn icon={User} onClick={handleProfileToggle} aria-expanded={profileOpen}>
                        {profileOpen ? 'Hide profile' : 'My profile'}
                        <ChevronDown size={14} className={`transition-transform duration-300 ${profileOpen ? 'rotate-180' : ''}`} />
                    </Btn>
                }
            >
                <StatRail>
                    {cards.map((card) => (
                        <StatTile key={card.label} label={card.label} icon={card.icon} value={loading ? '…' : card.value} hint={loading ? undefined : card.hint} onClick={card.onClick} />
                    ))}
                </StatRail>
            </PageHero>

            {profileOpen && (
                profileLoading ? (
                    <LoadingState text="Loading profile…" />
                ) : !profile ? (
                    <div className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface)">
                        <EmptyState icon={User} title="Profile not found" />
                    </div>
                ) : (
                    <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
                        <section className="rounded-[26px] border border-(--border-subtle) bg-(--bg-surface) p-6 text-center">
                            <Avatar name={`${profile.first_name} ${profile.last_name}`} size={84} ring className="mx-auto" />
                            <p className="mt-4 text-xl font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{profile.first_name} {profile.last_name}</p>
                            <p className="text-sm text-(--brand-primary)">{profile.title || 'Consultant'}</p>
                            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                                <Chip tone="slate">{profile.employee_code}</Chip>
                                <Chip tone={profile.is_active ? 'green' : 'rose'}>{profile.is_active ? 'Active' : 'Inactive'}</Chip>
                                {profile.e_verification_code && <Chip tone="sky" icon={BadgeCheck}>E-Verified</Chip>}
                            </div>
                            <div className="mt-6 space-y-3 border-t border-(--border-subtle) pt-5 text-left">
                                <Fact icon={Mail} label="Work email" value={profile.work_email || '—'} />
                                {profile.personal_email && <Fact icon={Mail} label="Personal email" value={profile.personal_email} />}
                                {profile.phone_number && <Fact icon={Phone} label="Phone" value={`${profile.phone_dial_code || ''} ${profile.phone_number}`} />}
                            </div>
                            <p className="mt-6 text-xs text-(--text-muted)">Contact Talent Ops to update your information.</p>
                        </section>

                        <div className="space-y-5">
                            <Panel icon={User} title="Personal details">
                                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                                    <Fact icon={Briefcase} label="Consultant type" value={profile.employee_type_name} />
                                    <Fact icon={Cake} label="Date of birth" value={fmtDate(profile.birth_date)} />
                                    <Fact icon={Users} label="Gender" value={profile.gender_name} />
                                    <Fact icon={Heart} label="Marital status" value={profile.marital_status_name} />
                                    <Fact icon={CalendarDays} label="Joining date" value={fmtDate(profile.joining_date)} />
                                    <Fact icon={MapPin} label="Country" value={profile.country_name} />
                                    {profile.e_verification_code && (
                                        <Fact icon={BadgeCheck} label="E-Verification" value={profile.e_verification_code} mono />
                                    )}
                                </div>
                            </Panel>

                            {immigrations.length > 0 && (
                                <Panel icon={Globe} title="Work authorization" subtitle={`${immigrations.length} record${immigrations.length !== 1 ? 's' : ''}`}>
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {immigrations.map((imm, i) => (
                                            <div key={imm.id || i} className="rounded-[18px] border border-(--border-subtle) bg-(--bg-app)/50 p-4">
                                                <Chip tone="brand">{imm.status_name}</Chip>
                                                <div className="mt-3 grid grid-cols-2 gap-3">
                                                    <Fact label="Start" value={fmtDate(imm.start_date)} />
                                                    <Fact label="Till" value={fmtDate(imm.till_date)} />
                                                    {imm.lca_wage && <Fact label="LCA wage" value={`${fmt$(imm.lca_wage)}/yr`} className="col-span-2" />}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </Panel>
                            )}
                        </div>
                    </div>
                )
            )}
        </div>
    );
};

export default EmployeeDashboard;
