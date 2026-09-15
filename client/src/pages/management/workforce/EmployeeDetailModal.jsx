import { useState, useEffect } from 'react';
import {
    Save, Edit3, User, Briefcase, Phone, Trash2, AlertTriangle, Lock, Unlock, Plus, Plane, Eye, EyeOff,
    FolderOpen, RotateCcw, KeyRound, Rocket, CalendarDays, Globe, UserX, X,
} from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import PlacementHistoryPanel from '../../../components/layout/PlacementHistoryPanel';
import AmountInput from '../../../components/ui/AmountInput';
import DocumentViewerModal from './DocumentViewerModal';
import { fmtDate } from '../../../utils/dateUtils';
import { DetailLayout, SectionTitle, Btn, Chip, Avatar, Fact, EmptyState, cx } from '../../../components/ui/kit';

// Helpers
const getSafeImmigrations = (raw) => {
    if (!raw) return [];
    let parsed = raw;
    if (typeof raw === 'string') {
        try { parsed = JSON.parse(raw); }
        catch { return []; }
    }
    if (Array.isArray(parsed)) return parsed.filter(i => i);
    return [];
};

const getNextDay = (dateString) => {
    if (!dateString) return undefined;
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return undefined;
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
};

// Strips timestamps to ensure MySQL compatibility
const safeDate = (dateString) => {
    if (!dateString) return '';
    return typeof dateString === 'string' ? dateString.split('T')[0] : '';
};

const formatSSN = (value) => {
    const v = value.replace(/\D/g, '').substring(0, 9);
    const match = v.match(/^(\d{0,3})(\d{0,2})(\d{0,4})$/);
    if (!match) return v;
    return !match[2] ? match[1] : `${match[1]}-${match[2]}${match[3] ? `-${match[3]}` : ''}`;
};

const formatUSD = (value) => {
    if (!value) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
    }).format(value);
};

// Which section holds each validated field, so a failed save opens the right one.
const ERROR_SECTION = {
    first_name: 'identity', last_name: 'identity', birth_date: 'identity', gender_id: 'identity',
    title: 'role', employee_type_id: 'role', joining_date: 'role', ssn: 'role',
    personal_email: 'reach', phone_number: 'reach', country_id: 'reach', e_verification_code: 'reach',
};

// --- UI pieces ---

const EditableField = ({ label, required, value, edit, onChange, type = "text", isSelect = false, isObject = false, options = [], min, maxLength = 25, placeholder, error, className }) => {
    const getDisplayValue = () => {
        if (!value) return '—';
        if (type === 'ssn' && String(value).length >= 4) return `XXX-XX-${String(value).slice(-4)}`;
        if (type === 'date') return fmtDate(value);
        return value;
    };

    return (
        <div className={cx('min-w-0', className)}>
            <p className="nx-label">{label}{edit && required && <span className="ml-0.5 text-rose-500">*</span>}</p>
            {edit ? (
                isSelect ? (
                    <select className={cx('nx-input cursor-pointer', error && 'nx-invalid')} value={value || ''} onChange={e => onChange(e.target.value)}>
                        <option value="" disabled>Select…</option>
                        {options.map(opt => <option key={isObject ? opt.id : opt} value={isObject ? opt.id : opt}>{isObject ? opt.name : opt}</option>)}
                    </select>
                ) : type === 'amount' ? (
                    <AmountInput
                        value={value || ''}
                        onChange={onChange}
                        placeholder={placeholder}
                        className={cx('nx-input', error && 'nx-invalid')}
                    />
                ) : (
                    <input
                        type={type === 'ssn' || type === 'email' ? 'text' : type}
                        placeholder={placeholder}
                        maxLength={type === 'email' ? undefined : maxLength}
                        className={cx('nx-input', error && 'nx-invalid')}
                        value={value || ''}
                        min={min}
                        onChange={e => onChange(e.target.value)}
                    />
                )
            ) : (
                <p className="truncate rounded-[12px] bg-(--bg-app)/60 px-3 py-2.5 text-sm font-medium text-(--text-main)">{getDisplayValue()}</p>
            )}
            {error && <p className="mt-1 text-[11px] font-medium text-rose-500">{error}</p>}
        </div>
    );
};

