import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Rocket, Plus, Download, Layers, PlayCircle, CheckCircle2, Handshake, CalendarRange, ArrowUpRight } from 'lucide-react';
import api from '../../../api/axios';
import { commonAPI, managementAPI } from '../../../api/apiService';
import { exportToExcel } from '../../../utils/exportToExcel';
import { rowOpen } from '../../../utils/rowClick';
import { matchesSearch } from '../../../utils/searchMatch';
import AddPlacementModal from './AddPlacementModal';
import PlacementDetailModal from './PlacementDetailModal';
import { fmtDate } from '../../../utils/dateUtils';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import {
    PageHero, StatRail, StatTile, Workbench, FilterDock, DockField, SearchInput, SelectInput,
    Btn, Chip, Avatar, EmptyState, LoadingState,
} from '../../../components/ui/kit';

// ─── helpers ─────────────────────────────────────────────────────────────────
const getActiveFinalRates = (p) => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    // Effective final bill rate from placement_bill_rates
    let finalBill = 0;
    if (p.bill_rates && Array.isArray(p.bill_rates) && p.bill_rates.length > 0) {
        const active = p.bill_rates
            .filter(br => br.effective_date && new Date(br.effective_date) <= now)
            .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
        if (active.length > 0) {
            const br = active[0];
            const base = parseFloat(br.bill_rate_value) || 0;
            const disc = parseFloat(br.discount_percentage) || 0;
            finalBill = base - (base * (disc / 100));
        }
    } else {
        finalBill = parseFloat(p.bill_rate) || 0;
    }

    // Effective final pay rate from placement_pay_rates
    let finalPay = parseFloat(p.pay_rate) || 0;
    if (p.pay_rates && Array.isArray(p.pay_rates)) {
        const active = p.pay_rates
            .filter(pr => pr.effective_date && new Date(pr.effective_date) <= now)
            .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
        if (active.length > 0) {
            const val = parseFloat(active[0].pay_rate_value) || 0;
            finalPay = p.pay_rate_type === 'Percentage' ? (finalBill * (val / 100)) : val;
        }
    }

    // Active pay type from placement_type_history — same MAX(start_date) <= today logic
    let payTypeName = p.pay_type_name || '';
    let lcaFlag = false;
    let payoutBasis = 'HOURS';
    let fixedPay = null;
    if (p.placement_types && Array.isArray(p.placement_types) && p.placement_types.length > 0) {
        const active = p.placement_types
            .filter(pt => pt.start_date && pt.start_date <= todayStr)
            .sort((a, b) => new Date(b.start_date) - new Date(a.start_date));
        if (active.length > 0) {
            payTypeName = active[0].pay_type_name || payTypeName;
            lcaFlag     = !!(active[0].run_as_per_lca_wage);
            // payout_basis is authoritative; the legacy flag covers rows saved before it existed.
            payoutBasis = active[0].payout_basis || (lcaFlag ? 'LCA' : 'HOURS');
            fixedPay    = active[0].fixed_pay_per_period != null ? parseFloat(active[0].fixed_pay_per_period) : null;
        }
    }

    return { bill: finalBill.toFixed(2), pay: finalPay.toFixed(2), payTypeName, lcaFlag, payoutBasis, fixedPay };
};

