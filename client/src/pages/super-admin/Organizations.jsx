import { useState, useEffect } from 'react';
import { Globe, Plus, Users, ArrowUpRight, ShieldCheck, ShieldOff, Layers } from 'lucide-react';
import { superAdminAPI } from '../../api/apiService';
import RegisterOrgModal from './RegisterOrgModal';
import OrgDetailModal from './OrgDetailModal';
import { matchesSearch } from '../../utils/searchMatch';
import { PageHero, StatRail, StatTile, Btn, SearchInput, Chip, EmptyState, LoadingState } from '../../components/ui/kit';

const Organizations = () => {
    const [orgs, setOrgs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRegisterOpen, setIsRegisterOpen] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState(null);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [query, setQuery] = useState('');

    const fetchOrgs = async () => {
        try {
            const res = await superAdminAPI.getOrganizations();
            setOrgs(res.data);
        } catch (err) {
            console.error("Failed to fetch organizations", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchOrgs(); }, []);

    const counts = {
        ALL: orgs.length,
        ACTIVE: orgs.filter(o => o.is_active).length,
        SUSPENDED: orgs.filter(o => !o.is_active).length,
    };

    const visible = orgs.filter(o =>
        (statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? o.is_active : !o.is_active))
        && matchesSearch(query, o.name, o.domain)
    );

    return (
        <div className="mx-auto max-w-[1800px] space-y-4">
            <PageHero
                icon={Globe}
                eyebrow="Platform"
                title="Tenants"
                description="Every workspace hosted on the platform, its owners and its access."
                actions={<Btn variant="primary" icon={Plus} onClick={() => setIsRegisterOpen(true)}>Register tenant</Btn>}
            >
                <StatRail>
                    <StatTile label="All tenants" icon={Layers} value={counts.ALL} active={statusFilter === 'ALL'} onClick={() => setStatusFilter('ALL')} />
                    <StatTile label="Live" icon={ShieldCheck} value={counts.ACTIVE} active={statusFilter === 'ACTIVE'} onClick={() => setStatusFilter('ACTIVE')} />
                    <StatTile label="Suspended" icon={ShieldOff} value={counts.SUSPENDED} active={statusFilter === 'SUSPENDED'} onClick={() => setStatusFilter('SUSPENDED')} />
                </StatRail>
            </PageHero>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-(--text-muted)"><span className="font-semibold text-(--text-main)">{visible.length}</span> tenants</p>
                <SearchInput value={query} onChange={setQuery} placeholder="Search tenant or domain…" className="w-full sm:w-72" />
            </div>

            {loading ? (
                <LoadingState text="Loading tenants…" />
            ) : visible.length === 0 ? (
                <EmptyState icon={Globe} title={orgs.length === 0 ? 'No tenants registered yet' : 'No tenants match'} text="Register a tenant to create its workspace and owner account." />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {visible.map(org => (
                        <button
                            key={org.id}
                            type="button"
                            onClick={() => setSelectedOrg(org)}
                            className={`group relative overflow-hidden rounded-[24px] border border-(--border-subtle) bg-(--bg-surface) p-5 text-left outline-none transition-all hover:-translate-y-1 hover:border-(--brand-primary)/45 ${!org.is_active ? 'opacity-70' : ''}`}
                        >
                            <div aria-hidden="true" className="absolute -right-10 -top-10 h-32 w-32 rounded-full border border-(--brand-primary)/15" />
                            <div className="relative flex items-start justify-between gap-3">
                                <span className="flex h-12 w-12 items-center justify-center rounded-[15px] text-lg font-semibold text-white" style={{ background: 'var(--brand-gradient)' }}>
                                    {(org.name || '?').slice(0, 1).toUpperCase()}
                                </span>
                                <Chip tone={org.is_active ? 'green' : 'rose'} icon={org.is_active ? ShieldCheck : ShieldOff}>
                                    {org.is_active ? 'Live' : 'Suspended'}
                                </Chip>
                            </div>
                            <p className="relative mt-4 truncate text-lg font-semibold text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }}>{org.name}</p>
                            <p className="relative flex items-center gap-1.5 truncate text-xs text-(--text-muted)"><Globe size={12} /> {org.domain || 'no-domain.com'}</p>
                            <div className="relative mt-5 flex items-center justify-between border-t border-(--border-subtle) pt-3 text-xs text-(--text-muted)">
                                <span className="flex items-center gap-1.5"><Users size={13} /> {org.admin_count ?? 0} owner{org.admin_count !== 1 ? 's' : ''}</span>
                                <span className="flex items-center gap-1 font-semibold text-(--brand-primary)">Open <ArrowUpRight size={13} /></span>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            <RegisterOrgModal
                isOpen={isRegisterOpen}
                onClose={() => setIsRegisterOpen(false)}
                onRefresh={fetchOrgs}
            />

            {selectedOrg && (
                <OrgDetailModal
                    org={selectedOrg}
                    onClose={() => setSelectedOrg(null)}
                    onStatusChange={() => { fetchOrgs(); setSelectedOrg(null); }}
                />
            )}
        </div>
    );
};

export default Organizations;
