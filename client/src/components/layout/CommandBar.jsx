import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Gauge, Globe, Users, Handshake, Rocket, Timer, SlidersHorizontal, Receipt, Banknote,
    BookOpen, ScanSearch, Settings2, ChevronDown, Menu, X, Sun, Moon, RefreshCw, LogOut, ArrowUpRight,
} from 'lucide-react';
import { managementAPI, portalAPI } from '../../api/apiService';
import { resolveFileUrl } from '../../utils/fileUrl';
import { PATHS, roleLabel as labelForRole } from '../../utils/constants';
import BrandMark from '../brand/BrandMark';

const GROUPS = [
    { key: 'overview', label: 'Overview' },
    { key: 'tenants',  label: 'Platform' },
    { key: 'talent',   label: 'Talent' },
    { key: 'finance',  label: 'Money' },
    { key: 'admin',    label: 'Workspace' },
    { key: 'me',       label: 'My Work' },
];

// Up to this many destinations sit directly in the bar; beyond it they fold into group menus.
const FLAT_LIMIT = 5;

const initialsOf = (text) =>
    (text || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'HR';

const underline = (
    <span
        aria-hidden="true"
        className="absolute inset-x-3 -bottom-[9px] h-[2px] rounded-full"
        style={{ background: 'var(--brand-gradient)', boxShadow: '0 0 12px var(--brand-glow)' }}
    />
);

const NavLink = ({ item, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`relative flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none transition-colors
            ${active ? 'bg-(--brand-primary)/10 text-(--text-main)' : 'text-(--text-muted) hover:bg-(--text-main)/5 hover:text-(--text-main)'}`}
    >
        <item.icon size={15} className={active ? 'text-(--brand-primary)' : ''} />
        <span className="whitespace-nowrap">{item.title}</span>
        {active && underline}
    </button>
);

const NavMenu = ({ section, open, active, onToggle, onPick, isActive }) => (
    <div className="relative flex h-full items-center">
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className={`relative flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-medium outline-none transition-colors
                ${active ? 'bg-(--brand-primary)/10 text-(--text-main)' : open ? 'bg-(--text-main)/5 text-(--text-main)' : 'text-(--text-muted) hover:bg-(--text-main)/5 hover:text-(--text-main)'}`}
        >
            {section.label}
            <ChevronDown size={14} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
            {active && underline}
        </button>

        {open && (
            <div
                className="nx-pop absolute left-0 top-[calc(100%-4px)] w-[min(580px,80vw)] rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-2"
                style={{ boxShadow: 'var(--shadow-floating)' }}
            >
                <p className="px-3 pb-2 pt-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-(--text-muted)">{section.label}</p>
                <div className="grid gap-1 sm:grid-cols-2">
                    {section.list.map((item) => {
                        const on = isActive(item.path);
                        return (
                            <button
                                key={item.path + item.title}
                                type="button"
                                onClick={() => onPick(item.path)}
                                className={`group flex items-start gap-3 rounded-[16px] p-3 text-left outline-none transition-colors
                                    ${on ? 'bg-(--brand-primary)/10' : 'hover:bg-(--text-main)/5'}`}
                            >
                                <span
                                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${on ? 'text-white' : 'bg-(--brand-primary)/10 text-(--brand-primary)'}`}
                                    style={on ? { background: 'var(--brand-gradient)' } : undefined}
                                >
                                    <item.icon size={17} />
                                </span>
                                <span className="min-w-0">
                                    <span className="flex items-center gap-1 text-sm font-semibold text-(--text-main)">
                                        {item.title}
                                        <ArrowUpRight size={13} className="text-(--brand-primary) opacity-0 transition-opacity group-hover:opacity-100" />
                                    </span>
                                    <span className="mt-0.5 block text-xs leading-snug text-(--text-muted)">{item.blurb}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        )}
    </div>
);

const IconButton = ({ onClick, title, children, className = '' }) => (
    <button
        type="button"
        onClick={onClick}
        title={title}
        aria-label={title}
        className={`flex h-7 w-7 items-center justify-center rounded-full border border-(--border-subtle) bg-(--bg-surface)/70 text-(--text-muted) outline-none transition-colors hover:border-(--brand-primary)/40 hover:text-(--text-main) ${className}`}
    >
        {children}
    </button>
);

const ThemeSwitch = ({ isDark, onToggle, className = '' }) => (
    <button
        type="button"
        onClick={onToggle}
        title="Toggle Light/Dark Mode"
        aria-label="Toggle Light/Dark Mode"
        className={`relative h-7 w-[52px] items-center rounded-full border border-(--border-subtle) bg-(--bg-surface)/70 px-1 outline-none ${className}`}
    >
        <span
            className={`absolute top-[2px] h-5 w-5 rounded-full transition-all duration-300 ${isDark ? 'left-[27px]' : 'left-[2px]'}`}
            style={{ background: 'var(--brand-gradient)', boxShadow: '0 4px 14px -4px var(--brand-glow)' }}
        />
        <Sun size={14} className={`relative z-10 ml-[6px] transition-colors ${isDark ? 'text-(--text-muted)' : 'text-white'}`} />
        <Moon size={14} className={`relative z-10 ml-auto mr-[6px] transition-colors ${isDark ? 'text-white' : 'text-(--text-muted)'}`} />
    </button>
);

const CommandBar = ({ userName, userRole, easternTime, isDark, onToggleTheme, isRefreshing, onRefresh, onLogout }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const barRef = useRef(null);

    const displayName = (userName && userName !== 'undefined' && userName !== 'null' && userName.trim() !== '')
        ? userName
        : 'User Profile';
    const roleLabel = labelForRole(userRole);

    const [orgLogoUrl, setOrgLogoUrl] = useState(() => localStorage.getItem('orgLogoUrl') || null);
    const [orgName,    setOrgName]    = useState(() => localStorage.getItem('orgName')    || 'SYSTEM');
    const [openMenu,   setOpenMenu]   = useState(null); // group key | 'profile' | null
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const applyOrgInfo = (data) => {
            const url  = data.logo_url || null;
            const name = data.name     || 'SYSTEM';
            setOrgLogoUrl(url);
            setOrgName(name);
            if (url) localStorage.setItem('orgLogoUrl', url);
            else     localStorage.removeItem('orgLogoUrl');
            localStorage.setItem('orgName', name);
        };

        if (['ORG_ADMIN', 'HR', 'ACCOUNTANT'].includes(userRole)) {
            managementAPI.getOrganizationDetails()
                .then(res => applyOrgInfo(res.data))
                .catch(() => {});
        } else if (userRole === 'EMPLOYEE') {
            portalAPI.getOrgInfo()
                .then(res => applyOrgInfo(res.data))
                .catch(() => {});
        }

        const handleOrgUpdate = (e) => {
            if (e.detail?.logo_url !== undefined) setOrgLogoUrl(e.detail.logo_url || null);
            if (e.detail?.name)                   setOrgName(e.detail.name);
        };

        window.addEventListener('orgLogoUpdated', handleOrgUpdate);
        return () => window.removeEventListener('orgLogoUpdated', handleOrgUpdate);
    }, [userRole]);

    // Close open menus on an outside click or Escape.
    useEffect(() => {
        if (!openMenu && !mobileOpen) return undefined;
        const onDown = (e) => {
            if (openMenu && barRef.current && !barRef.current.contains(e.target)) setOpenMenu(null);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') { setOpenMenu(null); setMobileOpen(false); }
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [openMenu, mobileOpen]);

    // ── Navigation items ──────────────────────────────────────────────────────
    // Talent Ops sees: Overview, Talent, Partners, Engagements, Time Logs
    // Workspace Admin / Finance Lead also see the Money group; Admin also sees Pay Audit and Workspace
    const items = useMemo(() => {
        const isManagement = ['ORG_ADMIN', 'HR', 'ACCOUNTANT'].includes(userRole);
        const overviewPath =
            userRole === 'SUPER_ADMIN' ? PATHS.platformOverview :
            isManagement               ? PATHS.overview         :
            PATHS.myOverview;

        const all = [
            { title: 'Overview',        icon: Gauge,             path: overviewPath,       group: 'overview', blurb: 'Live pulse of your operation',            roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'HR', 'ACCOUNTANT', 'EMPLOYEE'] },
            { title: 'Tenants',         icon: Globe,             path: PATHS.tenants,      group: 'tenants',  blurb: 'Workspaces, owners and access',            roles: ['SUPER_ADMIN'] },
            { title: 'Talent',          icon: Users,             path: PATHS.talent,       group: 'talent',   blurb: 'Consultant profiles, files & authorization', roles: ['ORG_ADMIN', 'HR', 'ACCOUNTANT'] },
            { title: 'Partners',        icon: Handshake,         path: PATHS.partners,     group: 'talent',   blurb: 'Partner accounts, contacts & terms',       roles: ['ORG_ADMIN', 'HR', 'ACCOUNTANT'] },
            { title: 'Engagements',     icon: Rocket,            path: PATHS.engagements,  group: 'talent',   blurb: 'Consultant assignments & rates',           roles: ['ORG_ADMIN', 'HR', 'ACCOUNTANT'] },
            { title: 'Time Logs',       icon: Timer,             path: PATHS.timeLogs,     group: 'talent',   blurb: 'Hours, approvals & overrides',             roles: ['ORG_ADMIN', 'HR', 'ACCOUNTANT'] },
            { title: 'Billing Rules',   icon: SlidersHorizontal, path: PATHS.billingRules, group: 'finance',  blurb: 'Terms, contacts & notes per engagement',   roles: ['ORG_ADMIN', 'ACCOUNTANT'] },
            { title: 'Billing',         icon: Receipt,           path: PATHS.billing,      group: 'finance',  blurb: 'Create, send & collect invoices',          roles: ['ORG_ADMIN', 'ACCOUNTANT'] },
            { title: 'Pay Runs',        icon: Banknote,          path: PATHS.payRuns,      group: 'finance',  blurb: 'Run pay cycles & adjustments',             roles: ['ORG_ADMIN', 'ACCOUNTANT'] },
            { title: 'Earnings Ledger', icon: BookOpen,          path: PATHS.ledger,       group: 'finance',  blurb: 'Consultant ledgers & C2C balances',        roles: ['ORG_ADMIN', 'ACCOUNTANT'] },
            { title: 'Pay Audit',       icon: ScanSearch,        path: PATHS.payAudit,     group: 'finance',  blurb: 'Earned versus paid',                       roles: ['ORG_ADMIN'] },
            { title: 'Workspace',       icon: Settings2,         path: PATHS.workspace,    group: 'admin',    blurb: 'Branding, billing email & team',           roles: ['ORG_ADMIN'] },
            { title: 'My Engagements',  icon: Rocket,            path: PATHS.myEngagements, group: 'me',      blurb: 'Your current assignments',                 roles: ['EMPLOYEE'] },
            { title: 'My Time Logs',    icon: Timer,             path: PATHS.myTimeLogs,   group: 'me',       blurb: 'Log and submit hours',                     roles: ['EMPLOYEE'] },
            { title: 'My Ledger',       icon: BookOpen,          path: PATHS.myLedger,     group: 'me',       blurb: 'Your earnings ledger',                     roles: ['EMPLOYEE'] },
        ];
        return all.filter(item => item.roles.includes(userRole));
    }, [userRole]);

    const sections = useMemo(() => {
        if (items.length <= FLAT_LIMIT) return items.map(item => ({ type: 'link', item }));
        return GROUPS
            .map(g => ({ g, list: items.filter(i => i.group === g.key) }))
            .filter(s => s.list.length > 0)
            .map(({ g, list }) => (list.length === 1
                ? { type: 'link', item: list[0] }
                : { type: 'menu', key: g.key, label: g.label, list }));
    }, [items]);

    const mobileGroups = useMemo(() => GROUPS
        .map(g => ({ ...g, list: items.filter(i => i.group === g.key) }))
        .filter(g => g.list.length > 0), [items]);

    const isActive = (path) => location.pathname === path;

    const go = (path) => {
        if (path) navigate(path);
        setOpenMenu(null);
        setMobileOpen(false);
    };

    const brand = (
        <>
            {orgLogoUrl ? (
                <img
                    src={resolveFileUrl(orgLogoUrl)}
                    alt="Workspace logo"
                    className="h-7 w-7 shrink-0 rounded-[9px] bg-white object-contain p-0.5 ring-1 ring-(--border-subtle)"
                />
            ) : (
                <BrandMark size={26} className="shrink-0 drop-shadow-[0_6px_16px_var(--brand-glow)]" />
            )}
            <span className="flex min-w-0 flex-col text-left">
                <span className="max-w-[150px] truncate text-xs font-semibold leading-tight text-(--text-main)" style={{ fontFamily: 'var(--font-display)' }} title={orgName}>
                    {orgName}
                </span>
                <span className="font-mono text-[9px] uppercase leading-tight tracking-[0.16em] text-(--text-muted)">HR Operations</span>
            </span>
        </>
    );

    return (
        <header ref={barRef} className="relative z-40 h-12 shrink-0 border-b border-(--border-subtle) bg-(--bg-sidebar) backdrop-blur-xl">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-px opacity-70"
                style={{ background: 'linear-gradient(90deg, transparent, var(--brand-primary), var(--brand-secondary), transparent)' }}
            />

            <div className="flex h-full items-center gap-1.5 px-2.5 sm:gap-2 sm:px-3.5 lg:px-4">
                {/* Brand */}
                <button
                    type="button"
                    onClick={() => go(items[0]?.path)}
                    className="flex min-w-0 shrink-0 items-center gap-2.5 outline-none [&>span]:hidden sm:[&>span]:flex"
                >
                    {brand}
                </button>

                <span className="mx-1.5 hidden h-6 w-px bg-(--border-subtle) lg:block" />

                {/* Desktop navigation */}
                <nav className="hidden h-full min-w-0 flex-1 items-center gap-1 lg:flex">
                    {sections.map((section) => (section.type === 'link' ? (
                        <NavLink
                            key={section.item.path + section.item.title}
                            item={section.item}
                            active={isActive(section.item.path)}
                            onClick={() => go(section.item.path)}
                        />
                    ) : (
                        <NavMenu
                            key={section.key}
                            section={section}
                            open={openMenu === section.key}
                            active={section.list.some(i => isActive(i.path))}
                            onToggle={() => setOpenMenu(openMenu === section.key ? null : section.key)}
                            onPick={go}
                            isActive={isActive}
                        />
                    )))}
                </nav>

                {/* Right cluster */}
                <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                    <div className="hidden h-7 items-center gap-1.5 rounded-full border border-(--border-subtle) bg-(--bg-surface)/70 px-2 md:flex lg:hidden xl:flex">
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-(--text-main)">{easternTime.date}</span>
                        <span className="h-3.5 w-px bg-(--border-subtle)" />
                        <span className="font-mono text-[11px] tabular-nums text-(--text-main)">{easternTime.time}</span>
                        <span className="font-mono text-[10px] text-(--text-muted)">EST</span>
                    </div>

                    <IconButton onClick={onRefresh} title="Refresh Page">
                        <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                    </IconButton>

                    <ThemeSwitch isDark={isDark} onToggle={onToggleTheme} className="hidden sm:flex" />

                    {/* Profile */}
                    <div className="relative hidden lg:block">
                        <button
                            type="button"
                            onClick={() => setOpenMenu(openMenu === 'profile' ? null : 'profile')}
                            aria-expanded={openMenu === 'profile'}
                            className="flex h-8 items-center gap-1.5 rounded-full border border-(--border-subtle) bg-(--bg-surface)/70 p-0.5 outline-none transition-colors hover:border-(--brand-primary)/40 xl:pr-3"
                        >
                            <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: 'var(--brand-gradient)' }}>
                                {initialsOf(displayName)}
                            </span>
                            <span className="hidden flex-col text-left leading-tight xl:flex">
                                <span className="max-w-[110px] truncate text-[11px] font-semibold text-(--text-main)" title={displayName}>{displayName}</span>
                                <span className="text-[9px] text-(--text-muted)">{roleLabel}</span>
                            </span>
                        </button>

                        {openMenu === 'profile' && (
                            <div
                                className="nx-pop absolute right-0 top-[calc(100%+10px)] w-72 rounded-[22px] border border-(--border-subtle) bg-(--bg-surface) p-2"
                                style={{ boxShadow: 'var(--shadow-floating)' }}
                            >
                                <div
                                    className="rounded-[16px] p-4"
                                    style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--brand-primary) 16%, transparent), color-mix(in srgb, var(--brand-secondary) 10%, transparent))' }}
                                >
                                    <p className="text-xs text-(--text-muted)">Welcome,</p>
                                    <p className="truncate text-base font-semibold text-(--text-main)">{userName || roleLabel}</p>
                                    <span className="mt-2 inline-flex rounded-full bg-(--bg-surface) px-2.5 py-1 text-[11px] font-semibold text-(--brand-primary)">{roleLabel}</span>
                                    <p className="mt-3 truncate text-xs text-(--text-muted)">{orgName}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={onLogout}
                                    className="mt-2 flex w-full items-center justify-between rounded-[14px] px-4 py-3 text-sm font-medium text-(--text-main) outline-none transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                                >
                                    <span className="flex items-center gap-2"><LogOut size={16} /> Log Out</span>
                                    <ArrowUpRight size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    <IconButton onClick={() => setMobileOpen(true)} title="Open Menu" className="lg:hidden">
                        <Menu size={18} />
                    </IconButton>
                </div>
            </div>

            {/* Mobile command sheet */}
            {mobileOpen && (
                <div className="fixed inset-0 z-[60] lg:hidden">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-md" onClick={() => setMobileOpen(false)} />
                    <div
                        className="nx-pop absolute inset-x-3 top-3 max-h-[calc(100vh-1.5rem)] overflow-y-auto rounded-[26px] border border-(--border-subtle) bg-(--bg-surface) p-4"
                        style={{ boxShadow: 'var(--shadow-floating)' }}
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2.5">{brand}</div>
                            <IconButton onClick={() => setMobileOpen(false)} title="Close Menu"><X size={18} /></IconButton>
                        </div>

                        <div className="mt-4 flex items-center justify-between gap-3 rounded-[16px] border border-(--border-subtle) px-4 py-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-(--text-main)">Welcome, {userName || roleLabel}</p>
                                <p className="text-[11px] text-(--brand-primary)">{roleLabel}</p>
                            </div>
                            <div className="text-right font-mono text-[11px] tabular-nums text-(--text-muted)">
                                <p>{easternTime.date}</p>
                                <p>{easternTime.time} EST</p>
                            </div>
                        </div>

                        {mobileGroups.map((group) => (
                            <div key={group.key} className="mt-5">
                                <p className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[0.22em] text-(--text-muted)">{group.label}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {group.list.map((item) => {
                                        const on = isActive(item.path);
                                        return (
                                            <button
                                                key={item.path + item.title}
                                                type="button"
                                                onClick={() => go(item.path)}
                                                className={`flex items-center gap-2.5 rounded-[16px] border p-3 text-left text-sm font-medium outline-none transition-colors
                                                    ${on ? 'border-transparent text-white' : 'border-(--border-subtle) text-(--text-main) hover:border-(--brand-primary)/40'}`}
                                                style={on ? { background: 'var(--brand-gradient)' } : undefined}
                                            >
                                                <item.icon size={17} className={on ? '' : 'text-(--brand-primary)'} />
                                                <span className="truncate">{item.title}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        <div className="mt-6 flex items-center gap-2 border-t border-(--border-subtle) pt-4">
                            <ThemeSwitch isDark={isDark} onToggle={onToggleTheme} className="flex" />
                            <button
                                type="button"
                                onClick={onLogout}
                                className="ml-auto flex h-10 items-center gap-2 rounded-full border border-rose-500/30 bg-rose-500/10 px-4 text-sm font-medium text-rose-500 outline-none"
                            >
                                <LogOut size={16} /> Log Out
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </header>
    );
};

export default CommandBar;
