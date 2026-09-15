import { useState, useEffect } from 'react';
import {
    X, User, Briefcase, Globe, Phone, Mail, Shield,
    Calendar, CreditCard, FileText, Loader2, ChevronDown, ChevronUp
} from 'lucide-react';
import { portalAPI } from '../../api/apiService';

import { fmtDate } from '../../utils/dateUtils';

const Field = ({ label, value }) => (
    <div>
        <p className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest mb-0.5">{label}</p>
        <p className="text-xs font-bold text-(--text-main) break-words">{value || '—'}</p>
    </div>
);

const SectionHeader = ({ icon: Icon, title, open, onToggle, count }) => (
    <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 bg-(--bg-app)/60 hover:bg-(--bg-app) rounded-xl border border-(--border-subtle) transition-colors outline-none"
    >
        <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-(--brand-primary)/10 flex items-center justify-center text-(--brand-primary)">
                <Icon size={14} />
            </div>
            <span className="text-xs font-bold text-(--text-main) uppercase tracking-widest">{title}</span>
            {count !== undefined && (
                <span className="px-1.5 py-0.5 rounded-md bg-(--brand-primary)/10 text-(--brand-primary) text-[10px] font-bold">
                    {count}
                </span>
            )}
        </div>
        {open ? <ChevronUp size={14} className="text-(--text-muted)" /> : <ChevronDown size={14} className="text-(--text-muted)" />}
    </button>
);

