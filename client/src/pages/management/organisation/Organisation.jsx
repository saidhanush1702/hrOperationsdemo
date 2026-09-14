import { useState, useEffect } from 'react';
import { Building2, Users, Shield, Calculator, Plus, Upload, Mail, Save, Loader2, Image as ImageIcon, Power, Trash2, Eye, EyeOff } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import AddHRModal from './AddHRModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';

import { resolveFileUrl } from '../../../utils/fileUrl';

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
            console.error("Failed to load organization data", err);
            setError("Failed to load organization data.");
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
            setSuccessMsg("Organization details updated successfully.");
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

    const TABS = [
        { key: 'DETAILS',     label: 'Company Details' },
        { key: 'ADMINS',      label: `Administrators (${adminUsers.length})` },
        { key: 'ACCOUNTANTS', label: `Accountants (${accountantUsers.length})` },
        { key: 'HR',          label: `HR Representatives (${hrUsers.length})` },
    ];

    const TeamRow = ({ member }) => {
        const [showPw, setShowPw] = useState(false);
        return (
            <tr className="hover:bg-(--bg-app) transition-colors border-b border-(--border-subtle)">
                <td className="px-3 sm:px-6 py-3 sm:py-4">
                    <div className="font-bold text-xs sm:text-sm text-(--text-main) truncate max-w-[120px] sm:max-w-none">{member.name}</div>
                    <div className="sm:hidden text-[10px] text-(--text-muted) mt-0.5 truncate">{member.email}</div>
                </td>
                <td className="hidden sm:table-cell px-6 py-4 text-(--text-muted) text-sm">{member.email}</td>
                <td className="hidden sm:table-cell px-6 py-4">
                    <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-(--text-main) tracking-wide">
                            {showPw ? (member.password || '—') : '••••••••'}
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowPw(p => !p)}
                            className="text-(--text-muted) hover:text-(--text-main) transition-colors outline-none shrink-0"
                        >
                            {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                    </div>
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 text-center">
                    <span className={`px-2 py-1 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${member.is_active ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'}`}>
                        {member.is_active ? 'Active' : 'Suspended'}
                    </span>
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 text-right">
                    <div className="flex justify-end gap-1.5 sm:gap-2">
                        <button
                            onClick={() => handleToggleAccess(member.id, member.is_active)}
                            className={`p-1.5 rounded-lg border transition-colors outline-none ${member.is_active ? 'text-yellow-600 bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/20' : 'text-green-600 bg-green-500/10 hover:bg-green-500/20 border-green-500/20'}`}
                            title={member.is_active ? "Suspend Access" : "Restore Access"}
                        >
                            <Power size={13} />
                        </button>
                        {canDelete && (
                            <button
                                onClick={() => handleDeleteMember(member.id)}
                                className="p-1.5 rounded-lg border text-red-600 bg-red-500/10 hover:bg-red-500/20 border-red-500/20 transition-colors outline-none"
                                title="Delete Account"
                            >
                                <Trash2 size={13} />
                            </button>
                        )}
                    </div>
                </td>
            </tr>
        );
    };

    const TeamTable = ({ users, emptyMsg }) => (
        <div className="overflow-x-auto">
            {loading ? (
                <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-(--brand-primary)" /></div>
            ) : (
                <table className="w-full text-left text-sm">
                    <thead className="bg-(--bg-app) border-b border-(--border-subtle)">
                        <tr>
                            <th className="px-3 sm:px-6 py-3 text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Name</th>
                            <th className="hidden sm:table-cell px-6 py-3 text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Email</th>
                            <th className="hidden sm:table-cell px-6 py-3 text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Password</th>
                            <th className="px-3 sm:px-6 py-3 text-[10px] font-bold text-(--text-muted) uppercase tracking-widest text-center">Status</th>
                            <th className="px-3 sm:px-6 py-3 text-[10px] font-bold text-(--text-muted) uppercase tracking-widest text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.length === 0 ? (
                            <tr><td colSpan="5" className="p-8 text-center text-(--text-muted) text-xs uppercase tracking-widest font-bold">{emptyMsg}</td></tr>
                        ) : (
                            users.map(u => <TeamRow key={u.id} member={u} />)
                        )}
                    </tbody>
                </table>
            )}
        </div>
    );

    return (
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 animate-in fade-in duration-500 pb-10 px-0">

            {/* Header */}
            <div className="px-1">
                <h1 className="text-xl sm:text-3xl font-semibold text-(--text-main) tracking-tight flex items-center gap-2 sm:gap-3">
                    <Building2 className="text-(--brand-primary) shrink-0" size={22} />
                    Organization Settings
                </h1>
                <p className="text-xs sm:text-sm text-(--text-muted) mt-1">Manage your company profile, billing email, and administrative team.</p>
            </div>

            {/* Scrollable Tabs */}
            <div className="flex overflow-x-auto hide-scrollbar border-b border-(--border-subtle) gap-0">
                {TABS.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`shrink-0 px-3 sm:px-4 py-2.5 text-[10px] sm:text-sm font-bold uppercase tracking-widest whitespace-nowrap transition-colors outline-none ${
                            activeTab === tab.key
                                ? 'border-b-2 border-(--brand-primary) text-(--brand-primary)'
                                : 'text-(--text-muted) hover:text-(--text-main) border-b-2 border-transparent'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* DETAILS TAB */}
            {activeTab === 'DETAILS' && (
                <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm p-4 sm:p-6 md:p-8">
                    {error && <div className="mb-4 p-3 bg-red-500/10 text-red-600 border border-red-500/20 rounded-xl text-sm">{error}</div>}
                    {successMsg && <div className="mb-4 p-3 bg-green-500/10 text-green-600 border border-green-500/20 rounded-xl text-sm">{successMsg}</div>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                        <div className="space-y-5 sm:space-y-6">
                            <div>
                                <h3 className="text-xs sm:text-sm font-bold text-(--text-main) uppercase tracking-wider mb-3 sm:mb-4 border-b border-(--border-subtle) pb-2">General Information</h3>
                                <div className="space-y-2.5 text-sm">
                                    <div className="flex gap-2">
                                        <span className="text-(--text-muted) font-medium w-20 shrink-0 text-xs sm:text-sm">Company:</span>
                                        <span className="font-bold text-(--text-main) text-xs sm:text-sm">{orgDetails.name}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-(--text-muted) font-medium w-20 shrink-0 text-xs sm:text-sm">Domain:</span>
                                        <span className="text-(--text-main) text-xs sm:text-sm break-all">{orgDetails.domain}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="text-(--text-muted) font-medium w-20 shrink-0 text-xs sm:text-sm">Address:</span>
                                        <span className="text-(--text-main) text-xs sm:text-sm">{orgDetails.address}</span>
                                    </div>
                                </div>
                                <p className="text-[10px] text-(--text-muted) mt-2 italic">To change core company details, please contact Super Admin support.</p>
                            </div>

                            <div>
                                <h3 className="text-xs sm:text-sm font-bold text-(--text-main) uppercase tracking-wider mb-3 sm:mb-4 border-b border-(--border-subtle) pb-2">Billing Settings</h3>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-(--text-muted) uppercase tracking-widest flex items-center gap-1.5"><Mail size={13} /> Accounts BCC Email</label>
                                    <p className="text-[10px] text-(--text-muted) leading-relaxed mb-1">This email will be BCC'd on all outbound invoice emails.</p>
                                    <input
                                        type="email"
                                        value={orgDetails.accounts_email}
                                        onChange={(e) => setOrgDetails({ ...orgDetails, accounts_email: e.target.value })}
                                        placeholder="e.g., accounts@yourcompany.com"
                                        className="w-full p-3 bg-(--bg-app) border border-(--border-subtle) rounded-xl text-sm outline-none focus:border-(--brand-primary)"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-xs sm:text-sm font-bold text-(--text-main) uppercase tracking-wider mb-3 sm:mb-4 border-b border-(--border-subtle) pb-2">Organization Logo</h3>
                            <p className="text-[10px] text-(--text-muted) leading-relaxed mb-4">This logo appears on your generated Invoice PDFs. Use a transparent PNG or JPG (max 2MB).</p>

                            <div className="flex flex-col items-center sm:items-start gap-4">
                                <div className="w-40 h-40 sm:w-48 sm:h-48 border-2 border-dashed border-(--border-subtle) rounded-2xl bg-(--bg-app) flex flex-col items-center justify-center overflow-hidden relative group">
                                    {logoPreview ? (
                                        <img src={logoPreview} alt="Org Logo" className="w-full h-full object-contain p-4" />
                                    ) : (
                                        <div className="flex flex-col items-center text-(--text-muted)">
                                            <ImageIcon size={28} className="mb-2 opacity-50" />
                                            <span className="text-xs font-medium uppercase tracking-widest">No Logo</span>
                                        </div>
                                    )}
                                    <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity duration-200">
                                        <Upload size={22} className="text-white mb-2" />
                                        <span className="text-white text-xs font-bold uppercase tracking-widest">Change Logo</span>
                                        <input type="file" accept="image/png, image/jpeg" className="hidden" onChange={handleLogoChange} />
                                    </label>
                                </div>
                                {logoFile && <span className="text-xs font-medium text-(--brand-primary)">New file selected: {logoFile.name}</span>}
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-(--border-subtle) flex justify-end">
                        <button
                            onClick={handleSaveDetails}
                            disabled={savingDetails}
                            className="bg-(--brand-primary) text-white px-6 sm:px-8 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
                        >
                            {savingDetails ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                            Save Changes
                        </button>
                    </div>
                </div>
            )}

            {/* ADMINS TAB */}
            {activeTab === 'ADMINS' && (
                <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 sm:p-6 border-b border-(--border-subtle) flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-(--bg-app)/30">
                        <div>
                            <h2 className="text-xs sm:text-sm font-bold text-(--text-main) uppercase tracking-wider flex items-center gap-2">
                                <Shield size={15} className="text-blue-500" /> Organization Admins
                            </h2>
                            <p className="text-[10px] text-(--text-muted) mt-1">Admins have full access to settings, workforce, and financial data.</p>
                        </div>
                        <button
                            onClick={() => { setModalRole('ORG_ADMIN'); setIsAddModalOpen(true); }}
                            className="shrink-0 bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) hover:text-(--brand-primary) hover:border-(--brand-primary) px-3 sm:px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm transition-all"
                        >
                            <Plus size={13} /> Add Admin
                        </button>
                    </div>
                    <TeamTable users={adminUsers} emptyMsg="No additional admins found." />
                </div>
            )}

            {/* ACCOUNTANTS TAB */}
            {activeTab === 'ACCOUNTANTS' && (
                <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 sm:p-6 border-b border-(--border-subtle) flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-(--bg-app)/30">
                        <div>
                            <h2 className="text-xs sm:text-sm font-bold text-(--text-main) uppercase tracking-wider flex items-center gap-2">
                                <Calculator size={15} className="text-emerald-500" /> Accountants
                            </h2>
                            <p className="text-[10px] text-(--text-muted) mt-1">Accountants have full access to all modules except delete operations.</p>
                        </div>
                        <button
                            onClick={() => { setModalRole('ACCOUNTANT'); setIsAddModalOpen(true); }}
                            className="shrink-0 bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) hover:text-(--brand-primary) hover:border-(--brand-primary) px-3 sm:px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm transition-all"
                        >
                            <Plus size={13} /> Add Accountant
                        </button>
                    </div>
                    <TeamTable users={accountantUsers} emptyMsg="No accountants found." />
                </div>
            )}

            {/* HR TAB */}
            {activeTab === 'HR' && (
                <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm overflow-hidden">
                    <div className="p-4 sm:p-6 border-b border-(--border-subtle) flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-(--bg-app)/30">
                        <div>
                            <h2 className="text-xs sm:text-sm font-bold text-(--text-main) uppercase tracking-wider flex items-center gap-2">
                                <Users size={15} className="text-purple-500" /> HR Representatives
                            </h2>
                            <p className="text-[10px] text-(--text-muted) mt-1">HR handles timesheets, workforce, and placements, but cannot alter core settings.</p>
                        </div>
                        <button
                            onClick={() => { setModalRole('HR'); setIsAddModalOpen(true); }}
                            className="shrink-0 bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) hover:text-(--brand-primary) hover:border-(--brand-primary) px-3 sm:px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm transition-all"
                        >
                            <Plus size={13} /> Add HR Rep
                        </button>
                    </div>
                    <TeamTable users={hrUsers} emptyMsg="No HR representatives found." />
                </div>
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
