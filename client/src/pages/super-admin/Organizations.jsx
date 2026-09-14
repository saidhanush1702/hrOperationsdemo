import { useState, useEffect } from 'react';
import { Building2, Plus, Globe, ChevronRight } from 'lucide-react';
import { superAdminAPI } from '../../api/apiService';
import RegisterOrgModal from './RegisterOrgModal';
import OrgDetailModal from './OrgDetailModal';

const Organizations = () => {
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRegisterOpen, setIsRegisterOpen] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState(null);

    const fetchOrgs = async () => {
        try {
            const res = await superAdminAPI.getOrganizations();
            setOrgs(res.data);
        } catch (err) {
            console.error("Failed to fetch organizations", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOrgs(); }, []);

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

            <div className="flex justify-between items-center bg-(--bg-surface) p-8 rounded-2xl border border-(--border-subtle) shadow-sm transition-colors duration-300">
                <div>
                    <h1 className="text-2xl font-bold uppercase tracking-tight italic flex items-center gap-3 text-(--text-main) transition-colors duration-300">
                        <Building2 size={28} /> Organization Directory
                    </h1>
                    <p className="text-sm text-(--text-muted) mt-1 uppercase tracking-widest font-medium transition-colors duration-300">
                        Global Tenant Management & Infrastructure
                    </p>
                </div>
                <button
                    onClick={() => setIsRegisterOpen(true)}
                    className="bg-(--brand-primary) text-(--brand-primary-text) px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center gap-2 shadow-lg active:scale-95"
                >
                    <Plus size={16} /> Register New Org
                </button>
            </div>

            <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm overflow-x-auto transition-colors duration-300">
                <table className="w-full text-left">
                    <thead className="bg-(--bg-app) text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) transition-colors duration-300">
                        <tr>
                            <th className="px-4 sm:px-8 py-4 sm:py-5">Organization &amp; Domain</th>
                            <th className="hidden sm:table-cell px-8 py-5">Admins</th>
                            <th className="px-4 sm:px-8 py-4 sm:py-5">Status</th>
                            <th className="px-4 sm:px-8 py-4 sm:py-5 text-right">Details</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-(--border-subtle)">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="px-4 sm:px-8 py-10 text-center text-(--text-muted) text-xs uppercase tracking-widest">
                                    Loading organizations...
                                </td>
                            </tr>
                        ) : orgs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-4 sm:px-8 py-10 text-center text-(--text-muted) text-xs uppercase tracking-widest">
                                    No organizations registered yet.
                                </td>
                            </tr>
                        ) : orgs.map(org => (
                            <tr
                                key={org.id}
                                onClick={() => setSelectedOrg(org)}
                                className={`hover:bg-(--bg-app) transition-colors duration-200 cursor-pointer ${!org.is_active ? 'opacity-60' : ''}`}
                            >
                                <td className="px-4 sm:px-8 py-4 sm:py-5">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-xl bg-(--bg-app) border border-(--border-subtle) flex items-center justify-center transition-colors duration-300">
                                            <Building2 size={20} className="text-(--text-muted)" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-(--text-main) uppercase tracking-tight">{org.name}</p>
                                            <div className="flex items-center gap-1 text-[10px] text-(--text-muted) font-bold uppercase">
                                                <Globe size={10} /> {org.domain || 'no-domain.com'}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="hidden sm:table-cell px-8 py-5">
                                    <span className="text-xs font-bold text-(--text-muted)">
                                        {org.admin_count ?? 0} admin{org.admin_count !== 1 ? 's' : ''}
                                    </span>
                                </td>
                                <td className="px-4 sm:px-8 py-4 sm:py-5">
                                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border transition-colors duration-300 ${
                                        org.is_active
                                            ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                            : 'bg-red-500/10 text-red-500 border-red-500/20'
                                    }`}>
                                        {org.is_active ? 'Active' : 'Suspended'}
                                    </span>
                                </td>
                                <td className="px-4 sm:px-8 py-4 sm:py-5 text-right">
                                    <ChevronRight size={16} className="text-(--text-muted) ml-auto" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <RegisterOrgModal
                isOpen={isRegisterOpen}
                onClose={() => setIsRegisterOpen(false)}
                onRefresh={fetchOrgs}
            />

            {selectedOrg && (
                <OrgDetailModal
                    org={selectedOrg}
                    onClose={() => setSelectedOrg(null)}
                    onStatusChange={() => { fetchOrgs(); setSelectedOrg(null); }}
                />
            )}
        </div>
    );
};

export default Organizations;
