import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Building2, Building, Users, Briefcase,
    Clock, FileText, Wallet, Shield, Menu, X, Settings, Receipt, Scale
} from 'lucide-react';
import { managementAPI, portalAPI } from '../../api/apiService';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 224;

const Sidebar = ({ isOpen, setIsOpen, isMobileOpen, setIsMobileOpen }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const userRole = localStorage.getItem('userRole');
    const rawName  = localStorage.getItem('userName');
    const userName = (rawName && rawName !== 'undefined' && rawName !== 'null' && rawName.trim() !== '')
        ? rawName
        : 'User Profile';

    const [orgLogoUrl, setOrgLogoUrl] = useState(() => localStorage.getItem('orgLogoUrl') || null);
    const [orgName,    setOrgName]    = useState(() => localStorage.getItem('orgName')    || 'SYSTEM');

    const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
    const [width, setWidth] = useState(() => {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('sidebarWidth') : null;
        return Math.max(MIN_WIDTH, Math.min(saved ? parseInt(saved, 10) : DEFAULT_WIDTH, MAX_WIDTH));
    });
    const isResizing = useRef(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        isResizing.current = true;
        document.body.style.cursor    = 'col-resize';
        document.body.style.userSelect = 'none';

        const handleMouseMove = (moveEvent) => {
            requestAnimationFrame(() => {
                const newWidth = moveEvent.clientX;
                if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setWidth(newWidth);
            });
        };

        const handleMouseUp = () => {
            isResizing.current = false;
            document.body.style.cursor    = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup',   handleMouseUp);
            setWidth(cur => { localStorage.setItem('sidebarWidth', String(cur)); return cur; });
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup',   handleMouseUp);
    }, []);

    // ── Navigation items ──────────────────────────────────────────────────────
    // HR sees: Dashboard, Workforce, Clients, Placements, Timesheets
    // ORG_ADMIN / ACCOUNTANT sees: all management items including Invoices, Payroll, Balance Sheet, Organisation
    const filteredItems = useMemo(() => {
        const isManagement = ['ORG_ADMIN', 'HR', 'ACCOUNTANT'].includes(userRole);
        const dashboardPath =
            userRole === 'SUPER_ADMIN' ? '/super-admin/dashboard' :
            isManagement               ? '/management/dashboard'  :
            '/portal/dashboard';

        const all = [
            { title: 'Dashboard',        icon: LayoutDashboard, path: dashboardPath,                    roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'HR', 'ACCOUNTANT', 'EMPLOYEE'] },
            { title: 'Organisations',    icon: Building2,       path: '/super-admin/organizations',      roles: ['SUPER_ADMIN'] },
            { title: 'Workforce',        icon: Users,           path: '/management/workforce',           roles: ['ORG_ADMIN', 'HR', 'ACCOUNTANT'] },
            { title: 'Clients',          icon: Building,        path: '/management/clients',             roles: ['ORG_ADMIN', 'HR', 'ACCOUNTANT'] },
            { title: 'Placements',       icon: Briefcase,       path: '/management/placements',          roles: ['ORG_ADMIN', 'HR', 'ACCOUNTANT'] },
            { title: 'Timesheets',       icon: Clock,           path: '/management/timesheets',          roles: ['ORG_ADMIN', 'HR', 'ACCOUNTANT'] },
            { title: 'Invoice Settings', icon: Settings,        path: '/management/invoice-settings',    roles: ['ORG_ADMIN', 'ACCOUNTANT'] },
            { title: 'Invoices',         icon: FileText,        path: '/management/invoices',            roles: ['ORG_ADMIN', 'ACCOUNTANT'] },
            { title: 'Payroll',          icon: Receipt,         path: '/management/payroll',             roles: ['ORG_ADMIN', 'ACCOUNTANT'] },
            { title: 'Balance Sheet',    icon: Wallet,          path: '/management/balance-sheet',       roles: ['ORG_ADMIN', 'ACCOUNTANT'] },
            { title: 'Reconcile',        icon: Scale,           path: '/management/reconcile',           roles: ['ORG_ADMIN'] },
            { title: 'Organisation',     icon: Building2,       path: '/management/organisation',        roles: ['ORG_ADMIN'] },
            { title: 'My Placements',    icon: Briefcase,       path: '/portal/placements',              roles: ['EMPLOYEE'] },
            { title: 'My Timesheets',    icon: Clock,           path: '/portal/timesheets',              roles: ['EMPLOYEE'] },
            { title: 'Balance Sheet',    icon: Wallet,          path: '/portal/balance-sheet',           roles: ['EMPLOYEE'] },
        ];
        return all.filter(item => item.roles.includes(userRole));
    }, [userRole]);

    const handleNavigate = (path) => {
        navigate(path);
        setIsMobileOpen(false);
    };

    const sidebarStyle   = isDesktop && isOpen ? { width: `${width}px` } : {};
    const transitionClass = isResizing.current ? '' : 'transition-all duration-300 ease-in-out';

    return (
        <>
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            <aside
                style={sidebarStyle}
                className={`
                    fixed top-0 left-0 h-screen z-50 bg-(--bg-sidebar) border-r border-(--border-subtle) flex flex-col font-sans ${transitionClass}
                    w-64 ${isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
                    lg:translate-x-0 lg:relative ${isOpen ? '' : 'lg:w-20'}
                `}
            >
                {/* ── Top: Logo + toggle ── */}
                <div className={`h-16 flex items-center border-b border-(--border-subtle) shrink-0 transition-all duration-300
                    ${isMobileOpen ? 'px-5 justify-between' : 'px-0 justify-center'}
                    ${isOpen       ? 'lg:px-5 lg:justify-between' : 'lg:px-0 lg:justify-center'}
                `}>
                    <div className={`flex items-center space-x-2 overflow-hidden transition-all duration-300
                        ${isMobileOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 hidden'}
                        ${isOpen       ? 'lg:opacity-100 lg:w-auto lg:flex' : 'lg:opacity-0 lg:w-0 lg:hidden'}
                    `}>
                        {orgLogoUrl ? (
                            <img
                                src={`${BACKEND_URL}${orgLogoUrl}`}
                                alt="Org Logo"
                                className="h-8 w-8 rounded object-contain flex-shrink-0 bg-white p-0.5"
                            />
                        ) : (
                            <div className="bg-(--brand-primary) p-1.5 rounded flex-shrink-0">
                                <Shield className="text-(--brand-primary-text) h-5 w-5" />
                            </div>
                        )}
                        <span className="font-bold text-(--text-main) tracking-tight uppercase text-sm truncate max-w-[130px]" title={orgName}>
                            {orgName}
                        </span>
                    </div>

                    <button
                        onClick={() => {
                            if (window.innerWidth < 1024) setIsMobileOpen(!isMobileOpen);
                            else                          setIsOpen(!isOpen);
                        }}
                        className={`p-2 rounded-lg hover:bg-(--bg-app)/50 transition-colors text-(--text-main) outline-none ${(!isOpen && !isMobileOpen) && 'mx-auto'}`}
                        title="Toggle Menu"
                    >
                        {isMobileOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>

                {/* ── Nav items ── */}
                <nav className={`flex-1 mt-6 space-y-2 overflow-y-auto overflow-x-hidden transition-all duration-300
                    ${isMobileOpen ? 'px-3' : 'px-2'}
                    ${isOpen       ? 'lg:px-3' : 'lg:px-2'}
                `}>
                    {filteredItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <button
                                key={item.title}
                                onClick={() => handleNavigate(item.path)}
                                title={!isOpen && !isMobileOpen ? item.title : ''}
                                className={`w-full flex items-center py-2.5 rounded-lg transition-all duration-200 outline-none
                                    ${isMobileOpen ? 'px-3 justify-start' : 'px-0 justify-center'}
                                    ${isOpen       ? 'lg:px-3 lg:justify-start' : 'lg:px-0 lg:justify-center'}
                                    ${isActive
                                        ? 'bg-(--bg-app) text-(--text-main) font-bold shadow-sm'
                                        : 'text-(--text-main)/70 hover:bg-(--bg-app)/50 hover:text-(--text-main)'}
                                `}
                            >
                                <item.icon size={18} className={`flex-shrink-0 ${isActive ? 'text-(--brand-primary)' : ''}`} />
                                <span className={`text-xs whitespace-nowrap overflow-hidden transition-all duration-300
                                    ${isMobileOpen ? 'ml-3 opacity-100 w-auto' : 'ml-0 opacity-0 w-0'}
                                    ${isOpen       ? 'lg:ml-3 lg:opacity-100 lg:w-auto' : 'lg:ml-0 lg:opacity-0 lg:w-0'}
                                `}>
                                    {item.title}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                {/* ── Resize handle ── */}
                <div
                    onMouseDown={handleMouseDown}
                    className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-(--brand-primary)/20 transition-colors duration-200 z-[60] hidden ${isOpen ? 'lg:block' : 'lg:hidden'}`}
                    title="Drag to resize"
                />

                {/* ── Bottom profile card ── */}
                <div className="p-4 border-t border-(--border-subtle) shrink-0">
                    <div
                        className={`py-3 bg-(--bg-app) rounded-xl flex items-center transition-all duration-300 shadow-sm
                            ${isMobileOpen ? 'px-4 space-x-3' : 'justify-center px-0'}
                            ${isOpen       ? 'lg:px-4 lg:space-x-3' : 'lg:justify-center lg:px-0'}
                        `}
                        title={!isOpen && !isMobileOpen ? userName : ''}
                    >
                        {/* Name + Role text (visible when expanded) */}
                        <div className={`min-w-0 overflow-hidden transition-all duration-300
                            ${isMobileOpen ? 'w-auto opacity-100 block' : 'w-0 opacity-0 hidden'}
                            ${isOpen       ? 'lg:block lg:w-auto lg:opacity-100' : 'lg:hidden lg:w-0 lg:opacity-0'}
                        `}>
                            <p className="text-xs font-bold text-(--text-main) truncate" title={userName}>
                                {userName}
                            </p>
                            <p className="text-[9px] text-(--text-muted) uppercase tracking-widest leading-none mt-1 truncate font-bold text-(--brand-primary)">
                                {userRole?.replace('_', ' ')}
                            </p>
                        </div>

                        {/* Initials avatar (visible when collapsed) */}
                        <div className={`shrink-0 overflow-hidden transition-all duration-300 flex justify-center
                            ${isMobileOpen ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100 block'}
                            ${isOpen       ? 'lg:hidden lg:w-0 lg:opacity-0' : 'lg:block lg:w-auto lg:opacity-100'}
                        `}>
                            <div className="w-8 h-8 rounded-full bg-(--brand-primary)/10 text-(--brand-primary) flex items-center justify-center font-bold text-xs uppercase tracking-widest border border-(--brand-primary)/20 shadow-sm">
                                {userName.substring(0, 2)}
                            </div>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
