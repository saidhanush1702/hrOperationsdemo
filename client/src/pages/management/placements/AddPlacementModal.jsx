import { useState, useEffect } from 'react';
import { Check, Briefcase, DollarSign, CreditCard, Clock, AlertTriangle, Plus, Trash2, Lock, Eye } from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import AmountInput from '../../../components/ui/AmountInput';
import PayoutBasisPicker from './PayoutBasisPicker';
import { getEasternDateString, getEasternDateMinus, isOnOrBeforeEasternToday, fmtDate } from '../../../utils/dateUtils';

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AddPlacementModal = ({ isOpen, onClose, onRefresh }) => {
    const [loading, setLoading] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [minStartDate, setMinStartDate] = useState('');
    
    const [employees, setEmployees] = useState([]);
    const [clients, setClients] = useState([]);
    const [lookups, setLookups] = useState({ payTypes: [], cycles: [] });

    const initialFormState = {
        employee_id: '', client_id: '',
        job_title: '', start_date: '', end_date: '', status: 'Active',
        has_timesheets: false, timesheet_cycle_id: '', timesheet_start_date: '', week_start_day: '',
        bill_rates: [],
        pay_rate_type: 'Amount',
        pay_rates: [],
        // placement_types replaces single pay_type_id + run_as_per_lca_wage
        placement_types: [{ id: Date.now(), start_date: '', pay_type_id: '', run_as_per_lca_wage: false, payout_basis: 'HOURS', fixed_pay_per_period: '' }],
    };
    const [formData, setFormData] = useState(initialFormState);

    useEffect(() => {
        setMinStartDate(getEasternDateMinus(30));

        if (isOpen) {
            const fetchData = async () => {
                try {
                    const [empRes, cliRes, lookupsRes] = await Promise.all([
                        managementAPI.getEmployees(),
                        managementAPI.getClients(),
                        commonAPI.getLookups()
                    ]);
                    
                    setEmployees(empRes.data.filter(e => e.is_active === 1 || e.is_active === true));
                    setClients(cliRes.data);
                    if (lookupsRes.data) setLookups(lookupsRes.data);
                } catch (err) { 
                    console.error("Failed to fetch placement dependencies:", err); 
                }
            };
            fetchData();
        } else {
            setFormData(initialFormState);
            setSubmitError('');
        }
    }, [isOpen]);

    const getFinalBillRateAmount = () => {
        const active = (formData.bill_rates || [])
            .filter(br => br.effective_date && isOnOrBeforeEasternToday(br.effective_date))
            .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
        if (active.length === 0) return 0;
        const br = active[0];
        const base = parseFloat(br.bill_rate_value) || 0;
        const disc = parseFloat(br.discount_percentage) || 0;
        return base - (base * (disc / 100));
    };

    const calculateCurrentBillRate = () => getFinalBillRateAmount().toFixed(2);

    const calculateCurrentPayRate = () => {
        const finalBillRate = getFinalBillRateAmount();
        const activeRates = formData.pay_rates
            .filter(pr => pr.effective_date && new Date(pr.effective_date) <= new Date())
            .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
        if (activeRates.length === 0) return '0.00';
        const val = parseFloat(activeRates[0].pay_rate_value) || 0;
        if (formData.pay_rate_type === 'Percentage') return (finalBillRate * (val / 100)).toFixed(2);
        return val.toFixed(2);
    };

    const getPayRateValidation = () => {
        const finalBillRate = getFinalBillRateAmount();
        const primaryTypeId = formData.placement_types?.[0]?.pay_type_id;
        const selectedPayTypeName = lookups.payTypes?.find(pt => String(pt.id) === String(primaryTypeId))?.name;
        const isW2Like = selectedPayTypeName === 'W2';
        const maxAllowed = parseFloat((isW2Like ? finalBillRate * 0.85 : finalBillRate).toFixed(2));

        let isValid = true;
        let message = isW2Like
            ? `W2 Pay Rate can be at most 85% of the Final Bill Rate — exactly 85% is allowed, above 85% is not.`
            : `Pay Rate must be less than the Final Bill Rate.`;

        if (finalBillRate > 0 && formData.pay_rates.length > 0) {
            for (let pr of formData.pay_rates) {
                const val = parseFloat(pr.pay_rate_value) || 0;
                const amt = parseFloat((formData.pay_rate_type === 'Percentage' ? (finalBillRate * (val / 100)) : val).toFixed(2));
                const exceeded = isW2Like ? amt > maxAllowed : amt >= maxAllowed;
                if (exceeded) {
                    isValid = false;
                    message = isW2Like
                        ? `ERROR: Pay Rate (${fmt$(amt)}/Hr) exceeds the 85% cap (${fmt$(maxAllowed)}/Hr). W2 placements cannot go above 85% of the Final Bill Rate.`
                        : `ERROR: Pay Rate (${fmt$(amt)}/Hr) cannot equal or exceed the Final Bill Rate (${fmt$(maxAllowed)}/Hr).`;
                    break;
                }
            }
        }
        return { isValid, message };
    };

    const validationStatus = getPayRateValidation();

    const handleSubmit = async () => {
        setSubmitError('');

        if ((formData.placement_types || []).length === 0) {
            setSubmitError("Please add at least one Placement Type record.");
            return;
        }
        for (let pt of formData.placement_types) {
            if (!pt.pay_type_id || !pt.start_date) {
                setSubmitError("Please fill out the Start Date and Type for all Placement Type records.");
                return;
            }
        }

        if (!validationStatus.isValid) {
            setSubmitError(validationStatus.message);
            return;
        }

        if (formData.bill_rates.length === 0) {
            setSubmitError("Please add at least one Bill Rate.");
            return;
        }
        for (let br of formData.bill_rates) {
            if (!br.bill_rate_value || !br.effective_date) {
                setSubmitError("Please fill out the Rate and Start Date for all Bill Rates.");
                return;
            }
        }

        for (let p of formData.pay_rates) {
            if (!p.pay_rate_value || !p.effective_date) {
                setSubmitError("Please fill out the Value and Start Date for all Pay Rates.");
                return;
            }
        }

        setLoading(true);
        try {
            await managementAPI.createPlacement(formData);
            onRefresh(); 
            onClose();
        } catch (err) {
            const backendError = err.response?.data?.error || err.response?.data?.message || "An unknown error occurred.";
            setSubmitError(backendError);
        } finally { 
            setLoading(false); 
        }
    };

    const handleTimesheetStartDateChange = (dateValue) => {
        let updatedData = { timesheet_start_date: dateValue };
        if (dateValue) {
            const date = new Date(dateValue + 'T00:00:00');
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            updatedData.week_start_day = days[date.getDay()];
        }
        setFormData(prev => ({ ...prev, ...updatedData }));
    };

    const handleArrayAdd = (field) => {
        let newEntry = { id: Date.now() };
        if (field === 'bill_rates') {
            newEntry = { ...newEntry, effective_date: getEasternDateString(), bill_rate_value: '', discount_percentage: '', discount_reason: '', _showDiscount: false };
        } else if (field === 'placement_types') {
            newEntry = { ...newEntry, start_date: '', pay_type_id: '', run_as_per_lca_wage: false, payout_basis: 'HOURS', fixed_pay_per_period: '' };
        } else {
            newEntry = { ...newEntry, effective_date: getEasternDateString(), pay_rate_value: '' };
        }
        setFormData(prev => ({ ...prev, [field]: [...prev[field], newEntry] }));
    };

    const toggleBillRateDiscount = (index) => {
        const arr = [...formData.bill_rates];
        arr[index]._showDiscount = !arr[index]._showDiscount;
        if (!arr[index]._showDiscount) {
            arr[index].discount_percentage = '';
            arr[index].discount_reason = '';
        }
        setFormData({ ...formData, bill_rates: arr });
    };

    const handleArrayRemove = (field, index) => {
        const newArr = [...formData[field]];
        newArr.splice(index, 1);
        setFormData({ ...formData, [field]: newArr });
    };

    const handleArrayChange = (field, index, key, value) => {
        const newArr = [...formData[field]];
        newArr[index][key] = value;
        // LCA belongs to W2 and FIXED to C2C. Switching the pay type invalidates a
        // basis chosen under the old one, so reset it rather than submitting a
        // combination the backend will silently coerce to hourly anyway.
        if (field === 'placement_types' && key === 'pay_type_id') {
            const typeName = lookups.payTypes?.find(t => String(t.id) === String(value))?.name || '';
            const basis    = newArr[index].payout_basis;
            const stillValid = (typeName === 'W2'  && basis === 'LCA')
                            || (typeName === 'C2C' && basis === 'FIXED');
            if (!stillValid) {
                newArr[index].run_as_per_lca_wage  = false;
                newArr[index].payout_basis         = 'HOURS';
                newArr[index].fixed_pay_per_period = '';
            }
        }
        setFormData({ ...formData, [field]: newArr });
    };

    const selectedEmployee = employees.find(e => String(e.id) === String(formData.employee_id));

    const getPlacementTypeName = (pay_type_id) =>
        lookups.payTypes?.find(pt => String(pt.id) === String(pay_type_id))?.name || '';

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
                    type="submit" form="placementForm" disabled={loading || !validationStatus.isValid} 
                    className="bg-(--brand-primary) text-(--brand-primary-text) px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 shadow-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 outline-none"
                >
                    {loading ? 'Creating...' : 'Create Placement'} <Check size={14}/>
                </button>
            </div>
        </div>
    );

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} icon={<Briefcase size={16} />} title="Create Placement" subtitle="Assign Employee to Client" footer={modalFooter}>
            <form id="placementForm" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="space-y-6">
                
                {/* SECTION 1: Assignment Details */}
                <div className="space-y-3">
                    <SectionHeader icon={<Briefcase size={14} />} title="Assignment & Job Details" />
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 flex items-start gap-2">
                        <Lock size={13} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] font-bold text-amber-700 leading-relaxed">
                            <span className="uppercase tracking-wider">Caution:</span> The <span className="underline">Employee</span> and <span className="underline">Direct Client</span> fields <span className="font-extrabold">cannot be changed</span> after the placement is created. Please verify your selection before submitting.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                        <div className="flex flex-col">
                            <FormSelect label="Select Employee*" required value={formData.employee_id} onChange={v => setFormData({...formData, employee_id: v})}>
                                <option value="">-- Choose Employee --</option>
                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>)}
                            </FormSelect>
                            {selectedEmployee && (
                                <span className="text-[10px] font-bold text-(--text-main) ml-1 mt-1">
                                    EMP ID: <span className="text-(--text-muted)">{selectedEmployee.employee_code || 'N/A'}</span>
                                </span>
                            )}
                        </div>

                        <FormSelect label="Direct Client*" required value={formData.client_id} onChange={v => setFormData({...formData, client_id: v})}>
                            <option value="">-- Choose Client --</option>
                            {clients.map(cli => <option key={cli.id} value={cli.id}>{cli.client_name}</option>)}
                        </FormSelect>

                        <FormInput label="Job Title*" required value={formData.job_title} onChange={v => setFormData({...formData, job_title: v})} />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 sm:col-span-3 lg:col-span-2">
                            <FormInput label="Start Date*" type="date" required value={formData.start_date} onChange={v => setFormData({...formData, start_date: v})} />
                            <FormInput label="End Date" type="date" min={formData.start_date || minStartDate} value={formData.end_date} onChange={v => setFormData({...formData, end_date: v})} />
                        </div>
                    </div>
                </div>

                {/* SECTION 2+3: Placement Type + Timesheet side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

                    {/* Placement Type Records */}
                    <div className="space-y-4 bg-(--bg-app)/50 p-4 sm:p-5 rounded-xl border border-(--border-subtle)">
                        <div className="flex items-center justify-between border-b border-(--border-subtle) pb-1.5 mb-2">
                            <div className="flex items-center gap-1.5">
                                <span className="text-purple-500"><CreditCard size={14} /></span>
                                <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Placement Type Records</h3>
                            </div>
                            <button type="button" onClick={() => handleArrayAdd('placement_types')}
                                className="text-[10px] bg-purple-500/10 text-purple-600 px-3 py-1.5 rounded-lg border border-purple-500/20 flex items-center gap-1 font-bold uppercase tracking-wider hover:bg-purple-500/20 transition-all outline-none">
                                <Plus size={12}/> Add Type
                            </button>
                        </div>
                        <div className="space-y-3">
                            {(formData.placement_types || []).map((ptEntry, index) => {
                                const ptName = getPlacementTypeName(ptEntry.pay_type_id);
                                const isW2 = ptName === 'W2';
                                return (
                                    <div key={ptEntry.id} className="p-3 bg-(--bg-surface) border border-(--border-subtle) rounded-lg relative animate-in fade-in zoom-in-95 duration-200 space-y-2 pr-8">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                            <FormInput label="Start Date*" type="date" required value={ptEntry.start_date}
                                                onChange={v => handleArrayChange('placement_types', index, 'start_date', v)} />
                                            <FormSelect label="Placement Type*" required value={ptEntry.pay_type_id}
                                                onChange={v => handleArrayChange('placement_types', index, 'pay_type_id', v)}>
                                                <option value="">-- Choose Type --</option>
                                                {lookups.payTypes?.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                                            </FormSelect>
                                        </div>
                                        {/* Both pay types choose a payout basis; the picker
                                            offers whichever pair belongs to the type chosen. */}
                                        {(isW2 || ptName === 'C2C') && (
                                            <PayoutBasisPicker
                                                entry={ptEntry}
                                                index={index}
                                                isW2={isW2}
                                                onChange={(key, value) => handleArrayChange('placement_types', index, key, value)}
                                            />
                                        )}
                                        {(formData.placement_types || []).length > 1 && (
                                            <button type="button" onClick={() => handleArrayRemove('placement_types', index)}
                                                className="absolute top-2 right-2 text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-all outline-none">
                                                <Trash2 size={14}/>
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                            {(formData.placement_types || []).length === 0 && (
                                <p className="text-[10px] text-(--text-muted) text-center py-2 bg-(--bg-surface) rounded-lg border border-dashed border-(--border-subtle)">No type records. Click "Add Type" to start.</p>
                            )}
                        </div>
                    </div>

                    {/* Timesheet Settings */}
                    <div className="space-y-4 bg-(--bg-app)/50 p-4 sm:p-5 rounded-xl border border-(--border-subtle)">
                        <SectionHeader icon={<Clock size={14} className="text-orange-500"/>} title="Timesheet Settings" />
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5 flex items-start gap-2">
                            <Lock size={13} className="text-amber-500 shrink-0 mt-0.5" />
                            <p className="text-[10px] font-bold text-amber-700 leading-relaxed">
                                <span className="uppercase tracking-wider">Caution:</span> The <span className="underline">First Timesheet Start Date</span>, <span className="underline">Timesheet Cycle</span>, and <span className="underline">Week Start Day</span> <span className="font-extrabold">cannot be changed</span> after the placement is created. Enter these details carefully.
                            </p>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold text-(--text-main) cursor-pointer">
                            <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-(--border-subtle) text-(--brand-primary) focus:ring-(--brand-primary)"
                                checked={formData.has_timesheets}
                                onChange={e => setFormData({...formData, has_timesheets: e.target.checked})}
                            />
                            Enable Timesheets for this Placement
                        </label>
                        {formData.has_timesheets && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mt-4 animate-in fade-in">
                                <div className="sm:col-span-2">
                                    <FormInput label="First Timesheet Start Date*" type="date" required={formData.has_timesheets} value={formData.timesheet_start_date} onChange={handleTimesheetStartDateChange} />
                                </div>
                                <FormSelect label="Timesheet Cycle" value={formData.timesheet_cycle_id} onChange={v => setFormData({...formData, timesheet_cycle_id: v})}>
                                    <option value="">-- Cycle --</option>
                                    {lookups.cycles?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </FormSelect>
                                <FormSelect label="Week Start Day" value={formData.week_start_day} onChange={v => setFormData({...formData, week_start_day: v})}>
                                    <option value="">-- Select Day --</option>
                                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
                                </FormSelect>
                            </div>
                        )}
                    </div>

                </div>{/* end Placement Type + Timesheet grid */}

                {/* SECTION 4+5: Bill Rate + Pay Rate side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

                    {/* SECTION: Bill Rate Records */}
                    <div className="space-y-4 bg-(--bg-app)/50 p-4 sm:p-5 rounded-xl border border-(--border-subtle)">
                        <SectionHeader icon={<DollarSign size={14} className="text-green-500"/>} title="Bill Rate (Client Charges)" />

                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-bold text-(--text-main) uppercase tracking-widest">Bill Rate Records</label>
                                <button type="button" onClick={() => handleArrayAdd('bill_rates')} className="text-[10px] bg-green-500/10 text-green-600 px-3 py-1.5 rounded-lg border border-green-500/20 flex items-center gap-1 font-bold uppercase tracking-wider hover:bg-green-500/20 transition-all outline-none">
                                    <Plus size={12}/> Add Bill Rate
                                </button>
                            </div>

                            {formData.bill_rates.map((br, index) => (
                                <div key={br.id} className="p-3 bg-(--bg-surface) border border-(--border-subtle) rounded-lg relative animate-in fade-in zoom-in-95 duration-200 space-y-2 pr-8">
                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                        <div className="sm:col-span-6 relative">
                                            <span className="absolute left-2.5 top-[26px] text-xs font-bold text-(--text-muted)">$</span>
                                            <FormInput label="Rate ($/Hr)*" type="amount" required value={br.bill_rate_value} onChange={v => handleArrayChange('bill_rates', index, 'bill_rate_value', v)} className="pl-6" />
                                            <span className="absolute right-3 top-[26px] text-xs font-bold text-(--text-muted)">/ Hr</span>
                                        </div>
                                        <div className="sm:col-span-6">
                                            <FormInput label="Start Date*" type="date" required value={br.effective_date} onChange={v => handleArrayChange('bill_rates', index, 'effective_date', v)} />
                                        </div>
                                    </div>

                                    {/* Discount toggle */}
                                    {!br._showDiscount ? (
                                        <button type="button" onClick={() => toggleBillRateDiscount(index)} className="text-[10px] bg-yellow-500/10 text-yellow-600 px-2.5 py-1 rounded-md border border-yellow-500/20 flex items-center gap-1 font-bold uppercase tracking-wider hover:bg-yellow-500/20 transition-all outline-none">
                                            <Plus size={10}/> Add Discount
                                        </button>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-lg animate-in fade-in duration-150">
                                            <div className="sm:col-span-4 relative">
                                                <FormInput label="Discount (%)" type="number" step="0.1" value={br.discount_percentage} onChange={v => handleArrayChange('bill_rates', index, 'discount_percentage', v)} />
                                                <span className="absolute right-3 top-[26px] text-xs font-bold text-(--text-muted)">%</span>
                                                {br.bill_rate_value && br.discount_percentage && (
                                                    <p className="text-[10px] font-bold text-orange-500 mt-1 ml-1">Saves: {fmt$(parseFloat(br.bill_rate_value) * (parseFloat(br.discount_percentage) / 100))}</p>
                                                )}
                                            </div>
                                            <div className="sm:col-span-8">
                                                <FormInput label="Reason" value={br.discount_reason} onChange={v => handleArrayChange('bill_rates', index, 'discount_reason', v)} />
                                            </div>
                                            <div className="sm:col-span-12 text-right">
                                                <button type="button" onClick={() => toggleBillRateDiscount(index)} className="text-[10px] text-red-500 hover:text-red-600 font-bold uppercase tracking-wider outline-none">Remove Discount</button>
                                            </div>
                                        </div>
                                    )}

                                    {br.bill_rate_value && (
                                        <p className="text-[10px] font-bold text-green-600 ml-1">
                                            Final: {fmt$((parseFloat(br.bill_rate_value) || 0) * (1 - (parseFloat(br.discount_percentage) || 0) / 100))} / Hr
                                        </p>
                                    )}

                                    <button type="button" onClick={() => handleArrayRemove('bill_rates', index)} className="absolute top-2 right-2 text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-all outline-none">
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                            ))}

                            {formData.bill_rates.length === 0 && (
                                <p className="text-[10px] text-(--text-muted) text-center py-2 bg-(--bg-surface) rounded-lg border border-dashed border-(--border-subtle)">No bill rates added. Click "Add Bill Rate" to start.</p>
                            )}
                        </div>

                        <div className="pt-3 mt-1 border-t border-(--border-subtle) flex justify-between items-center">
                            <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Active Final Bill Rate</span>
                            <span className="text-sm font-bold text-green-500 bg-green-500/10 px-3 py-1 rounded-md border border-green-500/20">
                                {fmt$(calculateCurrentBillRate())} / Hr
                            </span>
                        </div>
                    </div>

                    {/* SECTION 3: Pay Rate */}
                    <div className="space-y-4 bg-(--bg-app)/50 p-4 sm:p-5 rounded-xl border border-(--border-subtle) h-full content-start">
                        <SectionHeader icon={<CreditCard size={14} className="text-blue-500"/>} title="Pay Rate (Employee Earnings)" />
                        
                        <div className="space-y-0.5 w-1/2 pr-2 border-b border-(--border-subtle) pb-4">
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider ml-1">Input</label>
                            <div className="flex bg-(--input-bg) border border-(--border-subtle) rounded-lg overflow-hidden h-[34px]">
                                <button type="button" onClick={() => setFormData({...formData, pay_rate_type: 'Amount'})} className={`flex-1 text-xs font-bold transition-colors ${formData.pay_rate_type === 'Amount' ? 'bg-(--brand-primary) text-(--brand-primary-text)' : 'text-(--text-muted) hover:bg-(--bg-surface)'}`}>Fixed ($)</button>
                                <button type="button" onClick={() => setFormData({...formData, pay_rate_type: 'Percentage'})} className={`flex-1 text-xs font-bold transition-colors ${formData.pay_rate_type === 'Percentage' ? 'bg-(--brand-primary) text-(--brand-primary-text)' : 'text-(--text-muted) hover:bg-(--bg-surface)'}`}>Percent (%)</button>
                            </div>
                        </div>

                        <div className="space-y-3 pt-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-1">
                                    <label className="text-[10px] font-bold text-(--text-main) uppercase tracking-widest">Pay Rate Records</label>
                                    <RateSegmentsPopover billRates={formData.bill_rates} payRates={formData.pay_rates} payRateType={formData.pay_rate_type} />
                                </div>
                                <button type="button" onClick={() => handleArrayAdd('pay_rates')} className="text-[10px] bg-(--brand-primary)/10 text-(--brand-primary) px-3 py-1.5 rounded-lg border border-(--brand-primary)/20 flex items-center gap-1 font-bold uppercase tracking-wider hover:bg-(--brand-primary)/20 transition-all outline-none">
                                    <Plus size={12}/> Add Pay Rate
                                </button>
                            </div>

                            {formData.pay_rates.map((pr, index) => {
                                const val = parseFloat(pr.pay_rate_value) || 0;
                                const finalBillRate = getFinalBillRateAmount();
                                const isAmt = formData.pay_rate_type === 'Amount';

                                return (
                                <div key={pr.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 bg-(--bg-surface) border border-(--border-subtle) rounded-lg relative animate-in fade-in zoom-in-95 duration-200 pr-8">
                                    <div className="sm:col-span-6">
                                        <div className="relative">
                                            {isAmt && <span className="absolute left-2.5 top-[26px] text-xs font-bold text-(--text-muted)">$</span>}
                                            <FormInput label={`Value (${isAmt ? '$' : '%'})*`} type={isAmt ? 'amount' : 'number'} step="0.01" required value={pr.pay_rate_value} onChange={v => handleArrayChange('pay_rates', index, 'pay_rate_value', v)} className={isAmt ? 'pl-6' : ''}/>
                                            {!isAmt && <span className="absolute right-3 top-[26px] text-xs font-bold text-(--text-muted)">%</span>}
                                            {isAmt && <span className="absolute right-3 top-[26px] text-xs font-bold text-(--text-muted)">/ Hr</span>}
                                        </div>
                                        {isAmt && finalBillRate > 0 && (
                                            <p className="text-[10px] font-bold text-orange-500 mt-1 ml-1">Rate: {(val / finalBillRate * 100).toFixed(2)}%</p>
                                        )}
                                    </div>
                                    <div className="sm:col-span-6">
                                        <FormInput label="Start Date*" required type="date" value={pr.effective_date} onChange={v => handleArrayChange('pay_rates', index, 'effective_date', v)} />
                                    </div>
                                    <button type="button" onClick={() => handleArrayRemove('pay_rates', index)} className="absolute top-2 right-2 text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-all outline-none">
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                            )})}
                            {formData.pay_rates.length === 0 && (
                                <p className="text-[10px] text-(--text-muted) text-center py-2 bg-(--bg-surface) rounded-lg border border-dashed border-(--border-subtle)">No active pay rates.</p>
                            )}
                        </div>

                        <div className="pt-3 mt-1 border-t border-(--border-subtle) flex justify-between items-center">
                            <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Final Pay Rate</span>
                            <span className="text-sm font-bold text-blue-500 bg-blue-500/10 px-3 py-1 rounded-md border border-blue-500/20">
                                {fmt$(calculateCurrentPayRate())} / Hr
                            </span>
                        </div>
                    </div>

                </div>
            </form>
        </BaseModal>
    );
};

// ── Rate segment helpers (mirrors backend buildRateSegments logic) ──────────
const _dateMinus1 = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
};

const buildDisplaySegments = (billRates, payRates, payRateType) => {
    const validBR = (billRates || [])
        .filter(br => br.effective_date && br.bill_rate_value)
        .map(br => ({ ...br, effective_date: String(br.effective_date).split('T')[0] }))
        .sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1));

    const validPR = (payRates || [])
        .filter(pr => pr.effective_date && pr.pay_rate_value)
        .map(pr => ({ ...pr, effective_date: String(pr.effective_date).split('T')[0] }))
        .sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1));

    if (validPR.length === 0) return [];

    // Percentage: both BR and PR changes split segments (mirrors backend exactly)
    // Amount: only PR changes split segments (mirrors backend) — BR shown for reference only
    const brDates = payRateType === 'Percentage' ? validBR.map(r => r.effective_date) : [];
    const allDates = [...new Set([...brDates, ...validPR.map(r => r.effective_date)])].sort();
    if (allDates.length === 0) return [];

    const getActiveBR = (date) => {
        const active = validBR.filter(r => r.effective_date <= date);
        if (!active.length) return null;
        const br = active[active.length - 1];
        const base = parseFloat(br.bill_rate_value) || 0;
        const disc = parseFloat(br.discount_percentage) || 0;
        return base - (base * disc / 100);
    };

    const getActivePR = (date) => {
        const active = validPR.filter(r => r.effective_date <= date);
        return active.length ? active[active.length - 1] : null;
    };

    const segments = [];
    for (let i = 0; i < allDates.length; i++) {
        const startDate = allDates[i];
        const endDate = i + 1 < allDates.length ? _dateMinus1(allDates[i + 1]) : null;
        const prObj = getActivePR(startDate);
        if (!prObj) continue;
        const prVal = parseFloat(prObj.pay_rate_value) || 0;
        const brFinal = getActiveBR(startDate);
        const actualRate = payRateType === 'Percentage'
            ? (brFinal !== null ? brFinal * (prVal / 100) : 0)
            : prVal;
        segments.push({ startDate, endDate, billRateFinal: brFinal, payRateInput: prVal, actualRate });
    }
    return segments;
};

const RateSegmentsPopover = ({ billRates, payRates, payRateType }) => {
    const [visible, setVisible] = useState(false);
    const segments = buildDisplaySegments(billRates, payRates, payRateType);
    if (segments.length === 0) return null;
    const isPerc = payRateType === 'Percentage';
    const fmtAmt = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div className="relative" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
            <button type="button" className="p-1 rounded-md text-(--text-muted) hover:text-indigo-500 hover:bg-indigo-500/10 transition-all outline-none" title="View rate segment breakdown">
                <Eye size={13} />
            </button>
            {visible && (
                <div
                    className="absolute right-0 bottom-full mb-2 z-[100] animate-in fade-in zoom-in-95 duration-150"
                    style={{ minWidth: '480px' }}
                    onMouseEnter={() => setVisible(true)}
                    onMouseLeave={() => setVisible(false)}
                >
                    <div className="bg-(--bg-surface) border border-indigo-500/30 rounded-xl shadow-2xl p-4">
                        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Eye size={11} /> Rate Segment Breakdown
                            <span className="text-(--text-muted) font-normal normal-case tracking-normal text-[10px]">— how payroll computes $/hr each period</span>
                        </p>
                        <table className="w-full text-[10px] border-collapse">
                            <thead>
                                <tr className="border-b-2 border-(--border-subtle)">
                                    <th className="text-left pb-2 pr-3 font-bold text-(--text-muted) uppercase tracking-wider">Period</th>
                                    <th className="text-right pb-2 px-3 font-bold text-green-600 uppercase tracking-wider">Bill Rate</th>
                                    <th className="text-right pb-2 px-3 font-bold text-blue-500 uppercase tracking-wider">
                                        Pay Rate {isPerc ? '(%)' : '($/hr)'}
                                    </th>
                                    <th className="text-right pb-2 pl-3 font-bold text-indigo-500 uppercase tracking-wider">Actual $/hr</th>
                                </tr>
                            </thead>
                            <tbody>
                                {segments.map((seg, i) => (
                                    <tr key={i} className={`${i < segments.length - 1 ? 'border-b border-(--border-subtle)/50' : ''} ${i % 2 === 0 ? 'bg-(--bg-app)/30' : ''}`}>
                                        <td className="py-2 pr-3 font-bold text-(--text-main) whitespace-nowrap">
                                            {fmtDate(seg.startDate)}
                                            <span className="text-(--text-muted) font-normal mx-1">–</span>
                                            {seg.endDate ? fmtDate(seg.endDate) : <span className="text-green-500 font-bold">Ongoing</span>}
                                        </td>
                                        <td className="py-2 px-3 text-right font-bold text-green-600">
                                            {seg.billRateFinal !== null ? fmtAmt(seg.billRateFinal) : <span className="text-(--text-muted) font-normal">—</span>}
                                        </td>
                                        <td className="py-2 px-3 text-right font-bold text-blue-500">
                                            {isPerc ? `${seg.payRateInput}%` : fmtAmt(seg.payRateInput)}
                                        </td>
                                        <td className="py-2 pl-3 text-right font-bold text-indigo-600">
                                            {fmtAmt(seg.actualRate)}
                                            {!isPerc && <span className="text-[10px] text-(--text-muted) font-normal ml-1">(fixed)</span>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className="text-[10px] text-(--text-muted) mt-3 border-t border-(--border-subtle) pt-2 leading-relaxed">
                            {isPerc
                                ? <><span className="font-bold text-indigo-500">Formula:</span> Actual $/hr = Bill Rate × Pay % — each bill rate or pay rate change creates a new payroll segment.</>
                                : <><span className="font-bold text-indigo-500">Note:</span> Fixed pay rate — bill rate is shown for reference only. Actual $/hr equals the fixed pay rate regardless of bill rate changes.</>
                            }
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

const SectionHeader = ({ icon, title }) => (
    <div className="flex items-center gap-1.5 border-b border-(--border-subtle) pb-1.5 mb-2">
        <span className="text-(--text-muted)">{icon}</span>
        <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">{title}</h3>
    </div>
);

const FormInput = ({ label, type = "text", value, onChange, placeholder, required = false, step, readOnly = false, min, className="" }) => (
    <div className="space-y-0.5">
        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider ml-1">{label}</label>
        {type === 'amount' ? (
            <AmountInput
                value={value || ''}
                onChange={onChange}
                placeholder={placeholder || '0.00'}
                className={`w-full py-1.5 px-3 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) focus:border-(--brand-primary) rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-(--brand-primary) transition-all placeholder:font-normal placeholder:text-(--text-muted) ${className}`}
            />
        ) : (
            <input
                type={type} step={step} min={min} required={required} readOnly={readOnly} placeholder={placeholder}
                onWheel={type === 'number' ? e => e.target.blur() : undefined}
                className={`w-full py-1.5 px-3 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) focus:border-(--brand-primary) rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-(--brand-primary) transition-all placeholder:font-normal placeholder:text-(--text-muted) ${readOnly ? 'opacity-60 cursor-not-allowed bg-(--bg-surface)' : ''} ${className}`}
                value={value || ''} onChange={e => onChange && onChange(e.target.value)}
            />
        )}
    </div>
);

const FormSelect = ({ label, children, value, onChange, required = false }) => (
    <div className="space-y-0.5">
        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider ml-1">{label}</label>
        <select 
            required={required} 
            className="w-full py-1.5 px-3 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) focus:border-(--brand-primary) rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-(--brand-primary) transition-all" 
            value={value} onChange={e => onChange(e.target.value)}
        >
            {children}
        </select>
    </div>
);

export default AddPlacementModal;