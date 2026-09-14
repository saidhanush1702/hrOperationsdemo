import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Briefcase, Calendar, Clock, AlertCircle, TrendingUp, Loader2,
    User, ChevronDown, Phone, Mail, Globe, CreditCard
} from 'lucide-react';
import { portalAPI } from '../../../api/apiService';

import { fmtDate } from '../../../utils/dateUtils';

const StatCard = ({ label, value, icon: Icon, colorClass, subLabel, loading, onClick }) => (
    <div
        onClick={onClick}
        className={`bg-(--bg-surface) border border-(--border-subtle) p-5 rounded-2xl shadow-sm transition-all duration-300
            ${onClick ? 'cursor-pointer hover:border-(--brand-primary)/40 hover:shadow-md hover:-translate-y-0.5' : ''}`}
    >
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center mb-3 ${colorClass}/10`}>
            <Icon size={18} className={colorClass} />
        </div>
        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">{label}</p>
        {loading ? (
            <div className="h-7 w-24 bg-(--border-subtle) rounded animate-pulse mt-1" />
        ) : (
            <p className="text-xl font-bold text-(--text-main) mt-1">{value}</p>
        )}
        {subLabel && !loading && (
            <p className="text-[9px] text-(--text-muted) mt-1 font-bold uppercase tracking-widest">{subLabel}</p>
        )}
    </div>
);

const ProfileField = ({ label, value }) => (
    <div>
        <p className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest mb-0.5">{label}</p>
        <p className="text-xs font-bold text-(--text-main) break-words">{value || '—'}</p>
    </div>
);

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
            .catch(err => console.error('Dashboard stats error:', err))
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
            label: 'Active Placements',
            value: stats ? `${stats.active_placements}` : '0',
            subLabel: stats?.active_placements === 1 ? 'placement' : 'placements',
            icon: Briefcase,
            colorClass: 'text-(--brand-primary)',
            onClick: () => navigate('/portal/placements?filter=ACTIVE'),
        },
        {
            label: 'Hours This Week',
            value: stats ? `${stats.hours_this_week}` : '0',
            subLabel: 'hrs logged (Mon–Sun)',
            icon: Calendar,
            colorClass: 'text-blue-500',
            onClick: () => navigate('/portal/timesheets'),
        },
        {
            label: 'Pending Timesheets',
            value: stats ? `${stats.pending_timesheets}` : '0',
            subLabel: stats?.pending_timesheets > 0 ? 'need attention' : 'all up to date',
            icon: stats?.pending_timesheets > 0 ? AlertCircle : Clock,
            colorClass: stats?.pending_timesheets > 0 ? 'text-orange-500' : 'text-green-500',
            onClick: () => navigate('/portal/timesheets?tab=NOT_SUBMITTED'),
        },
        {
            label: 'Net Balance',
            value: stats ? fmt$(stats.net_balance) : '$0.00',
            subLabel: 'total earnings ledger',
            icon: TrendingUp,
            colorClass: (stats?.net_balance ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500',
            onClick: () => navigate('/portal/balance-sheet'),
        },
    ];

    const immigrations = profile?.immigrations || [];

    return (
        <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">

            {/* ── My Profile expandable bar ── */}
            <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm overflow-hidden">
                <button
                    onClick={handleProfileToggle}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-(--bg-app)/50 transition-colors outline-none"
                >
                    <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-(--brand-primary)/10 flex items-center justify-center text-(--brand-primary)">
                            <User size={14} />
                        </div>
                        <span className="text-xs font-bold text-(--text-main) uppercase tracking-widest">My Profile</span>
                    </div>
                    <ChevronDown
                        size={16}
                        className={`text-(--text-muted) transition-transform duration-300 ${profileOpen ? 'rotate-180' : ''}`}
                    />
                </button>

                {/* Expanded profile details */}
                {profileOpen && (
                    <div className="border-t border-(--border-subtle) px-5 py-4">
                        {profileLoading ? (
                            <div className="flex items-center justify-center py-8 gap-2 text-(--text-muted)">
                                <Loader2 size={18} className="animate-spin text-(--brand-primary)" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Loading profile…</span>
                            </div>
                        ) : !profile ? (
                            <div className="flex items-center justify-center py-8 text-(--text-muted)">
                                <p className="text-[10px] font-bold uppercase tracking-widest">Profile not found.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Avatar + name */}
                                <div className="flex items-center gap-4 p-4 bg-(--brand-primary)/5 border border-(--brand-primary)/20 rounded-xl">
                                    <div className="h-12 w-12 rounded-xl bg-(--brand-primary)/10 border border-(--brand-primary)/20 flex items-center justify-center text-(--brand-primary) text-base font-bold uppercase shrink-0">
                                        {profile.first_name?.[0]}{profile.last_name?.[0]}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-(--text-main) tracking-tight">
                                            {profile.first_name} {profile.last_name}
                                        </p>
                                        <p className="text-[10px] text-(--brand-primary) font-bold tracking-widest mt-0.5">
                                            {profile.title || 'Employee'}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                            <span className="text-[9px] font-mono font-bold text-(--text-muted) bg-(--bg-app) px-2 py-0.5 rounded border border-(--border-subtle)">
                                                {profile.employee_code}
                                            </span>
                                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                                                profile.is_active
                                                    ? 'bg-green-500/10 text-green-600 border-green-500/20'
                                                    : 'bg-red-500/10 text-red-600 border-red-500/20'
                                            }`}>
                                                {profile.is_active ? 'Active' : 'Inactive'}
                                            </span>
                                            {profile.e_verification_code && (
                                                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-600 border-blue-500/20">
                                                    E-Verified
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Details grid */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    <ProfileField label="Employee Type"  value={profile.employee_type_name} />
                                    <ProfileField label="Date of Birth"  value={fmtDate(profile.birth_date)} />
                                    <ProfileField label="Gender"         value={profile.gender_name} />
                                    <ProfileField label="Marital Status" value={profile.marital_status_name} />
                                    <ProfileField label="Joining Date"   value={fmtDate(profile.joining_date)} />
                                    <ProfileField label="Country"        value={profile.country_name} />
                                    {profile.e_verification_code && (
                                        <ProfileField label="E-Verification" value={profile.e_verification_code} />
                                    )}
                                </div>

                                {/* Contact */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-(--border-subtle)">
                                    <div className="flex items-center gap-2">
                                        <Mail size={13} className="text-(--text-muted) shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest">Work Email</p>
                                            <p className="text-xs font-bold text-(--text-main) truncate">{profile.work_email || '—'}</p>
                                        </div>
                                    </div>
                                    {profile.personal_email && (
                                        <div className="flex items-center gap-2">
                                            <Mail size={13} className="text-(--text-muted) shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest">Personal Email</p>
                                                <p className="text-xs font-bold text-(--text-main) truncate">{profile.personal_email}</p>
                                            </div>
                                        </div>
                                    )}
                                    {profile.phone_number && (
                                        <div className="flex items-center gap-2">
                                            <Phone size={13} className="text-(--text-muted) shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-[9px] font-bold text-(--text-muted) uppercase tracking-widest">Phone</p>
                                                <p className="text-xs font-bold text-(--text-main)">
                                                    {profile.phone_dial_code} {profile.phone_number}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Immigration records */}
                                {immigrations.length > 0 && (
                                    <div className="pt-2 border-t border-(--border-subtle)">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Globe size={13} className="text-(--text-muted)" />
                                            <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">
                                                Immigration Records
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            {immigrations.map((imm, i) => (
                                                <div key={imm.id || i} className="bg-(--bg-app) rounded-xl border border-(--border-subtle) px-3 py-2 grid grid-cols-3 gap-2">
                                                    <ProfileField label="Status"     value={imm.status_name} />
                                                    <ProfileField label="Start"      value={fmtDate(imm.start_date)} />
                                                    <ProfileField label="Till"       value={fmtDate(imm.till_date)} />
                                                    {imm.lca_wage && (
                                                        <div className="col-span-3">
                                                            <ProfileField label="LCA Wage" value={`${fmt$(imm.lca_wage)}/yr`} />
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <p className="text-[9px] text-(--text-muted) text-center font-bold uppercase tracking-widest pt-1">
                                    Contact HR to update your information
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {cards.map((card, i) => (
                    <StatCard key={i} {...card} loading={loading} />
                ))}
            </div>
        </div>
    );
};

export default EmployeeDashboard;