const FieldGrid = ({ children }) => (
    <div className="grid gap-4 rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5 sm:grid-cols-2">{children}</div>
);

const AuthorizationCard = ({ imm, lookups, isEditingGlobal, isEditingThis, editImmData, setEditImmData, onEditStart, onEditCancel, onEditSave, onDelete, canDelete }) => (
    <div className="overflow-hidden rounded-[20px] border border-(--border-subtle) bg-(--bg-surface)">
        {isEditingThis ? (
            <div className="grid gap-3 border-l-[3px] border-(--brand-primary) p-4 sm:grid-cols-2 xl:grid-cols-4">
                <EditableField label="Status" required value={editImmData.status_id} edit isSelect isObject options={lookups.immigrationStatuses} onChange={v => setEditImmData({ ...editImmData, status_id: v })} />
                <EditableField label="Valid from" type="date" value={editImmData.start_date} edit onChange={v => setEditImmData({ ...editImmData, start_date: v })} />
                <EditableField label="Valid through" type="date" value={editImmData.till_date} edit min={getNextDay(editImmData.start_date)} onChange={v => setEditImmData({ ...editImmData, till_date: v })} />
                <EditableField label="LCA wage" type="amount" placeholder="e.g. 85000" value={editImmData.lca_wage} edit onChange={v => setEditImmData({ ...editImmData, lca_wage: v })} />
                <div className="flex justify-end gap-2 sm:col-span-2 xl:col-span-4">
                    <Btn size="sm" onClick={onEditCancel}>Cancel</Btn>
                    <Btn size="sm" variant="primary" onClick={onEditSave}>Update</Btn>
                </div>
            </div>
        ) : (
            <div className="flex flex-wrap items-center gap-4 p-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-(--brand-primary)/10 text-(--brand-primary)"><Plane size={18} /></span>
                <div className="min-w-[140px] flex-1">
                    <p className="text-sm font-semibold text-(--text-main)">{imm.status_name || imm.status}</p>
                    <p className="text-xs text-(--text-muted)">{fmtDate(imm.start_date) || '—'} → {fmtDate(imm.till_date) || '—'}</p>
                </div>
                <Fact label="LCA wage" value={formatUSD(imm.lca_wage)} />
                {isEditingGlobal && (
                    <div className="flex gap-1.5">
                        <Btn size="icon" icon={Edit3} onClick={onEditStart} title="Edit record" />
                        {canDelete && <Btn size="icon" variant="danger" icon={Trash2} onClick={onDelete} title="Delete record" />}
                    </div>
                )}
            </div>
        )}
    </div>
);

