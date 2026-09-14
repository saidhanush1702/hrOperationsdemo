import { useState, useEffect } from 'react';
import { RefreshCw, ChevronRight, ChevronLeft, Check, UserPlus, AlertTriangle } from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import AmountInput from '../../../components/ui/AmountInput';

const getNextDay = (dateString) => {
    if (!dateString) return undefined;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return undefined;
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
};

const formatSSN = (value) => {
    const v = value.replace(/\D/g, '').substring(0, 9);
    const match = v.match(/^(\d{0,3})(\d{0,2})(\d{0,4})$/);
    if (!match) return v;
    return !match[2] ? match[1] : `${match[1]}-${match[2]}${match[3] ? `-${match[3]}` : ''}`;
};

const AddEmployeeModal = ({ isOpen, onClose, onRefresh }) => {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({}); 
    const [submitError, setSubmitError] = useState(''); 

    const [lookups, setLookups] = useState({ 
        genders: [], 
        employeeTypes: [], 
        countries: [], 
        immigrationStatuses: [],
        maritalStatuses: [],
        phoneCodes: []
    });

    const initialFormState = {
        profile: {
            first_name: '', last_name: '', birth_date: '',
            gender_id: '', marital_status_id: '', title: '', employee_code: '', 
            employee_type_id: '', ssn: '', joining_date: '',
            immigration_status_id: '', immigration_start_date: '', immigration_till_date: '', lca_wage: '',
            personal_email: '', phone_code_id: '', phone_number: '', country_id: '', e_verification_code: ''
        },
        auth: { email: '', password: '' }
    };

    const [formData, setFormData] = useState(initialFormState);

    const stepTitles = [
        "1. Demographic & Contact",
        "2. Employment Details",
        "3. Immigration Details",
        "4. Communication & Identity",
        "Final Step: Account Setup"
    ];

    useEffect(() => {
        if (isOpen) {
            const fetchInitialData = async () => {
                try {
                    const [codeRes, lookupsRes] = await Promise.all([
                        managementAPI.getNextEmployeeCode(),
                        commonAPI.getLookups()
                    ]);
                    
                    if (codeRes.data.nextCode) {
                        setFormData(prev => ({
                            ...prev,
                            profile: { ...prev.profile, employee_code: codeRes.data.nextCode }
                        }));
                    }
                    if (lookupsRes.data) {
                        setLookups(lookupsRes.data);
                    }
                } catch (err) {
                    console.error("Failed to fetch initial data", err);
                }
            };
            fetchInitialData();
        } else {
            setFormData(initialFormState);
            setStep(1);
            setErrors({});
            setSubmitError('');
        }
    }, [isOpen]);

    const updateProfile = (field, value) => {
        setFormData(prev => ({ ...prev, profile: { ...prev.profile, [field]: value } }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
        if (submitError) setSubmitError('');
    };

    const updateAuth = (field, value) => {
        setFormData(prev => ({ ...prev, auth: { ...prev.auth, [field]: value } }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
        if (submitError) setSubmitError('');
    };

    const generatePassword = () => {
        const pass = Math.random().toString(36).slice(-10) + "!" + Math.floor(Math.random()*10);
        updateAuth('password', pass);
    };

    const validateStep = () => {
        const newErrors = {};
        const p = formData.profile;
        const a = formData.auth;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (step === 1) {
            if (!p.first_name) newErrors.first_name = "First name is required.";
            if (!p.last_name) newErrors.last_name = "Last name is required.";
            if (!p.birth_date) newErrors.birth_date = "Birth date is required.";
            if (!p.gender_id) newErrors.gender_id = "Gender is required.";
        }
        if (step === 2) {
            if (!p.title) newErrors.title = "Job title is required.";
            if (!p.joining_date) newErrors.joining_date = "Joining date is required.";
            if (!p.ssn) {
                newErrors.ssn = "SSN is required.";
            } else if (p.ssn.length !== 11) {
                newErrors.ssn = "SSN must be 9 digits (XXX-XX-XXXX).";
            }
        }
        if (step === 3) {
            if (p.immigration_start_date && p.immigration_till_date && p.immigration_start_date >= p.immigration_till_date) {
                newErrors.immigration_till_date = "Till Date must be strictly after the Start Date.";
            }
        }
        if (step === 4) {
            if (!p.personal_email) {
                newErrors.personal_email = "Personal email is required.";
            } else if (!emailRegex.test(p.personal_email)) {
                newErrors.personal_email = "Please enter a valid email address.";
            }
            
            // Country-Specific Phone Validation
            if (!p.phone_code_id) {
                newErrors.phone_number = "Country code is required.";
            } else if (!p.phone_number) {
                newErrors.phone_number = "Phone number is required.";
            } else {
                const selectedCode = lookups.phoneCodes?.find(pc => String(pc.id) === String(p.phone_code_id));
                if (selectedCode) {
                    const country = selectedCode.country_name;
                    const digitsOnly = p.phone_number.replace(/\D/g, ''); 

                    if (['Canada', 'United States', 'India'].includes(country) && digitsOnly.length !== 10) {
                        newErrors.phone_number = `${country} phone numbers must be exactly 10 digits.`;
                    } else if (country === 'United Kingdom' && (digitsOnly.length < 10 || digitsOnly.length > 11)) {
                        newErrors.phone_number = "UK phone numbers must be 10 or 11 digits.";
                    }
                }
            }

            if (!p.country_id) newErrors.country_id = "Country of origin is required.";
            if (!p.e_verification_code) newErrors.e_verification_code = "E-Verification code is required.";
        }
        if (step === 5) {
            if (!a.email) {
                newErrors.email = "Login email is required.";
            } else if (!emailRegex.test(a.email)) {
                newErrors.email = "Please enter a valid email address.";
            }
            if (!a.password) newErrors.password = "Password is required.";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNext = () => {
        if (!validateStep()) return;
        setStep(step + 1);
    };

    const handleSubmit = async () => {
        if (!validateStep()) return;
        setLoading(true);
        setSubmitError(''); 
        try {
            await managementAPI.addEmployee(formData);
            onRefresh(); 
            onClose();
        } catch (err) { 
            const backendError = err.response?.data?.error || err.response?.data?.message || err.message || "An unknown error occurred.";
            setSubmitError(backendError);
        } finally { 
            setLoading(false); 
        }
    };

    const modalFooter = (
        <div className="flex flex-col w-full gap-3">
            {submitError && (
                <div className="w-full bg-red-500/10 border border-red-500/30 text-red-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>{submitError}</span>
                </div>
            )}
            
            <div className="flex justify-between w-full">
                <button 
                    disabled={step === 1} 
                    onClick={() => setStep(step - 1)} 
                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-(--text-muted) hover:text-(--text-main) disabled:opacity-0 transition-all outline-none"
                >
                    <ChevronLeft size={14}/> Back
                </button>
                
                {step < 5 ? (
                    <button 
                        onClick={handleNext} 
                        className="bg-(--brand-primary) text-(--brand-primary-text) px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm hover:opacity-90 active:scale-95 transition-all outline-none"
                    >
                        Next <ChevronRight size={14}/>
                    </button>
                ) : (
                    <button 
                        onClick={handleSubmit} 
                        disabled={loading} 
                        className="bg-(--brand-primary) text-(--brand-primary-text) px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 outline-none"
                    >
                        {loading ? 'Creating...' : 'Finish & Save'} <Check size={14}/>
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <BaseModal
            isOpen={isOpen} onClose={onClose} icon={<UserPlus size={16} />}
            title="Hire New Staff"
            subtitle={<span className="text-(--brand-primary) font-bold">{stepTitles[step - 1]}</span>}
            headerRight={`Step ${step} of 5`}
            footer={modalFooter}
        >
            {step === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <FormInput label="First Name*" value={formData.profile.first_name} onChange={v => updateProfile('first_name', v)} error={errors.first_name} />
                    <FormInput label="Last Name*" value={formData.profile.last_name} onChange={v => updateProfile('last_name', v)} error={errors.last_name} />
                    <FormInput label="Birth Date*" type="date" value={formData.profile.birth_date} onChange={v => updateProfile('birth_date', v)} error={errors.birth_date} />
                    <FormSelect label="Gender*" isObject={true} options={lookups.genders || []} value={formData.profile.gender_id} onChange={v => updateProfile('gender_id', v)} error={errors.gender_id} />
                    <div className="col-span-1 sm:col-span-2">
                        <FormSelect label="Marital Status" isObject={true} options={lookups.maritalStatuses || []} value={formData.profile.marital_status_id} onChange={v => updateProfile('marital_status_id', v)} />
                    </div>
                </div>
            )}

            {step === 2 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <FormInput label="Job Title*" value={formData.profile.title} onChange={v => updateProfile('title', v)} error={errors.title} />
                    <FormSelect label="Job Type" isObject={true} options={lookups.employeeTypes || []} value={formData.profile.employee_type_id} onChange={v => updateProfile('employee_type_id', v)} />
                    <FormInput label="Employee Code (Auto-Generated)" value={formData.profile.employee_code} onChange={() => {}} placeholder="Fetching..." readOnly={true} />
                    <FormInput label="Joining Date*" type="date" value={formData.profile.joining_date} onChange={v => updateProfile('joining_date', v)} error={errors.joining_date} />
                    <div className="col-span-1 sm:col-span-2">
                        <FormInput label="SSN / Tax ID*" placeholder="XXX-XX-XXXX" maxLength={11} value={formData.profile.ssn} onChange={v => updateProfile('ssn', formatSSN(v))} error={errors.ssn} />
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <FormSelect label="Immigration Status" isObject={true} options={lookups.immigrationStatuses || []} value={formData.profile.immigration_status_id} onChange={v => updateProfile('immigration_status_id', v)} />
                    <FormInput label="Start Date" type="date" value={formData.profile.immigration_start_date} onChange={v => updateProfile('immigration_start_date', v)} />
                    <FormInput label="Till Date" type="date" value={formData.profile.immigration_till_date} min={getNextDay(formData.profile.immigration_start_date)} onChange={v => updateProfile('immigration_till_date', v)} error={errors.immigration_till_date} />
                    <FormInput label="LCA Wage" type="amount" placeholder="e.g. 85000" value={formData.profile.lca_wage} onChange={v => updateProfile('lca_wage', v)} />
                </div>
            )}

            {step === 4 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <FormInput label="Personal Email*" type="email" value={formData.profile.personal_email} onChange={v => updateProfile('personal_email', v)} error={errors.personal_email} maxLength={null} />
                    
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest ml-1">Phone Number*</label>
                        <div className="flex gap-2">
                            <select 
                                className="w-1/3 py-1.5 px-2 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) focus:border-(--brand-primary) rounded-lg text-xs font-bold outline-none"
                                value={formData.profile.phone_code_id}
                                onChange={e => {
                                    updateProfile('phone_code_id', e.target.value);
                                    updateProfile('phone_number', ''); 
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
                                className={`w-2/3 py-1.5 px-3 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) focus:border-(--brand-primary) rounded-lg text-xs font-bold outline-none transition-all ${errors.phone_number ? 'border-red-500 focus:ring-red-500' : ''}`}
                                value={formData.profile.phone_number}
                                onChange={e => {
                                    const onlyNums = e.target.value.replace(/\D/g, '').slice(0, 10);
                                    updateProfile('phone_number', onlyNums);
                                }}
                            />
                        </div>
                        {errors.phone_number && <p className="text-[10px] text-red-500 font-semibold ml-1">{errors.phone_number}</p>}
                    </div>

                    <FormSelect label="Country of Origin*" isObject={true} options={lookups.countries || []} value={formData.profile.country_id} onChange={v => updateProfile('country_id', v)} error={errors.country_id} />
                    <FormInput label="E-Verification Code*" maxLength={15} value={formData.profile.e_verification_code} onChange={v => updateProfile('e_verification_code', v.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15))} error={errors.e_verification_code} />
                </div>
            )}

            {step === 5 && (
                <div className="space-y-3 sm:space-y-4 max-w-md mx-auto py-2 sm:py-6">
                    <FormInput label="Personal Email (Login)*" type="email" value={formData.auth.email} onChange={v => updateAuth('email', v)} error={errors.email} maxLength={null} />
                    <div className="space-y-1">
                        <div className="flex justify-between items-center">
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest ml-1">Password*</label>
                            <button onClick={generatePassword} className="text-[10px] font-bold text-(--brand-primary) flex items-center gap-1 hover:opacity-80 transition-opacity outline-none">
                                <RefreshCw size={10}/> Generate
                            </button>
                        </div>
                        <input 
                            type="text" 
                            maxLength={25}
                            className={`w-full py-1.5 px-3 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) focus:border-(--brand-primary) rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-(--brand-primary) transition-all placeholder:text-(--input-placeholder) ${errors.password ? 'border-red-500 focus:ring-red-500' : ''}`}
                            value={formData.auth.password} 
                            onChange={e => updateAuth('password', e.target.value)} 
                        />
                        {errors.password && <p className="text-[10px] text-red-500 font-semibold ml-1">{errors.password}</p>}
                    </div>
                </div>
            )}
        </BaseModal>
    );
};

const FormInput = ({ label, type = "text", value, onChange, placeholder, readOnly = false, min, maxLength = 25, error }) => (
    <div className="space-y-1">
        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest ml-1">{label}</label>
        {type === 'amount' ? (
            <AmountInput
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className={`w-full py-1.5 px-3 bg-(--input-bg) text-(--input-text) border rounded-lg text-xs font-bold outline-none transition-all ${
                    error
                        ? 'border-red-500 focus:ring-1 focus:ring-red-500 focus:border-red-500'
                        : 'border-(--border-subtle) focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary)'
                }`}
            />
        ) : (
            <input
                type={type}
                placeholder={placeholder}
                readOnly={readOnly}
                min={min}
                maxLength={type === "email" ? undefined : maxLength}
                className={`w-full py-1.5 px-3 bg-(--input-bg) text-(--input-text) border rounded-lg text-xs font-bold outline-none transition-all ${
                    readOnly
                    ? 'opacity-60 cursor-not-allowed bg-(--bg-app) border-(--border-subtle)'
                    : error
                        ? 'border-red-500 focus:ring-1 focus:ring-red-500 focus:border-red-500'
                        : 'border-(--border-subtle) focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary)'
                }`}
                value={value}
                onChange={e => onChange && onChange(e.target.value)}
            />
        )}
        {error && <p className="text-[10px] text-red-500 font-semibold ml-1">{error}</p>}
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
            <option value="" disabled className="text-(--input-placeholder)">Select...</option>
            {options.map(opt => (
                <option key={isObject ? opt.id : opt} value={isObject ? opt.id : opt}>
                    {isObject ? opt.name : opt}
                </option>
            ))}
        </select>
        {error && <p className="text-[10px] text-red-500 font-semibold ml-1">{error}</p>}
    </div>
);

export default AddEmployeeModal;