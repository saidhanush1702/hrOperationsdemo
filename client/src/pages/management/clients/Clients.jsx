import { useState, useEffect } from 'react';
import { Building, Globe, UserPlus, Mail, Search, Download } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import { exportToExcel } from '../../../utils/exportToExcel';
import { rowOpen } from '../../../utils/rowClick';
import AddClientModal from './AddClientModal';
import ClientDetailModal from './ClientDetailModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';

const Clients = () => {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isClientModalOpen, setIsClientModalOpen] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);

    const fetchClients = async () => {
        setLoading(true);
        try {
            const res = await managementAPI.getClients();
            setClients(res.data);
        } catch (err) {
            console.error("Client fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchClients(); }, []);
    useEffect(() => { setCurrentPage(1); }, [searchQuery]);

    const handleExport = () => {
        const headers = [
            'Company Name', 'Company Website', 'Office Address', 'Fax Number',
            'Primary Contact', 'Contact Name', 'Contact Title', 'Contact Type',
            'Contact Email', 'Contact Phone',
        ];
        const keys = [
            'client_name', 'website', 'address', 'fax_number',
            'is_primary', 'contact_name', 'contact_title', 'contact_type',
            'contact_email', 'contact_phone',
        ];
        const rows = [];
        filteredClients.forEach(client => {
            const contacts = client.contacts || [];
            if (contacts.length === 0) {
                rows.push({
                    client_name: client.client_name || '',
                    website: client.website || '',
                    address: client.address || '',
                    fax_number: client.fax_number || '',
                    is_primary: '', contact_name: '', contact_title: '',
                    contact_type: '', contact_email: '', contact_phone: '',
                });
            } else {
                contacts.forEach(c => {
                    rows.push({
                        client_name:  client.client_name  || '',
                        website:      client.website      || '',
                        address:      client.address      || '',
                        fax_number:   client.fax_number   || '',
                        is_primary:   (c.is_primary === 1 || c.is_primary === true) ? 'Yes' : 'No',
                        contact_name:  c.contact_name  || '',
                        contact_title: c.contact_title || '',
                        contact_type:  c.contact_type_name || '',
                        contact_email: c.contact_email || '',
                        contact_phone: c.contact_phone
                            ? `${c.phone_dial_code || ''}${c.contact_phone}`
                            : '',
                    });
                });
            }
        });
        exportToExcel(rows, headers, keys, 'clients');
    };

    const filteredClients = clients.filter(c => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (c.client_name || '').toLowerCase().includes(q);
    });

    const paginatedClients = filteredClients.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    return (
        <div className="-mt-4 lg:-mt-8 -mx-4 lg:-mx-8 flex flex-col gap-2 animate-in fade-in duration-500">
        <div className="flex flex-col h-[calc(100vh-4rem)] gap-2">

            {/* Header */}
            <div className="bg-(--bg-surface) px-4 sm:px-6 py-3 sm:py-4 rounded-2xl border border-(--border-subtle) shadow-sm flex justify-between items-center shrink-0 transition-colors duration-300">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 bg-(--brand-primary)/10 rounded-xl flex items-center justify-center text-(--brand-primary) transition-colors shrink-0">
                        <Building size={18} className="sm:w-5 sm:h-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-base sm:text-lg font-bold uppercase tracking-tight text-(--text-main) leading-none truncate">Client Directory</h1>
                        <p className="hidden sm:block text-[10px] text-(--text-muted) mt-1 uppercase tracking-widest font-bold truncate">Manage your client list and contact details</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExport}
                        title="Export to Excel"
                        className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 w-9 h-9 sm:w-auto sm:px-4 sm:py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2 shrink-0 outline-none"
                    >
                        <Download size={15} /> <span className="hidden sm:inline">Export</span>
                    </button>
                    <button
                        onClick={() => setIsClientModalOpen(true)}
                        className="bg-(--brand-primary) text-(--brand-primary-text) w-9 h-9 sm:w-auto sm:px-5 sm:py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95 shrink-0 outline-none"
                        title="Add Client"
                    >
                        <UserPlus size={16} /> <span className="hidden sm:inline">Add Client</span>
                    </button>
                </div>
            </div>

            {/* Table card */}
            <div className="bg-(--bg-surface) border border-(--border-subtle) rounded-2xl shadow-sm flex flex-col flex-1 overflow-hidden transition-colors duration-300">

                {/* Toolbar */}
                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-(--border-subtle) bg-(--bg-app)/30 shrink-0">
                    <div className="flex items-center px-3 py-1.5 bg-(--bg-surface) border border-(--border-subtle) rounded-lg shadow-sm">
                        <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">
                            {filteredClients.length} Client{filteredClients.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="relative w-full sm:w-56 shrink-0 group">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted) group-focus-within:text-(--brand-primary) transition-colors">
                            <Search size={13} />
                        </div>
                        <input
                            type="text"
                            placeholder="Search clients..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-xl text-xs font-bold focus:border-(--brand-primary) focus:ring-1 focus:ring-(--brand-primary) outline-none shadow-sm"
                        />
                    </div>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    <table className="w-full text-left table-fixed">
                        <thead className="bg-(--bg-app) text-[9px] sm:text-[10px] font-bold text-(--text-muted) uppercase tracking-widest border-b border-(--border-subtle) sticky top-0 z-10 transition-colors duration-300">
                            <tr>
                                <th className="px-4 sm:px-6 py-3 sm:py-4 w-[45%] sm:w-[35%]">Organization</th>
                                <th className="hidden sm:table-cell px-2 sm:px-6 py-3 sm:py-4 sm:w-[30%]">Contact Details</th>
                                <th className="px-2 sm:px-6 py-3 sm:py-4 w-[35%] sm:w-[20%]">Platform</th>
                                <th className="hidden sm:table-cell px-4 sm:px-6 py-3 sm:py-4 sm:w-[15%] text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-(--border-subtle)">
                            {loading ? (
                                <tr>
                                    <td colSpan="4" className="text-center py-10 text-xs text-(--text-muted)">Loading clients…</td>
                                </tr>
                            ) : paginatedClients.length > 0 ? paginatedClients.map((client, index) => {
                                const primaryContact = client.contacts?.find(c => c.is_primary === 1 || c.is_primary === true) || client.contacts?.[0] || {};
                                return (
                                    <tr key={client.id || index}
                                        onClick={rowOpen(() => setSelectedClient(client))}
                                        title="View Client"
                                        className="hover:bg-(--bg-app) transition-colors group cursor-pointer">
                                        <td className="px-4 sm:px-6 py-3 sm:py-3.5 overflow-hidden">
                                            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                                                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-(--bg-surface) border border-(--border-subtle) flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-(--text-muted) uppercase shadow-sm shrink-0">
                                                    {client.client_name?.[0] || '?'}
                                                </div>
                                                <p className="text-xs sm:text-sm font-bold tracking-tight leading-none truncate text-(--text-main)">{client.client_name}</p>
                                            </div>
                                        </td>
                                        <td className="hidden sm:table-cell px-2 sm:px-6 py-3 sm:py-3.5 overflow-hidden">
                                            <div className="min-w-0">
                                                <p className="text-[11px] sm:text-xs font-bold text-(--text-main) tracking-tight truncate">{primaryContact.contact_name || 'N/A'}</p>
                                                {primaryContact.contact_email ? (
                                                    <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-bold uppercase text-(--text-muted) tracking-wider mt-1 truncate">
                                                        <Mail size={10} className="shrink-0" />
                                                        <span className="truncate">{primaryContact.contact_email}</span>
                                                    </div>
                                                ) : (
                                                    <p className="text-[9px] sm:text-[10px] font-bold uppercase text-(--text-muted) tracking-wider mt-1">---</p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-2 sm:px-6 py-3 sm:py-3.5 overflow-hidden">
                                            {client.website ? (
                                                <a
                                                    href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center gap-1.5 text-[10px] font-bold text-(--text-muted) uppercase tracking-wider hover:text-(--brand-primary) transition-colors truncate"
                                                >
                                                    <Globe size={12} className="shrink-0" />
                                                    <span className="truncate">{client.website.replace(/^https?:\/\//, '')}</span>
                                                </a>
                                            ) : (
                                                <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">---</span>
                                            )}
                                        </td>
                                        {/* Hidden on mobile: tapping the row opens the same modal, so the
                                            button was only costing width on the narrowest screen. */}
                                        <td className="hidden sm:table-cell px-4 sm:px-6 py-3 sm:py-3.5 text-right">
                                            <button
                                                onClick={() => setSelectedClient(client)}
                                                title="View Client"
                                                className="inline-flex items-center justify-center px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-(--bg-surface) text-(--text-main) hover:bg-(--brand-primary) hover:text-(--brand-primary-text) hover:border-(--brand-primary) rounded-lg border border-(--border-subtle) transition-all active:scale-95 shadow-sm outline-none"
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan="4" className="px-4 sm:px-6 py-12 text-center text-(--text-muted) text-xs font-bold uppercase tracking-widest">
                                        {searchQuery ? 'No clients match your search.' : 'No clients found.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <Pagination
                    currentPage={currentPage}
                    totalItems={filteredClients.length}
                    onPageChange={setCurrentPage}
                />
            </div>
        </div>

            <AuditLogPanel module="clients" />

            <AddClientModal isOpen={isClientModalOpen} onClose={() => setIsClientModalOpen(false)} onRefresh={fetchClients} />
            {selectedClient && <ClientDetailModal client={selectedClient} onClose={() => setSelectedClient(null)} onRefresh={fetchClients} />}
        </div>
    );
};

export default Clients;
