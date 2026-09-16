import { useState, useEffect } from 'react';
import { Handshake, Globe, Plus, Mail, Download, Users, ArrowUpRight, Link2 } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import { exportToExcel } from '../../../utils/exportToExcel';
import { rowOpen } from '../../../utils/rowClick';
import AddClientModal from './AddClientModal';
import ClientDetailModal from './ClientDetailModal';
import AuditLogPanel from '../../../components/layout/AuditLogPanel';
import Pagination, { PAGE_SIZE } from '../../../components/ui/Pagination';
import { PageHero, StatRail, StatTile, Btn, SearchInput, Chip, Avatar, EmptyState, LoadingState } from '../../../components/ui/kit';

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

    const filteredClients = clients.filter(c => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (c.client_name || '').toLowerCase().includes(q);
    });

    const handleExport = () => {
        const headers = [
            'Partner Name', 'Partner Website', 'Office Address', 'Fax Number',
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
        exportToExcel(rows, headers, keys, 'partners');
    };

    const paginatedClients = filteredClients.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    // Directory grouping: A–Z headers for the partners on this page.
    const grouped = paginatedClients.reduce((acc, c) => {
        const first = (c.client_name?.[0] || '#').toUpperCase();
        const key = /[A-Z]/.test(first) ? first : '#';
        (acc[key] = acc[key] || []).push(c);
        return acc;
    }, {});
    const letters = Object.keys(grouped).sort();

    const totalContacts = clients.reduce((n, c) => n + (c.contacts?.length || 0), 0);
    const withWebsite = clients.filter(c => c.website).length;

    return (
        <div className="mx-auto max-w-[1800px] space-y-4">
            <PageHero
                icon={Handshake}
                eyebrow="Talent"
                title="Partner directory"
                description="The companies you staff for — their websites, offices and the people you work with."
                actions={
                    <>
                        <Btn variant="success" icon={Download} onClick={handleExport} title="Export to Excel">Export</Btn>
                        <Btn variant="primary" icon={Plus} onClick={() => setIsClientModalOpen(true)}>New partner</Btn>
                    </>
                }
            >
                <StatRail>
                    <StatTile label="Partners" icon={Handshake} value={clients.length} hint="in the directory" />
                    <StatTile label="Contacts" icon={Users} value={totalContacts} hint="people on file" />
                    <StatTile label="Online presence" icon={Link2} value={withWebsite} hint="with a website" />
                </StatRail>
            </PageHero>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-(--text-muted)">
                    <span className="font-semibold text-(--text-main)">{filteredClients.length}</span> partner{filteredClients.length !== 1 ? 's' : ''}
                </p>
                <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search partners…" className="w-full sm:w-80" />
            </div>

            {loading ? (
                <LoadingState text="Loading partners…" />
            ) : paginatedClients.length === 0 ? (
                <EmptyState icon={Handshake} title={searchQuery ? 'No partners match your search' : 'No partners yet'} text="Add a partner to start creating engagements." />
            ) : (
                <div className="space-y-8">
                    {letters.map(letter => (
                        <div key={letter}>
                            <div className="mb-3 flex items-center gap-3">
                                <span className="flex h-9 w-9 items-center justify-center rounded-[12px] font-mono text-sm font-semibold text-white" style={{ background: 'var(--brand-gradient)' }}>{letter}</span>
                                <span className="h-px flex-1 bg-(--border-subtle)" />
                                <span className="font-mono text-[11px] text-(--text-muted)">{grouped[letter].length}</span>
                            </div>
                            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                                {grouped[letter].map((client, index) => {
                                    const primaryContact = client.contacts?.find(c => c.is_primary === 1 || c.is_primary === true) || client.contacts?.[0] || {};
                                    return (
                                        <div
                                            key={client.id || index}
                                            onClick={rowOpen(() => setSelectedClient(client))}
                                            title="Open partner"
                                            className="group relative cursor-pointer overflow-hidden rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-5 transition-all hover:-translate-y-1 hover:border-(--brand-primary)/45"
                                        >
                                            <div className="flex items-start gap-4">
                                                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] border border-(--border-subtle) bg-(--bg-app) text-lg font-semibold text-(--brand-primary)">
                                                    {client.client_name?.[0]?.toUpperCase() || '?'}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-base font-semibold text-(--text-main)">{client.client_name}</p>
                                                    {client.website ? (
                                                        <a
                                                            href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="flex items-center gap-1.5 truncate text-xs text-(--text-muted) transition-colors hover:text-(--brand-primary)"
                                                        >
                                                            <Globe size={12} className="shrink-0" />
                                                            <span className="truncate">{client.website.replace(/^https?:\/\//, '')}</span>
                                                        </a>
                                                    ) : (
                                                        <p className="text-xs text-(--text-muted)">No website</p>
                                                    )}
                                                </div>
                                                <ArrowUpRight size={17} className="shrink-0 text-(--text-muted) transition-colors group-hover:text-(--brand-primary)" />
                                            </div>

                                            <div className="mt-4 flex items-center gap-3 rounded-[16px] bg-(--bg-app)/60 px-3 py-2.5">
                                                <Avatar name={primaryContact.contact_name || '?'} size={32} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium text-(--text-main)">{primaryContact.contact_name || 'No contact yet'}</p>
                                                    <p className="flex items-center gap-1 truncate text-[11px] text-(--text-muted)">
                                                        <Mail size={11} className="shrink-0" />
                                                        <span className="truncate">{primaryContact.contact_email || '—'}</span>
                                                    </p>
                                                </div>
                                                <Chip tone="brand">{client.contacts?.length || 0} contacts</Chip>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="overflow-hidden rounded-[20px] border border-(--border-subtle)">
                <Pagination
                    currentPage={currentPage}
                    totalItems={filteredClients.length}
                    onPageChange={setCurrentPage}
                />
            </div>

            <AuditLogPanel module="clients" />

            <AddClientModal isOpen={isClientModalOpen} onClose={() => setIsClientModalOpen(false)} onRefresh={fetchClients} />
            {selectedClient && <ClientDetailModal client={selectedClient} onClose={() => setSelectedClient(null)} onRefresh={fetchClients} />}
        </div>
    );
};

export default Clients;