const fmt$ = (v) => '$' + parseFloat(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EMPTY_FILTERS = { payType: 'ALL', employee: 'ALL', client: 'ALL' };

// ─── Main component ───────────────────────────────────────────────────────────
const Placements = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [placements, setPlacements] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [lookups, setLookups]       = useState({ payTypes: [] });
    const [activeEmployees, setActiveEmployees] = useState([]);

    const [isAddModalOpen, setIsAddModalOpen]     = useState(false);
    const [selectedPlacement, setSelectedPlacement] = useState(null);

    const [filterStatus, setFilterStatus] = useState(() => {
        const s = new URLSearchParams(location.search).get('status');
        return ['ACTIVE', 'COMPLETED'].includes(s) ? s : 'ALL';
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [applied, setApplied] = useState(EMPTY_FILTERS);

    // ─── data fetch ──────────────────────────────────────────────────────────
    const fetchData = async () => {
        setLoading(true);
        try {
            const [placementsRes, lookupsRes, employeesRes] = await Promise.all([
                api.get('/api/management/placements'),
                commonAPI.getLookups(),
                managementAPI.getEmployees(),
            ]);
            setPlacements(placementsRes.data);
            if (lookupsRes.data) setLookups(lookupsRes.data);
            if (employeesRes.data) {
                // active consultants only for the dropdown
                const active = employeesRes.data
                    .filter(e => e.role === 'EMPLOYEE' && (e.is_active === 1 || e.is_active === true))
                    .map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}` }))
                    .sort((a, b) => a.name.localeCompare(b.name));
                setActiveEmployees(active);
            }
        } catch (err) {
            console.error('Data fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchData(); }, []);
    useEffect(() => { setCurrentPage(1); }, [filterStatus, searchQuery, applied]);

    // Deep link from the Engagement History panels in the Talent and Partner detail
    // views: ?engagement=<id> opens that engagement as soon as the list has loaded.
    // The param is stripped afterwards with replace:true so it does not reopen on a
    // back navigation or a refresh.
    useEffect(() => {
        if (loading) return;
        const wanted = new URLSearchParams(location.search).get('engagement');
        if (!wanted) return;

        const match = placements.find(p => String(p.id) === String(wanted));
        if (match) setSelectedPlacement(match);

        const params = new URLSearchParams(location.search);
        params.delete('engagement');
        const qs = params.toString();
        navigate({ pathname: location.pathname, search: qs ? `?${qs}` : '' }, { replace: true });
    }, [loading, placements, location.search, location.pathname, navigate]);

    // ─── unique partners from engagement data ─────────────────────────────────
    const uniqueClients = useMemo(() => {
        const map = new Map();
        placements.forEach(p => {
            if (p.client_id && !map.has(p.client_id)) map.set(p.client_id, p.client_name);
        });
        return [...map.entries()]
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [placements]);

    // ─── filter logic ─────────────────────────────────────────────────────────
    const filteredPlacements = useMemo(() => placements.filter(p => {
        if (filterStatus === 'ACTIVE'    && p.status !== 'Active')    return false;
        if (filterStatus === 'COMPLETED' && p.status !== 'Completed') return false;
        if (applied.payType  !== 'ALL' && String(p.pay_type_id)  !== String(applied.payType))  return false;
        if (applied.employee !== 'ALL' && String(p.employee_id)  !== String(applied.employee)) return false;
        if (applied.client   !== 'ALL' && String(p.client_id)    !== String(applied.client))   return false;
        if (!matchesSearch(searchQuery,
            p.first_name, p.last_name, p.employee_code,
            p.placement_code, p.client_name, p.job_title, p.pay_type_name)) return false;
        return true;
    }), [placements, filterStatus, applied, searchQuery]);

    const tabCounts = useMemo(() => ({
        ALL:       placements.length,
        ACTIVE:    placements.filter(p => p.status === 'Active').length,
        COMPLETED: placements.filter(p => p.status === 'Completed').length,
    }), [placements]);

    const paginatedPlacements = filteredPlacements.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    const setFilter = (key, value) => setApplied(prev => ({ ...prev, [key]: value }));
    const clearAll  = () => { setApplied(EMPTY_FILTERS); setSearchQuery(''); };
    const activeCount = Object.values(applied).filter(v => v !== 'ALL').length + (searchQuery ? 1 : 0);

    // ─── export ───────────────────────────────────────────────────────────────
    const handleExport = () => {
        const headers = [
            'Consultant', 'Partner', 'Engagement Type', 'Payout Basis', 'Fixed Pay / Period',
            'Job Title', 'Engagement ID', 'Start Date', 'End Date',
            'Standard Bill Rate', 'Active Discounts', 'Active Final Bill Rate',
            'Pay Rate', 'Active Final Pay Rate',
            'First Time Log Start Date', 'Time Log Cycle', 'Week Start Day',
        ];
        const keys = [
            'employee', 'direct_client', 'placement_type', 'payout_basis', 'fixed_pay_per_period',
            'job_title', 'placement_code', 'start_date', 'end_date',
            'standard_bill_rate', 'active_discounts', 'active_final_bill_rate',
            'pay_rate', 'active_final_pay_rate',
            'first_timesheet_start_date', 'timesheet_cycle', 'week_start_day',
        ];
        const rows = filteredPlacements.map(p => {
            const finalRates = getActiveFinalRates(p);
            const activeDiscount = (() => {
                if (!p.discounts || !Array.isArray(p.discounts) || p.discounts.length === 0) return 'None';
                const active = p.discounts
                    .filter(d => d.effective_date && new Date(d.effective_date) <= new Date())
                    .sort((a, b) => new Date(b.effective_date) - new Date(a.effective_date));
                if (!active.length) return 'None';
                const d = active[0];
                return `${parseFloat(d.discount_value).toFixed(1)}%${d.reason ? ` (${d.reason})` : ''}`;
            })();
            return {
                employee:                   `${p.first_name} ${p.last_name}`,
                direct_client:              p.client_name || '',
                placement_type:             p.pay_type_name || '',
                payout_basis:               finalRates.payoutBasis === 'LCA'   ? 'As per LCA Wage'
                                          : finalRates.payoutBasis === 'FIXED' ? 'Fixed Pay (C2C)'
                                          :                                      'Hourly',
                fixed_pay_per_period:       finalRates.payoutBasis === 'FIXED' && finalRates.fixedPay != null
                                              ? finalRates.fixedPay.toFixed(2) : '',
                job_title:                  p.job_title || '',
                placement_code:             p.placement_code || '',
                start_date:                 fmtDate(p.start_date),
                end_date:                   p.end_date ? fmtDate(p.end_date) : 'Ongoing',
                standard_bill_rate:         parseFloat(p.bill_rate || 0).toFixed(2),
                active_discounts:           activeDiscount,
                active_final_bill_rate:     finalRates.bill,
                pay_rate:                   parseFloat(p.pay_rate || 0).toFixed(2),
                active_final_pay_rate:      finalRates.pay,
                first_timesheet_start_date: p.timesheet_start_date ? fmtDate(p.timesheet_start_date) : '',
                timesheet_cycle:            p.timesheet_cycle_name || '',
                week_start_day:             p.week_start_day || '',
            };
        });
        exportToExcel(rows, headers, keys, 'engagements');
    };

    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="mx-auto max-w-[1800px] space-y-4">
            <PageHero
                icon={Rocket}
                eyebrow="Talent"
                title="Engagements"
                description="Consultants deployed with partners — pay models, bill and pay rates, and timelines."
                actions={
                    <>
                        <Btn variant="success" icon={Download} onClick={handleExport} title="Export to Excel">Export</Btn>
                        <Btn variant="primary" icon={Plus} onClick={() => setIsAddModalOpen(true)}>New engagement</Btn>
                    </>
                }
            >
                <StatRail>
                    <StatTile label="All engagements" icon={Layers} value={tabCounts.ALL} active={filterStatus === 'ALL'} onClick={() => setFilterStatus('ALL')} />
                    <StatTile label="Running" icon={PlayCircle} value={tabCounts.ACTIVE} hint="active now" active={filterStatus === 'ACTIVE'} onClick={() => setFilterStatus('ACTIVE')} />
                    <StatTile label="Wrapped up" icon={CheckCircle2} value={tabCounts.COMPLETED} hint="completed" active={filterStatus === 'COMPLETED'} onClick={() => setFilterStatus('COMPLETED')} />
                </StatRail>
            </PageHero>

            <Workbench
                dock={
                    <FilterDock activeCount={activeCount} onReset={clearAll}>
                        <DockField label="Find">
                            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Name, consultant or engagement ID…" />
                        </DockField>
                        <DockField label="Pay model">
                            <SelectInput value={applied.payType} onChange={v => setFilter('payType', v)}>
                                <option value="ALL">All pay models</option>
                                {(lookups.payTypes || []).map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                            </SelectInput>
                        </DockField>
                        <DockField label="Consultant">
                            <SelectInput value={applied.employee} onChange={v => setFilter('employee', v)}>
                                <option value="ALL">All consultants</option>
                                {activeEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                            </SelectInput>
                        </DockField>
                        <DockField label="Partner">
                            <SelectInput value={applied.client} onChange={v => setFilter('client', v)}>
                                <option value="ALL">All partners</option>
                                {uniqueClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </SelectInput>
                        </DockField>
                    </FilterDock>
                }
            >
                <p className="text-sm text-(--text-muted)">
                    <span className="font-semibold text-(--text-main)">{filteredPlacements.length}</span> engagements
                </p>

                {loading ? (
                    <LoadingState text="Loading engagements…" />
                ) : paginatedPlacements.length === 0 ? (
                    <EmptyState icon={Rocket} title="No engagements match" text="Adjust the filters or create a new engagement." />
                ) : (
                    <div className="grid gap-4 xl:grid-cols-2">
                        {paginatedPlacements.map(p => {
                            const isActive   = p.status === 'Active';
                            const finalRates = getActiveFinalRates(p);
                            const payLabel = `${finalRates.payTypeName}`
                                + (finalRates.payTypeName === 'W2' && finalRates.payoutBasis === 'LCA' ? ' · LCA' : '')
                                + (finalRates.payTypeName === 'C2C' && finalRates.payoutBasis === 'FIXED' ? ` · fixed ${fmt$(finalRates.fixedPay)}/period` : '');
                            return (
                                <div
                                    key={p.id}
                                    onClick={rowOpen(() => setSelectedPlacement(p))}
                                    title="Open engagement"
                                    className="group relative cursor-pointer overflow-hidden rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-5 transition-all hover:-translate-y-1 hover:border-(--brand-primary)/45 hover:shadow-[0_22px_44px_-28px_var(--brand-glow)]"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <Avatar name={`${p.first_name || ''} ${p.last_name || ''}`} size={44} />
                                            <div className="min-w-0">
                                                <p className="truncate text-base font-semibold text-(--text-main)">{p.first_name} {p.last_name}</p>
                                                <p className="truncate text-xs text-(--text-muted)">{p.job_title || '—'}</p>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <Chip tone={isActive ? 'green' : 'slate'}>{p.status}</Chip>
                                            <ArrowUpRight size={17} className="text-(--text-muted) transition-colors group-hover:text-(--brand-primary)" />
                                        </div>
                                    </div>

                                    <div className="mt-4 flex items-center gap-2 rounded-[14px] bg-(--bg-app)/60 px-3 py-2">
                                        <Handshake size={15} className="shrink-0 text-(--brand-primary)" />
                                        <span className="truncate text-sm font-medium text-(--text-main)">{p.client_name}</span>
                                        <span className="ml-auto shrink-0 font-mono text-[11px] text-(--text-muted)">{p.placement_code}</span>
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-3">
                                        <div className="rounded-[14px] border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                                            <p className="text-[11px] text-emerald-500">Bill rate</p>
                                            <p className="text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>
                                                {fmt$(finalRates.bill)}<span className="text-xs font-normal text-(--text-muted)"> / {p.bill_frequency_name?.[0] || 'Hr'}</span>
                                            </p>
                                        </div>
                                        <div className="min-w-0 rounded-[14px] border border-sky-500/20 bg-sky-500/5 px-3 py-2">
                                            <p className="truncate text-[11px] text-sky-500" title={payLabel}>Pay · {payLabel}</p>
                                            <p className="text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>
                                                {fmt$(finalRates.pay)}<span className="text-xs font-normal text-(--text-muted)"> / {p.pay_frequency_name?.[0] || 'Hr'}</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex items-center gap-2 text-xs text-(--text-muted)">
                                        <CalendarRange size={13} className="shrink-0" />
                                        <span>{fmtDate(p.start_date)}</span>
                                        <span className="h-px flex-1 bg-(--border-subtle)" />
                                        <span>{p.end_date ? fmtDate(p.end_date) : 'Ongoing'}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="overflow-hidden rounded-[20px] border border-(--border-subtle)">
                    <Pagination currentPage={currentPage} totalItems={filteredPlacements.length} onPageChange={setCurrentPage} />
                </div>
            </Workbench>

            <AuditLogPanel module="placements" />
            <AddPlacementModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onRefresh={fetchData} />
            {selectedPlacement && (
                <PlacementDetailModal placement={selectedPlacement} onClose={() => setSelectedPlacement(null)} onRefresh={fetchData} />
            )}
        </div>
    );
};

export default Placements;
