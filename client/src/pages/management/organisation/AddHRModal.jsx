import { useState } from 'react';
import { UserPlus, Loader2, AlertTriangle, Shield, Calculator, Users, KeyRound } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import { roleLabel } from '../../../utils/constants';
import { Btn, Field, Notice, Avatar } from '../../../components/ui/kit';

const ROLE_INFO = {
    ORG_ADMIN:  { icon: Shield,     text: 'Full access to settings, talent and financial data.' },
    ACCOUNTANT: { icon: Calculator, text: 'Full access to every module except delete operations.' },
    HR:         { icon: Users,      text: 'Handles time logs, talent and engagements, but cannot alter core settings.' },
};

const AddHRModal = ({ isOpen, onClose, onRefresh, role = 'HR' }) => {
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        role: role
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!formData.first_name || !formData.last_name || !formData.email || !formData.password) {
            return setError('All fields are required.');
        }

        setLoading(true);
        try {
            const res = await managementAPI.createTeamMember(formData);
            // The account is saved even when the welcome email fails; say so.
            if (res.data?.emailSent === false) alert(res.data.message);
            onRefresh();
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || `Failed to create ${roleLabel(role).toLowerCase()}.`);
        } finally {
            setLoading(false);
        }
    };

    const displayRole = roleLabel(role);
    const info = ROLE_INFO[role] || ROLE_INFO.HR;
    const RoleIcon = info.icon;
    const fullName = `${formData.first_name} ${formData.last_name}`.trim();

    const footer = (
        <div className="flex w-full justify-end gap-2">
            <Btn onClick={onClose} disabled={loading}>Cancel</Btn>
            <Btn type="submit" form="teamMemberForm" variant="primary" icon={loading ? Loader2 : UserPlus} disabled={loading}>
                Invite {displayRole.toLowerCase()}
            </Btn>
        </div>
    );

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} icon={<UserPlus size={18} />} title={`Add ${displayRole.toLowerCase()}`} subtitle="Create console access for a teammate" footer={footer} noPadding>
            <div className="grid min-h-full lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="space-y-4 border-b border-(--border-subtle) bg-(--bg-app)/40 p-5 lg:border-b-0 lg:border-r lg:p-6">
                    <div className="rounded-[22px] p-5 text-white" style={{ background: 'var(--brand-gradient)', boxShadow: '0 20px 40px -24px var(--brand-glow)' }}>
                        <RoleIcon size={22} />
                        <p className="mt-3 text-xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{displayRole}</p>
                        <p className="mt-1 text-xs text-white/85">{info.text}</p>
                    </div>
                    <div className="flex items-center gap-3 rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) p-4">
                        <Avatar name={fullName || '?'} size={40} />
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-(--text-main)">{fullName || 'New teammate'}</p>
                            <p className="truncate text-xs text-(--text-muted)">{formData.email || 'name@company.com'}</p>
                        </div>
                    </div>
                </aside>

                <form id="teamMemberForm" onSubmit={handleSubmit} className="mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-6 lg:p-8">
                    {error && <Notice tone="rose" icon={AlertTriangle}>{error}</Notice>}

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="First name" required>
                            <input type="text" value={formData.first_name} onChange={(e) => setFormData({...formData, first_name: e.target.value})} className="nx-input" placeholder="John" />
                        </Field>
                        <Field label="Last name" required>
                            <input type="text" value={formData.last_name} onChange={(e) => setFormData({...formData, last_name: e.target.value})} className="nx-input" placeholder="Doe" />
                        </Field>
                    </div>

                    <Field label="Email address" required>
                        <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="nx-input" placeholder="name@company.com" />
                    </Field>

                    <Field label="Temporary password" required hint="They can change it after signing in.">
                        <div className="relative">
                            <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                            <input type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="nx-input pl-9" placeholder="Create a temporary password" />
                        </div>
                    </Field>
                </form>
            </div>
        </BaseModal>
    );
};

export default AddHRModal;
