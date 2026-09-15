import { useState, useEffect } from 'react';
import {
    SlidersHorizontal, Save, CheckCircle2, MapPin, User, PlusCircle, Handshake, Calendar, Layers,
    ArrowUpRight, CalendarClock, StickyNote, Mail, Rocket,
} from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import { fmtDateGB } from '../../../utils/dateUtils';
import { matchesSearch } from '../../../utils/searchMatch';
import BaseModal from '../../../components/ui/BaseModal';
import {
    PageHero, StatRail, StatTile, SearchInput, Btn, Chip, Panel, Fact, Notice, EmptyState, LoadingState, cx,
} from '../../../components/ui/kit';

const PillGroup = ({ value, options, onChange }) => (
    <div className="flex flex-wrap gap-2">
        {options.map(([v, label]) => {
            const on = String(value) === v;
            return (
                <button
                    key={v}
                    type="button"
                    onClick={() => onChange(v)}
                    className={cx('h-9 rounded-full border px-4 text-sm font-medium outline-none transition-colors', on ? 'border-transparent text-white' : 'border-(--border-subtle) text-(--text-main) hover:border-(--brand-primary)/45')}
                    style={on ? { background: 'var(--brand-gradient)' } : undefined}
                >
                    {label}
                </button>
            );
        })}
    </div>
);

