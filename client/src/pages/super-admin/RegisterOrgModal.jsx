import { useState } from 'react';
import { Building, Check, Loader2, Eye, EyeOff } from 'lucide-react';
import BaseModal from '../../components/ui/BaseModal';
import api from '../../api/axios';

const EMPTY_FORM = { name: '', admin_first_name: '', admin_last_name: '', admin_email: '', admin_password: '', domain: '', address: '' };

const Field = ({ label, children }) => (
    <div className="space-y-1">
        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest ml-1">
            {label}
        </label>
        {children}
    </div>
);

const Input = (props) => (
    <input
        className="w-full p-3.5 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) rounded-2xl text-sm outline-none focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) transition-all placeholder:text-(--input-placeholder)"
        {...props}
    />
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
            await api.post('/api/super-admin/create-org', formData);
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
        <button
            form="register-org-form"
            type="submit"
            disabled={loading}
            className="ml-auto bg-(--brand-primary) text-(--brand-primary-text) px-8 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-lg hover:opacity-90 active:scale-95 focus:ring-4 focus:ring-(--brand-primary)/50 outline-none transition-all disabled:opacity-50"
        >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <><Check size={15} /> Complete Registration</>}
        </button>
    );

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            icon={<Building size={18} />}
            title="Register Tenant"
            subtitle="Create a new organization and its admin account"
            footer={footer}
        >
            <form id="register-org-form" onSubmit={handleSubmit} className="space-y-5">

                {/* Row 1: Org Name + Domain */}
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Organization Name">
                        <Input
                            required
                            placeholder="e.g. Acme Corp"
                            value={formData.name}
                            onChange={set('name')}
                        />
                    </Field>
                    <Field label="Custom Domain">
                        <Input
                            placeholder="acme.com"
                            value={formData.domain}
                            onChange={set('domain')}
                        />
                    </Field>
                </div>

                {/* Row 2: First Name + Last Name */}
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Admin First Name">
                        <Input
                            placeholder="John"
                            value={formData.admin_first_name}
                            onChange={set('admin_first_name')}
                        />
                    </Field>
                    <Field label="Admin Last Name">
                        <Input
                            placeholder="Smith"
                            value={formData.admin_last_name}
                            onChange={set('admin_last_name')}
                        />
                    </Field>
                </div>

                {/* Row 3: Admin Email + Password */}
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Admin Email">
                        <Input
                            type="email"
                            required
                            placeholder="admin@org.com"
                            value={formData.admin_email}
                            onChange={set('admin_email')}
                        />
                    </Field>
                    <Field label="Password">
                        <div className="relative">
                            <Input
                                type={showPassword ? 'text' : 'password'}
                                required
                                placeholder="Min. 6 characters"
                                value={formData.admin_password}
                                onChange={set('admin_password')}
                                style={{ paddingRight: '2.75rem' }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(p => !p)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text-main) transition-colors"
                                tabIndex={-1}
                            >
                                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </Field>
                </div>

                {/* Row 4: Address */}
                <Field label="Physical Address">
                    <textarea
                        className="w-full p-3.5 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) rounded-2xl text-sm outline-none focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) transition-all h-24 resize-none placeholder:text-(--input-placeholder)"
                        placeholder="Headquarters address..."
                        value={formData.address}
                        onChange={set('address')}
                    />
                </Field>

            </form>
        </BaseModal>
    );
};

export default RegisterOrgModal;
