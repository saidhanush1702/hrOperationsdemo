import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Check, UserPlus, AlertTriangle, User, Briefcase, Plane, Phone, KeyRound } from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import AmountInput from '../../../components/ui/AmountInput';
import { Field, Btn, cx } from '../../../components/ui/kit';

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

// The onboarding canvas: every section is visible on one page and saved together.
// `profile` / `auth` list the required fields that drive the completion meter;
// `errorKeys` are the validation keys that flag a section in the map.
const SECTIONS = [
    { n: 1, title: 'Identity',             subtitle: 'Who the consultant is',             icon: User,      profile: ['first_name', 'last_name', 'birth_date', 'gender_id'], errorKeys: ['first_name', 'last_name', 'birth_date', 'gender_id'] },
    { n: 2, title: 'Role & tax identity',  subtitle: 'Position, start date and SSN',       icon: Briefcase, profile: ['title', 'joining_date', 'ssn'],                      errorKeys: ['title', 'joining_date', 'ssn'] },
    { n: 3, title: 'Work authorization',   subtitle: 'Visa status, validity and wage',     icon: Plane,     profile: [],                                                    errorKeys: ['immigration_till_date'] },
    { n: 4, title: 'Reach & verification', subtitle: 'Contact details and E-Verify',       icon: Phone,     profile: ['personal_email', 'phone_code_id', 'phone_number', 'country_id', 'e_verification_code'], errorKeys: ['personal_email', 'phone_number', 'country_id', 'e_verification_code'] },
    { n: 5, title: 'Portal access',        subtitle: 'Sign-in for the consultant portal',  icon: KeyRound,  auth: ['email', 'password'],                                   errorKeys: ['email', 'password'] },
];

const isFilled = (v) => v !== null && v !== undefined && String(v).trim() !== '';

const FormInput = ({ label, required, type = 'text', value, onChange, placeholder, readOnly = false, min, maxLength = 25, error, className }) => (
    <Field label={label} required={required} error={error} className={className}>
        {type === 'amount' ? (
            <AmountInput
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className={cx('nx-input', error && 'nx-invalid')}
            />
        ) : (
            <input
                type={type}
                placeholder={placeholder}
                readOnly={readOnly}
                min={min}
                maxLength={type === 'email' ? undefined : maxLength}
                className={cx('nx-input', error && 'nx-invalid')}
                value={value}
                onChange={e => onChange && onChange(e.target.value)}
            />
        )}
    </Field>
);

const FormSelect = ({ label, required, options, value, onChange, isObject = false, error, className }) => (
    <Field label={label} required={required} error={error} className={className}>
        <select
            className={cx('nx-input cursor-pointer', error && 'nx-invalid')}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
        >
            <option value="" disabled>Select…</option>
            {options.map(opt => (
                <option key={isObject ? opt.id : opt} value={isObject ? opt.id : opt}>
                    {isObject ? opt.name : opt}
                </option>
            ))}
        </select>
    </Field>
);

