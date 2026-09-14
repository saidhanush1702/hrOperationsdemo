import { useState, useEffect } from 'react';
import { Building2, Users, ShieldAlert, Activity } from 'lucide-react';
import { superAdminAPI } from '../../api/apiService';

const SuperAdminDashboard = () => {
    const [stats, setStats] = useState({ totalOrgs: 0, totalUsers: 0, activeSessions: 0, systemHealth: 'Healthy' });

    useEffect(() => {
        superAdminAPI.getStats()
            .then(res => setStats(prev => ({ ...prev, ...res.data })))
            .catch(err => console.error('Failed to load super admin stats', err));
    }, []);



    const cards = [
        { label: 'Total Organizations', value: stats.totalOrgs, icon: Building2 },
        { label: 'Platform Users', value: stats.totalUsers, icon: Users },
        { label: 'Active Sessions', value: stats.activeSessions, icon: Activity },
        { label: 'System Status', value: stats.systemHealth, icon: ShieldAlert },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div>
                <h1 className="text-2xl font-bold text-(--text-main) tracking-tight uppercase transition-colors">System Infrastructure</h1>
                <p className="text-sm text-(--text-muted) transition-colors">Global oversight of all tenant organizations and platform health.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {cards.map((card, i) => (
                    <div key={i} className="bg-(--bg-surface) border border-(--border-subtle) p-6 rounded-xl hover:border-(--text-main) transition-all group duration-300">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-(--bg-app) text-(--text-muted) rounded-lg group-hover:bg-(--text-main) group-hover:text-(--bg-surface) transition-colors">
                                <card.icon size={20} />
                            </div>
                        </div>
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest transition-colors">{card.label}</p>
                        <p className="text-3xl font-bold text-(--text-main) mt-1 transition-colors">{card.value}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};
export default SuperAdminDashboard;