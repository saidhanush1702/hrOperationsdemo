import { useState, useEffect } from 'react';
import { Handshake, Check, Plus, Trash2, Star, AlertTriangle, Globe, MapPin, Printer, Users, Mail } from 'lucide-react';
import api from '../../../api/axios';
import { commonAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import { Field, Btn, Avatar, Chip, cx } from '../../../components/ui/kit';

const FormInput = ({ label, required, type = "text", value, onChange, placeholder, maxLength = 50, error, className }) => (
    <Field label={label} required={required} error={error} className={className}>
        <input
            type={type}
            placeholder={placeholder}
            maxLength={type === "email" ? undefined : maxLength}
            className={cx('nx-input', error && 'nx-invalid')}
            value={value}
            onChange={e => onChange && onChange(e.target.value)}
        />
    </Field>
);

const FormSelect = ({ label, required, options, value, onChange, isObject = false, error }) => (
    <Field label={label} required={required} error={error}>
        <select
            className={cx('nx-input cursor-pointer', error && 'nx-invalid')}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
        >
            <option value="" disabled>Select type…</option>
            {options.map(opt => (
                <option key={isObject ? opt.id : opt} value={isObject ? opt.id : opt}>
                    {isObject ? opt.name : opt}
                </option>
            ))}
        </select>
    </Field>
);

const AddClientModal = ({ isOpen, onClose, onRefresh }) => {
    const [loading, setLoading] = useState(false);
    const [lookups, setLookups] = useState({ clientContactTypes: [], phoneCodes: [] });
    const [errors, setErrors] = useState({});
    const [submitError, setSubmitError] = useState('');

    const initialFormState = {
        client_name: '',
        website: '',
        address: '',
        fax_number: '',
        contacts: [
            { contact_name: '', contact_title: '', contact_type_id: '', contact_email: '', phone_code_id: '', contact_phone: '', is_primary: true }
        ]
    };
    const [formData, setFormData] = useState(initialFormState);

    useEffect(() => {
        if (isOpen) {
            commonAPI.getLookups()
                .then(res => setLookups(res.data))
                .catch(err => console.error("Failed to load lookups", err));
        } else {
            setFormData(initialFormState);
            setErrors({});
            setSubmitError('');
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const updateField = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
        if (submitError) setSubmitError('');
    };

    const handleContactChange = (index, field, value) => {
        const updatedContacts = [...formData.contacts];
        updatedContacts[index][field] = value;
        setFormData({ ...formData, contacts: updatedContacts });

        // Clear specific contact error
        const errorKey = `contact_${index}_${field}`;
        if (errors[errorKey]) setErrors(prev => ({ ...prev, [errorKey]: null }));

        // Also clear phone combined error if modifying phone fields
        if (field === 'phone_code_id' || field === 'contact_phone') {
            if (errors[`contact_${index}_contact_phone`]) setErrors(prev => ({ ...prev, [`contact_${index}_contact_phone`]: null }));
        }

        if (submitError) setSubmitError('');
    };

    const validateForm = () => {
        const newErrors = {};
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const websiteRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/i;

        if (!formData.client_name) newErrors.client_name = "Partner name is required.";

        if (!formData.website) {
            newErrors.website = "Website is required.";
        } else if (!websiteRegex.test(formData.website)) {
            newErrors.website = "Please enter a valid website URL.";
        }

        // Fax Validation (If provided, ensure it has enough numbers)
        if (formData.fax_number) {
            const faxDigits = formData.fax_number.replace(/\D/g, '');
            if (faxDigits.length > 0 && faxDigits.length < 7) {
                newErrors.fax_number = "Fax number must be at least 7 digits.";
            }
        }

        // Contacts Validation
        formData.contacts.forEach((contact, index) => {
            if (!contact.contact_name) newErrors[`contact_${index}_contact_name`] = "Name is required.";
            if (!contact.contact_type_id) newErrors[`contact_${index}_contact_type_id`] = "Type is required.";

            if (!contact.contact_email) {
                newErrors[`contact_${index}_contact_email`] = "Email is required.";
            } else if (!emailRegex.test(contact.contact_email)) {
                newErrors[`contact_${index}_contact_email`] = "Invalid email format.";
            }

            // Phone Validation (Only check if they entered something)
            if (contact.phone_code_id || contact.contact_phone) {
                if (!contact.phone_code_id) {
                    newErrors[`contact_${index}_contact_phone`] = "Country code is required.";
                } else if (!contact.contact_phone) {
                    newErrors[`contact_${index}_contact_phone`] = "Phone number is required.";
                } else {
                    const digitsOnly = contact.contact_phone.replace(/\D/g, '');
                    if (digitsOnly.length !== 10) {
                        newErrors[`contact_${index}_contact_phone`] = "Phone number must be exactly 10 digits.";
                    }
                }
            }
        });

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async () => {
        if (!validateForm()) return;
        setLoading(true);
        setSubmitError('');
        try {
            await api.post('/api/management/clients', formData);
            onRefresh();
            onClose();
        } catch (err) {
            const backendError = err.response?.data?.error || err.response?.data?.message || "An unknown error occurred.";
            setSubmitError(backendError);
        } finally {
            setLoading(false);
        }
    };

    const addContact = () => {
        setFormData({
            ...formData,
            contacts: [
                ...formData.contacts,
                { contact_name: '', contact_title: '', contact_type_id: '', contact_email: '', phone_code_id: '', contact_phone: '', is_primary: false }
            ]
        });
    };

    const removeContact = (index) => {
        if (formData.contacts.length === 1) return;
        const updatedContacts = [...formData.contacts];
        const removedWasPrimary = updatedContacts[index].is_primary;
        updatedContacts.splice(index, 1);
        if (removedWasPrimary && updatedContacts.length > 0) {
            updatedContacts[0].is_primary = true;
        }
        setFormData({ ...formData, contacts: updatedContacts });
    };

    const setPrimaryContact = (index) => {
        const updatedContacts = formData.contacts.map((c, i) => ({
            ...c, is_primary: i === index
        }));
        setFormData({ ...formData, contacts: updatedContacts });
    };

    if (!isOpen) return null;

    const primary = formData.contacts.find(c => c.is_primary) || formData.contacts[0];

    const modalFooter = (
        <div className="flex w-full flex-col gap-3">
            {submitError && (
                <div className="flex items-center gap-2 rounded-[14px] border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-500">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{submitError}</span>
                </div>
            )}
            <div className="flex w-full items-center justify-end gap-2">
                <Btn onClick={onClose}>Cancel</Btn>
                <Btn variant="primary" icon={Check} onClick={handleSubmit} disabled={loading}>
                    {loading ? 'Saving…' : 'Add partner'}
                </Btn>
            </div>
        </div>
    );

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            icon={<Handshake size={18} />}
            title="New partner"
            subtitle="Register a company and the people you work with"
            headerRight={<Chip tone="brand" icon={Users}>{formData.contacts.length} contact{formData.contacts.length !== 1 ? 's' : ''}</Chip>}
            footer={modalFooter}
            noPadding
        >
            <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-5 p-4 sm:p-6 lg:p-8">
                    {/* Company */}
                    <section className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-5 sm:p-6">
                        <h3 className="mb-1 text-base font-semibold text-(--text-main)">Company</h3>
                        <p className="mb-5 text-xs text-(--text-muted)">How this partner appears on engagements and invoices.</p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormInput label="Partner / company name" required value={formData.client_name} onChange={v => updateField('client_name', v)} error={errors.client_name} />
                            <FormInput label="Company website" required placeholder="e.g. www.example.com" value={formData.website} onChange={v => updateField('website', v)} error={errors.website} />
                            <FormInput label="Office address" placeholder="Optional" value={formData.address} onChange={v => updateField('address', v)} />
                            <FormInput label="Fax number" placeholder="Optional" value={formData.fax_number} onChange={v => updateField('fax_number', v.replace(/[^\d+]/g, ''))} error={errors.fax_number} maxLength={20} />
                        </div>
                    </section>

                    {/* Contacts */}
                    <section className="rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-5 sm:p-6">
                        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-(--text-main)">People</h3>
                                <p className="text-xs text-(--text-muted)">Star the person who should be contacted first.</p>
                            </div>
                            <Btn size="sm" variant="primary" icon={Plus} onClick={addContact}>Add person</Btn>
                        </div>

                        <div className="grid gap-4 xl:grid-cols-2">
                            {formData.contacts.map((contact, index) => (
                                <div
                                    key={index}
                                    className={cx('rounded-[20px] border p-4', contact.is_primary ? 'border-amber-500/40 bg-amber-500/[0.04]' : 'border-(--border-subtle) bg-(--bg-app)/40')}
                                >
                                    <div className="mb-4 flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <Avatar name={contact.contact_name || `${index + 1}`} size={34} />
                                            <span className="text-sm font-semibold text-(--text-main)">{contact.contact_name || `Person ${index + 1}`}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setPrimaryContact(index)}
                                                className={cx('flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold outline-none transition-colors', contact.is_primary ? 'bg-amber-500/15 text-amber-500' : 'text-(--text-muted) hover:bg-(--text-main)/5 hover:text-(--text-main)')}
                                            >
                                                <Star size={13} className={contact.is_primary ? 'fill-amber-500' : ''} />
                                                {contact.is_primary ? 'Primary' : 'Make primary'}
                                            </button>
                                            {formData.contacts.length > 1 && (
                                                <Btn size="icon" variant="danger" icon={Trash2} onClick={() => removeContact(index)} title="Remove person" />
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <FormInput label="Name" required value={contact.contact_name} onChange={v => handleContactChange(index, 'contact_name', v)} error={errors[`contact_${index}_contact_name`]} />
                                        <FormInput label="Title" placeholder="e.g. Director" value={contact.contact_title} onChange={v => handleContactChange(index, 'contact_title', v)} />
                                        <FormSelect label="Contact type" required isObject options={lookups.clientContactTypes || []} value={contact.contact_type_id} onChange={v => handleContactChange(index, 'contact_type_id', v)} error={errors[`contact_${index}_contact_type_id`]} />
                                        <FormInput label="Email" required type="email" value={contact.contact_email} onChange={v => handleContactChange(index, 'contact_email', v)} error={errors[`contact_${index}_contact_email`]} maxLength={null} />
                                        <Field label="Phone" error={errors[`contact_${index}_contact_phone`]} className="sm:col-span-2">
                                            <div className="flex gap-2">
                                                <select
                                                    className={cx('nx-input w-2/5 cursor-pointer', errors[`contact_${index}_contact_phone`] && 'nx-invalid')}
                                                    value={contact.phone_code_id || ''}
                                                    onChange={e => {
                                                        handleContactChange(index, 'phone_code_id', e.target.value);
                                                        handleContactChange(index, 'contact_phone', '');
                                                    }}
                                                >
                                                    <option value="" disabled>Code</option>
                                                    {lookups.phoneCodes?.map(pc => (
                                                        <option key={pc.id} value={pc.id}>{pc.dial_code} ({pc.country_name})</option>
                                                    ))}
                                                </select>
                                                <input
                                                    type="text"
                                                    maxLength={10}
                                                    className={cx('nx-input w-3/5', errors[`contact_${index}_contact_phone`] && 'nx-invalid')}
                                                    value={contact.contact_phone || ''}
                                                    onChange={e => handleContactChange(index, 'contact_phone', e.target.value.replace(/\D/g, ''))}
                                                />
                                            </div>
                                        </Field>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {/* Live preview */}
                <aside className="border-t border-(--border-subtle) bg-(--bg-app)/40 p-5 lg:border-l lg:border-t-0 lg:p-6">
                    <div className="lg:sticky lg:top-6">
                        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-(--brand-primary)">Live preview</p>
                        <div className="relative mt-4 overflow-hidden rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-5">
                            <div aria-hidden="true" className="absolute -right-10 -top-10 h-32 w-32 rounded-full blur-2xl" style={{ background: 'var(--brand-glow)' }} />
                            <span className="relative flex h-14 w-14 items-center justify-center rounded-[18px] text-xl font-semibold text-white" style={{ background: 'var(--brand-gradient)' }}>
                                {formData.client_name?.[0]?.toUpperCase() || '?'}
                            </span>
                            <p className="relative mt-4 truncate text-lg font-semibold text-(--text-main)">{formData.client_name || 'Partner name'}</p>
                            <div className="relative mt-3 space-y-2 text-xs text-(--text-muted)">
                                <p className="flex items-center gap-2 truncate"><Globe size={13} /> {formData.website || 'website.com'}</p>
                                <p className="flex items-center gap-2 truncate"><MapPin size={13} /> {formData.address || 'Office address'}</p>
                                <p className="flex items-center gap-2 truncate"><Printer size={13} /> {formData.fax_number || 'Fax number'}</p>
                            </div>
                            <div className="relative mt-4 rounded-[16px] bg-(--bg-app)/60 p-3">
                                <p className="text-[11px] text-(--text-muted)">Primary contact</p>
                                <p className="mt-1 truncate text-sm font-medium text-(--text-main)">{primary?.contact_name || '—'}</p>
                                <p className="flex items-center gap-1 truncate text-[11px] text-(--text-muted)"><Mail size={11} /> {primary?.contact_email || '—'}</p>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </BaseModal>
    );
};

export default AddClientModal;
