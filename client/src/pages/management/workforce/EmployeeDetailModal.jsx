import { useState, useEffect } from 'react';
import { Save, Edit3, User, Briefcase, Mail, Fingerprint, Trash2, AlertTriangle, Lock, Unlock, Plus, Plane, Eye, EyeOff, FileText, ChevronLeft, RotateCcw } from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import PlacementHistoryPanel from '../../../components/layout/PlacementHistoryPanel';
import AmountInput from '../../../components/ui/AmountInput';
import DocumentViewerModal from './DocumentViewerModal';
import { fmtDate } from '../../../utils/dateUtils';

// Helpers
const getSafeImmigrations = (raw) => {
    if (!raw) return [];
    let parsed = raw;
    if (typeof raw === 'string') {
        try { parsed = JSON.parse(raw); }
        catch (e) { return []; }
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

// FIXED: Now aggressively strips timestamps to ensure MySQL compatibility
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

const EmployeeDetailModal = ({ employee, onClose, onRefresh }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [isTerminating, setIsTerminating] = useState(false);
    const [terminationData, setTerminationData] = useState({ date: '', reason: '' });

    const [lookups, setLookups] = useState({
        genders: [], employeeTypes: [], countries: [], immigrationStatuses: [], maritalStatuses: [], phoneCodes: []
    });

    const [immigrations, setImmigrations] = useState(getSafeImmigrations(employee?.immigrations));
    // UPDATED: Included lca_wage in initial state
    const [showAddImm, setShowAddImm] = useState(false);
    const [newImm, setNewImm] = useState({ status_id: '', start_date: '', till_date: '', lca_wage: '' });

    // UPDATED: Included lca_wage in initial state
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
        if (!editData.employee_type_id) newErrors.employee_type_id = "Job type is required.";
        if (!editData.joining_date) newErrors.joining_date = "Joining date is required.";

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
        if (window.confirm(`Are you sure you want to ${actionText} system access?`)) {
            try {
                await managementAPI.toggleEmployeeAccess(employee.id, { is_active: newStatus });
                onRefresh(); onClose();
            } catch (err) { setSubmitError(err.response?.data?.message || `Failed to ${actionText} access.`); }
        }
    };

    // Undoes a termination: clears the employee's termination fields and restores
    // the user's login in one backend transaction. Only offered on an employee who
    // is actually terminated, so there is no "reactivate an active employee" case.
    const handleReactivate = async () => {
        if (!window.confirm(
            `Reactivate ${employee.first_name} ${employee.last_name}?

` +
            `Their termination date and reason will be cleared and portal access restored. ` +
            `Existing placements are not reopened.`
        )) return;
        try {
            await managementAPI.reactivateEmployee(employee.id);
            onRefresh(); onClose();
        } catch (err) {
            setSubmitError(err.response?.data?.message || err.response?.data?.error || "Failed to reactivate employee.");
        }
    };

    const handleTerminateConfirm = async () => {
        if (!terminationData.date || !terminationData.reason.trim()) return alert("Provide date and reason.");
        if (window.confirm(`WARNING: Officially terminate?`)) {
            try {
                await managementAPI.terminateEmployee(employee.id, terminationData);
                onRefresh(); onClose();
            } catch (err) { setSubmitError(err.response?.data?.message || "Critical: Termination failed."); }
        }
    };

    // -- IMMIGRATION ACTIONS --
    const handleAddImmigration = async () => {
        if (!newImm.status_id) return alert("Status is required");
        if (newImm.start_date && newImm.till_date && newImm.start_date >= newImm.till_date) return alert("Till Date must be strictly after the Start Date.");
        try {
            await managementAPI.addImmigration(employee.id, newImm);
            const statusObj = lookups.immigrationStatuses.find(s => String(s.id) === String(newImm.status_id));
            setImmigrations([...immigrations, { ...newImm, id: Date.now(), status_name: statusObj?.name }]);
            setNewImm({ status_id: '', start_date: '', till_date: '', lca_wage: '' });
            setShowAddImm(false); onRefresh();
        } catch (err) { alert("Failed to add record"); }
    };

    const handleDeleteImmigration = async (immId) => {
        if (window.confirm("Remove this immigration record?")) {
            try {
                await managementAPI.deleteImmigration(immId);
                setImmigrations(immigrations.filter(i => i.id !== immId)); onRefresh();
            } catch (err) { alert("Failed to delete record"); }
        }
    };

    const handleUpdateImmigration = async (immId) => {
        if (!editImmData.status_id) return alert("Status is required");
        if (editImmData.start_date && editImmData.till_date && editImmData.start_date >= editImmData.till_date) return alert("Till Date must be strictly after the Start Date.");
        try {
            await managementAPI.updateImmigration(immId, editImmData);
            const statusObj = lookups.immigrationStatuses.find(s => String(s.id) === String(editImmData.status_id));
            setImmigrations(immigrations.map(imm => imm.id === immId ? { ...imm, ...editImmData, status_name: statusObj?.name } : imm));
            setEditingImmId(null); onRefresh();
        } catch (err) { alert("Failed to update record"); }
    };

    if (!employee) return null;

    const modalFooter = isTerminating ? (
        <TerminationPanel
            terminationData={terminationData}
            setTerminationData={setTerminationData}
            onCancel={() => setIsTerminating(false)}
            onConfirm={handleTerminateConfirm}
        />
    ) : (
        <div className="flex flex-col w-full gap-3">
            {submitError && (
                <div className="w-full bg-red-500/10 border border-red-500/30 text-red-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>{submitError}</span>
                </div>
            )}
            <div className="flex justify-between items-center w-full">
                <div className="flex gap-2">
                    {['ORG_ADMIN', 'ACCOUNTANT'].includes(userRole) && !isTerminated && (
                        <button onClick={handleToggleAccess} className={`flex items-center gap-1.5 transition-all text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border ${isActive ? 'text-orange-500 hover:bg-orange-500/10 border-transparent hover:border-orange-500/20' : 'text-green-500 hover:bg-green-500/10 border-transparent hover:border-green-500/20'}`}>
                            {isActive ? <Lock size={12} /> : <Unlock size={12} />} {isActive ? "Suspend Access" : "Restore Access"}
                        </button>
                    )}
                    {['ORG_ADMIN', 'ACCOUNTANT'].includes(userRole) && !isTerminated && (
                        <button onClick={() => setIsTerminating(true)} className="flex items-center gap-1.5 text-(--text-muted) hover:text-red-500 transition-all text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20">
                            <Trash2 size={12} /> Terminate
                        </button>
                    )}
                    {/* Termination used to be a one-way door — this is the only way back. */}
                    {['ORG_ADMIN', 'ACCOUNTANT'].includes(userRole) && isTerminated && (
                        <button onClick={handleReactivate}
                            title="Clear the termination and restore portal access"
                            className="flex items-center gap-1.5 text-green-600 hover:bg-green-500/10 transition-all text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border border-green-500/30 hover:border-green-500/50">
                            <RotateCcw size={12} /> Reactivate Employee
                        </button>
                    )}
                </div>
                <div className="flex gap-2">
                    {!isEditing ? (
                        <button onClick={() => setIsEditing(true)} className="bg-(--brand-primary) text-(--brand-primary-text) px-6 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:opacity-90 transition-all active:scale-95 outline-none">
                            <Edit3 size={12} /> Edit Details
                        </button>
                    ) : (
                        <>
                            <button onClick={() => { setIsEditing(false); setShowAddImm(false); setEditingImmId(null); }} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-colors">Cancel</button>
                            <button onClick={handleSave} className="bg-(--brand-primary) text-(--brand-primary-text) px-6 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:opacity-90 transition-all active:scale-95 outline-none">
                                <Save size={12} /> Save Changes
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <BaseModal
            isOpen={true} onClose={onClose} icon={<Fingerprint size={16} />}
            title="Employee Master File"
            subtitle={
                <span>
                    {editData.first_name} {editData.last_name}
                    {!isActive && !isTerminated && <span className="text-orange-500 ml-2">(SUSPENDED)</span>}
                    {isTerminated && <span className="text-red-500 ml-2">(TERMINATED)</span>}
                </span>
            }
            footer={modalFooter}
        >
            <div className="space-y-4 -mt-4">
                {/* Personal Section */}
                <div className="space-y-2">
                    <SectionHeader icon={<User size={12} />} title="Personal & Demographic" />
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-(--bg-app)/50 p-2 rounded-xl border border-(--border-subtle)">
                        <Field label="First Name*" value={editData.first_name} edit={isEditing} error={errors.first_name} onChange={v => updateField('first_name', v)} />
                        <Field label="Last Name*" value={editData.last_name} edit={isEditing} error={errors.last_name} onChange={v => updateField('last_name', v)} />
                        <Field label="Birth Date*" type="date" value={editData.birth_date} edit={isEditing} error={errors.birth_date} onChange={v => updateField('birth_date', v)} />
                        <Field label="Gender*" value={isEditing ? editData.gender_id : editData.gender_name} edit={isEditing} isSelect isObject options={lookups.genders} error={errors.gender_id} onChange={v => updateField('gender_id', v)} />
                        <div className="col-span-1 sm:col-span-4">
                            <Field label="Marital Status" value={isEditing ? editData.marital_status_id : editData.marital_status_name} edit={isEditing} isSelect isObject options={lookups.maritalStatuses} onChange={v => updateField('marital_status_id', v)} />
                        </div>
                    </div>
                </div>

                {/* Employment Section */}
                <div className="space-y-2">
                    <SectionHeader icon={<Briefcase size={12} />} title="Employment Details" />
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-(--bg-app)/50 p-2 rounded-xl border border-(--border-subtle)">
                        <Field label="Employee Code" value={editData.employee_code} edit={isEditing} onChange={v => updateField('employee_code', v)} />
                        <Field label="Job Title*" value={editData.title} edit={isEditing} error={errors.title} onChange={v => updateField('title', v)} />
                        <Field label="Employment Type*" value={isEditing ? editData.employee_type_id : editData.employee_type_name} edit={isEditing} isSelect isObject options={lookups.employeeTypes} error={errors.employee_type_id} onChange={v => updateField('employee_type_id', v)} />
                        <Field label="Joining Date*" type="date" value={editData.joining_date} edit={isEditing} error={errors.joining_date} onChange={v => updateField('joining_date', v)} />
                        <div className="col-span-1 sm:col-span-4">
                            <Field label="SSN*" value={editData.ssn} edit={isEditing} type="ssn" maxLength={11} error={errors.ssn} onChange={v => updateField('ssn', formatSSN(v))} />
                        </div>
                    </div>
                </div>

                {/* Communication Section */}
                <div className="space-y-2">
                    <SectionHeader icon={<Mail size={12} />} title="Communication & Setup" />
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-(--bg-app)/50 p-2 rounded-xl border border-(--border-subtle)">
                        <Field label="Personal Email*" type="email" value={editData.personal_email} edit={isEditing} error={errors.personal_email} onChange={v => updateField('personal_email', v)} />

                        <PhoneField
                            label="Phone Number*"
                            edit={isEditing}
                            codeValue={editData.phone_code_id}
                            numberValue={editData.phone_number}
                            displayValue={`${employee?.phone_dial_code || ''} ${employee?.phone_number || ''}`.trim()}
                            error={errors.phone_number}
                            lookups={lookups}
                            onCodeChange={v => {
                                updateField('phone_code_id', v);
                                updateField('phone_number', '');
                            }}
                            onNumberChange={v => updateField('phone_number', v.replace(/\D/g, ''))}
                        />

                        <Field label="Country of Origin*" value={isEditing ? editData.country_id : editData.country_name} edit={isEditing} isSelect isObject options={lookups.countries} error={errors.country_id} onChange={v => updateField('country_id', v)} />
                        <Field label="E-Verify Code*" maxLength={15} value={editData.e_verification_code} edit={isEditing} error={errors.e_verification_code} onChange={v => updateField('e_verification_code', v.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15))} />
                    </div>
                </div>

                {/* Document Vault Section */}
                <div className="space-y-2">
                    <SectionHeader icon={<FileText size={12} />} title="Document Vault" />
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-(--bg-app)/50 p-2 rounded-xl border border-(--border-subtle)">
                        <div className="col-span-1 sm:col-span-3 flex flex-col justify-center px-1">
                            <p className="text-[11px] font-bold text-(--text-main) truncate transition-colors duration-300">Manage Employee Files</p>
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider transition-colors duration-300 mt-0.5">Upload IDs, Resumes, and Onboarding documents</label>
                        </div>
                        <div className="col-span-1 flex items-center justify-end">
                            <button onClick={() => setShowDocuments(true)} className="w-full flex items-center justify-center gap-2 bg-(--brand-primary) text-(--brand-primary-text) px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm hover:opacity-90 transition-all active:scale-95 outline-none">
                                <FileText size={12} /> Open Vault
                            </button>
                        </div>
                    </div>
                </div>

                {/* Immigration Section */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center border-b border-(--border-subtle) pb-1">
                        <div className="flex items-center gap-1.5">
                            <span className="text-(--text-muted)"><Plane size={12} /></span>
                            <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Immigration History</h3>
                        </div>
                        {isEditing && (
                            <button onClick={() => { setShowAddImm(!showAddImm); setEditingImmId(null); }} className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-(--brand-primary) hover:opacity-80 transition-opacity bg-(--brand-primary)/10 px-2 py-1 rounded">
                                <Plus size={10} /> Add Record
                            </button>
                        )}
                    </div>

                    {isEditing && showAddImm && !editingImmId && (
                        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-3 bg-(--bg-app)/80 rounded-xl border border-(--brand-primary)/30 animate-in fade-in slide-in-from-top-2">
                            <Field label="Status*" value={newImm.status_id} edit={true} isSelect={true} isObject={true} options={lookups.immigrationStatuses} onChange={v => setNewImm({ ...newImm, status_id: v })} />
                            <Field label="Start Date" type="date" value={newImm.start_date} edit={true} onChange={v => setNewImm({ ...newImm, start_date: v })} />
                            <Field label="Till Date" type="date" value={newImm.till_date} edit={true} min={getNextDay(newImm.start_date)} onChange={v => setNewImm({ ...newImm, till_date: v })} />
                            <Field label="LCA Wage" type="amount" placeholder="e.g. 85000" value={newImm.lca_wage} edit={true} onChange={v => setNewImm({ ...newImm, lca_wage: v })} />
                            <div className="flex items-end pb-px">
                                <button onClick={handleAddImmigration} className="w-full bg-(--brand-primary) text-(--brand-primary-text) py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all">Save</button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        {immigrations.length === 0 ? (
                            <p className="text-[10px] font-bold text-(--text-muted) italic px-1 py-2">No immigration records found.</p>
                        ) : (
                            immigrations.map((imm, index) => (
                                <ImmigrationCard
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
                            ))
                        )}
                    </div>
                </div>

                {/* Credentials Section */}
                <div className="space-y-2">
                    <SectionHeader icon={<Lock size={12} />} title="System Credentials (Read-Only)" />
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 bg-(--bg-app)/50 p-2 rounded-xl border border-(--border-subtle)">
                        <div className="col-span-1 sm:col-span-2">
                            <Field label="Username / Email" value={employee.email} edit={false} />
                        </div>
                        <div className="col-span-1 sm:col-span-2">
                            <div className="space-y-0.5">
                                <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider ml-1 transition-colors duration-300">Password</label>
                                <div className="flex items-center gap-2 px-1">
                                    <p className="text-[11px] font-bold text-(--text-main) truncate transition-colors duration-300">
                                        {!showPassword ? '••••••••••••' : (employee.plain_password || 'Password Encrypted / Hidden')}
                                    </p>
                                    <button onClick={() => setShowPassword(!showPassword)} className="flex items-center text-(--brand-primary) hover:opacity-80 transition-opacity outline-none" title={showPassword ? "Hide Password" : "Show Password"}>
                                        {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Placement History — every placement this employee has held. Last
                    section because it navigates away, so it reads as the exit. */}
                <PlacementHistoryPanel employeeId={employee.id} onNavigate={onClose} />
            </div>

            {showDocuments && <DocumentViewerModal employee={employee} onClose={() => setShowDocuments(false)} />}
        </BaseModal>
    );
};

// --- EXTRACTED UI COMPONENTS ---

const SectionHeader = ({ icon, title }) => (
    <div className="flex items-center gap-1.5 border-b border-(--border-subtle) pb-1 transition-colors duration-300">
        <span className="text-(--text-muted) transition-colors duration-300">{icon}</span>
        <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest transition-colors duration-300">{title}</h3>
    </div>
);

const Field = ({ label, value, edit, onChange, type = "text", isSelect = false, isObject = false, options = [], min, maxLength = 25, placeholder, error }) => {
    const getDisplayValue = () => {
        if (!value) return '---';
        if (type === 'ssn' && String(value).length >= 4) return `XXX-XX-${String(value).slice(-4)}`;
        if (type === 'date') return fmtDate(value);
        return value;
    };

    return (
        <div className="space-y-0.5">
            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider ml-1 transition-colors duration-300">{label}</label>
            {edit ? (
                isSelect ? (
                    <select className={`w-full py-1 px-2 bg-(--input-bg) text-(--input-text) border rounded-lg text-[10px] font-bold focus:ring-1 focus:ring-(--brand-primary) outline-none transition-all ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-(--border-subtle) focus:border-(--brand-primary)'}`} value={value || ''} onChange={e => onChange(e.target.value)}>
                        <option value="" disabled>Select...</option>
                        {options.map(opt => <option key={isObject ? opt.id : opt} value={isObject ? opt.id : opt}>{isObject ? opt.name : opt}</option>)}
                    </select>
                ) : type === 'amount' ? (
                    <AmountInput
                        value={value || ''}
                        onChange={onChange}
                        placeholder={placeholder}
                        className={`w-full py-1 px-2 bg-(--input-bg) text-(--input-text) border rounded-lg text-[10px] font-bold focus:ring-1 outline-none transition-all ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-(--border-subtle) focus:border-(--brand-primary) focus:ring-(--brand-primary)'}`}
                    />
                ) : (
                    <input type={type === 'ssn' || type === 'email' ? 'text' : type} placeholder={placeholder} maxLength={type === 'email' ? undefined : maxLength} className={`w-full py-1 px-2 bg-(--input-bg) text-(--input-text) border rounded-lg text-[10px] font-bold focus:ring-1 outline-none transition-all ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-(--border-subtle) focus:border-(--brand-primary) focus:ring-(--brand-primary)'}`} value={value || ''} min={min} onChange={e => onChange(e.target.value)} />
                )
            ) : (
                <p className="text-[11px] font-bold text-(--text-main) px-1 truncate transition-colors duration-300">{getDisplayValue()}</p>
            )}
            {error && <p className="text-[10px] text-red-500 font-semibold ml-1 leading-none">{error}</p>}
        </div>
    );
};

const PhoneField = ({ label, edit, codeValue, numberValue, displayValue, error, onCodeChange, onNumberChange, lookups }) => (
    <div className="space-y-0.5">
        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider ml-1 transition-colors duration-300">{label}</label>
        {edit ? (
            <div className="flex gap-1">
                <select className="w-1/3 py-1 px-1 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) focus:border-(--brand-primary) rounded-lg text-[10px] font-bold outline-none" value={codeValue || ''} onChange={e => onCodeChange(e.target.value)}>
                    <option value="" disabled>Code</option>
                    {lookups.phoneCodes?.map(pc => <option key={pc.id} value={pc.id}>{pc.dial_code} ({pc.country_name})</option>)}
                </select>
                <input type="text" maxLength={10} className={`w-2/3 py-1 px-2 bg-(--input-bg) text-(--input-text) border rounded-lg text-[10px] font-bold focus:ring-1 outline-none transition-all ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-(--border-subtle) focus:border-(--brand-primary) focus:ring-(--brand-primary)'}`} value={numberValue || ''} onChange={e => onNumberChange(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            </div>
        ) : (
            <p className="text-[11px] font-bold text-(--text-main) px-1 truncate transition-colors duration-300">{displayValue || '---'}</p>
        )}
        {error && <p className="text-[10px] text-red-500 font-semibold ml-1 leading-none">{error}</p>}
    </div>
);

const TerminationPanel = ({ terminationData, setTerminationData, onCancel, onConfirm }) => (
    <div className="bg-red-500/5 p-3 rounded-xl border border-red-500/20 w-full animate-in fade-in slide-in-from-bottom-2">
        <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-red-500" />
            <h4 className="text-red-500 font-bold text-[10px] uppercase tracking-widest">Terminate Employee</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1 col-span-1">
                <label className="text-[10px] font-bold text-red-500/70 uppercase tracking-tighter ml-1">Termination Date</label>
                <input type="date" className="w-full p-1.5 bg-(--bg-surface) text-(--text-main) border border-red-500/30 rounded-lg text-[10px] font-bold focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all" value={terminationData.date} onChange={e => setTerminationData({ ...terminationData, date: e.target.value })} />
            </div>
            <div className="space-y-1 col-span-1 sm:col-span-3">
                <label className="text-[10px] font-bold text-red-500/70 uppercase tracking-tighter ml-1">Reason for Termination</label>
                <div className="flex gap-2">
                    <input type="text" placeholder="Enter reason..." className="flex-1 p-1.5 bg-(--bg-surface) text-(--text-main) border border-red-500/30 rounded-lg text-[10px] font-bold focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all" value={terminationData.reason} onChange={e => setTerminationData({ ...terminationData, reason: e.target.value })} />
                    <button onClick={onCancel} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-colors">Cancel</button>
                    <button onClick={onConfirm} className="bg-red-500 text-white px-6 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest shadow-sm hover:opacity-90 transition-all active:scale-95">Confirm</button>
                </div>
            </div>
        </div>
    </div>
);

const ImmigrationCard = ({ imm, lookups, isEditingGlobal, isEditingThis, editImmData, setEditImmData, onEditStart, onEditCancel, onEditSave, onDelete, canDelete }) => (
    <div className="bg-(--bg-app)/50 rounded-lg border border-(--border-subtle) transition-colors duration-300 overflow-hidden">
        {isEditingThis ? (
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-3 bg-(--bg-app)/80 border-l-2 border-(--brand-primary)">
                <Field label="Status*" value={editImmData.status_id} edit={true} isSelect={true} isObject={true} options={lookups.immigrationStatuses} onChange={v => setEditImmData({ ...editImmData, status_id: v })} />
                <Field label="Start Date" type="date" value={editImmData.start_date} edit={true} onChange={v => setEditImmData({ ...editImmData, start_date: v })} />
                <Field label="Till Date" type="date" value={editImmData.till_date} edit={true} min={getNextDay(editImmData.start_date)} onChange={v => setEditImmData({ ...editImmData, till_date: v })} />
                <Field label="LCA Wage" type="amount" placeholder="e.g. 85000" value={editImmData.lca_wage} edit={true} onChange={v => setEditImmData({ ...editImmData, lca_wage: v })} />
                <div className="flex items-end gap-1 pb-px">
                    <button onClick={onEditCancel} className="flex-1 bg-(--bg-surface) text-(--text-muted) border border-(--border-subtle) py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:text-(--text-main) transition-all">Cancel</button>
                    <button onClick={onEditSave} className="flex-1 bg-(--brand-primary) text-(--brand-primary-text) py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all">Update</button>
                </div>
            </div>
        ) : (
            <div className="flex flex-col sm:flex-row justify-between sm:items-center px-3 py-2 gap-4 sm:gap-0">
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 sm:gap-6 w-full mr-4">
                    <div>
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Status</p>
                        <p className="text-[11px] font-bold text-(--text-main) truncate mt-0.5">{imm.status_name || imm.status}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Start Date</p>
                        <p className="text-[10px] font-bold text-(--text-main) mt-0.5">{fmtDate(imm.start_date) || '---'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Till Date</p>
                        <p className="text-[10px] font-bold text-(--text-main) mt-0.5">{fmtDate(imm.till_date) || '---'}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">LCA Wage</p>
                        <p className="text-[10px] font-bold text-(--text-main) mt-0.5">
                            {formatUSD(imm.lca_wage)}
                        </p>
                    </div>
                </div>
                {isEditingGlobal && (
                    <div className="flex justify-end gap-1 shrink-0">
                        <button onClick={onEditStart} className="text-(--brand-primary) hover:bg-(--brand-primary)/10 p-1.5 rounded-md transition-colors" title="Edit Record"><Edit3 size={12} /></button>
                        {canDelete && (
                            <button onClick={onDelete} className="text-(--text-muted) hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-colors" title="Delete Record"><Trash2 size={12} /></button>
                        )}
                    </div>
                )}
            </div>
        )}
    </div>
);

const formatUSD = (value) => {
    if (!value) return '---';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
    }).format(value);
};

export default EmployeeDetailModal;