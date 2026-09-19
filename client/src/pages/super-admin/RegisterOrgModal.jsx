import { useState } from 'react';
import { Globe, Check, Loader2, Eye, EyeOff, Building2, KeyRound } from 'lucide-react';
import BaseModal from '../../components/ui/BaseModal';
import api from '../../api/axios';
import { Field, Btn } from '../../components/ui/kit';

const EMPTY_FORM = { name: '', admin_first_name: '', admin_last_name: '', admin_email: '', admin_password: '', domain: '', address: '', send_welcome_email: false };

const Block = ({ n, icon: Icon, title, text, children }) => (
    <div className="grid gap-5 rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-5 sm:p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div>
            <div className="flex items-center gap-3">
                <span className="font-mono text-2xl font-semibold nx-gradient-text">{n}</span>
                <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-(--brand-primary)/10 text-(--brand-primary)"><Icon size={16} /></span>
            </div>
            <p className="mt-3 text-base font-semibold text-(--text-main)">{title}</p>
            <p className="mt-1 text-xs text-(--text-muted)">{text}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
);

const RegisterOrgModal = ({ isOpen, onClose, onRefresh }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState(EMPTY_FORM);
    const [showPassword, setShowPassword] = useState(false);

    const set = (field) => (e) => setFormData(prev => ({ ...prev, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await api.post('/api/super-admin/create-org', formData);
            // The workspace is saved even when the welcome email fails; say so.
            if (res.data?.emailSent === false) alert(res.data.message);
            onRefresh();
            onClose();
            setFormData(EMPTY_FORM);
        } catch (err) {
            alert(err.response?.data?.message || 'Registration failed.');
        } finally {
            setLoading(false);
        }
    };

    const footer = (
        <Btn variant="primary" type="submit" form="register-org-form" disabled={loading} icon={loading ? Loader2 : Check} className="ml-auto">
            {loading ? 'Registering…' : 'Launch tenant'}
        </Btn>
    );

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            icon={<Globe size={18} />}
            title="Register tenant"
            subtitle="Create a workspace and its owner account"
            footer={footer}
        >
            <form id="register-org-form" onSubmit={handleSubmit} className="mx-auto max-w-5xl space-y-5">
                <Block n="01" icon={Building2} title="Workspace identity" text="How this tenant appears across the platform.">
                    <Field label="Tenant name" required>
                        <input className="nx-input" required placeholder="e.g. Acme Corp" value={formData.name} onChange={set('name')} />
                    </Field>
                    <Field label="Custom domain">
                        <input className="nx-input" placeholder="acme.com" value={formData.domain} onChange={set('domain')} />
                    </Field>
                    <Field label="Headquarters address" className="sm:col-span-2">
                        <textarea className="nx-input h-24 resize-none" placeholder="Headquarters address…" value={formData.address} onChange={set('address')} />
                    </Field>
                </Block>

                <Block n="02" icon={KeyRound} title="Owner account" text="The first admin who can sign in and set the workspace up.">
                    <Field label="First name">
                        <input className="nx-input" placeholder="John" value={formData.admin_first_name} onChange={set('admin_first_name')} />
                    </Field>
                    <Field label="Last name">
                        <input className="nx-input" placeholder="Smith" value={formData.admin_last_name} onChange={set('admin_last_name')} />
                    </Field>
                    <Field label="Sign-in email" required>
                        <input className="nx-input" type="email" required placeholder="admin@org.com" value={formData.admin_email} onChange={set('admin_email')} />
                    </Field>
                    <Field label="Password" required>
                        <div className="relative">
                            <input
                                className="nx-input pr-11"
                                type={showPassword ? 'text' : 'password'}
                                required
                                placeholder="Min. 6 characters"
                                value={formData.admin_password}
                                onChange={set('admin_password')}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(p => !p)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted) transition-colors hover:text-(--text-main)"
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </Field>
                    <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-(--border-subtle) px-4 py-3 sm:col-span-2">
                        <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 cursor-pointer"
                            checked={formData.send_welcome_email}
                            onChange={e => setFormData(prev => ({ ...prev, send_welcome_email: e.target.checked }))}
                        />
                        <span>
                            <span className="block text-sm font-medium text-(--text-main)">Email the login details to the owner</span>
                            <span className="block text-xs text-(--text-muted)">Optional. The workspace is created either way — leave this off and share the password yourself.</span>
                        </span>
                    </label>
                </Block>
            </form>
        </BaseModal>
    );
};

export default RegisterOrgModal;
