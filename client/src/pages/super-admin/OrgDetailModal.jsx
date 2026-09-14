import { useState, useEffect } from 'react';
import { Building2, Globe, MapPin, Users, Mail, Eye, EyeOff, Power, PowerOff, Loader2, ShieldOff, ShieldCheck } from 'lucide-react';
import BaseModal from '../../components/ui/BaseModal';
import { superAdminAPI } from '../../api/apiService';

const OrgDetailModal = ({ org, onClose, onStatusChange }) => {
    const [admins, setAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [visiblePasswords, setVisiblePasswords] = useState({});
    const [suspending, setSuspending] = useState(false);

    useEffect(() => {
        if (!org) return;
        setLoading(true);
        setVisiblePasswords({});
        superAdminAPI.getOrgAdmins(org.id)
            .then(res => setAdmins(res.data))
            .catch(() => setAdmins([]))
            .finally(() => setLoading(false));
    }, [org?.id]);

    const togglePasswordVisibility = (adminId) => {
        setVisiblePasswords(prev => ({ ...prev, [adminId]: !prev[adminId] }));
    };

    const handleToggleSuspend = async () => {
        const action = org.is_active ? 'suspend' : 'activate';
        if (!window.confirm(`Are you sure you want to ${action} "${org.name}"? This will ${org.is_active ? 'block all users from logging in' : 'restore access for all users'}.`)) return;
        setSuspending(true);
        try {
            await superAdminAPI.toggleOrganizationStatus(org.id, org.is_active);
            onStatusChange();
        } catch {
            alert(`Failed to ${action} organization.`);
        } finally {
            setSuspending(false);
        }
    };

    const suspendButton = org && (
        <button
            onClick={handleToggleSuspend}
            disabled={suspending}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 ${
                org.is_active
                    ? 'bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500 hover:text-white'
                    : 'bg-green-500/10 text-green-500 border border-green-500/30 hover:bg-green-500 hover:text-white'
            }`}
        >
            {suspending
                ? <Loader2 size={14} className="animate-spin" />
                : org.is_active
                    ? <><PowerOff size={14} /> Suspend Organization</>
                    : <><Power size={14} /> Activate Organization</>
            }
        </button>
    );

    const statusBadge = org && (
        <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${
            org.is_active
                ? 'bg-green-500/10 text-green-500 border-green-500/20'
                : 'bg-red-500/10 text-red-500 border-red-500/20'
        }`}>
            {org.is_active ? <ShieldCheck size={11} /> : <ShieldOff size={11} />}
            {org.is_active ? 'Active' : 'Suspended'}
        </span>
    );

    return (
        <BaseModal
            isOpen={!!org}
            onClose={onClose}
            icon={<Building2 size={18} />}
            title={org?.name ?? ''}
            subtitle="Organization Details"
            headerRight={statusBadge}
            footer={suspendButton}
        >
            <div className="space-y-6">
                {/* Org Info */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-(--bg-app) rounded-2xl p-4 border border-(--border-subtle) space-y-1">
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1.5">
                            <Globe size={10} /> Domain
                        </p>
                        <p className="text-sm font-semibold text-(--text-main)">{org?.domain || '—'}</p>
                    </div>
                    <div className="bg-(--bg-app) rounded-2xl p-4 border border-(--border-subtle) space-y-1">
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1.5">
                            <Users size={10} /> Admins
                        </p>
                        <p className="text-sm font-semibold text-(--text-main)">{org?.admin_count ?? '—'}</p>
                    </div>
                    <div className="col-span-2 bg-(--bg-app) rounded-2xl p-4 border border-(--border-subtle) space-y-1">
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1.5">
                            <MapPin size={10} /> Address
                        </p>
                        <p className="text-sm font-semibold text-(--text-main)">{org?.address || '—'}</p>
                    </div>
                </div>

                {/* Suspension warning */}
                {org && !org.is_active && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-red-500/10 text-red-500 border-red-500/20 text-xs font-bold uppercase tracking-widest">
                        <ShieldOff size={15} />
                        Organization is Suspended — all portal access is blocked
                    </div>
                )}

                {/* Admin Credentials */}
                <div className="space-y-3">
                    <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1.5">
                        <Users size={10} /> Org Admin Credentials
                    </p>

                    {loading ? (
                        <div className="flex items-center justify-center py-10 text-(--text-muted)">
                            <Loader2 size={20} className="animate-spin mr-2" /> Loading...
                        </div>
                    ) : admins.length === 0 ? (
                        <p className="text-sm text-(--text-muted) text-center py-8">No org admins found.</p>
                    ) : (
                        <div className="space-y-3">
                            {admins.map(admin => (
                                <div key={admin.id} className="bg-(--bg-app) border border-(--border-subtle) rounded-2xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <div className="h-9 w-9 rounded-xl bg-(--bg-surface) border border-(--border-subtle) flex items-center justify-center text-sm font-bold text-(--text-muted) uppercase">
                                                {(admin.first_name?.[0] || admin.email[0]).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-(--text-main)">
                                                    {admin.first_name || admin.last_name
                                                        ? `${admin.first_name || ''} ${admin.last_name || ''}`.trim()
                                                        : '—'}
                                                </p>
                                                <span className={`text-[10px] font-bold uppercase ${admin.is_active ? 'text-green-500' : 'text-red-400'}`}>
                                                    {admin.is_active ? 'Active' : 'Deactivated'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-2.5">
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1">
                                                <Mail size={9} /> Username / Email
                                            </p>
                                            <p className="text-xs font-mono bg-(--bg-surface) border border-(--border-subtle) rounded-xl px-3 py-2.5 text-(--text-main) select-all">
                                                {admin.email}
                                            </p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Password</p>
                                            <div className="flex items-center gap-2">
                                                <p className="flex-1 text-xs font-mono bg-(--bg-surface) border border-(--border-subtle) rounded-xl px-3 py-2.5 text-(--text-main) select-all">
                                                    {visiblePasswords[admin.id] ? admin.password : '••••••••••'}
                                                </p>
                                                <button
                                                    onClick={() => togglePasswordVisibility(admin.id)}
                                                    className="p-2.5 rounded-xl text-(--text-muted) hover:text-(--text-main) bg-(--bg-surface) border border-(--border-subtle) hover:border-(--text-main) transition-colors"
                                                    title={visiblePasswords[admin.id] ? 'Hide password' : 'Show password'}
                                                >
                                                    {visiblePasswords[admin.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </BaseModal>
    );
};

export default OrgDetailModal;
