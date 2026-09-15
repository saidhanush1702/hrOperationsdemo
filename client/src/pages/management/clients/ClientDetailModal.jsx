import { useState, useEffect } from 'react';
import { Save, Edit3, Trash2, Handshake, Plus, Star, Mail, Phone, Globe, MapPin, Printer, AlertTriangle, Building2, Users, Rocket } from 'lucide-react';
import api from '../../../api/axios';
import { commonAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import PlacementHistoryPanel from '../../../components/layout/PlacementHistoryPanel';
import { DetailLayout, SectionTitle, Btn, Chip, Avatar, Fact, EmptyState, cx } from '../../../components/ui/kit';

const getSafeContacts = (contactsRaw) => {
    if (!contactsRaw) return [];
    let parsed = contactsRaw;
    if (typeof contactsRaw === 'string') {
        try { parsed = JSON.parse(contactsRaw); }
        catch { return []; }
    }
    if (Array.isArray(parsed)) {
        return parsed.filter(c => c !== null);
    }
    return [];
};

// View/edit field
const PartnerField = ({ label, required, value, edit, onChange, type = "text", placeholder, error, maxLength = 50, className }) => (
    <div className={cx('min-w-0', className)}>
        <p className="nx-label">{label}{edit && required && <span className="ml-0.5 text-rose-500">*</span>}</p>
        {edit ? (
            <input
                type={type}
                placeholder={placeholder}
                maxLength={type === "email" ? undefined : maxLength}
                className={cx('nx-input', error && 'nx-invalid')}
                value={value || ''}
                onChange={e => onChange && onChange(e.target.value)}
            />
        ) : (
            <p className="truncate rounded-[12px] bg-(--bg-app)/60 px-3 py-2.5 text-sm font-medium text-(--text-main)">{value || '—'}</p>
        )}
        {error && <p className="mt-1 text-[11px] font-medium text-rose-500">{error}</p>}
    </div>
);

const ClientDetailModal = ({ client, onClose, onRefresh }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [lookups, setLookups] = useState({ clientContactTypes: [], phoneCodes: [] });
    const [errors, setErrors] = useState({});
    const [submitError, setSubmitError] = useState('');
    const [section, setSection] = useState('company');

    // Latest saved baseline, so "Cancel" works correctly after a save
    const [currentClient, setCurrentClient] = useState(client);

    const [editData, setEditData] = useState({
        ...currentClient,
        contacts: getSafeContacts(currentClient?.contacts)
    });

    const userRole = localStorage.getItem('userRole');

    // Sync if parent passes a completely new client prop
    useEffect(() => {
        setCurrentClient(client);
    }, [client]);

    // Reset edit data to the baseline whenever it changes (on load, or after a successful save)
    useEffect(() => {
        setEditData({
            ...currentClient,
            contacts: getSafeContacts(currentClient?.contacts)
        });
        setIsEditing(false);
        setErrors({});
        setSubmitError('');
    }, [currentClient]);

    useEffect(() => {
        commonAPI.getLookups()
            .then(res => setLookups(res.data))
            .catch(err => console.error("Failed to load lookups", err));
    }, []);

    const validateForm = () => {
        const newErrors = {};
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const websiteRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/i;

        if (!editData.client_name) newErrors.client_name = "Partner name is required.";

        if (!editData.website) {
            newErrors.website = "Website is required.";
        } else if (!websiteRegex.test(editData.website)) {
            newErrors.website = "Please enter a valid website URL.";
        }

        if (editData.fax_number) {
            const faxDigits = editData.fax_number.replace(/\D/g, '');
            if (faxDigits.length > 0 && faxDigits.length < 7) {
                newErrors.fax_number = "Fax number must be at least 7 digits.";
            }
        }

        editData.contacts.forEach((contact, index) => {
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
        const keys = Object.keys(newErrors);
        if (keys.length > 0) setSection(keys.some(k => !k.startsWith('contact_')) ? 'company' : 'contacts');
        return keys.length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) return;
        setSubmitError('');
        try {
            await api.put(`/api/management/clients/${client.id}`, editData);

            // Setting the new baseline triggers the effect above, exiting edit mode while staying open
            setCurrentClient(editData);
            onRefresh();

        } catch (err) {
            setSubmitError(err.response?.data?.error || err.response?.data?.message || "Update failed");
        }
    };

    const handleDelete = async () => {
        if (window.confirm(`Delete ${client.client_name}? This cannot be undone.`)) {
            try {
                await api.delete(`/api/management/clients/${client.id}`);
                onRefresh();
                onClose();
            } catch { alert("Delete failed"); }
        }
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setErrors({});
        setSubmitError('');
        setEditData({
            ...currentClient,
            contacts: getSafeContacts(currentClient?.contacts)
        });
    };

    const updateField = (field, value) => {
        setEditData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
        if (submitError) setSubmitError('');
    };

    const handleContactChange = (index, field, value) => {
        const updatedContacts = [...editData.contacts];
        updatedContacts[index][field] = value;
        setEditData({ ...editData, contacts: updatedContacts });

        const errorKey = `contact_${index}_${field}`;
        if (errors[errorKey]) setErrors(prev => ({ ...prev, [errorKey]: null }));

        if (field === 'phone_code_id' || field === 'contact_phone') {
            if (errors[`contact_${index}_contact_phone`]) setErrors(prev => ({ ...prev, [`contact_${index}_contact_phone`]: null }));
        }

        if (submitError) setSubmitError('');
    };

    const addContact = () => {
        setEditData({
            ...editData,
            contacts: [
                ...editData.contacts,
                { contact_name: '', contact_title: '', contact_type_id: '', contact_email: '', phone_code_id: '', contact_phone: '', is_primary: editData.contacts.length === 0 }
            ]
        });
    };

    const removeContact = (index) => {
        const updatedContacts = [...editData.contacts];
        const removedWasPrimary = updatedContacts[index].is_primary;

        updatedContacts.splice(index, 1);

        if (removedWasPrimary && updatedContacts.length > 0) {
            updatedContacts[0].is_primary = true;
        }
        setEditData({ ...editData, contacts: updatedContacts });
    };

    const setPrimaryContact = (index) => {
        const updatedContacts = editData.contacts.map((c, i) => ({
            ...c, is_primary: i === index
        }));
        setEditData({ ...editData, contacts: updatedContacts });
    };

    if (!client) return null;

    const websiteHref = editData.website
        ? (editData.website.startsWith('http') ? editData.website : `https://${editData.website}`)
        : null;

    const aside = (
        <div>
            <span className="flex h-16 w-16 items-center justify-center rounded-[20px] text-2xl font-semibold text-white" style={{ background: 'var(--brand-gradient)' }}>
                {editData.client_name?.[0]?.toUpperCase() || '?'}
            </span>
            <p className="mt-4 text-xl font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{editData.client_name || '—'}</p>
            {websiteHref ? (
                <a href={websiteHref} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1.5 truncate text-xs text-(--brand-primary) hover:underline">
                    <Globe size={12} /> {editData.website.replace(/^https?:\/\//, '')}
                </a>
            ) : <p className="mt-1 text-xs text-(--text-muted)">No website</p>}

            <div className="mt-5 space-y-3 rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) p-4">
                <Fact icon={MapPin} label="Office" value={editData.address} />
                <Fact icon={Printer} label="Fax" value={editData.fax_number} />
                <Fact icon={Users} label="People on file" value={editData.contacts?.length || 0} />
            </div>

            {submitError && (
                <div className="mt-4 flex items-start gap-2 rounded-[14px] border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-500">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>{submitError}</span>
                </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
                {!isEditing ? (
                    <Btn variant="primary" icon={Edit3} onClick={() => setIsEditing(true)}>Edit partner</Btn>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <Btn onClick={cancelEdit}>Cancel</Btn>
                        <Btn variant="primary" icon={Save} onClick={handleSave}>Save</Btn>
                    </div>
                )}
                {userRole === 'ORG_ADMIN' && (
                    <Btn variant="danger" icon={Trash2} onClick={handleDelete}>Delete partner</Btn>
                )}
            </div>
        </div>
    );

    return (
        <BaseModal
            isOpen={true}
            onClose={onClose}
            icon={<Handshake size={18} />}
            title="Partner profile"
            subtitle={editData.client_name}
            headerRight={isEditing ? <Chip tone="amber" icon={Edit3}>Editing</Chip> : null}
            noPadding
        >
            <DetailLayout
                aside={aside}
                active={section}
                onSelect={setSection}
                sections={[
                    { key: 'company', label: 'Company', icon: Building2 },
                    { key: 'contacts', label: 'People', icon: Users, count: editData.contacts?.length || 0 },
                    { key: 'history', label: 'Engagements', icon: Rocket },
                ]}
            >
                {section === 'company' && (
                    <>
                        <SectionTitle icon={Building2} title="Company" subtitle="Name, website and office details" />
                        <div className="grid gap-4 rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5 sm:grid-cols-2">
                            <PartnerField label="Partner / company name" required value={editData.client_name} edit={isEditing} onChange={v => updateField('client_name', v)} error={errors.client_name} />
                            <PartnerField label="Company website" required value={editData.website} edit={isEditing} onChange={v => updateField('website', v)} error={errors.website} />
                            <PartnerField label="Office address" value={editData.address} edit={isEditing} onChange={v => updateField('address', v)} />
                            <PartnerField label="Fax number" value={editData.fax_number} edit={isEditing} onChange={v => updateField('fax_number', v.replace(/[^\d+]/g, ''))} error={errors.fax_number} maxLength={20} />
                        </div>
                    </>
                )}

                {section === 'contacts' && (
                    <>
                        <SectionTitle
                            icon={Users}
                            title="People"
                            subtitle="Who you work with at this partner"
                            actions={isEditing && <Btn size="sm" variant="primary" icon={Plus} onClick={addContact}>Add person</Btn>}
                        />

                        {editData.contacts?.length === 0 && !isEditing && (
                            <EmptyState icon={Users} title="No people on file" text="Edit the partner to add contacts." />
                        )}

                        <div className="grid gap-4 xl:grid-cols-2">
                            {editData.contacts?.map((contact, index) => (
                                <div
                                    key={index}
                                    className={cx('rounded-[22px] border p-5', contact.is_primary ? 'border-amber-500/40 bg-amber-500/[0.04]' : 'border-(--border-subtle) bg-(--bg-surface)')}
                                >
                                    <div className="mb-4 flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <Avatar name={contact.contact_name || '?'} size={40} />
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-(--text-main)">{contact.contact_name || 'New person'}</p>
                                                <p className="truncate text-xs text-(--text-muted)">{contact.contact_title || '—'}</p>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-1">
                                            {isEditing ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setPrimaryContact(index)}
                                                    className={cx('flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold outline-none transition-colors', contact.is_primary ? 'bg-amber-500/15 text-amber-500' : 'text-(--text-muted) hover:bg-(--text-main)/5 hover:text-(--text-main)')}
                                                >
                                                    <Star size={13} className={contact.is_primary ? 'fill-amber-500' : ''} />
                                                    {contact.is_primary ? 'Primary' : 'Make primary'}
                                                </button>
                                            ) : contact.is_primary ? (
                                                <Chip tone="amber" icon={Star}>Primary</Chip>
                                            ) : null}
                                            {isEditing && editData.contacts.length > 1 && (
                                                <Btn size="icon" variant="danger" icon={Trash2} onClick={() => removeContact(index)} title="Remove person" />
                                            )}
                                        </div>
                                    </div>

                                    {isEditing ? (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <PartnerField label="Name" required value={contact.contact_name} edit onChange={v => handleContactChange(index, 'contact_name', v)} error={errors[`contact_${index}_contact_name`]} />
                                            <PartnerField label="Title" value={contact.contact_title} edit onChange={v => handleContactChange(index, 'contact_title', v)} />
                                            <div className="min-w-0">
                                                <p className="nx-label">Contact type<span className="ml-0.5 text-rose-500">*</span></p>
                                                <select
                                                    className={cx('nx-input cursor-pointer', errors[`contact_${index}_contact_type_id`] && 'nx-invalid')}
                                                    value={contact.contact_type_id || ''}
                                                    onChange={e => handleContactChange(index, 'contact_type_id', e.target.value)}
                                                >
                                                    <option value="" disabled>Select…</option>
                                                    {(lookups.clientContactTypes || []).map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                                                </select>
                                                {errors[`contact_${index}_contact_type_id`] && <p className="mt-1 text-[11px] font-medium text-rose-500">{errors[`contact_${index}_contact_type_id`]}</p>}
                                            </div>
                                            <PartnerField label="Email" required type="email" value={contact.contact_email} edit onChange={v => handleContactChange(index, 'contact_email', v)} error={errors[`contact_${index}_contact_email`]} maxLength={null} />
                                            <div className="min-w-0 sm:col-span-2">
                                                <p className="nx-label">Phone</p>
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
                                                {errors[`contact_${index}_contact_phone`] && <p className="mt-1 text-[11px] font-medium text-rose-500">{errors[`contact_${index}_contact_phone`]}</p>}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <Fact label="Contact type" value={contact.contact_type_name || lookups.clientContactTypes?.find(t => t.id === contact.contact_type_id)?.name} />
                                            <Fact icon={Mail} label="Email" value={contact.contact_email} />
                                            <Fact icon={Phone} label="Phone" value={contact.contact_phone ? `${contact.phone_dial_code || ''} ${contact.contact_phone}`.trim() : null} />
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {section === 'history' && (
                    <>
                        <SectionTitle icon={Rocket} title="Engagement history" subtitle="Every engagement staffed at this partner" />
                        <PlacementHistoryPanel clientId={currentClient?.id} onNavigate={onClose} />
                    </>
                )}
            </DetailLayout>
        </BaseModal>
    );
};

export default ClientDetailModal;
