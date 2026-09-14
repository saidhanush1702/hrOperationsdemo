import { useState, useEffect } from 'react';
import { Save, Edit3, Briefcase, DollarSign, CreditCard, Clock, AlertTriangle, CheckCircle, Plus, Trash2, X, Lock, Eye, Tag } from 'lucide-react';
import api from '../../../api/axios';
import { managementAPI, commonAPI, timesheetAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import AmountInput from '../../../components/ui/AmountInput';
import PayoutBasisPicker from './PayoutBasisPicker';

import { getEasternDateString, getEasternDateMinus, fmtDate, isOnOrBeforeEasternToday } from '../../../utils/dateUtils';
const getUSADateString = getEasternDateString;

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PlacementDetailModal = ({ placement, onClose, onRefresh }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [minStartDate, setMinStartDate] = useState('');
    // Set when a pay-rate edit re-priced already-posted C2C balance sheet entries.
    const [balanceSheetSync, setBalanceSheetSync] = useState(null);
    
    // Completion State
    const [isCompleting, setIsCompleting] = useState(false);
    const [completionData, setCompletionData] = useState({ end_date: '', reason: '' });

    // Lookup Data States
    const [employees, setEmployees] = useState([]);
    const [clients, setClients] = useState([]);
    const [lookups, setLookups] = useState({ payTypes: [], cycles: [] });
    
    // Convert initial placement data into our form structure
    const getInitialData = (data) => ({
        ...data,
        has_timesheets: data.has_timesheets === 1 || data.has_timesheets === true,
        is_completed: data.is_completed === 1 || data.is_completed === true,
        pay_rate_type: data.pay_rate_type || 'Amount',
        completion_reason: data.completion_reason || '',
        bill_rates: Array.isArray(data.bill_rates) ? data.bill_rates : [],
        pay_rates: Array.isArray(data.pay_rates) ? data.pay_rates : [],
        // placement_types from history; fall back to single entry from legacy pay_type_id
        placement_types: Array.isArray(data.placement_types) && data.placement_types.length > 0
            ? data.placement_types
            : [{ id: Date.now(), start_date: data.start_date || '', pay_type_id: data.pay_type_id || '',
                 run_as_per_lca_wage: !!data.run_as_per_lca_wage,
                 payout_basis: data.run_as_per_lca_wage ? 'LCA' : 'HOURS',
                 fixed_pay_per_period: '' }],
    });

    const [currentPlacement, setCurrentPlacement] = useState(getInitialData(placement));
    const [editData, setEditData] = useState(getInitialData(placement));

    useEffect(() => {
        // Calculate 30 days ago in USA time
        setMinStartDate(getEasternDateMinus(30));

        // Fetch all necessary data for full editing
        Promise.all([
            managementAPI.getEmployees(),
            managementAPI.getClients(),
            commonAPI.getLookups()
        ]).then(([empRes, cliRes, lookupsRes]) => {
            setEmployees(empRes.data.filter(e => e.is_active === 1 || e.is_active === true || String(e.id) === String(placement.employee_id)));
            setClients(cliRes.data);
            if (lookupsRes.data) setLookups(lookupsRes.data);
        }).catch(err => console.error("Failed to load dependencies", err));
    }, [placement.employee_id]);

    useEffect(() => {
        const freshData = getInitialData(placement);
        setCurrentPlacement(freshData);
        setEditData(freshData);
        setIsEditing(false);
        setIsCompleting(false);
        setSubmitError('');
    }, [placement]);

    // --- CORE CALCULATIONS ---
    const getFinalBillRateAmount = (data) => {
        const active = (data.bill_rates || [])
            .filter(br => br.effective_date && isOnOrBeforeEasternToday(br.effective_date))
            .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
        if (active.length === 0) return 0;
        const br = active[0];
        const base = parseFloat(br.bill_rate_value) || 0;
        const disc = parseFloat(br.discount_percentage) || 0;
        return base - (base * (disc / 100));
    };

    const calculateCurrentBillRate = (dataToUse) => getFinalBillRateAmount(dataToUse).toFixed(2);

    const calculateCurrentPayRate = (dataToUse) => {
        const finalBillRate = getFinalBillRateAmount(dataToUse);
        const activeRates = (dataToUse.pay_rates || [])
            .filter(pr => pr.effective_date && new Date(pr.effective_date) <= new Date())
            .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));

        if (activeRates.length === 0) return '0.00';

        const val = parseFloat(activeRates[0].pay_rate_value) || 0;
        if (dataToUse.pay_rate_type === 'Percentage') return (finalBillRate * (val / 100)).toFixed(2);
        return val.toFixed(2);
    };

    // --- PAY RATE VALIDATIONS ---
    const getPayRateValidation = () => {
        const finalBillRate = getFinalBillRateAmount(editData);
        const primaryPayTypeId = editData.placement_types?.[0]?.pay_type_id || editData.pay_type_id;
        const selectedPayTypeName = lookups.payTypes?.find(pt => String(pt.id) === String(primaryPayTypeId))?.name;
        const isW2Like = selectedPayTypeName === 'W2';
        const maxAllowed = parseFloat((isW2Like ? finalBillRate * 0.85 : finalBillRate).toFixed(2));

        let isValid = true;
        let message = isW2Like
            ? `W2 Pay Rate can be at most 85% of the Final Bill Rate — exactly 85% is allowed, above 85% is not.`
            : `Pay Rate must be less than the Final Bill Rate.`;

        if (finalBillRate > 0 && editData.pay_rates.length > 0) {
            for (let pr of editData.pay_rates) {
                const val = parseFloat(pr.pay_rate_value) || 0;
                const amt = parseFloat((editData.pay_rate_type === 'Percentage' ? (finalBillRate * (val / 100)) : val).toFixed(2));

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

    // --- ACTIONS ---
    const handleSave = async () => {
        setSubmitError('');
        
        if (!validationStatus.isValid) {
            setSubmitError(validationStatus.message);
            return;
        }

        if (!editData.placement_types || editData.placement_types.length === 0) {
            setSubmitError("Please add at least one Placement Type Record.");
            return;
        }
        for (let pt of editData.placement_types) {
            if (!pt.start_date || !pt.pay_type_id) {
                setSubmitError("Please fill out the Start Date and Type for all Placement Type Records.");
                return;
            }
        }

        if (editData.bill_rates.length === 0) {
            setSubmitError("Please add at least one Bill Rate.");
            return;
        }
        for (let br of editData.bill_rates) {
            if (!br.bill_rate_value || !br.effective_date) {
                setSubmitError("Please fill out the Rate and Start Date for all Bill Rates.");
                return;
            }
        }

        for (let p of editData.pay_rates) {
            if (!p.pay_rate_value || !p.effective_date) {
                setSubmitError("Please fill out the Value and Start Date for all Pay Rates.");
                return;
            }
        }

        const finalCalculatedPayRate = calculateCurrentPayRate(editData);

        const payload = {
            ...editData,
            pay_rate: finalCalculatedPayRate,
            bill_rates: editData.bill_rates.map(({ _showDiscount, ...br }) => br)
        };

        setLoading(true);
        try {
            const saveRes = await api.put(`/api/management/placements/${placement.id}`, payload);

            // The backend re-prices already-posted C2C balance sheet entries when
            // the pay rate changes. Surface it — money moved, so it must not be silent.
            const sync = saveRes.data?.balance_sheet_sync;
            setBalanceSheetSync(sync && sync.changes?.length > 0 ? sync : null);

            // --- FIX: ENRICH SAVED DATA WITH DISPLAY NAMES ---
            // Find the selected entities to update their display names in the UI immediately
            const selectedClient = clients.find(c => String(c.id) === String(payload.client_id));
            const selectedEmployee = employees.find(e => String(e.id) === String(payload.employee_id));
            const selectedPayType = lookups.payTypes?.find(pt => String(pt.id) === String(payload.pay_type_id));
            const selectedCycle = lookups.cycles?.find(c => String(c.id) === String(payload.timesheet_cycle_id));

            const enrichedData = {
                ...payload,
                client_name: selectedClient ? selectedClient.client_name : currentPlacement.client_name,
                first_name: selectedEmployee ? selectedEmployee.first_name : currentPlacement.first_name,
                last_name: selectedEmployee ? selectedEmployee.last_name : currentPlacement.last_name,
                pay_type_name: selectedPayType ? selectedPayType.name : currentPlacement.pay_type_name,
                timesheet_cycle_name: selectedCycle ? selectedCycle.name : currentPlacement.timesheet_cycle_name
            };

            setCurrentPlacement(enrichedData);
            setEditData(enrichedData);
            setIsEditing(false);
            onRefresh();

            timesheetAPI.generateTimesheets().catch(e => console.error("Silent timesheet gen failed:", e));

        } catch (err) {
            const exactError = err.response?.data?.error || err.response?.data?.message || "Update failed";
            setSubmitError(exactError);
        } finally {
            setLoading(false);
        }
    };

    const startCompletionFlow = () => {
        setIsCompleting(true);
        setIsEditing(false);
        const usaToday = getUSADateString();
        
        const initialEndDate = currentPlacement.end_date ? formatDateForInput(currentPlacement.end_date) : usaToday;
        
        setCompletionData({
            end_date: initialEndDate,
            reason: ''
        });
    };

    const confirmCompletion = async () => {
        setSubmitError('');
        setLoading(true);
        
        try {
            const finalCalculatedPayRate = calculateCurrentPayRate(currentPlacement);
            
            const payload = {
                ...currentPlacement,
                end_date: completionData.end_date,
                completion_reason: completionData.reason,
                is_completed: true,
                status: 'Completed',
                pay_rate: finalCalculatedPayRate,
                bill_rates: currentPlacement.bill_rates.map(({ _showDiscount, ...br }) => br)
            };

            await api.put(`/api/management/placements/${placement.id}`, payload);
            onRefresh();
            onClose();

            timesheetAPI.generateTimesheets().catch(e => console.error("Silent timesheet gen failed:", e));

        } catch (err) {
            const exactError = err.response?.data?.error || err.response?.data?.message || "Failed to mark as completed.";
            setSubmitError(exactError);
        } finally {
            setLoading(false);
        }
    };

    const formatDateForInput = (dateString) => {
        if (!dateString) return '';
        return dateString.split('T')[0];
    };

    const handleTimesheetStartDateChange = (dateValue) => {
        let updatedData = { timesheet_start_date: dateValue };
        if (dateValue) {
            const date = new Date(dateValue + 'T00:00:00');
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            updatedData.week_start_day = days[date.getDay()];
        }
        setEditData(prev => ({ ...prev, ...updatedData }));
    };

    // --- ARRAY MANAGEMENT ---
    const handleArrayAdd = (field) => {
        const usaToday = getUSADateString();
        if (field === 'placement_types') {
            return setEditData(prev => ({
                ...prev,
                placement_types: [...prev.placement_types, { id: Date.now(), start_date: '', pay_type_id: '', run_as_per_lca_wage: false, payout_basis: 'HOURS', fixed_pay_per_period: '' }]
            }));
        }
        const newEntry = { id: Date.now(), effective_date: usaToday };
        if (field === 'bill_rates') {
            newEntry.bill_rate_value = '';
            newEntry.discount_percentage = '';
            newEntry.discount_reason = '';
            newEntry._showDiscount = false;
        } else {
            newEntry.pay_rate_value = '';
        }
        setEditData(prev => ({ ...prev, [field]: [...prev[field], newEntry] }));
    };

    const toggleBillRateDiscount = (index) => {
        const arr = [...editData.bill_rates];
        arr[index]._showDiscount = !arr[index]._showDiscount;
        if (!arr[index]._showDiscount) {
            arr[index].discount_percentage = '';
            arr[index].discount_reason = '';
        }
        setEditData({ ...editData, bill_rates: arr });
    };

    const handleArrayRemove = (field, index) => {
        const newArr = [...editData[field]];
        newArr.splice(index, 1);
        setEditData({ ...editData, [field]: newArr });
    };

    const handleArrayChange = (field, index, key, value) => {
        const newArr = [...editData[field]];
        newArr[index][key] = value;
        // LCA belongs to W2 and FIXED to C2C, so switching the pay type invalidates
        // whichever basis was chosen under the old one. Reset to hourly rather than
        // carrying a basis the new type cannot honour -- the backend coerces the same
        // way, and leaving a stale value here would show a control the save ignores.
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
        setEditData({ ...editData, [field]: newArr });
    };

    const dataToRender = isEditing ? editData : currentPlacement;
    const finalBillRateForDisplay = getFinalBillRateAmount(dataToRender);

    if (!placement) return null;

    const modalFooter = (
        <div className="flex flex-col w-full gap-3">
            {submitError && (
                <div className="w-full bg-red-500/10 border border-red-500/30 text-red-600 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>{submitError}</span>
                </div>
            )}

            {balanceSheetSync && (
                <div className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                    <CheckCircle size={14} className="shrink-0" />
                    <span>
                        Balance sheet updated — {balanceSheetSync.changes.length} C2C
                        {' '}entr{balanceSheetSync.changes.length === 1 ? 'y' : 'ies'} re-priced:
                        {' '}{fmt$(balanceSheetSync.total_before)} → {fmt$(balanceSheetSync.total_after)}
                        {' '}({balanceSheetSync.delta >= 0 ? '+' : '−'}{fmt$(Math.abs(balanceSheetSync.delta))})
                    </span>
                    <button
                        onClick={() => setBalanceSheetSync(null)}
                        className="ml-auto shrink-0 text-emerald-700/60 hover:text-emerald-700 transition-colors outline-none"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {isCompleting ? (
                <div className="w-full bg-orange-500/10 border border-orange-500/30 p-4 rounded-xl animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex items-center justify-between mb-3 border-b border-orange-500/20 pb-2">
                        <h4 className="text-xs font-bold text-orange-600 uppercase tracking-wider flex items-center gap-1.5">
                            <CheckCircle size={14} /> Finalize Completion
                        </h4>
                        <button onClick={() => setIsCompleting(false)} className="text-orange-600 hover:bg-orange-500/20 p-1 rounded-md transition-colors outline-none">
                            <X size={14} />
                        </button>
                    </div>
                    
                    <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2.5 flex items-start gap-2">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] font-bold text-amber-700 leading-relaxed">
                            Before completing this placement, go to <span className="uppercase tracking-widest">Invoices → Sync</span> to ensure all approved timesheets have been invoiced. Invoices will not be auto-generated for inactive placements after completion.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <Field
                            label="Final End Date*"
                            type="date" 
                            value={completionData.end_date} 
                            edit={true} 
                            onChange={v => setCompletionData({...completionData, end_date: v})} 
                        />
                        <Field 
                            label="Reason for Completion*" 
                            placeholder="e.g., Project finished, Resigned..."
                            value={completionData.reason} 
                            edit={true} 
                            onChange={v => setCompletionData({...completionData, reason: v})} 
                        />
                    </div>
                    
                    <div className="flex justify-end gap-2">
                        <button onClick={() => setIsCompleting(false)} className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-colors outline-none">
                            Cancel
                        </button>
                        <button 
                            disabled={!completionData.end_date || !completionData.reason || loading}
                            onClick={confirmCompletion} 
                            className="bg-orange-500 text-white px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:bg-orange-600 transition-all active:scale-95 disabled:opacity-50 outline-none"
                        >
                            {loading ? 'Processing...' : 'Confirm Completion'}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex justify-between items-center w-full">
                    <div className="flex gap-2">
                        {!isEditing && !editData.is_completed && (
                            <button onClick={startCompletionFlow} className="flex items-center gap-1.5 text-green-500 hover:text-green-600 transition-all text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-xl hover:bg-green-500/10 border border-transparent hover:border-green-500/20 outline-none">
                                <CheckCircle size={14} /> Mark Completed
                            </button>
                        )}
                    </div>
                    
                    <div className="flex gap-2">
                        {!isEditing ? (
                            <button onClick={() => setIsEditing(true)} className="bg-(--brand-primary) text-(--brand-primary-text) px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:opacity-90 transition-all active:scale-95 focus:ring-4 focus:ring-(--brand-primary)/50 outline-none">
                                <Edit3 size={14} /> Edit Placement
                            </button>
                        ) : (
                            <>
                                <button onClick={() => { setIsEditing(false); setEditData(currentPlacement); setSubmitError(''); }} className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-colors outline-none">
                                    Cancel
                                </button>
                                <button onClick={handleSave} disabled={loading || !validationStatus.isValid} className="bg-(--brand-primary) text-(--brand-primary-text) px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 shadow-sm hover:opacity-90 transition-all active:scale-95 focus:ring-4 focus:ring-(--brand-primary)/50 outline-none disabled:opacity-50">
                                    {loading ? 'Saving...' : <><Save size={14} /> Save Changes</>}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <BaseModal
            isOpen={true} 
            onClose={onClose} 
            icon={<Briefcase size={16} />}
            title={`${currentPlacement.first_name} ${currentPlacement.last_name} @ ${currentPlacement.client_name}`}
            subtitle="Placement Details"
            headerRight={
                currentPlacement.is_completed 
                ? <span className="bg-green-500/10 text-green-500 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest">Completed</span>
                : <span className="bg-(--brand-primary)/10 text-(--brand-primary) px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest">Active</span>
            }
            footer={modalFooter}
        >
            <div className="space-y-6">
                
                {/* SECTION 1: Assignment Details */}
                <div className="space-y-3">
                    <SectionHeader icon={<Briefcase size={14} />} title="Assignment & Job Details" />
                    
                    {/* Display Completion Reason if completed */}
                    {!isEditing && currentPlacement.is_completed && currentPlacement.completion_reason && (
                        <div className="bg-orange-500/10 border border-orange-500/30 p-3 rounded-xl mb-3 flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Reason for Completion</span>
                            <span className="text-xs font-bold text-(--text-main)">{currentPlacement.completion_reason}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4 bg-(--bg-app)/50 p-4 rounded-xl border border-(--border-subtle)">
                        {isEditing && (
                            <div className="sm:col-span-4 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
                                <Lock size={12} className="text-amber-500 shrink-0" />
                                <p className="text-[10px] font-bold text-amber-700">
                                    <span className="uppercase tracking-wider">Locked:</span> Employee and Direct Client cannot be modified after placement creation.
                                </p>
                            </div>
                        )}
                        <DynamicSelectField
                            label="Employee*"
                            value={editData.employee_id}
                            displayValue={`${currentPlacement.first_name} ${currentPlacement.last_name}`}
                            options={employees.map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))}
                            edit={false}
                            onChange={v => setEditData({ ...editData, employee_id: v })}
                        />
                        <DynamicSelectField
                            label="Direct Client*"
                            value={editData.client_id}
                            displayValue={currentPlacement.client_name}
                            options={clients.map(c => ({ id: c.id, name: c.client_name }))}
                            edit={false}
                            onChange={v => setEditData({ ...editData, client_id: v })}
                        />
                        <Field label="Job Title" value={editData.job_title} edit={isEditing} onChange={v => setEditData({ ...editData, job_title: v })} />
                        
                        <Field label="Placement Code" value={editData.placement_code} edit={false} readOnly={true} />
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:col-span-3 lg:col-span-2">
                            <Field label="Start Date" type="date" value={formatDateForInput(editData.start_date)} min={minStartDate} edit={isEditing} onChange={v => setEditData({ ...editData, start_date: v })} />
                            <Field label="End Date" type="date" value={formatDateForInput(editData.end_date)} min={formatDateForInput(editData.start_date) || minStartDate} edit={isEditing} onChange={v => setEditData({ ...editData, end_date: v })} />
                        </div>
                    </div>
                </div>

                {/* SECTION 2+3: Placement Type + Timesheet side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

                {/* Placement Type Records */}
                <div className="space-y-4 bg-(--bg-app)/50 p-4 sm:p-5 rounded-xl border border-(--border-subtle)">
                    <div className="flex items-center justify-between border-b border-(--border-subtle) pb-1.5 mb-2">
                        <div className="flex items-center gap-1.5">
                            <span className="text-purple-500"><Tag size={14} /></span>
                            <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Placement Type Records</h3>
                        </div>
                        {isEditing && (
                            <button type="button" onClick={() => handleArrayAdd('placement_types')} className="text-[10px] bg-purple-500/10 text-purple-600 px-3 py-1.5 rounded-lg border border-purple-500/20 flex items-center gap-1 font-bold uppercase tracking-wider hover:bg-purple-500/20 transition-all outline-none">
                                <Plus size={12}/> Add Type Record
                            </button>
                        )}
                    </div>

                    <div className="space-y-3 max-h-[172px] overflow-y-auto pr-1">
                        {dataToRender.placement_types.map((pt, index) => {
                            const typeName = lookups.payTypes?.find(t => String(t.id) === String(pt.pay_type_id))?.name || pt.pay_type_name || '';
                            const isW2Entry  = typeName === 'W2';
                            const isC2CEntry = typeName === 'C2C';
                            return (
                                <div key={pt.id || index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 bg-(--bg-surface) border border-(--border-subtle) rounded-lg relative animate-in fade-in zoom-in-95 duration-200">
                                    <div className="sm:col-span-4">
                                        <Field label="Start Date*" type="date" value={formatDateForInput(pt.start_date)} edit={isEditing} onChange={v => handleArrayChange('placement_types', index, 'start_date', v)} />
                                    </div>
                                    <div className="sm:col-span-4">
                                        <DynamicSelectField
                                            label="Type*"
                                            value={pt.pay_type_id}
                                            displayValue={typeName}
                                            options={lookups.payTypes}
                                            edit={isEditing}
                                            onChange={v => handleArrayChange('placement_types', index, 'pay_type_id', v)}
                                        />
                                    </div>
                                    <div className="sm:col-span-12 flex items-end pb-1">
                                        {(isW2Entry || isC2CEntry || !!pt.run_as_per_lca_wage || pt.payout_basis === 'FIXED') && (
                                            <PayoutBasisPicker
                                                entry={pt}
                                                index={index}
                                                isW2={isW2Entry}
                                                editable={isEditing && (isW2Entry || isC2CEntry)}
                                                isEditing={isEditing}
                                                onChange={(key, value) => handleArrayChange('placement_types', index, key, value)}
                                            />
                                        )}
                                    </div>
                                    {isEditing && editData.placement_types.length > 1 && (
                                        <button type="button" onClick={() => handleArrayRemove('placement_types', index)} className="absolute top-2 right-2 text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-all outline-none">
                                            <Trash2 size={14}/>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                        {dataToRender.placement_types.length === 0 && (
                            <p className="text-[10px] text-(--text-muted) text-center py-2 bg-(--bg-surface) rounded-lg border border-dashed border-(--border-subtle)">
                                {isEditing ? 'No type records. Click "Add Type Record" to start.' : 'No placement type records.'}
                            </p>
                        )}
                    </div>
                </div>

                {/* Timesheet Settings */}
                <div className="space-y-4 bg-(--bg-app)/50 p-4 sm:p-5 rounded-xl border border-(--border-subtle)">
                    <SectionHeader icon={<Clock size={14} className="text-orange-500" />} title="Timesheet Settings" />

                    {isEditing && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-center gap-2">
                            <Lock size={12} className="text-amber-500 shrink-0" />
                            <p className="text-[10px] font-bold text-amber-700">
                                <span className="uppercase tracking-wider">Locked:</span> Timesheet settings (Enable toggle, Start Date, Cycle, Week Start Day) cannot be modified after placement creation.
                            </p>
                        </div>
                    )}

                    <div className="mb-3">
                        <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest block mb-1">Status</span>
                        {dataToRender.has_timesheets ? (
                            <span className="text-[10px] bg-green-500/10 text-green-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Enabled</span>
                        ) : (
                            <span className="text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Disabled</span>
                        )}
                    </div>

                    {dataToRender.has_timesheets && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 animate-in fade-in">
                            <div className="sm:col-span-2">
                                <Field label="First Timesheet Start Date" type="date" value={formatDateForInput(dataToRender.timesheet_start_date)} edit={false} onChange={handleTimesheetStartDateChange} />
                            </div>
                            <DynamicSelectField label="Timesheet Cycle" value={dataToRender.timesheet_cycle_id} displayValue={dataToRender.timesheet_cycle_name || lookups.cycles?.find(c => String(c.id) === String(dataToRender.timesheet_cycle_id))?.name} options={lookups.cycles} edit={false} onChange={v => setEditData({ ...editData, timesheet_cycle_id: v })} />
                            <StaticSelectField label="Week Start Day" value={dataToRender.week_start_day} edit={false} options={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']} onChange={v => setEditData({ ...editData, week_start_day: v })} />
                        </div>
                    )}
                </div>

                </div>{/* end Placement Type + Timesheet grid */}

                {/* SECTION 4+5: Bill Rate + Pay Rate side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    
                    {/* SECTION 2: Bill Rate Records */}
                    <div className="space-y-4 bg-(--bg-app)/50 p-4 sm:p-5 rounded-xl border border-(--border-subtle)">
                        <SectionHeader icon={<DollarSign size={14} className="text-green-500" />} title="Bill Rate (Client Charges)" />

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-bold text-(--text-main) uppercase tracking-widest">Bill Rate Records</label>
                                {isEditing && (
                                    <button type="button" onClick={() => handleArrayAdd('bill_rates')} className="text-[10px] bg-green-500/10 text-green-600 px-3 py-1.5 rounded-lg border border-green-500/20 flex items-center gap-1 font-bold uppercase tracking-wider hover:bg-green-500/20 transition-all outline-none">
                                        <Plus size={12}/> Add Bill Rate
                                    </button>
                                )}
                            </div>

                            <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                            {dataToRender.bill_rates.map((br, index) => (
                                <div key={br.id || index} className="p-3 bg-(--bg-surface) border border-(--border-subtle) rounded-lg relative animate-in fade-in zoom-in-95 duration-200 space-y-2 pr-8">
                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                        <div className="sm:col-span-6">
                                            {isEditing ? (
                                                <div className="relative">
                                                    <span className="absolute left-2.5 top-[26px] text-xs font-bold text-(--text-muted)">$</span>
                                                    <Field label="Rate ($/Hr)*" type="amount" value={br.bill_rate_value} edit={true} onChange={v => handleArrayChange('bill_rates', index, 'bill_rate_value', v)} />
                                                    <span className="absolute right-3 top-[26px] text-xs font-bold text-(--text-muted)">/ Hr</span>
                                                </div>
                                            ) : (
                                                <Field label="Rate" value={`${fmt$(br.bill_rate_value)} / Hr`} edit={false} />
                                            )}
                                        </div>
                                        <div className="sm:col-span-6">
                                            <Field label="Start Date*" type="date" value={formatDateForInput(br.effective_date)} edit={isEditing} onChange={v => handleArrayChange('bill_rates', index, 'effective_date', v)} />
                                        </div>
                                    </div>

                                    {/* Discount section */}
                                    {isEditing ? (
                                        !br._showDiscount ? (
                                            <button type="button" onClick={() => toggleBillRateDiscount(index)} className="text-[10px] bg-yellow-500/10 text-yellow-600 px-2.5 py-1 rounded-md border border-yellow-500/20 flex items-center gap-1 font-bold uppercase tracking-wider hover:bg-yellow-500/20 transition-all outline-none">
                                                <Plus size={10}/> Add Discount
                                            </button>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-lg animate-in fade-in duration-150">
                                                <div className="sm:col-span-4 relative">
                                                    <Field label="Discount (%)" type="number" step="0.1" value={br.discount_percentage} edit={true} onChange={v => handleArrayChange('bill_rates', index, 'discount_percentage', v)} />
                                                    <span className="absolute right-3 top-[26px] text-xs font-bold text-(--text-muted)">%</span>
                                                    {br.bill_rate_value && br.discount_percentage && (
                                                        <p className="text-[10px] font-bold text-orange-500 mt-1 ml-1">Saves: {fmt$((parseFloat(br.bill_rate_value) || 0) * (parseFloat(br.discount_percentage) / 100))}</p>
                                                    )}
                                                </div>
                                                <div className="sm:col-span-8">
                                                    <Field label="Reason" value={br.discount_reason} edit={true} onChange={v => handleArrayChange('bill_rates', index, 'discount_reason', v)} />
                                                </div>
                                                <div className="sm:col-span-12 text-right">
                                                    <button type="button" onClick={() => toggleBillRateDiscount(index)} className="text-[10px] text-red-500 hover:text-red-600 font-bold uppercase tracking-wider outline-none">Remove Discount</button>
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        br.discount_percentage ? (
                                            <div className="flex gap-4 px-1 py-1.5 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
                                                <Field label="Discount" value={`${br.discount_percentage}%`} edit={false} />
                                                {br.discount_reason && <Field label="Reason" value={br.discount_reason} edit={false} />}
                                            </div>
                                        ) : null
                                    )}

                                    <p className="text-[10px] font-bold text-green-600 ml-1">
                                        Final: {fmt$((parseFloat(br.bill_rate_value) || 0) * (1 - (parseFloat(br.discount_percentage) || 0) / 100))} / Hr
                                    </p>

                                    {isEditing && (
                                        <button type="button" onClick={() => handleArrayRemove('bill_rates', index)} className="absolute top-2 right-2 text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-all outline-none">
                                            <Trash2 size={14}/>
                                        </button>
                                    )}
                                </div>
                            ))}

                            {dataToRender.bill_rates.length === 0 && (
                                <p className="text-[10px] text-(--text-muted) text-center py-2 bg-(--bg-surface) rounded-lg border border-dashed border-(--border-subtle)">
                                    {isEditing ? 'No bill rates. Click "Add Bill Rate" to start.' : 'No bill rate records.'}
                                </p>
                            )}
                            </div>{/* end scroll wrapper */}
                        </div>

                        <div className="pt-3 mt-1 border-t border-(--border-subtle) flex justify-between items-center">
                            <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Active Final Bill Rate</span>
                            <span className="text-sm font-bold text-green-500 bg-green-500/10 px-3 py-1 rounded-md border border-green-500/20">
                                {fmt$(calculateCurrentBillRate(dataToRender))} / Hr
                            </span>
                        </div>
                    </div>

                    {/* SECTION 3: Pay Rate */}
                    <div className="space-y-4 bg-(--bg-app)/50 p-4 sm:p-5 rounded-xl border border-(--border-subtle) h-full content-start">
                        <SectionHeader icon={<CreditCard size={14} className="text-blue-500"/>} title="Pay Rate (Employee Earnings)" />
                        
                        {isEditing ? (
                            <div className="space-y-0.5 w-1/2 pr-2 border-b border-(--border-subtle) pb-4">
                                <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider ml-1">Input</label>
                                <div className="flex bg-(--input-bg) border border-(--border-subtle) rounded-lg overflow-hidden h-[34px]">
                                    <button type="button" onClick={() => setEditData({...editData, pay_rate_type: 'Amount'})} className={`flex-1 text-xs font-bold transition-colors ${editData.pay_rate_type === 'Amount' ? 'bg-(--brand-primary) text-(--brand-primary-text)' : 'text-(--text-muted) hover:bg-(--bg-surface)'}`}>Fixed ($)</button>
                                    <button type="button" onClick={() => setEditData({...editData, pay_rate_type: 'Percentage'})} className={`flex-1 text-xs font-bold transition-colors ${editData.pay_rate_type === 'Percentage' ? 'bg-(--brand-primary) text-(--brand-primary-text)' : 'text-(--text-muted) hover:bg-(--bg-surface)'}`}>Percent (%)</button>
                                </div>
                            </div>
                        ) : (
                            <div className="border-b border-(--border-subtle) pb-4">
                                <Field label="Input" value={currentPlacement.pay_rate_type === 'Percentage' ? 'Percentage (%)' : 'Fixed Amount ($)'} edit={false} />
                            </div>
                        )}

                        <div className="space-y-2 pt-2">
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-1">
                                    <label className="text-[10px] font-bold text-(--text-main) uppercase tracking-widest">Pay Rate Records</label>
                                    <RateSegmentsPopover billRates={dataToRender.bill_rates} payRates={dataToRender.pay_rates} payRateType={dataToRender.pay_rate_type} />
                                </div>
                                {isEditing && (
                                    <button type="button" onClick={() => handleArrayAdd('pay_rates')} className="text-[10px] bg-(--brand-primary)/10 text-(--brand-primary) px-3 py-1.5 rounded-lg border border-(--brand-primary)/20 flex items-center gap-1 font-bold uppercase tracking-wider hover:bg-(--brand-primary)/20 transition-all outline-none">
                                        <Plus size={12}/> Add Pay Rate
                                    </button>
                                )}
                            </div>

                            <div className="space-y-3 max-h-[172px] overflow-y-auto pr-1">
                            {dataToRender.pay_rates.map((pr, index) => {
                                const val = parseFloat(pr.pay_rate_value) || 0;
                                const isAmt = dataToRender.pay_rate_type === 'Amount';
                                return (
                                <div key={pr.id || index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 bg-(--bg-surface) border border-(--border-subtle) rounded-lg relative animate-in fade-in zoom-in-95 duration-200">
                                    <div className="sm:col-span-6">
                                        {isEditing ? (
                                            <div className="relative">
                                                {isAmt && <span className="absolute left-2.5 top-[26px] text-xs font-bold text-(--text-muted)">$</span>}
                                                <Field label={`Value (${isAmt ? '$' : '%'})*`} type={isAmt ? 'amount' : 'number'} step="0.01" value={pr.pay_rate_value} edit={true} onChange={v => handleArrayChange('pay_rates', index, 'pay_rate_value', v)} />
                                                {!isAmt && <span className="absolute right-3 top-[26px] text-xs font-bold text-(--text-muted)">%</span>}
                                                {isAmt && <span className="absolute right-3 top-[26px] text-xs font-bold text-(--text-muted)">/ Hr</span>}
                                            </div>
                                        ) : (
                                            <Field label={`Value (${isAmt ? '$' : '%'})`} value={`${isAmt ? '$' : ''}${pr.pay_rate_value}${!isAmt ? '%' : ''}`} edit={false} />
                                        )}
                                        {isAmt && finalBillRateForDisplay > 0 && (
                                            <p className="text-[10px] font-bold text-orange-500 mt-1 ml-1">Rate: {((parseFloat(pr.pay_rate_value)||0)/finalBillRateForDisplay*100).toFixed(2)}%</p>
                                        )}
                                    </div>
                                    <div className={`sm:col-span-6 ${isEditing ? 'pr-6' : ''}`}>
                                        <Field label="Start Date*" type="date" value={formatDateForInput(pr.effective_date)} edit={isEditing} onChange={v => handleArrayChange('pay_rates', index, 'effective_date', v)} />
                                    </div>
                                    {isEditing && (
                                        <button type="button" onClick={() => handleArrayRemove('pay_rates', index)} className="absolute top-2 right-2 text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-all outline-none">
                                            <Trash2 size={14}/>
                                        </button>
                                    )}
                                </div>
                            )})}
                            
                            {dataToRender.pay_rates.length === 0 && (
                                <p className="text-[10px] text-(--text-muted) text-center py-2 bg-(--bg-surface) rounded-lg border border-dashed border-(--border-subtle)">No active pay rates.</p>
                            )}
                            </div>{/* end scroll wrapper */}
                        </div>

                        <div className="pt-3 mt-1 border-t border-(--border-subtle) flex justify-between items-center">
                            <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Active Final Pay Rate</span>
                            <span className="text-sm font-bold text-blue-500 bg-blue-500/10 px-3 py-1 rounded-md border border-blue-500/20">
                                {fmt$(calculateCurrentPayRate(dataToRender))} / Hr
                            </span>
                        </div>

                        {isEditing && (
                            <div className={`p-3 rounded-lg border mt-4 transition-colors duration-300 ${validationStatus.isValid ? 'bg-blue-500/5 border-blue-500/20' : 'bg-red-500/10 border-red-500/40'}`}>
                                <p className={`text-[10px] font-bold leading-relaxed ${validationStatus.isValid ? 'text-(--text-muted)' : 'text-red-600'}`}>
                                    <strong className={validationStatus.isValid ? 'text-blue-500' : 'text-red-600'}>Validation Note: </strong> 
                                    {validationStatus.message}
                                </p>
                            </div>
                        )}
                    </div>

                </div>
            </div>
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
                                            {seg.billRateFinal !== null ? fmt$(seg.billRateFinal) : <span className="text-(--text-muted) font-normal">—</span>}
                                        </td>
                                        <td className="py-2 px-3 text-right font-bold text-blue-500">
                                            {isPerc ? `${seg.payRateInput}%` : fmt$(seg.payRateInput)}
                                        </td>
                                        <td className="py-2 pl-3 text-right font-bold text-indigo-600">
                                            {fmt$(seg.actualRate)}
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

const Field = ({ label, value, edit, onChange, type = "text", step, readOnly = false, min, placeholder }) => (
    <div className="space-y-0.5 w-full">
        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider ml-1">{label}</label>
        {edit ? (
            type === 'amount' ? (
                <AmountInput
                    value={value || ''}
                    onChange={onChange}
                    placeholder={placeholder || '0.00'}
                    className={`w-full py-1.5 px-3 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) focus:border-(--brand-primary) rounded-lg text-xs font-bold outline-none transition-all placeholder:font-normal placeholder:text-(--text-muted)`}
                />
            ) : (
                <input
                    type={type}
                    step={step}
                    min={min}
                    readOnly={readOnly}
                    placeholder={placeholder}
                    onWheel={type === 'number' ? e => e.target.blur() : undefined}
                    className={`w-full py-1.5 px-3 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) focus:border-(--brand-primary) rounded-lg text-xs font-bold outline-none transition-all placeholder:font-normal placeholder:text-(--text-muted) ${readOnly ? 'opacity-60 cursor-not-allowed bg-(--bg-surface)' : ''}`}
                    value={value || ''}
                    onChange={e => onChange(e.target.value)}
                />
            )
        ) : (
            <p className="text-[11px] font-bold text-(--text-main) px-1 truncate">
                {type === 'number' && value ? `$${value}` : (type === 'date' && value ? fmtDate(value) : (value || '---'))}
            </p>
        )}
    </div>
);

const StaticSelectField = ({ label, options, value, edit, onChange }) => (
    <div className="space-y-0.5">
        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider ml-1">{label}</label>
        {edit ? (
            <select 
                className="w-full py-1.5 px-3 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) focus:border-(--brand-primary) rounded-lg text-xs font-bold outline-none transition-all" 
                value={value || ''} 
                onChange={e => onChange(e.target.value)}
            >
                <option value="" disabled>Select...</option>
                {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
        ) : (
            <p className="text-[11px] font-bold text-(--text-main) px-1 truncate">{value || '---'}</p>
        )}
    </div>
);

const DynamicSelectField = ({ label, options, value, displayValue, edit, onChange }) => (
    <div className="space-y-0.5">
        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider ml-1">{label}</label>
        {edit ? (
            <select 
                className="w-full py-1.5 px-3 bg-(--input-bg) text-(--input-text) border border-(--border-subtle) focus:border-(--brand-primary) rounded-lg text-xs font-bold outline-none transition-all" 
                value={value || ''} 
                onChange={e => onChange(e.target.value)}
            >
                <option value="" disabled>Select...</option>
                {options?.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                ))}
            </select>
        ) : (
            <p className="text-[11px] font-bold text-(--text-main) px-1 truncate">{displayValue || '---'}</p>
        )}
    </div>
);

export default PlacementDetailModal;