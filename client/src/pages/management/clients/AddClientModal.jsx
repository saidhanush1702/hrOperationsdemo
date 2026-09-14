import { useState, useEffect } from 'react';
import { Building, Check, Plus, Trash2, Star, AlertTriangle } from 'lucide-react';
import api from '../../../api/axios';
import { commonAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';

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
    }, [isOpen]);

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
        const websiteRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;

        // Client Info Validation
        if (!formData.client_name) newErrors.client_name = "Client name is required.";
        
        // Website Validation
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
            
            // Email Validation
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

    const modalFooter = (
        <div className="flex flex-col w-full gap-3">
            {submitError && (
                <div className="w-full bg-red-500/10 border border-red-500/30 text-red-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>{submitError}</span>
                </div>
            )}
            <div className="flex justify-end w-full">
                <button 
                    onClick={handleSubmit} 
                    disabled={loading} 
                    className="bg-(--brand-primary) text-(--brand-primary-text) px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 outline-none"
                >
                    {loading ? 'Registering...' : 'Save Client'} <Check size={14}/>
                </button>
            </div>
        </div>
    );

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            icon={<Building size={16} />}
            title="Register Client"
            subtitle="Add a new company and their contacts"
            headerRight={`${formData.contacts.length} Contact${formData.contacts.length !== 1 ? 's' : ''}`}
            footer={modalFooter}
        >
            <div className="space-y-4">
                
                {/* Company Details - Changed to a 2x2 Grid for better proportions */}
                <div className="grid -mt-3 grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                    <FormInput 
                        label="Client / Company Name*" 
                        value={formData.client_name} 
                        onChange={v => updateField('client_name', v)} 
                        error={errors.client_name} 
                    />
                    <FormInput 
                        label="Company Website*" 
                        placeholder="e.g. www.example.com" 
                        value={formData.website} 
                        onChange={v => updateField('website', v)} 
                        error={errors.website} 
                    />
                    <FormInput 
                        label="Office Address" 
                        placeholder="Not mandatory" 
                        value={formData.address} 
                        onChange={v => updateField('address', v)} 
                    />
                    <FormInput 
                        label="Fax Number" 
                        placeholder="Not mandatory" 
                        value={formData.fax_number} 
                        onChange={v => updateField('fax_number', v.replace(/[^\d+]/g, ''))} 
                        error={errors.fax_number}
                        maxLength={20}
                    />
                </div>
                
                {/* Contacts Section */}
                <div className="pt-3 border-t border-(--border-subtle) transition-colors duration-300">
                    <div className="flex justify-between items-center mb-3">
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">
                            Points of Contact
                        </p>
                        <button 
                            type="button" 
                            onClick={addContact}
                            className="flex items-center gap-1.5 text-[10px] font-bold text-(--brand-primary) uppercase tracking-widest hover:opacity-80 active:scale-95 transition-all bg-(--brand-primary)/10 px-3 py-1.5 rounded-lg outline-none"
                        >
                            <Plus size={12} /> Add Contact
                        </button>
                    </div>

                    <div className="space-y-3">
                        {formData.contacts.map((contact, index) => (
                            <div key={index} className="relative p-4 rounded-xl border border-(--border-subtle) bg-(--bg-app)/50 transition-colors duration-300">
                                
                                {/* Contact Header Controls */}
                                <div className="flex justify-between items-center mb-3 pb-2 border-b border-(--border-subtle)">
                                    <button 
                                        type="button"
                                        onClick={() => setPrimaryContact(index)}
                                        className={`flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-widest px-2 py-1 rounded-md transition-all outline-none ${
                                            contact.is_primary 
                                            ? 'bg-yellow-500/10 text-yellow-500' 
                                            : 'text-(--text-muted) hover:bg-(--bg-surface) hover:text-(--text-main)'
                                        }`}
                                    >
                                        <Star size={12} className={contact.is_primary ? "fill-yellow-500" : ""} />
                                        {contact.is_primary ? "Primary Contact" : "Make Primary"}
                                    </button>

                                    {formData.contacts.length > 1 && (
                                        <button 
                                            type="button"
                                            onClick={() => removeContact(index)}
                                            className="text-(--text-muted) hover:text-red-500 p-1.5 hover:bg-red-500/10 rounded-md transition-colors flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest outline-none"
                                            title="Remove Contact"
                                        >
                                            <Trash2 size={12} /> Remove
                                        </button>
                                    )}
                                </div>

                                {/* Contact Inputs - Changed to a more spacious 3-column layout */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
                                    <FormInput 
                                        label="Contact Name*" 
                                        value={contact.contact_name} 
                                        onChange={v => handleContactChange(index, 'contact_name', v)} 
                                        error={errors[`contact_${index}_contact_name`]}
                                    />
                                    <FormInput 
                                        label="Contact Title" 
                                        placeholder="e.g. Director"
                                        value={contact.contact_title} 
                                        onChange={v => handleContactChange(index, 'contact_title', v)} 
                                    />
                                    <FormSelect 
                                        label="Contact Type*" 
                                        isObject={true} 
                                        options={lookups.clientContactTypes || []} 
                                        value={contact.contact_type_id} 
                                        onChange={v => handleContactChange(index, 'contact_type_id', v)} 
                                        error={errors[`contact_${index}_contact_type_id`]}
                                    />
                                    <FormInput 
                                        label="Contact Email*" 
                                        type="email"
                                        value={contact.contact_email} 
                                        onChange={v => handleContactChange(index, 'contact_email', v)} 
                                        error={errors[`contact_${index}_contact_email`]}
                                        maxLength={null}
                                    />
                                    
                                    {/* DB-Driven Country Code & Phone Input */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest ml-1">Contact Phone</label>
                                        <div className="flex gap-1">
                                            <select 
                                                className={`w-1/3 py-1.5 px-1 bg-(--input-bg) text-(--input-text) border ${errors[`contact_${index}_contact_phone`] ? 'border-red-500' : 'border-(--border-subtle)'} focus:border-(--brand-primary) rounded-lg text-xs font-bold outline-none`}
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
                                                className={`w-2/3 py-1.5 px-2 bg-(--input-bg) text-(--input-text) border rounded-lg text-xs font-bold outline-none transition-all ${errors[`contact_${index}_contact_phone`] ? 'border-red-500 focus:ring-red-500' : 'border-(--border-subtle) focus:border-(--brand-primary)'}`}
                                                value={contact.contact_phone || ''}
                                                onChange={e => handleContactChange(index, 'contact_phone', e.target.value.replace(/\D/g, ''))}
                                            />
                                        </div>
                                        {errors[`contact_${index}_contact_phone`] && <p className="text-[10px] text-red-500 font-semibold ml-1 leading-tight">{errors[`contact_${index}_contact_phone`]}</p>}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </BaseModal>
    );
};

// Reusable Components Match EmployeeModal Format Exactly
const FormInput = ({ label, type = "text", value, onChange, placeholder, readOnly = false, min, maxLength = 50, error }) => (
    <div className="space-y-1">
        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest ml-1">{label}</label>
        <input 
            type={type} 
            placeholder={placeholder}
            readOnly={readOnly}
            min={min}
            maxLength={type === "email" ? undefined : maxLength} 
            className={`w-full py-1.5 px-3 bg-(--input-bg) text-(--input-text) border rounded-lg text-xs font-bold outline-none transition-all placeholder:font-normal placeholder:text-(--text-muted) ${
                readOnly 
                ? 'opacity-60 cursor-not-allowed bg-(--bg-app) border-(--border-subtle)' 
                : error 
                    ? 'border-red-500 focus:ring-1 focus:ring-red-500 focus:border-red-500' 
                    : 'border-(--border-subtle) focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary)'
            }`}
            value={value} 
            onChange={e => onChange && onChange(e.target.value)} 
        />
        {error && <p className="text-[10px] text-red-500 font-semibold ml-1 leading-tight">{error}</p>}
    </div>
);

const FormSelect = ({ label, options, value, onChange, isObject = false, error }) => (
    <div className="space-y-1">
        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest ml-1">{label}</label>
        <select 
            className={`w-full py-1.5 px-3 bg-(--input-bg) text-(--input-text) border rounded-lg text-xs font-bold outline-none transition-all ${
                error 
                    ? 'border-red-500 focus:ring-1 focus:ring-red-500 focus:border-red-500' 
                    : 'border-(--border-subtle) focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary)'
            }`}
            value={value || ''} 
            onChange={e => onChange(e.target.value)}
        >
            <option value="" disabled className="text-(--input-placeholder)">Select Type...</option>
            {options.map(opt => (
                <option key={isObject ? opt.id : opt} value={isObject ? opt.id : opt}>
                    {isObject ? opt.name : opt}
                </option>
            ))}
        </select>
        {error && <p className="text-[10px] text-red-500 font-semibold ml-1 leading-tight">{error}</p>}
    </div>
);

export default AddClientModal;