const InvoiceSettings = () => {
    const [settingsData, setSettingsData] = useState([]);
    const [selectedPlacementId, setSelectedPlacementId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [setupFilter, setSetupFilter] = useState('ALL');

    const [formData, setFormData] = useState({
        invoice_cycle_id: '',
        net_terms: '30',
        custom_terms: '',
        pay_when_paid: false,
        client_contact_ids: [],
        custom_notes_1: '',
        custom_notes_2: '',
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await managementAPI.getInvoiceSettings();
            setSettingsData(res.data);
        } catch (err) {
            console.error("Failed to load billing rules:", err);
        } finally {
            setLoading(false);
        }
    };

    const filteredSettingsData = settingsData.filter(p => {
        if (!searchQuery.trim()) return true;
        return matchesSearch(searchQuery, p.client_name, `${p.first_name || ''} ${p.last_name || ''}`);
    });

    const visible = filteredSettingsData.filter(p =>
        setupFilter === 'ALL' || (setupFilter === 'CONFIGURED' ? !!p.setting_id : !p.setting_id)
    );

    const configuredCount = settingsData.filter(p => p.setting_id).length;

    const handleSelectPlacement = (placementId) => {
        setSelectedPlacementId(placementId);
        setSuccessMessage('');
        const selected = settingsData.find(p => p.placement_id === placementId);
        if (selected) {
            const terms = selected.net_terms || 30;
            const isStandardTerm = [15, 30, 45, 60, 90].includes(terms);
            let parsedIds = [];
            if (selected.selected_contact_ids) {
                parsedIds = typeof selected.selected_contact_ids === 'string'
                    ? JSON.parse(selected.selected_contact_ids)
                    : selected.selected_contact_ids;
            }
            setFormData({
                invoice_cycle_id: selected.invoice_cycle_id || '',
                net_terms: isStandardTerm ? String(terms) : 'custom',
                custom_terms: isStandardTerm ? '' : String(terms),
                pay_when_paid: selected.pay_when_paid ? true : false,
                client_contact_ids: parsedIds || [],
                custom_notes_1: selected.custom_notes_1 || '',
                custom_notes_2: selected.custom_notes_2 || '',
            });
        }
    };

    const handleFieldChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setSuccessMessage('');
    };

    const toggleContact = (contactId) => {
        setFormData(prev => {
            const current = prev.client_contact_ids || [];
            return current.includes(contactId)
                ? { ...prev, client_contact_ids: current.filter(id => id !== contactId) }
                : { ...prev, client_contact_ids: [...current, contactId] };
        });
        setSuccessMessage('');
    };

    const handleSave = async () => {
        if (!selectedPlacementId) return;
        setSaving(true);
        setSuccessMessage('');
        let finalNetTerms = 30;
        if (formData.net_terms === 'custom') {
            finalNetTerms = parseInt(formData.custom_terms, 10) || 30;
        } else {
            finalNetTerms = parseInt(formData.net_terms, 10);
        }
        try {
            await managementAPI.updateInvoiceSettings(selectedPlacementId, {
                invoice_cycle_id: formData.invoice_cycle_id || null,
                net_terms: finalNetTerms,
                pay_when_paid: formData.net_terms === '90' ? formData.pay_when_paid : false,
                client_contact_ids: formData.client_contact_ids,
                custom_notes_1: formData.custom_notes_1 || null,
                custom_notes_2: formData.custom_notes_2 || null,
            });
            setSuccessMessage('Billing rules saved.');
            await fetchSettings();
        } catch (error) {
            console.error("Failed to save billing rules:", error);
            alert(error.response?.data?.error || "Failed to save billing rules.");
        } finally {
            setSaving(false);
        }
    };

    const selectedPlacement = settingsData.find(p => p.placement_id === selectedPlacementId);

    let contacts = [];
    if (selectedPlacement) {
        contacts = typeof selectedPlacement.contacts === 'string'
            ? JSON.parse(selectedPlacement.contacts || '[]')
            : (selectedPlacement.contacts || []);
    }

    const editorFooter = selectedPlacement && (
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <span className="text-sm">
                {successMessage ? (
                    <span className="flex items-center gap-1.5 text-emerald-500"><CheckCircle2 size={16} /> {successMessage}</span>
                ) : formData.client_contact_ids.length === 0 ? (
                    <span className="text-xs text-amber-600">Select at least one recipient to save.</span>
                ) : null}
            </span>
            <Btn variant="primary" icon={Save} onClick={handleSave} disabled={saving || formData.client_contact_ids.length === 0}>
                {saving ? 'Saving…' : selectedPlacement.setting_id ? 'Update rules' : 'Save rules'}
            </Btn>
        </div>
    );

    return (
        <div className="mx-auto max-w-[1600px] space-y-6">
            <PageHero
                icon={SlidersHorizontal}
                eyebrow="Money"
                title="Billing rules"
                description="Invoice cycle, payment terms, notes and recipients for every active engagement."
            >
                <StatRail>
                    <StatTile label="Engagements" icon={Layers} value={settingsData.length} active={setupFilter === 'ALL'} onClick={() => setSetupFilter('ALL')} />
                    <StatTile label="Configured" icon={CheckCircle2} value={configuredCount} active={setupFilter === 'CONFIGURED'} onClick={() => setSetupFilter('CONFIGURED')} />
                    <StatTile label="Needs setup" icon={PlusCircle} value={settingsData.length - configuredCount} active={setupFilter === 'NEEDS'} onClick={() => setSetupFilter('NEEDS')} />
                </StatRail>
            </PageHero>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-(--text-muted)"><span className="font-semibold text-(--text-main)">{visible.length}</span> engagements</p>
                <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search partner or consultant…" className="w-full sm:w-80" />
            </div>

            {loading ? (
                <LoadingState text="Loading billing rules…" />
            ) : visible.length === 0 ? (
                <EmptyState icon={SlidersHorizontal} title={searchQuery ? 'No engagements match your search' : 'No active engagements found'} />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {visible.map(p => (
                        <button
                            key={p.placement_id}
                            type="button"
                            onClick={() => handleSelectPlacement(p.placement_id)}
                            className="group rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5 text-left outline-none transition-all hover:-translate-y-1 hover:border-(--brand-primary)/45"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-(--brand-primary)/10 text-(--brand-primary)">
                                    <Handshake size={18} />
                                </span>
                                {p.setting_id
                                    ? <Chip tone="green" icon={CheckCircle2}>Configured</Chip>
                                    : <Chip tone="amber" icon={PlusCircle}>Needs setup</Chip>}
                            </div>
                            <p className="mt-4 truncate text-base font-semibold text-(--text-main)">{p.client_name}</p>
                            <p className="flex items-center gap-1.5 truncate text-xs text-(--text-muted)"><User size={12} /> {p.first_name} {p.last_name}</p>
                            <div className="mt-4 flex items-center justify-between border-t border-(--border-subtle) pt-3 text-xs text-(--text-muted)">
                                <span className="truncate font-mono">{p.placement_code}</span>
                                <span className="flex shrink-0 items-center gap-1 font-semibold text-(--brand-primary)">Edit rules <ArrowUpRight size={13} /></span>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            <BaseModal
                isOpen={!!selectedPlacement}
                onClose={() => setSelectedPlacementId('')}
                icon={<SlidersHorizontal size={18} />}
                title="Billing rules"
                subtitle={selectedPlacement ? `${selectedPlacement.client_name} · ${selectedPlacement.first_name} ${selectedPlacement.last_name}` : ''}
                footer={editorFooter}
                noPadding
            >
                {selectedPlacement && (
                    <div className="grid min-h-full lg:grid-cols-[300px_minmax(0,1fr)]">
                        <aside className="space-y-4 border-b border-(--border-subtle) bg-(--bg-app)/40 p-5 lg:border-b-0 lg:border-r lg:p-6">
                            <span className="flex h-14 w-14 items-center justify-center rounded-[18px] text-xl font-semibold text-white" style={{ background: 'var(--brand-gradient)' }}>
                                {selectedPlacement.client_name?.[0]?.toUpperCase() || '?'}
                            </span>
                            <div>
                                <p className="text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{selectedPlacement.client_name}</p>
                                <p className="mt-1 flex items-start gap-1.5 text-xs text-(--text-muted)">
                                    <MapPin size={13} className="mt-0.5 shrink-0" /> {selectedPlacement.address || 'Address not provided in system.'}
                                </p>
                            </div>
                            <div className="space-y-3 rounded-[18px] border border-(--border-subtle) bg-(--bg-surface) p-4">
                                <Fact icon={User} label="Consultant" value={`${selectedPlacement.first_name} ${selectedPlacement.last_name}`} />
                                <Fact icon={Rocket} label="Engagement ID" value={selectedPlacement.placement_code} mono />
                                <Fact icon={Calendar} label="Invoice start date" value={selectedPlacement.timesheet_start_date ? fmtDateGB(selectedPlacement.timesheet_start_date) : 'Not set'} />
                            </div>
                            {selectedPlacement.setting_id
                                ? <Chip tone="green" icon={CheckCircle2}>Configured</Chip>
                                : <Chip tone="amber" icon={PlusCircle}>Needs setup</Chip>}
                        </aside>

                        <div className="space-y-5 p-4 sm:p-6 lg:p-8">
                            <Panel icon={CalendarClock} title="Cycle & terms" subtitle="How often to invoice and when payment is due">
                                <div className="space-y-5">
                                    <div>
                                        <p className="nx-label">Invoice cycle</p>
                                        <PillGroup
                                            value={formData.invoice_cycle_id}
                                            options={[['1', 'Weekly'], ['3', 'Semi-monthly'], ['4', 'Monthly']]}
                                            onChange={v => handleFieldChange('invoice_cycle_id', v)}
                                        />
                                    </div>
                                    <div>
                                        <p className="nx-label">Payment terms</p>
                                        <PillGroup
                                            value={formData.net_terms}
                                            options={[['15', 'Net 15'], ['30', 'Net 30'], ['45', 'Net 45'], ['60', 'Net 60'], ['90', 'Net 90'], ['custom', 'Custom']]}
                                            onChange={v => handleFieldChange('net_terms', v)}
                                        />

                                        {formData.net_terms === 'custom' && (
                                            <div className="mt-3 flex max-w-xs items-center gap-3">
                                                <span className="text-sm font-semibold text-(--text-muted)">Net</span>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="100"
                                                    placeholder="e.g. 20"
                                                    value={formData.custom_terms}
                                                    onChange={(e) => handleFieldChange('custom_terms', e.target.value)}
                                                    className="nx-input"
                                                />
                                            </div>
                                        )}

                                        {formData.net_terms === '90' && (
                                            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-[14px] border border-(--brand-primary)/25 bg-(--brand-primary)/5 px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.pay_when_paid}
                                                    onChange={(e) => handleFieldChange('pay_when_paid', e.target.checked)}
                                                    className="h-4 w-4"
                                                />
                                                <span className="text-sm text-(--text-main)">
                                                    “Pay when paid” <span className="text-(--text-muted)">— appears on the invoice PDF instead of Net 90</span>
                                                </span>
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </Panel>

                            <Panel icon={StickyNote} title="Invoice notes" subtitle="Printed on every invoice for this engagement">
                                <div className="grid gap-4 xl:grid-cols-2">
                                    {[['custom_notes_1', 'First paragraph', 'A custom message to appear on the invoice…'], ['custom_notes_2', 'Second paragraph', 'Secondary instructions or a thank-you note…']].map(([field, label, placeholder]) => (
                                        <label key={field} className="block">
                                            <span className="nx-label flex items-center justify-between">
                                                {label}
                                                <span className={formData[field]?.length === 250 ? 'text-rose-500' : ''}>{formData[field]?.length || 0} / 250</span>
                                            </span>
                                            <textarea
                                                value={formData[field]}
                                                onChange={(e) => handleFieldChange(field, e.target.value)}
                                                maxLength={250}
                                                rows="4"
                                                placeholder={placeholder}
                                                className="nx-input resize-none"
                                            />
                                        </label>
                                    ))}
                                </div>
                            </Panel>

                            <Panel icon={Mail} title="Recipients" subtitle="Partner contacts who receive these invoices">
                                {contacts.length === 0 ? (
                                    <Notice tone="rose" icon={Mail}>No contacts found. Add a contact on the partner's profile first.</Notice>
                                ) : (
                                    <div className="grid gap-3 md:grid-cols-2">
                                        {contacts.map(c => {
                                            const isChecked = formData.client_contact_ids.includes(c.id);
                                            return (
                                                <label
                                                    key={c.id}
                                                    className={cx('flex cursor-pointer items-start gap-3 rounded-[16px] border px-4 py-3 transition-colors', isChecked ? 'border-(--brand-primary) bg-(--brand-primary)/8' : 'border-(--border-subtle) hover:border-(--brand-primary)/40')}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => toggleContact(c.id)}
                                                        className="mt-1 h-4 w-4 cursor-pointer"
                                                    />
                                                    <span className="min-w-0">
                                                        <span className="block truncate text-sm font-semibold text-(--text-main)">{c.name}</span>
                                                        <span className="block truncate text-xs text-(--text-muted)">{c.email}</span>
                                                        <span className="mt-1 inline-block">{c.title ? <Chip tone="slate">{c.title}</Chip> : <span className="text-[11px] text-(--text-muted)">Type not specified</span>}</span>
                                                    </span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </Panel>
                        </div>
                    </div>
                )}
            </BaseModal>
        </div>
    );
};

export default InvoiceSettings;
