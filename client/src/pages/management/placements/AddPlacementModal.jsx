import { useState, useEffect } from 'react';
import { Check, Rocket, TrendingUp, Wallet, Timer, AlertTriangle, Plus, Lock, Layers, Handshake, User, CalendarRange } from 'lucide-react';
import { managementAPI, commonAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import PayoutBasisPicker from './PayoutBasisPicker';
import { getEasternDateString, getEasternDateMinus, isOnOrBeforeEasternToday, fmtDate } from '../../../utils/dateUtils';
import { Btn, cx } from '../../../components/ui/kit';
import { fmt$, Step, Notice, TimelineItem, EmptyRecords, FormInput, FormSelect, Segmented, RateSegmentsPopover } from './engagementUi';

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
                    console.error("Failed to fetch engagement dependencies:", err);
                }
            };
            fetchData();
        } else {
            setFormData(initialFormState);
            setSubmitError('');
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
            ? `W2 pay rate can be at most 85% of the final bill rate — exactly 85% is allowed, above 85% is not.`
            : `Pay rate must be less than the final bill rate.`;

        if (finalBillRate > 0 && formData.pay_rates.length > 0) {
            for (let pr of formData.pay_rates) {
                const val = parseFloat(pr.pay_rate_value) || 0;
                const amt = parseFloat((formData.pay_rate_type === 'Percentage' ? (finalBillRate * (val / 100)) : val).toFixed(2));
                const exceeded = isW2Like ? amt > maxAllowed : amt >= maxAllowed;
                if (exceeded) {
                    isValid = false;
                    message = isW2Like
                        ? `ERROR: Pay rate (${fmt$(amt)}/Hr) exceeds the 85% cap (${fmt$(maxAllowed)}/Hr). W2 engagements cannot go above 85% of the final bill rate.`
                        : `ERROR: Pay rate (${fmt$(amt)}/Hr) cannot equal or exceed the final bill rate (${fmt$(maxAllowed)}/Hr).`;
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
            setSubmitError("Please add at least one pay model period.");
            return;
        }
        for (let pt of formData.placement_types) {
            if (!pt.pay_type_id || !pt.start_date) {
                setSubmitError("Please fill out the start date and type for every pay model period.");
                return;
            }
        }

        if (!validationStatus.isValid) {
            setSubmitError(validationStatus.message);
            return;
        }

        if (formData.bill_rates.length === 0) {
            setSubmitError("Please add at least one bill rate.");
            return;
        }
        for (let br of formData.bill_rates) {
            if (!br.bill_rate_value || !br.effective_date) {
                setSubmitError("Please fill out the rate and start date for all bill rates.");
                return;
            }
        }

        for (let p of formData.pay_rates) {
            if (!p.pay_rate_value || !p.effective_date) {
                setSubmitError("Please fill out the value and start date for all pay rates.");
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
    const selectedClient = clients.find(c => String(c.id) === String(formData.client_id));

    const getPlacementTypeName = (pay_type_id) =>
        lookups.payTypes?.find(pt => String(pt.id) === String(pay_type_id))?.name || '';

    if (!isOpen) return null;

    const billNow = parseFloat(calculateCurrentBillRate());
    const payNow = parseFloat(calculateCurrentPayRate());

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
                <Btn variant="primary" type="submit" form="placementForm" icon={Check} disabled={loading || !validationStatus.isValid}>
                    {loading ? 'Creating…' : 'Create engagement'}
                </Btn>
            </div>
        </div>
    );

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} icon={<Rocket size={18} />} title="New engagement" subtitle="Deploy a consultant with a partner" footer={modalFooter} noPadding>
            <form id="placementForm" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-5 p-4 sm:p-6 lg:p-8">

                    {/* 01 Assignment */}
                    <Step n="01" icon={Rocket} title="Assignment" subtitle="Who goes where, and for how long">
                        <Notice tone="amber" icon={Lock}>
                            The <b>consultant</b> and <b>partner</b> cannot be changed after the engagement is created. Double-check before saving.
                        </Notice>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div>
                                <FormSelect label="Consultant" required value={formData.employee_id} onChange={v => setFormData({...formData, employee_id: v})}>
                                    <option value="">Choose consultant…</option>
                                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name}</option>)}
                                </FormSelect>
                                {selectedEmployee && (
                                    <p className="mt-1 text-[11px] text-(--text-muted)">Consultant ID: <span className="font-mono text-(--text-main)">{selectedEmployee.employee_code || 'N/A'}</span></p>
                                )}
                            </div>
                            <FormSelect label="Partner" required value={formData.client_id} onChange={v => setFormData({...formData, client_id: v})}>
                                <option value="">Choose partner…</option>
                                {clients.map(cli => <option key={cli.id} value={cli.id}>{cli.client_name}</option>)}
                            </FormSelect>
                            <FormInput label="Job title" required value={formData.job_title} onChange={v => setFormData({...formData, job_title: v})} className="sm:col-span-2" />
                            <FormInput label="Start date" type="date" required value={formData.start_date} onChange={v => setFormData({...formData, start_date: v})} />
                            <FormInput label="End date" type="date" min={formData.start_date || minStartDate} value={formData.end_date} onChange={v => setFormData({...formData, end_date: v})} />
                        </div>
                    </Step>

                    {/* 02 Pay model timeline */}
                    <Step
                        n="02"
                        icon={Layers}
                        title="Pay model timeline"
                        subtitle="Which pay model applies, and from when"
                        action={<Btn size="sm" icon={Plus} onClick={() => handleArrayAdd('placement_types')}>Add period</Btn>}
                    >
                        <div className="space-y-3">
                            {(formData.placement_types || []).map((ptEntry, index) => {
                                const ptName = getPlacementTypeName(ptEntry.pay_type_id);
                                const isW2 = ptName === 'W2';
                                return (
                                    <TimelineItem
                                        key={ptEntry.id}
                                        last={index === formData.placement_types.length - 1}
                                        onRemove={(formData.placement_types || []).length > 1 ? () => handleArrayRemove('placement_types', index) : undefined}
                                    >
                                        <div className="grid gap-3 pr-8 sm:grid-cols-2">
                                            <FormInput label="Starts" type="date" required value={ptEntry.start_date}
                                                onChange={v => handleArrayChange('placement_types', index, 'start_date', v)} />
                                            <FormSelect label="Pay model" required value={ptEntry.pay_type_id}
                                                onChange={v => handleArrayChange('placement_types', index, 'pay_type_id', v)}>
                                                <option value="">Choose model…</option>
                                                {lookups.payTypes?.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                                            </FormSelect>
                                        </div>
                                        {(isW2 || ptName === 'C2C') && (
                                            <div className="mt-3">
                                                <PayoutBasisPicker
                                                    entry={ptEntry}
                                                    index={index}
                                                    isW2={isW2}
                                                    onChange={(key, value) => handleArrayChange('placement_types', index, key, value)}
                                                />
                                            </div>
                                        )}
                                    </TimelineItem>
                                );
                            })}
                            {(formData.placement_types || []).length === 0 && (
                                <EmptyRecords>No pay model periods yet — add one to start.</EmptyRecords>
                            )}
                        </div>
                    </Step>

                    {/* 03 Time logging */}
                    <Step n="03" icon={Timer} title="Time logging" subtitle="How and when hours are collected">
                        <Notice tone="amber" icon={Lock}>
                            The <b>first time log start date</b>, <b>cycle</b> and <b>week start day</b> cannot be changed after the engagement is created.
                        </Notice>
                        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[16px] border border-(--border-subtle) px-4 py-3">
                            <span>
                                <span className="block text-sm font-semibold text-(--text-main)">Collect time logs</span>
                                <span className="block text-xs text-(--text-muted)">Generate time log periods for this engagement</span>
                            </span>
                            <input
                                type="checkbox"
                                className="sr-only"
                                checked={formData.has_timesheets}
                                onChange={e => setFormData({...formData, has_timesheets: e.target.checked})}
                            />
                            <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', !formData.has_timesheets && 'bg-(--border-subtle)')} style={formData.has_timesheets ? { background: 'var(--brand-gradient)' } : undefined}>
                                <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', formData.has_timesheets ? 'left-[22px]' : 'left-0.5')} />
                            </span>
                        </label>
                        {formData.has_timesheets && (
                            <div className="grid gap-4 sm:grid-cols-3">
                                <FormInput label="First time log starts" type="date" required={formData.has_timesheets} value={formData.timesheet_start_date} onChange={handleTimesheetStartDateChange} />
                                <FormSelect label="Cycle" value={formData.timesheet_cycle_id} onChange={v => setFormData({...formData, timesheet_cycle_id: v})}>
                                    <option value="">Choose cycle…</option>
                                    {lookups.cycles?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </FormSelect>
                                <FormSelect label="Week start day" value={formData.week_start_day} onChange={v => setFormData({...formData, week_start_day: v})}>
                                    <option value="">Choose day…</option>
                                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(d => <option key={d} value={d}>{d}</option>)}
                                </FormSelect>
                            </div>
                        )}
                    </Step>

                    <div className="grid gap-5 2xl:grid-cols-2">
                        {/* 04 Bill rates */}
                        <Step
                            n="04"
                            icon={TrendingUp}
                            title="Bill rates"
                            subtitle="What the partner is charged"
                            action={<Btn size="sm" variant="success" icon={Plus} onClick={() => handleArrayAdd('bill_rates')}>Add rate</Btn>}
                        >
                            <div className="space-y-3">
                                {formData.bill_rates.map((br, index) => (
                                    <TimelineItem key={br.id} last={index === formData.bill_rates.length - 1} onRemove={() => handleArrayRemove('bill_rates', index)}>
                                        <div className="grid gap-3 pr-8 sm:grid-cols-2">
                                            <FormInput label="Rate" type="amount" required prefix="$" suffix="/ Hr" value={br.bill_rate_value} onChange={v => handleArrayChange('bill_rates', index, 'bill_rate_value', v)} />
                                            <FormInput label="Effective from" type="date" required value={br.effective_date} onChange={v => handleArrayChange('bill_rates', index, 'effective_date', v)} />
                                        </div>

                                        {!br._showDiscount ? (
                                            <Btn size="sm" variant="warn" icon={Plus} className="mt-3" onClick={() => toggleBillRateDiscount(index)}>Add discount</Btn>
                                        ) : (
                                            <div className="mt-3 grid gap-3 rounded-[14px] border border-amber-500/25 bg-amber-500/5 p-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                                                <div>
                                                    <FormInput label="Discount" type="number" step="0.1" suffix="%" value={br.discount_percentage} onChange={v => handleArrayChange('bill_rates', index, 'discount_percentage', v)} />
                                                    {br.bill_rate_value && br.discount_percentage && (
                                                        <p className="mt-1 text-[11px] text-amber-600">Saves {fmt$(parseFloat(br.bill_rate_value) * (parseFloat(br.discount_percentage) / 100))}</p>
                                                    )}
                                                </div>
                                                <FormInput label="Reason" value={br.discount_reason} onChange={v => handleArrayChange('bill_rates', index, 'discount_reason', v)} />
                                                <div className="text-right sm:col-span-2">
                                                    <button type="button" onClick={() => toggleBillRateDiscount(index)} className="text-xs font-semibold text-rose-500 outline-none hover:underline">Remove discount</button>
                                                </div>
                                            </div>
                                        )}

                                        {br.bill_rate_value && (
                                            <p className="mt-2 text-xs font-semibold text-emerald-500">
                                                Final {fmt$((parseFloat(br.bill_rate_value) || 0) * (1 - (parseFloat(br.discount_percentage) || 0) / 100))} / Hr
                                            </p>
                                        )}
                                    </TimelineItem>
                                ))}
                                {formData.bill_rates.length === 0 && <EmptyRecords>No bill rates yet — add one to start.</EmptyRecords>}
                            </div>
                            <div className="flex items-center justify-between rounded-[16px] bg-emerald-500/10 px-4 py-3">
                                <span className="text-xs font-medium text-emerald-600">Active final bill rate</span>
                                <span className="text-lg font-semibold text-emerald-500" style={{ fontFamily: 'var(--font-display)' }}>{fmt$(calculateCurrentBillRate())} / Hr</span>
                            </div>
                        </Step>

                        {/* 05 Pay rates */}
                        <Step
                            n="05"
                            icon={Wallet}
                            title="Pay rates"
                            subtitle="What the consultant earns"
                            action={
                                <div className="flex items-center gap-2">
                                    <RateSegmentsPopover billRates={formData.bill_rates} payRates={formData.pay_rates} payRateType={formData.pay_rate_type} />
                                    <Btn size="sm" variant="primary" icon={Plus} onClick={() => handleArrayAdd('pay_rates')}>Add rate</Btn>
                                </div>
                            }
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span className="nx-label mb-0">Enter pay as</span>
                                <Segmented
                                    value={formData.pay_rate_type}
                                    options={[['Amount', 'Fixed ($)'], ['Percentage', 'Percent (%)']]}
                                    onChange={v => setFormData({...formData, pay_rate_type: v})}
                                />
                            </div>

                            <div className="space-y-3">
                                {formData.pay_rates.map((pr, index) => {
                                    const val = parseFloat(pr.pay_rate_value) || 0;
                                    const finalBillRate = getFinalBillRateAmount();
                                    const isAmt = formData.pay_rate_type === 'Amount';
                                    return (
                                        <TimelineItem key={pr.id} last={index === formData.pay_rates.length - 1} onRemove={() => handleArrayRemove('pay_rates', index)}>
                                            <div className="grid gap-3 pr-8 sm:grid-cols-2">
                                                <div>
                                                    <FormInput
                                                        label={`Value (${isAmt ? '$' : '%'})`}
                                                        type={isAmt ? 'amount' : 'number'}
                                                        step="0.01"
                                                        required
                                                        prefix={isAmt ? '$' : undefined}
                                                        suffix={isAmt ? '/ Hr' : '%'}
                                                        value={pr.pay_rate_value}
                                                        onChange={v => handleArrayChange('pay_rates', index, 'pay_rate_value', v)}
                                                    />
                                                    {isAmt && finalBillRate > 0 && (
                                                        <p className="mt-1 text-[11px] text-amber-600">{(val / finalBillRate * 100).toFixed(2)}% of bill rate</p>
                                                    )}
                                                </div>
                                                <FormInput label="Effective from" required type="date" value={pr.effective_date} onChange={v => handleArrayChange('pay_rates', index, 'effective_date', v)} />
                                            </div>
                                        </TimelineItem>
                                    );
                                })}
                                {formData.pay_rates.length === 0 && <EmptyRecords>No pay rates yet.</EmptyRecords>}
                            </div>
                            <div className="flex items-center justify-between rounded-[16px] bg-sky-500/10 px-4 py-3">
                                <span className="text-xs font-medium text-sky-600">Final pay rate</span>
                                <span className="text-lg font-semibold text-sky-500" style={{ fontFamily: 'var(--font-display)' }}>{fmt$(calculateCurrentPayRate())} / Hr</span>
                            </div>
                        </Step>
                    </div>
                </div>

                {/* Live snapshot */}
                <aside className="border-t border-(--border-subtle) bg-(--bg-app)/40 p-5 xl:border-l xl:border-t-0 xl:p-6">
                    <div className="space-y-4 xl:sticky xl:top-6">
                        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-(--brand-primary)">Engagement snapshot</p>
                        <div className="rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5">
                            <p className="flex items-center gap-2 text-sm text-(--text-muted)"><User size={14} /> <span className="truncate font-semibold text-(--text-main)">{selectedEmployee ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}` : 'Consultant'}</span></p>
                            <p className="mt-2 flex items-center gap-2 text-sm text-(--text-muted)"><Handshake size={14} /> <span className="truncate font-semibold text-(--text-main)">{selectedClient?.client_name || 'Partner'}</span></p>
                            <p className="mt-2 truncate text-xs text-(--text-muted)">{formData.job_title || 'Job title'}</p>
                            <p className="mt-3 flex items-center gap-2 text-xs text-(--text-muted)">
                                <CalendarRange size={13} />
                                {formData.start_date ? fmtDate(formData.start_date) : 'Start'} → {formData.end_date ? fmtDate(formData.end_date) : 'Ongoing'}
                            </p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-[18px] border border-emerald-500/20 bg-emerald-500/5 p-3">
                                <p className="text-[11px] text-emerald-500">Bill</p>
                                <p className="text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{fmt$(billNow)}</p>
                            </div>
                            <div className="rounded-[18px] border border-sky-500/20 bg-sky-500/5 p-3">
                                <p className="text-[11px] text-sky-500">Pay</p>
                                <p className="text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{fmt$(payNow)}</p>
                            </div>
                        </div>
                        <div className="rounded-[18px] p-4 text-white" style={{ background: 'var(--brand-gradient)' }}>
                            <p className="text-xs text-white/80">Spread per hour</p>
                            <p className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-display)' }}>{fmt$(billNow - payNow)}</p>
                        </div>
                        <Notice tone={validationStatus.isValid ? 'brand' : 'rose'} icon={AlertTriangle}>
                            {validationStatus.message}
                        </Notice>
                    </div>
                </aside>
            </form>
        </BaseModal>
    );
};

export default AddPlacementModal;
