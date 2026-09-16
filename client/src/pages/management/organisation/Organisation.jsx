import { useState, useEffect } from 'react';
import {
    Settings2, Users, Shield, Calculator, Plus, Upload, Mail, Save, Loader2, Image as ImageIcon, Power, Trash2, Eye, EyeOff,
    Building2, Globe, MapPin, Palette, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import AddHRModal from './AddHRModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import { resolveFileUrl } from '../../../utils/fileUrl';
import { roleLabel } from '../../../utils/constants';
import { PageHero, StatRail, StatTile, Panel, Fact, Btn, Chip, Avatar, Notice, EmptyState, LoadingState } from '../../../components/ui/kit';

const MemberCard = ({ member, canDelete, onToggle, onDelete }) => {
    const [showPw, setShowPw] = useState(false);
    return (
        <div className="rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5 transition-colors hover:border-(--brand-primary)/35">
            <div className="flex items-start gap-3">
                <Avatar name={member.name} size={44} />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-(--text-main)">{member.name}</p>
                    <p className="truncate text-xs text-(--text-muted)">{member.email}</p>
                </div>
                <Chip tone={member.is_active ? 'green' : 'rose'}>{member.is_active ? 'Active' : 'Suspended'}</Chip>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 rounded-[14px] bg-(--bg-app)/60 px-3 py-2">
                <span className="text-[11px] text-(--text-muted)">Password</span>
                <span className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-(--text-main)">{showPw ? (member.password || '—') : '••••••••'}</span>
                    <button type="button" onClick={() => setShowPw(p => !p)} className="shrink-0 text-(--text-muted) outline-none hover:text-(--text-main)">
                        {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                </span>
            </div>

            <div className="mt-4 flex justify-end gap-2">
                <Btn
                    size="sm"
                    variant={member.is_active ? 'warn' : 'success'}
                    icon={Power}
                    onClick={() => onToggle(member.id, member.is_active)}
                    title={member.is_active ? 'Suspend access' : 'Restore access'}
                >
                    {member.is_active ? 'Suspend' : 'Restore'}
                </Btn>
                {canDelete && (
                    <Btn size="icon" variant="danger" icon={Trash2} onClick={() => onDelete(member.id)} title="Delete account" />
                )}
            </div>
        </div>
    );
};

const Organisation = () => {
    const userRole = localStorage.getItem('userRole');
    const canDelete = userRole === 'ORG_ADMIN';

    const [activeTab, setActiveTab] = useState('DETAILS');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    const [orgDetails, setOrgDetails] = useState({ name: '', domain: '', address: '', accounts_email: '', logo_url: '' });
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState(null);
    const [savingDetails, setSavingDetails] = useState(false);

    const [team, setTeam] = useState([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [modalRole, setModalRole] = useState('HR');

    const fetchData = async () => {
        setLoading(true);
        try {
            const orgRes = await managementAPI.getOrganizationDetails();
            setOrgDetails({
                name: orgRes.data.name || '',
                domain: orgRes.data.domain || '',
                address: orgRes.data.address || '',
                accounts_email: orgRes.data.accounts_email || '',
                logo_url: orgRes.data.logo_url || ''
            });
            if (orgRes.data.logo_url) setLogoPreview(resolveFileUrl(orgRes.data.logo_url));

            const teamDataRes = await managementAPI.getOrganizationTeam();
            setTeam(teamDataRes.data);
        } catch (err) {
            console.error("Failed to load workspace data", err);
            setError("Failed to load workspace data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSaveDetails = async () => {
        setSavingDetails(true);
        setError('');
        setSuccessMsg('');
        try {
            const formData = new FormData();
            formData.append('accounts_email', orgDetails.accounts_email);
            if (logoFile) formData.append('logo', logoFile);
            await managementAPI.updateOrganizationDetails(formData);
            setSuccessMsg("Workspace details updated.");
            fetchData();
        } catch (err) {
            setError(err.response?.data?.error || "Failed to update details.");
        } finally {
            setSavingDetails(false);
        }
    };

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
        }
    };

    const handleToggleAccess = async (id, currentStatus) => {
        try {
            await managementAPI.toggleTeamAccess(id, { is_active: !currentStatus });
            fetchData();
        } catch (err) {
            alert(err.response?.data?.error || "Failed to update access.");
        }
    };

    const handleDeleteMember = async (id) => {
        if (!window.confirm("Are you sure you want to permanently delete this account?")) return;
        try {
            await managementAPI.deleteTeamMember(id);
            fetchData();
        } catch (err) {
            alert(err.response?.data?.error || "Failed to delete account.");
        }
    };

    const hrUsers          = team.filter(u => u.role === 'HR');
    const adminUsers       = team.filter(u => u.role === 'ORG_ADMIN');
    const accountantUsers  = team.filter(u => u.role === 'ACCOUNTANT');

    const TEAM = {
        ADMINS:      { role: 'ORG_ADMIN',  users: adminUsers,      icon: Shield,     title: 'Workspace admins', desc: 'Full access to settings, talent and financial data.', empty: 'No additional admins found.' },
        ACCOUNTANTS: { role: 'ACCOUNTANT', users: accountantUsers, icon: Calculator, title: 'Finance leads',    desc: 'Full access to every module except delete operations.', empty: 'No finance leads found.' },
        HR:          { role: 'HR',         users: hrUsers,         icon: Users,      title: 'Talent ops',       desc: 'Handles time logs, talent and engagements, but cannot alter core settings.', empty: 'No talent ops members found.' },
    };

    const team_ = TEAM[activeTab];

    return (
        <div className="mx-auto max-w-[1600px] space-y-4">
            <PageHero
                icon={Settings2}
                eyebrow="Workspace"
                title="Workspace"
                description="Your company profile, billing mailbox, brand mark and the people who run the console."
            >
                <StatRail>
                    <StatTile label="Profile" icon={Building2} value={orgDetails.name ? '1' : '—'} hint="Company & brand" active={activeTab === 'DETAILS'} onClick={() => setActiveTab('DETAILS')} />
                    <StatTile label="Workspace admins" icon={Shield} value={adminUsers.length} active={activeTab === 'ADMINS'} onClick={() => setActiveTab('ADMINS')} />
                    <StatTile label="Finance leads" icon={Calculator} value={accountantUsers.length} active={activeTab === 'ACCOUNTANTS'} onClick={() => setActiveTab('ACCOUNTANTS')} />
                    <StatTile label="Talent ops" icon={Users} value={hrUsers.length} active={activeTab === 'HR'} onClick={() => setActiveTab('HR')} />
                </StatRail>
            </PageHero>

            {activeTab === 'DETAILS' && (
                <div className="space-y-5">
                    {error && <Notice tone="rose" icon={AlertTriangle}>{error}</Notice>}
                    {successMsg && <Notice tone="green" icon={CheckCircle2}>{successMsg}</Notice>}

                    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                        <div className="space-y-5">
                            <Panel icon={Building2} title="Identity" subtitle="Managed by the platform owner">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Fact icon={Building2} label="Company" value={orgDetails.name} />
                                    <Fact icon={Globe} label="Domain" value={orgDetails.domain} />
                                    <Fact icon={MapPin} label="Address" value={orgDetails.address} className="sm:col-span-2" />
                                </div>
                                <p className="mt-4 text-xs text-(--text-muted)">To change core company details, contact platform support.</p>
                            </Panel>

                            <Panel icon={Mail} title="Billing mailbox" subtitle="BCC'd on every outbound invoice email">
                                <input
                                    type="email"
                                    value={orgDetails.accounts_email}
                                    onChange={(e) => setOrgDetails({ ...orgDetails, accounts_email: e.target.value })}
                                    placeholder="e.g. accounts@yourcompany.com"
                                    className="nx-input"
                                />
                            </Panel>
                        </div>

                        <Panel icon={Palette} title="Brand mark" subtitle="Printed on generated invoice PDFs · PNG or JPG, max 2MB">
                            <label className="group relative flex aspect-[4/3] max-w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[22px] border-2 border-dashed border-(--border-subtle) bg-(--bg-app)/60 transition-colors hover:border-(--brand-primary)/50">
                                {logoPreview ? (
                                    <img src={logoPreview} alt="Workspace logo" className="h-full w-full object-contain p-6" />
                                ) : (
                                    <span className="flex flex-col items-center text-(--text-muted)">
                                        <ImageIcon size={30} className="mb-2 opacity-50" />
                                        <span className="text-sm">No logo yet</span>
                                    </span>
                                )}
                                <span className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                    <Upload size={22} className="mb-2 text-white" />
                                    <span className="text-sm font-semibold text-white">Change logo</span>
                                </span>
                                <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleLogoChange} />
                            </label>
                            {logoFile && <p className="mt-3 text-xs font-medium text-(--brand-primary)">New file selected: {logoFile.name}</p>}
                        </Panel>
                    </div>

                    <div className="flex justify-end">
                        <Btn variant="primary" icon={savingDetails ? Loader2 : Save} onClick={handleSaveDetails} disabled={savingDetails}>
                            Save changes
                        </Btn>
                    </div>
                </div>
            )}

            {team_ && (
                <Panel
                    icon={team_.icon}
                    title={team_.title}
                    subtitle={team_.desc}
                    actions={
                        <Btn size="sm" variant="primary" icon={Plus} onClick={() => { setModalRole(team_.role); setIsAddModalOpen(true); }}>
                            Add {roleLabel(team_.role).toLowerCase()}
                        </Btn>
                    }
                >
                    {loading ? (
                        <LoadingState />
                    ) : team_.users.length === 0 ? (
                        <EmptyState icon={team_.icon} title={team_.empty} />
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {team_.users.map(u => (
                                <MemberCard key={u.id} member={u} canDelete={canDelete} onToggle={handleToggleAccess} onDelete={handleDeleteMember} />
                            ))}
                        </div>
                    )}
                </Panel>
            )}

            <AuditLogPanel module="organisation" />

            {isAddModalOpen && (
                <AddHRModal
                    isOpen={isAddModalOpen}
                    onClose={() => setIsAddModalOpen(false)}
                    onRefresh={fetchData}
                    role={modalRole}
                />
            )}
        </div>
    );
};

export default Organisation;