const EmployeeDetailModal = ({ employee, onClose, onRefresh }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [isTerminating, setIsTerminating] = useState(false);
    const [terminationData, setTerminationData] = useState({ date: '', reason: '' });
    const [section, setSection] = useState('identity');

    const [lookups, setLookups] = useState({
        genders: [], employeeTypes: [], countries: [], immigrationStatuses: [], maritalStatuses: [], phoneCodes: []
    });

    const [immigrations, setImmigrations] = useState(getSafeImmigrations(employee?.immigrations));
    const [showAddImm, setShowAddImm] = useState(false);
    const [newImm, setNewImm] = useState({ status_id: '', start_date: '', till_date: '', lca_wage: '' });

    const [editingImmId, setEditingImmId] = useState(null);
    const [editImmData, setEditImmData] = useState({ status_id: '', start_date: '', till_date: '', lca_wage: '' });

    const [showPassword, setShowPassword] = useState(false);
    const [showDocuments, setShowDocuments] = useState(false);

    const [editData, setEditData] = useState({});
    const [errors, setErrors] = useState({});
    const [submitError, setSubmitError] = useState('');

    const userRole = localStorage.getItem('userRole');
    const isActive = employee?.is_active === 1 || employee?.is_active === true;
    const isTerminated = !!employee?.termination_date;
    const canManage = ['ORG_ADMIN', 'ACCOUNTANT'].includes(userRole);

    useEffect(() => {
        if (employee) {
            setEditData({
                ...employee,
                birth_date: safeDate(employee.birth_date),
                joining_date: safeDate(employee.joining_date)
            });
            setErrors({});
            setSubmitError('');
        }
    }, [employee, isEditing]);

    useEffect(() => {
        if (isEditing || showAddImm || editingImmId !== null) {
            commonAPI.getLookups()
                .then(res => setLookups(res.data))
                .catch(err => console.error("Failed to load lookups", err));
        }
    }, [isEditing, showAddImm, editingImmId]);

    const updateField = (field, value) => {
        setEditData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }));
        if (submitError) setSubmitError('');
    };

    const validateForm = () => {
        const newErrors = {};
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!editData.first_name) newErrors.first_name = "First name is required.";
        if (!editData.last_name) newErrors.last_name = "Last name is required.";
        if (!editData.birth_date) newErrors.birth_date = "Birth date is required.";
        if (!editData.gender_id) newErrors.gender_id = "Gender is required.";

        if (!editData.title) newErrors.title = "Job title is required.";
        if (!editData.employee_type_id) newErrors.employee_type_id = "Employment type is required.";
        if (!editData.joining_date) newErrors.joining_date = "Start date is required.";

        if (!editData.ssn) {
            newErrors.ssn = "SSN is required.";
        } else if (editData.ssn.length !== 11) {
            newErrors.ssn = "SSN must be 9 digits.";
        }

        if (!editData.personal_email) {
            newErrors.personal_email = "Personal email is required.";
        } else if (!emailRegex.test(editData.personal_email)) {
            newErrors.personal_email = "Invalid email format.";
        }

        // Phone Validation
        if (!editData.phone_code_id) {
            newErrors.phone_number = "Country code is required.";
        } else if (!editData.phone_number) {
            newErrors.phone_number = "Phone number is required.";
        } else {
            const selectedCode = lookups.phoneCodes?.find(pc => String(pc.id) === String(editData.phone_code_id));
            if (selectedCode) {
                const country = selectedCode.country_name;
                const digitsOnly = editData.phone_number.replace(/\D/g, '');

                if (['Canada', 'United States', 'India'].includes(country) && digitsOnly.length !== 10) {
                    newErrors.phone_number = `${country} phone numbers must be exactly 10 digits.`;
                } else if (country === 'United Kingdom' && (digitsOnly.length < 10 || digitsOnly.length > 11)) {
                    newErrors.phone_number = "UK phone numbers must be 10 or 11 digits.";
                }
            }
        }

        if (!editData.country_id) newErrors.country_id = "Country is required.";
        if (!editData.e_verification_code) newErrors.e_verification_code = "E-Verify code is required.";

        setErrors(newErrors);
        const firstKey = Object.keys(newErrors)[0];
        if (firstKey && ERROR_SECTION[firstKey]) setSection(ERROR_SECTION[firstKey]);
        return Object.keys(newErrors).length === 0;
    };

    const handleSave = async () => {
        if (!validateForm()) return;
        try {
            await managementAPI.updateEmployee(employee.id, editData);
            setIsEditing(false); setShowAddImm(false); setEditingImmId(null); onRefresh();
        } catch (err) {
            const backendError = err.response?.data?.error || err.response?.data?.message || err.message || "An unknown error occurred.";
            setSubmitError(backendError);
        }
    };

    const handleToggleAccess = async () => {
        const newStatus = !isActive;
        const actionText = newStatus ? "RESTORE" : "SUSPEND";
        if (window.confirm(`Are you sure you want to ${actionText} portal access?`)) {
            try {
                await managementAPI.toggleEmployeeAccess(employee.id, { is_active: newStatus });
                onRefresh(); onClose();
            } catch (err) { setSubmitError(err.response?.data?.message || `Failed to ${actionText} access.`); }
        }
    };

    // Undoes an offboarding: clears the offboarding fields and restores the login in
    // one backend transaction. Only offered on a consultant who is actually offboarded.
    const handleReactivate = async () => {
        if (!window.confirm(
            `Reinstate ${employee.first_name} ${employee.last_name}?\n\n` +
            `Their offboarding date and reason will be cleared and portal access restored. ` +
            `Existing engagements are not reopened.`
        )) return;
        try {
            await managementAPI.reactivateEmployee(employee.id);
            onRefresh(); onClose();
        } catch (err) {
            setSubmitError(err.response?.data?.message || err.response?.data?.error || "Failed to reinstate consultant.");
        }
    };

    const handleTerminateConfirm = async () => {
        if (!terminationData.date || !terminationData.reason.trim()) return alert("Provide date and reason.");
        if (window.confirm(`WARNING: Officially offboard this consultant?`)) {
            try {
                await managementAPI.terminateEmployee(employee.id, terminationData);
                onRefresh(); onClose();
            } catch (err) { setSubmitError(err.response?.data?.message || "Offboarding failed."); }
        }
    };

    // -- WORK AUTHORIZATION ACTIONS --
    const handleAddImmigration = async () => {
        if (!newImm.status_id) return alert("Status is required");
        if (newImm.start_date && newImm.till_date && newImm.start_date >= newImm.till_date) return alert("Valid-through date must be strictly after the start date.");
        try {
            await managementAPI.addImmigration(employee.id, newImm);
            const statusObj = lookups.immigrationStatuses.find(s => String(s.id) === String(newImm.status_id));
            setImmigrations([...immigrations, { ...newImm, id: Date.now(), status_name: statusObj?.name }]);
            setNewImm({ status_id: '', start_date: '', till_date: '', lca_wage: '' });
            setShowAddImm(false); onRefresh();
        } catch { alert("Failed to add record"); }
    };

    const handleDeleteImmigration = async (immId) => {
        if (window.confirm("Remove this work authorization record?")) {
            try {
                await managementAPI.deleteImmigration(immId);
                setImmigrations(immigrations.filter(i => i.id !== immId)); onRefresh();
            } catch { alert("Failed to delete record"); }
        }
    };

    const handleUpdateImmigration = async (immId) => {
        if (!editImmData.status_id) return alert("Status is required");
        if (editImmData.start_date && editImmData.till_date && editImmData.start_date >= editImmData.till_date) return alert("Valid-through date must be strictly after the start date.");
        try {
            await managementAPI.updateImmigration(immId, editImmData);
            const statusObj = lookups.immigrationStatuses.find(s => String(s.id) === String(editImmData.status_id));
            setImmigrations(immigrations.map(imm => imm.id === immId ? { ...imm, ...editImmData, status_name: statusObj?.name } : imm));
            setEditingImmId(null); onRefresh();
        } catch { alert("Failed to update record"); }
    };

    if (!employee) return null;

    const fullName = `${editData.first_name || ''} ${editData.last_name || ''}`.trim();
    const statusChip = isTerminated
        ? <Chip tone="rose">Offboarded</Chip>
        : !isActive ? <Chip tone="amber">Access suspended</Chip>
            : <Chip tone="green">Active</Chip>;

    const aside = (
        <div>
            <div className="flex items-center gap-4 lg:block">
                <div className="relative w-fit">
                    <Avatar name={fullName} size={72} ring />
                    <span className={cx('absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-(--bg-surface)', isTerminated ? 'bg-rose-500' : isActive ? 'bg-emerald-500' : 'bg-amber-500')} />
                </div>
                <div className="min-w-0 lg:mt-4">
                    <p className="truncate text-xl font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{fullName || '—'}</p>
                    <p className="truncate text-sm text-(--text-muted)">{employee.title || '—'}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {statusChip}
                        <Chip tone="brand">{employee.employee_code || '—'}</Chip>
                    </div>
                </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) p-4 lg:grid-cols-1">
                <Fact icon={CalendarDays} label="Start date" value={fmtDate(employee.joining_date)} />
                <Fact icon={Briefcase} label="Employment type" value={employee.employee_type_name} />
                <Fact icon={Globe} label="Origin" value={employee.country_name} />
                {isTerminated && <Fact icon={UserX} label="Offboarded on" value={fmtDate(employee.termination_date)} />}
            </div>

            {submitError && (
                <div className="mt-4 flex items-start gap-2 rounded-[14px] border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-500">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>{submitError}</span>
                </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
                {!isEditing ? (
                    <Btn variant="primary" icon={Edit3} onClick={() => setIsEditing(true)}>Edit profile</Btn>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <Btn onClick={() => { setIsEditing(false); setShowAddImm(false); setEditingImmId(null); }}>Cancel</Btn>
                        <Btn variant="primary" icon={Save} onClick={handleSave}>Save</Btn>
                    </div>
                )}
                {canManage && !isTerminated && (
                    <Btn variant={isActive ? 'warn' : 'success'} icon={isActive ? Lock : Unlock} onClick={handleToggleAccess}>
                        {isActive ? 'Suspend portal access' : 'Restore portal access'}
                    </Btn>
                )}
                {canManage && !isTerminated && !isTerminating && (
                    <Btn variant="danger" icon={UserX} onClick={() => setIsTerminating(true)}>Offboard consultant</Btn>
                )}
                {canManage && isTerminated && (
                    <Btn variant="success" icon={RotateCcw} onClick={handleReactivate} title="Clear the offboarding and restore portal access">
                        Reinstate consultant
                    </Btn>
                )}
            </div>
        </div>
    );

    const sections = [
        { key: 'identity',      label: 'Identity',            icon: User },
        { key: 'role',          label: 'Role & tax',          icon: Briefcase },
        { key: 'reach',         label: 'Reach',               icon: Phone },
        { key: 'authorization', label: 'Work authorization',  icon: Plane, count: immigrations.length },
        { key: 'files',         label: 'Files',               icon: FolderOpen },
        { key: 'access',        label: 'Portal access',       icon: KeyRound },
        { key: 'history',       label: 'Engagements',         icon: Rocket },
    ];

    return (
        <BaseModal
            isOpen={true}
            onClose={onClose}
            icon={<User size={18} />}
            title="Consultant profile"
            subtitle={fullName}
            headerRight={isEditing ? <Chip tone="amber" icon={Edit3}>Editing</Chip> : null}
            noPadding
        >
            <DetailLayout aside={aside} sections={sections} active={section} onSelect={setSection}>
                {isTerminating && (
                    <div className="mb-6 rounded-[22px] border border-rose-500/25 bg-rose-500/5 p-5">
                        <div className="mb-4 flex items-center gap-2 text-rose-500">
                            <AlertTriangle size={16} />
                            <h4 className="text-sm font-semibold">Offboard consultant</h4>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
                            <label className="block">
                                <span className="nx-label">Offboarding date</span>
                                <input type="date" className="nx-input" value={terminationData.date} onChange={e => setTerminationData({ ...terminationData, date: e.target.value })} />
                            </label>
                            <label className="block">
                                <span className="nx-label">Reason</span>
                                <input type="text" placeholder="Enter reason…" className="nx-input" value={terminationData.reason} onChange={e => setTerminationData({ ...terminationData, reason: e.target.value })} />
                            </label>
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <Btn icon={X} onClick={() => setIsTerminating(false)}>Cancel</Btn>
                            <Btn variant="danger" icon={UserX} onClick={handleTerminateConfirm}>Confirm offboarding</Btn>
                        </div>
                    </div>
                )}

                {section === 'identity' && (
                    <>
                        <SectionTitle icon={User} title="Identity" subtitle="Personal and demographic details" />
                        <FieldGrid>
                            <EditableField label="First name" required value={editData.first_name} edit={isEditing} error={errors.first_name} onChange={v => updateField('first_name', v)} />
                            <EditableField label="Last name" required value={editData.last_name} edit={isEditing} error={errors.last_name} onChange={v => updateField('last_name', v)} />
                            <EditableField label="Birth date" required type="date" value={editData.birth_date} edit={isEditing} error={errors.birth_date} onChange={v => updateField('birth_date', v)} />
                            <EditableField label="Gender" required value={isEditing ? editData.gender_id : editData.gender_name} edit={isEditing} isSelect isObject options={lookups.genders} error={errors.gender_id} onChange={v => updateField('gender_id', v)} />
                            <EditableField label="Marital status" className="sm:col-span-2" value={isEditing ? editData.marital_status_id : editData.marital_status_name} edit={isEditing} isSelect isObject options={lookups.maritalStatuses} onChange={v => updateField('marital_status_id', v)} />
                        </FieldGrid>
                    </>
                )}

                {section === 'role' && (
                    <>
                        <SectionTitle icon={Briefcase} title="Role & tax identity" subtitle="Position, employment type and tax ID" />
                        <FieldGrid>
                            <EditableField label="Consultant ID" value={editData.employee_code} edit={isEditing} onChange={v => updateField('employee_code', v)} />
                            <EditableField label="Job title" required value={editData.title} edit={isEditing} error={errors.title} onChange={v => updateField('title', v)} />
                            <EditableField label="Employment type" required value={isEditing ? editData.employee_type_id : editData.employee_type_name} edit={isEditing} isSelect isObject options={lookups.employeeTypes} error={errors.employee_type_id} onChange={v => updateField('employee_type_id', v)} />
                            <EditableField label="Start date" required type="date" value={editData.joining_date} edit={isEditing} error={errors.joining_date} onChange={v => updateField('joining_date', v)} />
                            <EditableField label="SSN" required className="sm:col-span-2" value={editData.ssn} edit={isEditing} type="ssn" maxLength={11} error={errors.ssn} onChange={v => updateField('ssn', formatSSN(v))} />
                        </FieldGrid>
                    </>
                )}

                {section === 'reach' && (
                    <>
                        <SectionTitle icon={Phone} title="Reach & verification" subtitle="Contact details and E-Verify" />
                        <FieldGrid>
                            <EditableField label="Personal email" required type="email" value={editData.personal_email} edit={isEditing} error={errors.personal_email} onChange={v => updateField('personal_email', v)} />

                            <div className="min-w-0">
                                <p className="nx-label">Phone number{isEditing && <span className="ml-0.5 text-rose-500">*</span>}</p>
                                {isEditing ? (
                                    <div className="flex gap-2">
                                        <select
                                            className="nx-input w-2/5 cursor-pointer"
                                            value={editData.phone_code_id || ''}
                                            onChange={e => { updateField('phone_code_id', e.target.value); updateField('phone_number', ''); }}
                                        >
                                            <option value="" disabled>Code</option>
                                            {lookups.phoneCodes?.map(pc => <option key={pc.id} value={pc.id}>{pc.dial_code} ({pc.country_name})</option>)}
                                        </select>
                                        <input
                                            type="text"
                                            maxLength={10}
                                            className={cx('nx-input w-3/5', errors.phone_number && 'nx-invalid')}
                                            value={editData.phone_number || ''}
                                            onChange={e => updateField('phone_number', e.target.value.replace(/\D/g, '').slice(0, 10))}
                                        />
                                    </div>
                                ) : (
                                    <p className="truncate rounded-[12px] bg-(--bg-app)/60 px-3 py-2.5 text-sm font-medium text-(--text-main)">
                                        {`${employee?.phone_dial_code || ''} ${employee?.phone_number || ''}`.trim() || '—'}
                                    </p>
                                )}
                                {errors.phone_number && <p className="mt-1 text-[11px] font-medium text-rose-500">{errors.phone_number}</p>}
                            </div>

                            <EditableField label="Country of origin" required value={isEditing ? editData.country_id : editData.country_name} edit={isEditing} isSelect isObject options={lookups.countries} error={errors.country_id} onChange={v => updateField('country_id', v)} />
                            <EditableField label="E-Verify code" required maxLength={15} value={editData.e_verification_code} edit={isEditing} error={errors.e_verification_code} onChange={v => updateField('e_verification_code', v.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15))} />
                        </FieldGrid>
                    </>
                )}

                {section === 'authorization' && (
                    <>
                        <SectionTitle
                            icon={Plane}
                            title="Work authorization"
                            subtitle={isEditing ? 'Add, update or remove authorization records' : 'Switch to edit mode to change these records'}
                            actions={isEditing && (
                                <Btn size="sm" variant="primary" icon={Plus} onClick={() => { setShowAddImm(!showAddImm); setEditingImmId(null); }}>
                                    Add record
                                </Btn>
                            )}
                        />

                        {isEditing && showAddImm && !editingImmId && (
                            <div className="mb-4 grid gap-3 rounded-[20px] border border-(--brand-primary)/30 bg-(--brand-primary)/5 p-4 sm:grid-cols-2 xl:grid-cols-4">
                                <EditableField label="Status" required value={newImm.status_id} edit isSelect isObject options={lookups.immigrationStatuses} onChange={v => setNewImm({ ...newImm, status_id: v })} />
                                <EditableField label="Valid from" type="date" value={newImm.start_date} edit onChange={v => setNewImm({ ...newImm, start_date: v })} />
                                <EditableField label="Valid through" type="date" value={newImm.till_date} edit min={getNextDay(newImm.start_date)} onChange={v => setNewImm({ ...newImm, till_date: v })} />
                                <EditableField label="LCA wage" type="amount" placeholder="e.g. 85000" value={newImm.lca_wage} edit onChange={v => setNewImm({ ...newImm, lca_wage: v })} />
                                <div className="flex justify-end sm:col-span-2 xl:col-span-4">
                                    <Btn size="sm" variant="primary" icon={Save} onClick={handleAddImmigration}>Save record</Btn>
                                </div>
                            </div>
                        )}

                        {immigrations.length === 0 ? (
                            <EmptyState icon={Plane} title="No authorization records" text="Work authorization history will show here." />
                        ) : (
                            <div className="space-y-3">
                                {immigrations.map((imm, index) => (
                                    <AuthorizationCard
                                        key={imm.id || `imm-${index}`}
                                        imm={imm}
                                        lookups={lookups}
                                        isEditingGlobal={isEditing}
                                        isEditingThis={editingImmId === imm.id}
                                        editImmData={editImmData}
                                        setEditImmData={setEditImmData}
                                        onEditStart={() => {
                                            setEditingImmId(imm.id);
                                            setEditImmData({
                                                status_id: imm.status_id,
                                                start_date: safeDate(imm.start_date),
                                                till_date: safeDate(imm.till_date),
                                                lca_wage: imm.lca_wage || ''
                                            });
                                        }}
                                        onEditCancel={() => setEditingImmId(null)}
                                        onEditSave={() => handleUpdateImmigration(imm.id)}
                                        onDelete={() => handleDeleteImmigration(imm.id)}
                                        canDelete={userRole === 'ORG_ADMIN'}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                )}

                {section === 'files' && (
                    <>
                        <SectionTitle icon={FolderOpen} title="Files" subtitle="IDs, resumes and onboarding paperwork" />
                        <div className="relative overflow-hidden rounded-[24px] border border-(--border-subtle) p-8 text-center"
                            style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 10%, var(--bg-surface)), var(--bg-surface))' }}>
                            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] text-white" style={{ background: 'var(--brand-gradient)' }}>
                                <FolderOpen size={26} />
                            </span>
                            <p className="mt-4 text-lg font-semibold text-(--text-main)">Document vault</p>
                            <p className="mx-auto mt-1 max-w-sm text-sm text-(--text-muted)">Upload, preview and manage every file stored for this consultant.</p>
                            <Btn variant="primary" icon={FolderOpen} className="mt-5" onClick={() => setShowDocuments(true)}>Open vault</Btn>
                        </div>
                    </>
                )}

                {section === 'access' && (
                    <>
                        <SectionTitle icon={KeyRound} title="Portal access" subtitle="Read-only sign-in details" />
                        <FieldGrid>
                            <EditableField label="Username / Email" value={employee.email} edit={false} />
                            <div className="min-w-0">
                                <p className="nx-label">Password</p>
                                <div className="flex items-center gap-2">
                                    <p className="flex-1 truncate rounded-[12px] bg-(--bg-app)/60 px-3 py-2.5 font-mono text-sm text-(--text-main)">
                                        {!showPassword ? '••••••••••••' : (employee.plain_password || 'Password Encrypted / Hidden')}
                                    </p>
                                    <Btn size="icon" icon={showPassword ? EyeOff : Eye} onClick={() => setShowPassword(!showPassword)} title={showPassword ? 'Hide Password' : 'Show Password'} />
                                </div>
                            </div>
                        </FieldGrid>
                    </>
                )}

                {section === 'history' && (
                    <>
                        <SectionTitle icon={Rocket} title="Engagement history" subtitle="Every engagement this consultant has held" />
                        <PlacementHistoryPanel employeeId={employee.id} onNavigate={onClose} />
                    </>
                )}
            </DetailLayout>

            {showDocuments && <DocumentViewerModal employee={employee} onClose={() => setShowDocuments(false)} />}
        </BaseModal>
    );
};

export default EmployeeDetailModal;
