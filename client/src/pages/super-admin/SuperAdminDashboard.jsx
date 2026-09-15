import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Users, ShieldAlert, Activity, ArrowUpRight, Building2 } from 'lucide-react';
import { superAdminAPI } from '../../api/apiService';
import { PageHero, Btn } from '../../components/ui/kit';
import { PATHS } from '../../utils/constants';

const SuperAdminDashboard = () => {
    const navigate = useNavigate();
    const [stats, setStats] = useState({ totalOrgs: 0, totalUsers: 0, activeSessions: 0, systemHealth: 'Healthy' });

    useEffect(() => {
        superAdminAPI.getStats()
            .then(res => setStats(prev => ({ ...prev, ...res.data })))
            .catch(err => console.error('Failed to load super admin stats', err));
    }, []);

    const cards = [
        { label: 'Tenants',         value: stats.totalOrgs,      icon: Building2,   note: 'Workspaces hosted on the platform' },
        { label: 'Platform users',  value: stats.totalUsers,     icon: Users,       note: 'Accounts across every tenant' },
        { label: 'Active sessions', value: stats.activeSessions, icon: Activity,    note: 'People signed in right now' },
        { label: 'System status',   value: stats.systemHealth,   icon: ShieldAlert, note: 'Overall platform health' },
    ];

    return (
        <div className="mx-auto max-w-7xl space-y-6">
            <PageHero
                icon={Globe}
                eyebrow="Platform"
                title="Mission control"
                description="Global oversight of every tenant workspace and the health of the platform."
                actions={<Btn variant="primary" icon={ArrowUpRight} onClick={() => navigate(PATHS.tenants)}>Open tenants</Btn>}
            />

            <div className="grid gap-4 md:grid-cols-2">
                {cards.map((card) => (
                    <div key={card.label} className="relative overflow-hidden rounded-[26px] border border-(--border-subtle) bg-(--bg-surface) p-6">
                        <div aria-hidden="true" className="absolute -bottom-12 -right-12 h-44 w-44 rounded-full border border-(--brand-primary)/15" />
                        <div aria-hidden="true" className="absolute -bottom-4 -right-4 h-24 w-24 rounded-full border border-(--brand-secondary)/20" />
                        <div className="relative flex items-center gap-5">
                            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-(--brand-primary)/10 text-(--brand-primary)">
                                <card.icon size={24} />
                            </span>
                            <div className="min-w-0">
                                <p className="text-sm text-(--text-muted)">{card.label}</p>
                                <p className="truncate text-4xl font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{card.value}</p>
                                <p className="mt-0.5 text-xs text-(--text-muted)">{card.note}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default SuperAdminDashboard;