const EmployeeProfileModal = ({ onClose }) => {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [openSections, setOpenSections] = useState({ personal: true, employment: true, immigration: false, contact: true });

    useEffect(() => {
        portalAPI.getMyProfile()
            .then(res => setProfile(res.data))
            .catch(err => console.error('Profile fetch error:', err))
            .finally(() => setLoading(false));
    }, []);

    const toggle = (key) => setOpenSections(s => ({ ...s, [key]: !s[key] }));

    const immigrations = profile?.immigrations || [];

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
                onClick={onClose}
            />

            {/* Drawer panel */}
            <div className="fixed bottom-0 left-0 top-0 w-full max-w-sm z-50 flex flex-col bg-(--bg-surface) border-r border-(--border-subtle) shadow-2xl animate-in slide-in-from-left duration-300">

                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-(--border-subtle) bg-(--bg-app)/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-(--brand-primary)/10 flex items-center justify-center text-(--brand-primary)">
                            <User size={16} />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-(--text-main) uppercase tracking-tight">My Profile</h2>
                            <p className="text-[10px] text-(--text-muted) font-bold uppercase tracking-widest">Personal details on file</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-(--bg-app) transition-colors text-(--text-muted) outline-none"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-(--text-muted)">
                            <Loader2 className="w-7 h-7 animate-spin text-(--brand-primary)" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">Loading profile…</p>
                        </div>
                    ) : !profile ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-2 text-(--text-muted)">
                            <User size={28} className="opacity-20" />
                            <p className="text-[10px] font-bold uppercase tracking-widest">Profile not found.</p>
                        </div>
                    ) : (
                        <>
                            {/* Avatar + Name block */}
                            <div className="flex items-center gap-4 px-4 py-4 bg-(--brand-primary)/5 border border-(--brand-primary)/20 rounded-2xl">
                                <div className="h-14 w-14 rounded-2xl bg-(--brand-primary)/10 border border-(--brand-primary)/20 flex items-center justify-center text-(--brand-primary) text-lg font-bold uppercase shrink-0">
                                    {profile.first_name?.[0]}{profile.last_name?.[0]}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-base font-bold text-(--text-main) tracking-tight truncate">
                                        {profile.first_name} {profile.last_name}
                                    </p>
                                    <p className="text-[10px] text-(--brand-primary) font-bold tracking-widest mt-0.5 truncate">
                                        {profile.title || 'Consultant'}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1.5">
                                        <span className="text-[10px] font-mono font-bold text-(--text-muted) bg-(--bg-app) px-2 py-0.5 rounded-md border border-(--border-subtle)">
                                            {profile.employee_code}
                                        </span>
                                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                                            profile.is_active
                                                ? 'bg-green-500/10 text-green-600 border-green-500/20'
                                                : 'bg-red-500/10 text-red-600 border-red-500/20'
                                        }`}>
                                            {profile.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Personal Information */}
                            <SectionHeader
                                icon={User}
                                title="Personal Information"
                                open={openSections.personal}
                                onToggle={() => toggle('personal')}
                            />
                            {openSections.personal && (
                                <div className="grid grid-cols-2 gap-3 px-1">
                                    <Field label="First Name"     value={profile.first_name} />
                                    <Field label="Last Name"      value={profile.last_name} />
                                    <Field label="Date of Birth"  value={fmtDate(profile.birth_date)} />
                                    <Field label="Gender"         value={profile.gender_name} />
                                    <Field label="Marital Status" value={profile.marital_status_name} />
                                </div>
                            )}

                            {/* Employment Details */}
                            <SectionHeader
                                icon={Briefcase}
                                title="Work Details"
                                open={openSections.employment}
                                onToggle={() => toggle('employment')}
                            />
                            {openSections.employment && (
                                <div className="grid grid-cols-2 gap-3 px-1">
                                    <Field label="Job Title"      value={profile.title} />
                                    <Field label="Consultant Type" value={profile.employee_type_name} />
                                    <Field label="Consultant Code" value={profile.employee_code} />
                                    <Field label="Joining Date"   value={fmtDate(profile.joining_date)} />
                                    {profile.termination_date && (
                                        <Field label="Termination Date" value={fmtDate(profile.termination_date)} />
                                    )}
                                    <div className="col-span-2">
                                        <Field label="E-Verification Code" value={profile.e_verification_code} />
                                    </div>
                                </div>
                            )}

                            {/* Contact & Identity */}
                            <SectionHeader
                                icon={Phone}
                                title="Contact & Identity"
                                open={openSections.contact}
                                onToggle={() => toggle('contact')}
                            />
                            {openSections.contact && (
                                <div className="grid grid-cols-2 gap-3 px-1">
                                    <div className="col-span-2">
                                        <Field label="Work Email"     value={profile.work_email} />
                                    </div>
                                    <div className="col-span-2">
                                        <Field label="Personal Email" value={profile.personal_email} />
                                    </div>
                                    <Field label="Phone"   value={`${profile.phone_dial_code || ''} ${profile.phone_number || ''}`.trim()} />
                                    <Field label="Country" value={profile.country_name} />
                                </div>
                            )}

                            {/* Immigration Records */}
                            <SectionHeader
                                icon={Globe}
                                title="Work Authorization"
                                open={openSections.immigration}
                                onToggle={() => toggle('immigration')}
                                count={immigrations.length}
                            />
                            {openSections.immigration && (
                                immigrations.length === 0 ? (
                                    <div className="px-4 py-4 text-center text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">
                                        No work authorization records on file.
                                    </div>
                                ) : (
                                    <div className="space-y-2 px-1">
                                        {immigrations.map((imm, i) => (
                                            <div key={imm.id || i} className="bg-(--bg-app) rounded-xl border border-(--border-subtle) px-4 py-3 grid grid-cols-2 gap-3">
                                                <div className="col-span-2">
                                                    <Field label="Status" value={imm.status_name} />
                                                </div>
                                                <Field label="Start Date" value={fmtDate(imm.start_date)} />
                                                <Field label="Till Date"  value={fmtDate(imm.till_date)} />
                                                {imm.lca_wage && (
                                                    <div className="col-span-2">
                                                        <Field label="LCA Wage" value={`$${parseFloat(imm.lca_wage).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/yr`} />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-(--border-subtle) bg-(--bg-app)/30 shrink-0">
                    <p className="text-[10px] text-(--text-muted) text-center font-bold uppercase tracking-widest">
                        Contact Talent Ops to update your information
                    </p>
                </div>
            </div>
        </>
    );
};

export default EmployeeProfileModal;