const AddEmployeeModal = ({ isOpen, onClose, onRefresh }) => {
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [submitError, setSubmitError] = useState('');
    const [activeSection, setActiveSection] = useState(1);
    const sectionRefs = useRef({});

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
            setActiveSection(1);
            setErrors({});
            setSubmitError('');
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // Highlight the section currently in view in the onboarding map.
    useEffect(() => {
        if (!isOpen) return undefined;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) setActiveSection(Number(entry.target.dataset.section));
            });
        }, { rootMargin: '-30% 0px -60% 0px' });
        Object.values(sectionRefs.current).filter(Boolean).forEach(node => observer.observe(node));
        return () => observer.disconnect();
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

    // Validation rules per section (unchanged rules, run for every section on submit).
    const collectErrors = (step) => {
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
            if (!p.joining_date) newErrors.joining_date = "Start date is required.";
            if (!p.ssn) {
                newErrors.ssn = "SSN is required.";
            } else if (p.ssn.length !== 11) {
                newErrors.ssn = "SSN must be 9 digits (XXX-XX-XXXX).";
            }
        }
        if (step === 3) {
            if (p.immigration_start_date && p.immigration_till_date && p.immigration_start_date >= p.immigration_till_date) {
                newErrors.immigration_till_date = "Valid-through date must be strictly after the start date.";
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

        return newErrors;
    };

    const goTo = (n) => {
        setActiveSection(n);
        sectionRefs.current[n]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const handleSubmit = async () => {
        const allErrors = {};
        let firstInvalid = null;
        for (let s = 1; s <= SECTIONS.length; s++) {
            const sectionErrors = collectErrors(s);
            if (Object.keys(sectionErrors).length > 0 && firstInvalid === null) firstInvalid = s;
            Object.assign(allErrors, sectionErrors);
        }
        setErrors(allErrors);
        if (firstInvalid !== null) { goTo(firstInvalid); return; }

        setLoading(true);
        setSubmitError('');
        try {
            const res = await managementAPI.addEmployee(formData);
            // The profile is saved even when the welcome email fails; say so.
            if (res.data?.emailSent === false) alert(res.data.message);
            onRefresh();
            onClose();
        } catch (err) {
            const backendError = err.response?.data?.error || err.response?.data?.message || err.message || "An unknown error occurred.";
            setSubmitError(backendError);
        } finally {
            setLoading(false);
        }
    };

    const sectionState = (s) => {
        const values = [
            ...(s.profile || []).map(f => formData.profile[f]),
            ...(s.auth || []).map(f => formData.auth[f]),
        ];
        return {
            optional: values.length === 0,
            done: values.length > 0 && values.every(isFilled),
            hasError: s.errorKeys.some(k => errors[k]),
        };
    };

    const requiredTotal = SECTIONS.reduce((n, s) => n + (s.profile?.length || 0) + (s.auth?.length || 0), 0);
    const requiredFilled = SECTIONS.reduce((n, s) => n
        + (s.profile || []).filter(f => isFilled(formData.profile[f])).length
        + (s.auth || []).filter(f => isFilled(formData.auth[f])).length, 0);
    const progress = Math.round((requiredFilled / requiredTotal) * 100);

    const p = formData.profile;

    const renderSection = (n) => {
        switch (n) {
            case 1:
                return (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormInput label="First name" required value={p.first_name} onChange={v => updateProfile('first_name', v)} error={errors.first_name} />
                        <FormInput label="Last name" required value={p.last_name} onChange={v => updateProfile('last_name', v)} error={errors.last_name} />
                        <FormInput label="Birth date" required type="date" value={p.birth_date} onChange={v => updateProfile('birth_date', v)} error={errors.birth_date} />
                        <FormSelect label="Gender" required isObject options={lookups.genders || []} value={p.gender_id} onChange={v => updateProfile('gender_id', v)} error={errors.gender_id} />
                        <FormSelect label="Marital status" isObject options={lookups.maritalStatuses || []} value={p.marital_status_id} onChange={v => updateProfile('marital_status_id', v)} className="sm:col-span-2" />
                    </div>
                );
            case 2:
                return (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormInput label="Job title" required value={p.title} onChange={v => updateProfile('title', v)} error={errors.title} />
                        <FormSelect label="Employment type" isObject options={lookups.employeeTypes || []} value={p.employee_type_id} onChange={v => updateProfile('employee_type_id', v)} />
                        <FormInput label="Consultant ID (auto-generated)" value={p.employee_code} onChange={() => {}} placeholder="Fetching…" readOnly />
                        <FormInput label="Start date" required type="date" value={p.joining_date} onChange={v => updateProfile('joining_date', v)} error={errors.joining_date} />
                        <FormInput label="SSN / Tax ID" required placeholder="XXX-XX-XXXX" maxLength={11} value={p.ssn} onChange={v => updateProfile('ssn', formatSSN(v))} error={errors.ssn} className="sm:col-span-2" />
                    </div>
                );
            case 3:
                return (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <FormSelect label="Authorization status" isObject options={lookups.immigrationStatuses || []} value={p.immigration_status_id} onChange={v => updateProfile('immigration_status_id', v)} />
                        <FormInput label="Valid from" type="date" value={p.immigration_start_date} onChange={v => updateProfile('immigration_start_date', v)} />
                        <FormInput label="Valid through" type="date" value={p.immigration_till_date} min={getNextDay(p.immigration_start_date)} onChange={v => updateProfile('immigration_till_date', v)} error={errors.immigration_till_date} />
                        <FormInput label="LCA wage" type="amount" placeholder="e.g. 85000" value={p.lca_wage} onChange={v => updateProfile('lca_wage', v)} />
                    </div>
                );
            case 4:
                return (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormInput label="Personal email" required type="email" value={p.personal_email} onChange={v => updateProfile('personal_email', v)} error={errors.personal_email} maxLength={null} />

                        <Field label="Phone number" required error={errors.phone_number}>
                            <div className="flex gap-2">
                                <select
                                    className="nx-input w-2/5 cursor-pointer"
                                    value={p.phone_code_id}
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
                                    className={cx('nx-input w-3/5', errors.phone_number && 'nx-invalid')}
                                    value={p.phone_number}
                                    onChange={e => {
                                        const onlyNums = e.target.value.replace(/\D/g, '').slice(0, 10);
                                        updateProfile('phone_number', onlyNums);
                                    }}
                                />
                            </div>
                        </Field>

                        <FormSelect label="Country of origin" required isObject options={lookups.countries || []} value={p.country_id} onChange={v => updateProfile('country_id', v)} error={errors.country_id} />
                        <FormInput label="E-Verify code" required maxLength={15} value={p.e_verification_code} onChange={v => updateProfile('e_verification_code', v.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15))} error={errors.e_verification_code} />
                    </div>
                );
            case 5:
                return (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormInput label="Login email" required type="email" value={formData.auth.email} onChange={v => updateAuth('email', v)} error={errors.email} maxLength={null} />
                        <Field label="Password" required error={errors.password}>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    maxLength={25}
                                    className={cx('nx-input font-mono', errors.password && 'nx-invalid')}
                                    value={formData.auth.password}
                                    onChange={e => updateAuth('password', e.target.value)}
                                />
                                <Btn size="md" icon={RefreshCw} onClick={generatePassword}>Generate</Btn>
                            </div>
                        </Field>
                    </div>
                );
            default:
                return null;
        }
    };

    const modalFooter = (
        <div className="flex w-full flex-col gap-3">
            {submitError && (
                <div className="flex items-center gap-2 rounded-[14px] border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-500">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{submitError}</span>
                </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex min-w-[200px] flex-1 items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-(--border-subtle)">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: 'var(--brand-gradient)' }} />
                    </div>
                    <span className="font-mono text-xs text-(--text-muted)">{progress}% complete</span>
                </div>
                <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
                <Btn variant="primary" icon={Check} onClick={handleSubmit} disabled={loading}>
                    {loading ? 'Creating…' : 'Create consultant'}
                </Btn>
            </div>
        </div>
    );

    return (
        <BaseModal
            isOpen={isOpen}
            onClose={onClose}
            icon={<UserPlus size={18} />}
            title="Onboard a consultant"
            subtitle="Fill in each section — everything is saved together"
            footer={modalFooter}
            noPadding
        >
            <div className="grid min-h-full lg:grid-cols-[290px_minmax(0,1fr)]">
                <aside className="border-b border-(--border-subtle) bg-(--bg-app)/40 p-5 lg:border-b-0 lg:border-r lg:p-6">
                    <div className="lg:sticky lg:top-6">
                        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-(--brand-primary)">Onboarding map</p>
                        <p className="mt-2 text-sm text-(--text-muted)">Jump to any section. Checks turn on as sections are completed.</p>
                        <ol className="hide-scrollbar mt-5 flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
                            {SECTIONS.map(s => {
                                const st = sectionState(s);
                                const on = activeSection === s.n;
                                return (
                                    <li key={s.n} className="shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => goTo(s.n)}
                                            className={cx(
                                                'flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left outline-none transition-colors',
                                                on ? 'bg-(--bg-surface) shadow-[0_10px_30px_-20px_var(--brand-glow)]' : 'hover:bg-(--text-main)/5',
                                            )}
                                        >
                                            <span
                                                className={cx(
                                                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                                                    st.hasError ? 'border-rose-500/40 bg-rose-500/10 text-rose-500'
                                                        : st.done ? 'border-transparent text-white'
                                                            : 'border-(--border-subtle) text-(--text-muted)',
                                                )}
                                                style={!st.hasError && st.done ? { background: 'var(--brand-gradient)' } : undefined}
                                            >
                                                {st.hasError ? <AlertTriangle size={14} /> : st.done ? <Check size={14} /> : s.n}
                                            </span>
                                            <span className="min-w-0">
                                                <span className={cx('block whitespace-nowrap text-sm text-(--text-main)', on && 'font-semibold')}>{s.title}</span>
                                                <span className="hidden truncate text-[11px] text-(--text-muted) lg:block">{st.optional ? 'Optional' : s.subtitle}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    </div>
                </aside>

                <div className="space-y-5 p-4 sm:p-6 lg:p-8">
                    {SECTIONS.map(s => (
                        <section
                            key={s.n}
                            data-section={s.n}
                            ref={el => { sectionRefs.current[s.n] = el; }}
                            className="scroll-mt-6 rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-5 sm:p-6"
                        >
                            <header className="mb-5 flex items-center gap-3">
                                <span className="font-mono text-xl font-semibold nx-gradient-text">{String(s.n).padStart(2, '0')}</span>
                                <span className="h-8 w-px bg-(--border-subtle)" />
                                <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-(--brand-primary)/10 text-(--brand-primary)">
                                    <s.icon size={16} />
                                </span>
                                <div>
                                    <h3 className="text-base font-semibold text-(--text-main)">{s.title}</h3>
                                    <p className="text-xs text-(--text-muted)">{s.subtitle}</p>
                                </div>
                            </header>
                            {renderSection(s.n)}
                        </section>
                    ))}
                </div>
            </div>
        </BaseModal>
    );
};

export default AddEmployeeModal;
