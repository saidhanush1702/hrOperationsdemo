import { useState, useEffect } from 'react';
import { Globe, MapPin, Users, Mail, Eye, EyeOff, Power, PowerOff, Loader2, ShieldOff, ShieldCheck, LayoutGrid, KeyRound } from 'lucide-react';
import BaseModal from '../../components/ui/BaseModal';
import { superAdminAPI } from '../../api/apiService';
import { DetailLayout, SectionTitle, Fact, Chip, Btn, Avatar, EmptyState } from '../../components/ui/kit';

const OrgDetailModal = ({ org, onClose, onStatusChange }) => {
    const [admins, setAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [visiblePasswords, setVisiblePasswords] = useState({});
    const [suspending, setSuspending] = useState(false);
    const [section, setSection] = useState('overview');

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
            alert(`Failed to ${action} tenant.`);
        } finally {
            setSuspending(false);
        }
    };

    const aside = org && (
        <div>
            <span className="flex h-16 w-16 items-center justify-center rounded-[20px] text-2xl font-semibold text-white" style={{ background: 'var(--brand-gradient)' }}>
                {(org.name || '?').slice(0, 1).toUpperCase()}
            </span>
            <p className="mt-4 text-xl font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{org.name}</p>
            <p className="text-xs text-(--text-muted)">{org.domain || 'no-domain.com'}</p>
            <div className="mt-3">
                <Chip tone={org.is_active ? 'green' : 'rose'} icon={org.is_active ? ShieldCheck : ShieldOff}>{org.is_active ? 'Live' : 'Suspended'}</Chip>
            </div>
            <div className="mt-6">
                <Btn
                    variant={org.is_active ? 'danger' : 'success'}
                    icon={suspending ? Loader2 : org.is_active ? PowerOff : Power}
                    onClick={handleToggleSuspend}
                    disabled={suspending}
                    className="w-full"
                >
                    {org.is_active ? 'Suspend tenant' : 'Reactivate tenant'}
                </Btn>
            </div>
        </div>
    );

    return (
        <BaseModal
            isOpen={!!org}
            onClose={onClose}
            icon={<Globe size={18} />}
            title={org?.name ?? ''}
            subtitle="Tenant profile"
            noPadding
        >
            <DetailLayout
                aside={aside}
                active={section}
                onSelect={setSection}
                sections={[
                    { key: 'overview', label: 'Overview', icon: LayoutGrid },
                    { key: 'owners', label: 'Owner accounts', icon: KeyRound, count: loading ? undefined : admins.length },
                ]}
            >
                {section === 'overview' && (
                    <div className="space-y-5">
                        <SectionTitle icon={LayoutGrid} title="Overview" subtitle="Identity of this workspace" />
                        {org && !org.is_active && (
                            <div className="flex items-center gap-3 rounded-[16px] border border-rose-500/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
                                <ShieldOff size={16} /> This tenant is suspended — all portal access is blocked.
                            </div>
                        )}
                        <div className="grid gap-4 rounded-[22px] border border-(--border-subtle) p-5 sm:grid-cols-2">
                            <Fact icon={Globe} label="Domain" value={org?.domain} />
                            <Fact icon={Users} label="Owner accounts" value={org?.admin_count} />
                            <Fact icon={MapPin} label="Address" value={org?.address} className="sm:col-span-2" />
                        </div>
                    </div>
                )}

                {section === 'owners' && (
                    <div>
                        <SectionTitle icon={KeyRound} title="Owner accounts" subtitle="Sign-in credentials for this tenant's admins" />
                        {loading ? (
                            <div className="flex items-center justify-center py-10 text-sm text-(--text-muted)">
                                <Loader2 size={18} className="mr-2 animate-spin" /> Loading…
                            </div>
                        ) : admins.length === 0 ? (
                            <EmptyState icon={KeyRound} title="No owner accounts found" />
                        ) : (
                            <div className="grid gap-4 xl:grid-cols-2">
                                {admins.map(admin => {
                                    const name = admin.first_name || admin.last_name
                                        ? `${admin.first_name || ''} ${admin.last_name || ''}`.trim()
                                        : '—';
                                    return (
                                        <div key={admin.id} className="rounded-[22px] border border-(--border-subtle) bg-(--bg-app)/40 p-5">
                                            <div className="flex items-center gap-3">
                                                <Avatar name={name !== '—' ? name : admin.email} size={42} />
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-(--text-main)">{name}</p>
                                                    <Chip tone={admin.is_active ? 'green' : 'rose'}>{admin.is_active ? 'Active' : 'Deactivated'}</Chip>
                                                </div>
                                            </div>
                                            <div className="mt-4 space-y-3">
                                                <div>
                                                    <p className="nx-label flex items-center gap-1"><Mail size={11} /> Username / Email</p>
                                                    <p className="select-all rounded-[12px] border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 font-mono text-xs text-(--text-main)">{admin.email}</p>
                                                </div>
                                                <div>
                                                    <p className="nx-label">Password</p>
                                                    <div className="flex items-center gap-2">
                                                        <p className="flex-1 select-all rounded-[12px] border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 font-mono text-xs text-(--text-main)">
                                                            {visiblePasswords[admin.id] ? admin.password : '••••••••••'}
                                                        </p>
                                                        <Btn
                                                            size="icon"
                                                            icon={visiblePasswords[admin.id] ? EyeOff : Eye}
                                                            onClick={() => togglePasswordVisibility(admin.id)}
                                                            title={visiblePasswords[admin.id] ? 'Hide password' : 'Show password'}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </DetailLayout>
        </BaseModal>
    );
};

export default OrgDetailModal;
