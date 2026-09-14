import { useState, useEffect } from 'react';
import { Settings, Save, Loader2, CheckCircle2, MapPin, User, Briefcase, PlusCircle, Building2, Calendar, Search, X, ChevronDown } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import { fmtDateGB } from '../../../utils/dateUtils';

const InvoiceSettings = () => {
    const [settingsData, setSettingsData] = useState([]);
    const [selectedPlacementId, setSelectedPlacementId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showMobilePlacements, setShowMobilePlacements] = useState(false);

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
            console.error("Failed to load settings:", err);
        } finally {
            setLoading(false);
        }
    };

    const filteredSettingsData = settingsData.filter(p => {
        if (!searchQuery.trim()) return true;
        const query = searchQuery.toLowerCase();
        return (p.client_name || '').toLowerCase().includes(query) ||
            (`${p.first_name || ''} ${p.last_name || ''}`).toLowerCase().includes(query);
    });

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
            setSuccessMessage('Settings saved successfully!');
            await fetchSettings();
        } catch (error) {
            console.error("Failed to save settings:", error);
            alert(error.response?.data?.error || "Failed to save settings.");
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

    // Shared placement card used in both sidebar and mobile modal
    const PlacementCard = ({ p, onSelect }) => {
        const isSelected = selectedPlacementId === p.placement_id;
        return (
            <div
                onClick={() => onSelect(p.placement_id)}
                className={`flex flex-col p-3 rounded-xl cursor-pointer transition-colors border ${
                    isSelected
                        ? 'bg-(--brand-primary)/10 border-(--brand-primary) shadow-sm'
                        : 'bg-(--bg-surface) border-(--border-subtle) hover:border-(--brand-primary)/50'
                }`}
            >
                <div className="font-bold text-xs text-(--text-main) truncate mb-1 flex items-center gap-1.5">
                    <Building2 size={12} className={isSelected ? 'text-(--brand-primary)' : 'text-(--text-muted)'} />
                    {p.client_name}
                </div>
                <div className="text-[10px] text-(--text-muted) truncate flex items-center gap-1.5">
                    <User size={10} className="opacity-70" />
                    {p.first_name} {p.last_name}
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-(--border-subtle)">
                    {p.setting_id ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 uppercase tracking-wider">
                            <CheckCircle2 size={10} /> Configured
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">
                            <PlusCircle size={10} /> Needs Setup
                        </span>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="-mt-4 lg:-mt-8 -mx-4 lg:-mx-8 -mb-4 lg:-mb-8 flex flex-col h-[calc(100vh-4rem)] gap-2 animate-in fade-in duration-500">

            {/* PAGE HEADER */}
            <div className="bg-(--bg-surface) px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-(--border-subtle) shadow-sm flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 bg-(--brand-primary)/10 rounded-xl flex items-center justify-center text-(--brand-primary) shrink-0">
                        <Settings size={18} className="sm:w-5 sm:h-5" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-(--text-main) leading-none">Invoice Settings</h1>
                            {/* Mobile-only placement selector button */}
                            <button
                                onClick={() => setShowMobilePlacements(true)}
                                className="lg:hidden inline-flex items-center gap-1.5 bg-(--brand-primary)/10 text-(--brand-primary) border border-(--brand-primary)/20 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-(--brand-primary) hover:text-white transition-all outline-none max-w-[150px]"
                            >
                                <Briefcase size={11} className="shrink-0" />
                                <span className="truncate">{selectedPlacement ? selectedPlacement.client_name : 'Select Placement'}</span>
                                <ChevronDown size={10} className="shrink-0" />
                            </button>
                        </div>
                        <p className="hidden sm:block text-[10px] text-(--text-muted) mt-1 uppercase tracking-widest font-bold">Configure billing cycles, terms, notes, and contacts</p>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center bg-(--bg-surface) rounded-2xl border border-(--border-subtle)">
                    <Loader2 className="animate-spin text-(--brand-primary)" size={32} />
                </div>
            ) : (
                <div className="flex flex-col lg:flex-row w-full flex-1 overflow-hidden bg-(--bg-surface) rounded-2xl border border-(--border-subtle) shadow-sm">

                    {/* DESKTOP LEFT SIDEBAR — hidden on mobile */}
                    <div className="hidden lg:flex w-[280px] shrink-0 border-r border-(--border-subtle) bg-(--bg-app) flex-col p-4 overflow-y-auto custom-scrollbar">
                        <div className="mb-4 shrink-0">
                            <h3 className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest mb-3 px-1">Active Placements</h3>
                            <div className="relative group">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted) group-focus-within:text-(--brand-primary) transition-colors">
                                    <Search size={14} />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search client or employee..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg text-xs outline-none focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) transition-all shadow-sm placeholder:text-(--text-muted)"
                                />
                            </div>
                        </div>
                        <div className="flex-1 space-y-2 pb-4">
                            {filteredSettingsData.map(p => (
                                <PlacementCard key={p.placement_id} p={p} onSelect={handleSelectPlacement} />
                            ))}
                            {filteredSettingsData.length === 0 && (
                                <p className="text-xs text-(--text-muted) text-center py-4 font-bold uppercase tracking-widest">
                                    {searchQuery ? "No placements match your search." : "No active placements found."}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* RIGHT PANEL */}
                    <div className="flex-1 bg-(--bg-surface) flex flex-col overflow-y-auto custom-scrollbar p-4 sm:p-6 relative">
                        {selectedPlacement ? (
                            <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-300 w-full max-w-4xl mx-auto">

                                {/* Placement info card */}
                                <div className="bg-(--bg-app) p-4 sm:p-5 rounded-2xl border border-(--border-subtle) mb-6 shadow-sm shrink-0">
                                    <h2 className="text-base sm:text-lg font-bold text-(--text-main) leading-tight mb-2">
                                        {selectedPlacement.client_name}
                                    </h2>
                                    <div className="flex items-start gap-1.5 text-sm text-(--text-muted) mb-4">
                                        <MapPin size={15} className="shrink-0 mt-0.5 text-(--text-muted)" />
                                        <span className="leading-snug text-xs sm:text-sm">{selectedPlacement.address || 'Address not provided in system.'}</span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-(--border-subtle)">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-(--brand-primary)/10 flex items-center justify-center text-(--brand-primary) shrink-0">
                                                <User size={13} />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[10px] uppercase font-bold text-(--text-muted) tracking-wider">Employee</span>
                                                <span className="text-xs font-semibold truncate">{selectedPlacement.first_name} {selectedPlacement.last_name}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600 shrink-0">
                                                <Briefcase size={13} />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[10px] uppercase font-bold text-(--text-muted) tracking-wider">Placement Code</span>
                                                <span className="text-xs font-mono font-semibold truncate">{selectedPlacement.placement_code}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-green-500/10 flex items-center justify-center text-green-600 shrink-0">
                                                <Calendar size={13} />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[10px] uppercase font-bold text-(--text-muted) tracking-wider">Invoice Start Date</span>
                                                <span className="text-xs font-semibold">
                                                    {selectedPlacement.timesheet_start_date
                                                        ? fmtDateGB(selectedPlacement.timesheet_start_date)
                                                        : 'Not Set'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Billing settings */}
                                <div className="flex-1 shrink-0">
                                    <h3 className="text-xs font-bold text-(--text-main) uppercase tracking-widest mb-5">Billing Settings</h3>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Invoice Cycle</label>
                                            <select
                                                value={formData.invoice_cycle_id}
                                                onChange={(e) => handleFieldChange('invoice_cycle_id', e.target.value)}
                                                className="p-3 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl text-sm outline-none focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) transition-colors shadow-sm"
                                            >
                                                <option value="" disabled>Select Cycle</option>
                                                <option value="1">Weekly</option>
                                                <option value="3">Semi-Monthly</option>
                                                <option value="4">Monthly</option>
                                            </select>
                                        </div>

                                        <div className="flex flex-col gap-1.5">
                                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Payment Terms</label>
                                            <div className="flex flex-col gap-2">
                                                <select
                                                    value={formData.net_terms}
                                                    onChange={(e) => handleFieldChange('net_terms', e.target.value)}
                                                    className="p-3 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl text-sm outline-none focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) transition-colors shadow-sm"
                                                >
                                                    <option value="15">Net 15</option>
                                                    <option value="30">Net 30</option>
                                                    <option value="45">Net 45</option>
                                                    <option value="60">Net 60</option>
                                                    <option value="90">Net 90</option>
                                                    <option value="custom">Custom</option>
                                                </select>

                                                {formData.net_terms === 'custom' && (
                                                    <div className="flex items-center gap-3 mt-1 bg-(--bg-app) border border-(--border-subtle) p-2.5 rounded-xl">
                                                        <span className="text-xs font-bold text-(--text-muted) uppercase tracking-widest pl-2">Net -</span>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max="100"
                                                            placeholder="e.g. 20"
                                                            value={formData.custom_terms}
                                                            onChange={(e) => handleFieldChange('custom_terms', e.target.value)}
                                                            className="flex-1 p-2 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg text-sm outline-none focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) transition-colors placeholder:text-(--text-muted)"
                                                        />
                                                    </div>
                                                )}

                                                {formData.net_terms === '90' && (
                                                    <label className="flex items-center gap-2 mt-1 p-2 bg-(--brand-primary)/5 border border-(--brand-primary)/20 rounded-xl cursor-pointer hover:bg-(--brand-primary)/10 transition-colors">
                                                        <input
                                                            type="checkbox"
                                                            checked={formData.pay_when_paid}
                                                            onChange={(e) => handleFieldChange('pay_when_paid', e.target.checked)}
                                                            className="w-4 h-4 ml-1 accent-(--brand-primary)"
                                                        />
                                                        <span className="text-xs font-bold text-(--text-main) tracking-wide">
                                                            "Pay when paid" <span className="font-normal text-(--text-muted)">(Appears on Invoice PDF instead of Net 90)</span>
                                                        </span>
                                                    </label>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Custom Invoice Notes */}
                                    <div className="flex flex-col gap-4 w-full mt-2 mb-6 sm:mb-8 bg-(--bg-app) border border-(--border-subtle) rounded-xl p-4">
                                        <div>
                                            <div className="flex justify-between items-center mb-1.5">
                                                <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Invoice Note Paragraph 1</label>
                                                <span className={`text-[10px] font-bold ${formData.custom_notes_1?.length === 250 ? 'text-red-500' : 'text-(--text-muted)'}`}>
                                                    {formData.custom_notes_1?.length || 0} / 250
                                                </span>
                                            </div>
                                            <textarea
                                                value={formData.custom_notes_1}
                                                onChange={(e) => handleFieldChange('custom_notes_1', e.target.value)}
                                                maxLength={250}
                                                rows="2"
                                                placeholder="Enter a custom message to appear on the invoice..."
                                                className="w-full p-3 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl text-sm outline-none focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) transition-colors shadow-sm resize-none placeholder:text-(--text-muted)"
                                            />
                                        </div>
                                        <div>
                                            <div className="flex justify-between items-center mb-1.5">
                                                <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Invoice Note Paragraph 2</label>
                                                <span className={`text-[10px] font-bold ${formData.custom_notes_2?.length === 250 ? 'text-red-500' : 'text-(--text-muted)'}`}>
                                                    {formData.custom_notes_2?.length || 0} / 250
                                                </span>
                                            </div>
                                            <textarea
                                                value={formData.custom_notes_2}
                                                onChange={(e) => handleFieldChange('custom_notes_2', e.target.value)}
                                                maxLength={250}
                                                rows="2"
                                                placeholder="Enter secondary instructions or thank you notes..."
                                                className="w-full p-3 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl text-sm outline-none focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) transition-colors shadow-sm resize-none placeholder:text-(--text-muted)"
                                            />
                                        </div>
                                    </div>

                                    {/* Client Contacts */}
                                    <div className="flex flex-col gap-2 w-full mt-4">
                                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Client Contacts (Email Recipients)</label>
                                        {contacts.length === 0 ? (
                                            <div className="p-4 border border-red-500/20 bg-red-500/10 rounded-xl">
                                                <span className="text-xs text-red-500 font-bold uppercase tracking-widest">No contacts found. Please add a contact in Client Management.</span>
                                            </div>
                                        ) : (
                                            <div className="border border-(--border-subtle) rounded-xl overflow-hidden shadow-sm bg-(--bg-surface) overflow-x-auto">
                                                <table className="w-full text-left border-collapse min-w-[480px]">
                                                    <thead className="bg-(--bg-app) text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle)">
                                                        <tr>
                                                            <th className="p-3 w-12 text-center">Select</th>
                                                            <th className="p-3">Contact Name</th>
                                                            <th className="p-3">Type</th>
                                                            <th className="p-3">Email Address</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-(--border-subtle)">
                                                        {contacts.map(c => {
                                                            const isChecked = formData.client_contact_ids.includes(c.id);
                                                            return (
                                                                <tr
                                                                    key={c.id}
                                                                    onClick={() => toggleContact(c.id)}
                                                                    className={`cursor-pointer transition-colors ${isChecked ? 'bg-(--brand-primary)/5' : 'hover:bg-(--bg-app)'}`}
                                                                >
                                                                    <td className="p-3 text-center">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isChecked}
                                                                            onChange={() => toggleContact(c.id)}
                                                                            className="accent-blue-600 w-4 h-4 cursor-pointer"
                                                                        />
                                                                    </td>
                                                                    <td className="p-3 text-xs font-bold text-(--text-main)">{c.name}</td>
                                                                    <td className="p-3 text-xs text-(--text-muted)">
                                                                        {c.title ? (
                                                                            <span className="bg-(--bg-app) border border-(--border-subtle) px-2 py-1 rounded text-[10px] font-bold tracking-wider text-(--text-muted)">{c.title}</span>
                                                                        ) : 'Not Specified'}
                                                                    </td>
                                                                    <td className="p-3 text-xs text-(--text-muted)">{c.email}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Save footer */}
                                <div className="mt-6 sm:mt-8 pt-5 border-t border-(--border-subtle) flex items-center justify-between pb-2 shrink-0">
                                    <div className="text-sm font-bold">
                                        {successMessage && (
                                            <span className="text-green-600 flex items-center gap-1.5 animate-in fade-in">
                                                <CheckCircle2 size={16} /> {successMessage}
                                            </span>
                                        )}
                                    </div>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving || formData.client_contact_ids.length === 0}
                                        className="flex items-center gap-2 bg-(--brand-primary) text-white px-6 sm:px-8 py-2.5 sm:py-3 rounded-xl hover:shadow-lg hover:opacity-90 disabled:opacity-50 transition-all font-bold text-xs uppercase tracking-widest"
                                    >
                                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                        {selectedPlacement.setting_id ? 'Update Settings' : 'Save Settings'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center px-4">
                                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-(--bg-app) border border-(--border-subtle) flex items-center justify-center mb-4">
                                    <Settings size={24} className="text-(--text-muted) sm:w-7 sm:h-7" />
                                </div>
                                <h3 className="text-(--text-main) font-bold text-base sm:text-lg">No Placement Selected</h3>
                                <p className="text-(--text-muted) text-sm max-w-xs mt-2">
                                    {/* Desktop hint */}
                                    <span className="hidden lg:inline">Select a placement from the sidebar to view and configure billing settings.</span>
                                    {/* Mobile hint */}
                                    <span className="lg:hidden">Tap the <strong>Select Placement</strong> button above to choose a placement.</span>
                                </p>
                                {/* Mobile CTA */}
                                <button
                                    onClick={() => setShowMobilePlacements(true)}
                                    className="lg:hidden mt-5 inline-flex items-center gap-2 bg-(--brand-primary) text-white px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest shadow-sm hover:opacity-90 transition-all"
                                >
                                    <Briefcase size={14} /> Select Placement
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* MOBILE PLACEMENT SELECTOR OVERLAY */}
            {showMobilePlacements && (
                <div className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col justify-end animate-in fade-in duration-200">
                    <div className="flex flex-col bg-(--bg-surface) rounded-t-2xl overflow-hidden shadow-2xl max-h-[85vh] animate-in slide-in-from-bottom-2 duration-300">
                        {/* Modal header */}
                        <div className="px-4 py-4 border-b border-(--border-subtle) flex justify-between items-center bg-(--bg-app) shrink-0">
                            <h3 className="text-sm font-bold text-(--text-main) uppercase tracking-wider flex items-center gap-2">
                                <Briefcase size={15} className="text-(--brand-primary)" /> Select Placement
                            </h3>
                            <button onClick={() => setShowMobilePlacements(false)} className="text-(--text-muted) hover:text-(--text-main) transition-colors p-1">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Search bar */}
                        <div className="px-4 py-3 shrink-0 border-b border-(--border-subtle)">
                            <div className="relative group">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted) group-focus-within:text-(--brand-primary) transition-colors">
                                    <Search size={14} />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search client or employee..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl text-sm outline-none focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) transition-all shadow-sm placeholder:text-(--text-muted)"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Placement list */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {filteredSettingsData.map(p => (
                                <PlacementCard
                                    key={p.placement_id}
                                    p={p}
                                    onSelect={(id) => {
                                        handleSelectPlacement(id);
                                        setShowMobilePlacements(false);
                                    }}
                                />
                            ))}
                            {filteredSettingsData.length === 0 && (
                                <p className="text-xs text-(--text-muted) text-center py-6 font-bold uppercase tracking-widest">
                                    {searchQuery ? "No placements match your search." : "No active placements found."}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvoiceSettings;
