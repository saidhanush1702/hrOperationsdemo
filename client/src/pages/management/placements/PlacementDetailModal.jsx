import { useState, useEffect } from 'react';
import { Save, Edit3, Rocket, TrendingUp, Wallet, Timer, AlertTriangle, CheckCircle, Plus, X, Lock, Layers, Handshake } from 'lucide-react';
import api from '../../../api/axios';
import { managementAPI, commonAPI, timesheetAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';
import PayoutBasisPicker from './PayoutBasisPicker';
import { getEasternDateString, getEasternDateMinus, fmtDate, isOnOrBeforeEasternToday } from '../../../utils/dateUtils';
import { DetailLayout, SectionTitle, Btn, Chip, Avatar, Fact } from '../../../components/ui/kit';
import { fmt$, Notice, TimelineItem, EmptyRecords, FormInput, FormSelect, Segmented, RateSegmentsPopover } from './engagementUi';

const getUSADateString = getEasternDateString;

const PlacementDetailModal = ({ placement, onClose, onRefresh }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [minStartDate, setMinStartDate] = useState('');
    const [section, setSection] = useState('assignment');
    // Set when a pay-rate edit re-priced already-posted C2C ledger entries.
    const [balanceSheetSync, setBalanceSheetSync] = useState(null);

    // Completion State
    const [isCompleting, setIsCompleting] = useState(false);
    const [completionData, setCompletionData] = useState({ end_date: '', reason: '' });

    // Lookup Data States
    const [employees, setEmployees] = useState([]);
    const [clients, setClients] = useState([]);
    const [lookups, setLookups] = useState({ payTypes: [], cycles: [] });

    // Convert initial engagement data into our form structure
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
            ? `W2 pay rate can be at most 85% of the final bill rate — exactly 85% is allowed, above 85% is not.`
            : `Pay rate must be less than the final bill rate.`;

        if (finalBillRate > 0 && editData.pay_rates.length > 0) {
            for (let pr of editData.pay_rates) {
                const val = parseFloat(pr.pay_rate_value) || 0;
                const amt = parseFloat((editData.pay_rate_type === 'Percentage' ? (finalBillRate * (val / 100)) : val).toFixed(2));

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

    // --- ACTIONS ---
    const handleSave = async () => {
        setSubmitError('');

        if (!validationStatus.isValid) {
            setSubmitError(validationStatus.message);
            return;
        }

        if (!editData.placement_types || editData.placement_types.length === 0) {
            setSubmitError("Please add at least one pay model period.");
            return;
        }
        for (let pt of editData.placement_types) {
            if (!pt.start_date || !pt.pay_type_id) {
                setSubmitError("Please fill out the start date and type for every pay model period.");
                return;
            }
        }

        if (editData.bill_rates.length === 0) {
            setSubmitError("Please add at least one bill rate.");
            return;
        }
        for (let br of editData.bill_rates) {
            if (!br.bill_rate_value || !br.effective_date) {
                setSubmitError("Please fill out the rate and start date for all bill rates.");
                return;
            }
        }

        for (let p of editData.pay_rates) {
            if (!p.pay_rate_value || !p.effective_date) {
                setSubmitError("Please fill out the value and start date for all pay rates.");
                return;
            }
        }

        const finalCalculatedPayRate = calculateCurrentPayRate(editData);

        const payload = {
            ...editData,
            pay_rate: finalCalculatedPayRate,
            bill_rates: editData.bill_rates.map(({ _showDiscount, ...br }) => br) // eslint-disable-line no-unused-vars
        };

        setLoading(true);
        try {
            const saveRes = await api.put(`/api/management/placements/${placement.id}`, payload);

            // The backend re-prices already-posted C2C ledger entries when the pay rate
            // changes. Surface it — money moved, so it must not be silent.
            const sync = saveRes.data?.balance_sheet_sync;
            setBalanceSheetSync(sync && sync.changes?.length > 0 ? sync : null);

            // Enrich saved data with display names so the view updates immediately
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

            timesheetAPI.generateTimesheets().catch(e => console.error("Silent time log gen failed:", e));

        } catch (err) {
            const exactError = err.response?.data?.error || err.response?.data?.message || "Update failed";
            setSubmitError(exactError);
        } finally {
            setLoading(false);
        }
    };

    const formatDateForInput = (dateString) => {
        if (!dateString) return '';
        return dateString.split('T')[0];
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
                bill_rates: currentPlacement.bill_rates.map(({ _showDiscount, ...br }) => br) // eslint-disable-line no-unused-vars
            };

            await api.put(`/api/management/placements/${placement.id}`, payload);
            onRefresh();
            onClose();

            timesheetAPI.generateTimesheets().catch(e => console.error("Silent time log gen failed:", e));

        } catch (err) {
            const exactError = err.response?.data?.error || err.response?.data?.message || "Failed to mark as completed.";
            setSubmitError(exactError);
        } finally {
            setLoading(false);
        }
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
        // carrying a basis the new type cannot honour.
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

    const consultantName = `${currentPlacement.first_name} ${currentPlacement.last_name}`;

    const aside = (
        <div>
            <div className="flex items-center gap-3">
                <Avatar name={consultantName} size={56} ring />
                <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{consultantName}</p>
                    <p className="truncate text-xs text-(--text-muted)">{currentPlacement.job_title || '—'}</p>
                </div>
            </div>
            <p className="mt-4 flex items-center gap-2 text-sm text-(--text-main)">
                <Handshake size={15} className="text-(--brand-primary)" /> <span className="truncate font-medium">{currentPlacement.client_name}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
                {currentPlacement.is_completed ? <Chip tone="slate">Completed</Chip> : <Chip tone="green">Active</Chip>}
                <Chip tone="brand">{currentPlacement.placement_code || '—'}</Chip>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-[18px] border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <p className="text-[11px] text-emerald-500">Bill rate</p>
                    <p className="text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{fmt$(calculateCurrentBillRate(dataToRender))}</p>
                </div>
                <div className="rounded-[18px] border border-sky-500/20 bg-sky-500/5 p-3">
                    <p className="text-[11px] text-sky-500">Pay rate</p>
                    <p className="text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{fmt$(calculateCurrentPayRate(dataToRender))}</p>
                </div>
            </div>

            {submitError && (
                <Notice tone="rose" icon={AlertTriangle} className="mt-4">{submitError}</Notice>
            )}

            {balanceSheetSync && (
                <Notice tone="green" icon={CheckCircle} className="mt-4">
                    <div className="flex items-start gap-2">
                        <span className="flex-1">
                            Ledger updated — {balanceSheetSync.changes.length} C2C
                            {' '}entr{balanceSheetSync.changes.length === 1 ? 'y' : 'ies'} re-priced:
                            {' '}{fmt$(balanceSheetSync.total_before)} → {fmt$(balanceSheetSync.total_after)}
                            {' '}({balanceSheetSync.delta >= 0 ? '+' : '−'}{fmt$(Math.abs(balanceSheetSync.delta))})
                        </span>
                        <button onClick={() => setBalanceSheetSync(null)} className="shrink-0 outline-none"><X size={14} /></button>
                    </div>
                </Notice>
            )}

            <div className="mt-4 flex flex-col gap-2">
                {!isEditing ? (
                    <Btn variant="primary" icon={Edit3} onClick={() => setIsEditing(true)}>Edit engagement</Btn>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <Btn onClick={() => { setIsEditing(false); setEditData(currentPlacement); setSubmitError(''); }}>Cancel</Btn>
                        <Btn variant="primary" icon={Save} onClick={handleSave} disabled={loading || !validationStatus.isValid}>
                            {loading ? 'Saving…' : 'Save'}
                        </Btn>
                    </div>
                )}
                {!isEditing && !editData.is_completed && !isCompleting && (
                    <Btn variant="success" icon={CheckCircle} onClick={startCompletionFlow}>Mark completed</Btn>
                )}
            </div>
        </div>
    );

    return (
        <BaseModal
            isOpen={true}
            onClose={onClose}
            icon={<Rocket size={18} />}
            title={`${consultantName} × ${currentPlacement.client_name}`}
            subtitle="Engagement details"
            headerRight={isEditing ? <Chip tone="amber" icon={Edit3}>Editing</Chip> : null}
            noPadding
        >
            <DetailLayout
                aside={aside}
                active={section}
                onSelect={setSection}
                sections={[
                    { key: 'assignment', label: 'Assignment', icon: Rocket },
                    { key: 'model', label: 'Pay model', icon: Layers, count: dataToRender.placement_types.length },
                    { key: 'time', label: 'Time logging', icon: Timer },
                    { key: 'bill', label: 'Bill rates', icon: TrendingUp, count: dataToRender.bill_rates.length },
                    { key: 'pay', label: 'Pay rates', icon: Wallet, count: dataToRender.pay_rates.length },
                ]}
            >
                {isCompleting && (
                    <div className="mb-6 rounded-[22px] border border-emerald-500/25 bg-emerald-500/5 p-5">
                        <div className="mb-3 flex items-center justify-between">
                            <h4 className="flex items-center gap-2 text-sm font-semibold text-emerald-600"><CheckCircle size={16} /> Complete this engagement</h4>
                            <Btn size="icon" icon={X} onClick={() => setIsCompleting(false)} title="Cancel" />
                        </div>
                        <Notice tone="amber" icon={AlertTriangle} className="mb-4">
                            Before completing, open <b>Billing → Sync</b> to make sure all approved time logs have been invoiced. Invoices are not auto-generated for inactive engagements after completion.
                        </Notice>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormInput label="Final end date" required type="date" value={completionData.end_date} onChange={v => setCompletionData({...completionData, end_date: v})} />
                            <FormInput label="Reason for completion" required placeholder="e.g. Project finished, resigned…" value={completionData.reason} onChange={v => setCompletionData({...completionData, reason: v})} />
                        </div>
                        <div className="mt-4 flex justify-end gap-2">
                            <Btn onClick={() => setIsCompleting(false)}>Cancel</Btn>
                            <Btn variant="success" icon={CheckCircle} disabled={!completionData.end_date || !completionData.reason || loading} onClick={confirmCompletion}>
                                {loading ? 'Processing…' : 'Confirm completion'}
                            </Btn>
                        </div>
                    </div>
                )}

                {section === 'assignment' && (
                    <>
                        <SectionTitle icon={Rocket} title="Assignment" subtitle="Consultant, partner, role and dates" />
                        <div className="space-y-4">
                            {!isEditing && currentPlacement.is_completed && currentPlacement.completion_reason && (
                                <Notice tone="amber" icon={CheckCircle}><b>Completion reason:</b> {currentPlacement.completion_reason}</Notice>
                            )}
                            {isEditing && (
                                <Notice tone="amber" icon={Lock}>Consultant and partner are locked once an engagement is created.</Notice>
                            )}
                            <div className="grid gap-4 rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5 sm:grid-cols-2">
                                <Fact label="Consultant" value={consultantName} />
                                <Fact label="Partner" value={currentPlacement.client_name} />
                                {isEditing
                                    ? <FormInput label="Job title" value={editData.job_title} onChange={v => setEditData({ ...editData, job_title: v })} />
                                    : <Fact label="Job title" value={editData.job_title} />}
                                <Fact label="Engagement ID" value={editData.placement_code} mono />
                                {isEditing
                                    ? <FormInput label="Start date" type="date" value={formatDateForInput(editData.start_date)} min={minStartDate} onChange={v => setEditData({ ...editData, start_date: v })} />
                                    : <Fact label="Start date" value={editData.start_date ? fmtDate(editData.start_date) : null} />}
                                {isEditing
                                    ? <FormInput label="End date" type="date" value={formatDateForInput(editData.end_date)} min={formatDateForInput(editData.start_date) || minStartDate} onChange={v => setEditData({ ...editData, end_date: v })} />
                                    : <Fact label="End date" value={editData.end_date ? fmtDate(editData.end_date) : 'Ongoing'} />}
                            </div>
                        </div>
                    </>
                )}

                {section === 'model' && (
                    <>
                        <SectionTitle
                            icon={Layers}
                            title="Pay model timeline"
                            subtitle="Which pay model applies, and from when"
                            actions={isEditing && <Btn size="sm" icon={Plus} onClick={() => handleArrayAdd('placement_types')}>Add period</Btn>}
                        />
                        <div className="space-y-3">
                            {dataToRender.placement_types.map((pt, index) => {
                                const typeName = lookups.payTypes?.find(t => String(t.id) === String(pt.pay_type_id))?.name || pt.pay_type_name || '';
                                const isW2Entry  = typeName === 'W2';
                                const isC2CEntry = typeName === 'C2C';
                                return (
                                    <TimelineItem
                                        key={pt.id || index}
                                        last={index === dataToRender.placement_types.length - 1}
                                        onRemove={isEditing && editData.placement_types.length > 1 ? () => handleArrayRemove('placement_types', index) : undefined}
                                    >
                                        <div className="grid gap-3 pr-8 sm:grid-cols-2">
                                            {isEditing
                                                ? <FormInput label="Starts" required type="date" value={formatDateForInput(pt.start_date)} onChange={v => handleArrayChange('placement_types', index, 'start_date', v)} />
                                                : <Fact label="Starts" value={pt.start_date ? fmtDate(pt.start_date) : null} />}
                                            {isEditing ? (
                                                <FormSelect label="Pay model" required value={pt.pay_type_id} onChange={v => handleArrayChange('placement_types', index, 'pay_type_id', v)}>
                                                    <option value="" disabled>Select…</option>
                                                    {lookups.payTypes?.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                                                </FormSelect>
                                            ) : (
                                                <Fact label="Pay model" value={typeName ? <Chip tone="brand">{typeName}</Chip> : null} />
                                            )}
                                        </div>
                                        {(isW2Entry || isC2CEntry || !!pt.run_as_per_lca_wage || pt.payout_basis === 'FIXED') && (
                                            <div className="mt-3">
                                                <PayoutBasisPicker
                                                    entry={pt}
                                                    index={index}
                                                    isW2={isW2Entry}
                                                    editable={isEditing && (isW2Entry || isC2CEntry)}
                                                    isEditing={isEditing}
                                                    onChange={(key, value) => handleArrayChange('placement_types', index, key, value)}
                                                />
                                            </div>
                                        )}
                                    </TimelineItem>
                                );
                            })}
                            {dataToRender.placement_types.length === 0 && (
                                <EmptyRecords>{isEditing ? 'No pay model periods — add one to start.' : 'No pay model periods.'}</EmptyRecords>
                            )}
                        </div>
                    </>
                )}

                {section === 'time' && (
                    <>
                        <SectionTitle icon={Timer} title="Time logging" subtitle="How hours are collected for this engagement" />
                        <div className="space-y-4">
                            {isEditing && (
                                <Notice tone="amber" icon={Lock}>Time logging settings (on/off, first start date, cycle and week start day) cannot be changed after creation.</Notice>
                            )}
                            <div className="flex items-center justify-between rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) px-5 py-4">
                                <span className="text-sm font-semibold text-(--text-main)">Time logs</span>
                                {dataToRender.has_timesheets ? <Chip tone="green">Enabled</Chip> : <Chip tone="rose">Disabled</Chip>}
                            </div>
                            {dataToRender.has_timesheets && (
                                <div className="grid gap-4 rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5 sm:grid-cols-3">
                                    <Fact label="First time log starts" value={dataToRender.timesheet_start_date ? fmtDate(formatDateForInput(dataToRender.timesheet_start_date)) : null} />
                                    <Fact label="Cycle" value={dataToRender.timesheet_cycle_name || lookups.cycles?.find(c => String(c.id) === String(dataToRender.timesheet_cycle_id))?.name} />
                                    <Fact label="Week start day" value={dataToRender.week_start_day} />
                                </div>
                            )}
                        </div>
                    </>
                )}

                {section === 'bill' && (
                    <>
                        <SectionTitle
                            icon={TrendingUp}
                            title="Bill rates"
                            subtitle="What the partner is charged"
                            actions={isEditing && <Btn size="sm" variant="success" icon={Plus} onClick={() => handleArrayAdd('bill_rates')}>Add rate</Btn>}
                        />
                        <div className="space-y-3">
                            {dataToRender.bill_rates.map((br, index) => (
                                <TimelineItem
                                    key={br.id || index}
                                    last={index === dataToRender.bill_rates.length - 1}
                                    onRemove={isEditing ? () => handleArrayRemove('bill_rates', index) : undefined}
                                >
                                    <div className="grid gap-3 pr-8 sm:grid-cols-2">
                                        {isEditing
                                            ? <FormInput label="Rate" type="amount" required prefix="$" suffix="/ Hr" value={br.bill_rate_value} onChange={v => handleArrayChange('bill_rates', index, 'bill_rate_value', v)} />
                                            : <Fact label="Rate" value={`${fmt$(br.bill_rate_value)} / Hr`} />}
                                        {isEditing
                                            ? <FormInput label="Effective from" required type="date" value={formatDateForInput(br.effective_date)} onChange={v => handleArrayChange('bill_rates', index, 'effective_date', v)} />
                                            : <Fact label="Effective from" value={br.effective_date ? fmtDate(formatDateForInput(br.effective_date)) : null} />}
                                    </div>

                                    {isEditing ? (
                                        !br._showDiscount ? (
                                            <Btn size="sm" variant="warn" icon={Plus} className="mt-3" onClick={() => toggleBillRateDiscount(index)}>Add discount</Btn>
                                        ) : (
                                            <div className="mt-3 grid gap-3 rounded-[14px] border border-amber-500/25 bg-amber-500/5 p-3 sm:grid-cols-[140px_minmax(0,1fr)]">
                                                <div>
                                                    <FormInput label="Discount" type="number" step="0.1" suffix="%" value={br.discount_percentage} onChange={v => handleArrayChange('bill_rates', index, 'discount_percentage', v)} />
                                                    {br.bill_rate_value && br.discount_percentage && (
                                                        <p className="mt-1 text-[11px] text-amber-600">Saves {fmt$((parseFloat(br.bill_rate_value) || 0) * (parseFloat(br.discount_percentage) / 100))}</p>
                                                    )}
                                                </div>
                                                <FormInput label="Reason" value={br.discount_reason} onChange={v => handleArrayChange('bill_rates', index, 'discount_reason', v)} />
                                                <div className="text-right sm:col-span-2">
                                                    <button type="button" onClick={() => toggleBillRateDiscount(index)} className="text-xs font-semibold text-rose-500 outline-none hover:underline">Remove discount</button>
                                                </div>
                                            </div>
                                        )
                                    ) : (
                                        br.discount_percentage ? (
                                            <div className="mt-3 flex flex-wrap gap-4 rounded-[14px] border border-amber-500/25 bg-amber-500/5 px-3 py-2">
                                                <Fact label="Discount" value={`${br.discount_percentage}%`} />
                                                {br.discount_reason && <Fact label="Reason" value={br.discount_reason} />}
                                            </div>
                                        ) : null
                                    )}

                                    <p className="mt-2 text-xs font-semibold text-emerald-500">
                                        Final {fmt$((parseFloat(br.bill_rate_value) || 0) * (1 - (parseFloat(br.discount_percentage) || 0) / 100))} / Hr
                                    </p>
                                </TimelineItem>
                            ))}

                            {dataToRender.bill_rates.length === 0 && (
                                <EmptyRecords>{isEditing ? 'No bill rates — add one to start.' : 'No bill rates on record.'}</EmptyRecords>
                            )}
                        </div>
                        <div className="mt-4 flex items-center justify-between rounded-[16px] bg-emerald-500/10 px-4 py-3">
                            <span className="text-xs font-medium text-emerald-600">Active final bill rate</span>
                            <span className="text-lg font-semibold text-emerald-500" style={{ fontFamily: 'var(--font-display)' }}>{fmt$(calculateCurrentBillRate(dataToRender))} / Hr</span>
                        </div>
                    </>
                )}

                {section === 'pay' && (
                    <>
                        <SectionTitle
                            icon={Wallet}
                            title="Pay rates"
                            subtitle="What the consultant earns"
                            actions={
                                <div className="flex items-center gap-2">
                                    <RateSegmentsPopover billRates={dataToRender.bill_rates} payRates={dataToRender.pay_rates} payRateType={dataToRender.pay_rate_type} />
                                    {isEditing && <Btn size="sm" variant="primary" icon={Plus} onClick={() => handleArrayAdd('pay_rates')}>Add rate</Btn>}
                                </div>
                            }
                        />
                        <div className="mb-4 flex items-center justify-between gap-3 rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) px-5 py-3">
                            <span className="nx-label mb-0">Pay entered as</span>
                            {isEditing ? (
                                <Segmented
                                    value={editData.pay_rate_type}
                                    options={[['Amount', 'Fixed ($)'], ['Percentage', 'Percent (%)']]}
                                    onChange={v => setEditData({...editData, pay_rate_type: v})}
                                />
                            ) : (
                                <Chip tone="brand">{currentPlacement.pay_rate_type === 'Percentage' ? 'Percentage (%)' : 'Fixed amount ($)'}</Chip>
                            )}
                        </div>

                        <div className="space-y-3">
                            {dataToRender.pay_rates.map((pr, index) => {
                                const isAmt = dataToRender.pay_rate_type === 'Amount';
                                return (
                                    <TimelineItem
                                        key={pr.id || index}
                                        last={index === dataToRender.pay_rates.length - 1}
                                        onRemove={isEditing ? () => handleArrayRemove('pay_rates', index) : undefined}
                                    >
                                        <div className="grid gap-3 pr-8 sm:grid-cols-2">
                                            <div>
                                                {isEditing ? (
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
                                                ) : (
                                                    <Fact label={`Value (${isAmt ? '$' : '%'})`} value={`${isAmt ? '$' : ''}${pr.pay_rate_value}${!isAmt ? '%' : ''}`} />
                                                )}
                                                {isAmt && finalBillRateForDisplay > 0 && (
                                                    <p className="mt-1 text-[11px] text-amber-600">{((parseFloat(pr.pay_rate_value) || 0) / finalBillRateForDisplay * 100).toFixed(2)}% of bill rate</p>
                                                )}
                                            </div>
                                            {isEditing
                                                ? <FormInput label="Effective from" required type="date" value={formatDateForInput(pr.effective_date)} onChange={v => handleArrayChange('pay_rates', index, 'effective_date', v)} />
                                                : <Fact label="Effective from" value={pr.effective_date ? fmtDate(formatDateForInput(pr.effective_date)) : null} />}
                                        </div>
                                    </TimelineItem>
                                );
                            })}

                            {dataToRender.pay_rates.length === 0 && <EmptyRecords>No pay rates on record.</EmptyRecords>}
                        </div>

                        <div className="mt-4 flex items-center justify-between rounded-[16px] bg-sky-500/10 px-4 py-3">
                            <span className="text-xs font-medium text-sky-600">Active final pay rate</span>
                            <span className="text-lg font-semibold text-sky-500" style={{ fontFamily: 'var(--font-display)' }}>{fmt$(calculateCurrentPayRate(dataToRender))} / Hr</span>
                        </div>

                        {isEditing && (
                            <Notice tone={validationStatus.isValid ? 'brand' : 'rose'} icon={AlertTriangle} className="mt-4">
                                <b>Validation:</b> {validationStatus.message}
                            </Notice>
                        )}
                    </>
                )}
            </DetailLayout>
        </BaseModal>
    );
};

export default PlacementDetailModal;
