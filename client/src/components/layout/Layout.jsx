import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Sun, Moon, Menu, Clock, RefreshCw } from 'lucide-react';
import Sidebar from './Sidebar';
import TopProgressBar from '../ui/TopProgressBar';
import { pulseLoading } from '../../utils/loadingBus';
import api from '../../api/axios';

const Layout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const userRole = localStorage.getItem('userRole');
    const userName = localStorage.getItem('userName') || '';

    const [isDark, setIsDark] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [easternTime, setEasternTime] = useState({ date: '', time: '' });
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        window.location.reload();
    }, []);

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York',
                month: '2-digit', day: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
            }).formatToParts(now);
            const get = (type) => parts.find(p => p.type === type)?.value || '';
            const date = `${get('month')}/${get('day')}/${get('year')}`;
            const time = `${get('hour')}:${get('minute')}:${get('second')} ${get('dayPeriod')}`;
            setEasternTime({ date, time });
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    // Show the bar the moment a nav item is clicked, so the click is acknowledged
    // even before the page's own requests start (or when its chunk is cached and
    // there is nothing to fetch at all).
    useEffect(() => { pulseLoading(); }, [location.pathname]);

    useEffect(() => {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            setIsDark(true);
            document.documentElement.classList.add('dark');
        }
    }, []);

    const toggleTheme = () => {
        if (isDark) {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
            setIsDark(false);
        } else {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            setIsDark(true);
        }
    };

    const handleLogout = async () => {
        try {
            await api.post('/api/auth/logout');
            localStorage.clear();
            navigate('/');
        } catch (err) {
            console.error("Logout failed", err);
        }
    };

    const welcomeText = `Welcome, ${userName || userRole?.replace('_', ' ')}`;

    return (
        <div className="flex h-screen w-full bg-(--bg-app) overflow-hidden transition-colors duration-300 relative">

            <TopProgressBar />

            <Sidebar
                isOpen={isSidebarOpen}
                setIsOpen={setIsSidebarOpen}
                isMobileOpen={isMobileSidebarOpen}
                setIsMobileOpen={setIsMobileSidebarOpen}
            />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">

                {/* Fixed Header */}
                <header className="h-16 shrink-0 bg-(--bg-sidebar) border-b border-(--border-subtle) flex items-center justify-between px-4 lg:px-8 transition-colors duration-300">

                    {/* Left: Hamburger (mobile) + Welcome Text */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsMobileSidebarOpen(true)}
                            className="lg:hidden p-2 rounded-lg hover:bg-(--border-subtle) transition-colors text-(--text-main) outline-none"
                            title="Open Menu"
                        >
                            <Menu size={20} />
                        </button>
                        <h2 className="text-sm lg:text-base font-semibold text-(--text-main) tracking-tight truncate">
                            {welcomeText}
                        </h2>
                    </div>

                    {/* Right: Eastern Clock + Theme Toggle + Logout */}
                    <div className="flex items-center space-x-1 lg:space-x-4">

                        {/* Live Eastern Date & Time */}
                        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-(--border-subtle)/50 border border-(--border-subtle)">
                            <Clock size={13} className="text-(--text-muted) shrink-0" />
                            <span className="font-mono text-xs font-bold text-(--text-main) tracking-tight tabular-nums">
                                {easternTime.date}
                            </span>
                            <span className="text-(--border-subtle) text-xs select-none">|</span>
                            <span className="font-mono text-xs font-bold text-(--text-main) tracking-tight tabular-nums">
                                {easternTime.time}
                            </span>
                            <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">EST</span>
                        </div>

                        <button
                            onClick={handleRefresh}
                            className="flex items-center justify-center p-2 lg:px-3 lg:py-2 text-(--text-muted) hover:text-(--text-main) hover:bg-(--border-subtle) rounded-lg transition-all outline-none"
                            title="Refresh Page"
                        >
                            <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                        </button>

                        <button
                            onClick={toggleTheme}
                            className="flex items-center justify-center p-2 lg:px-3 lg:py-2 text-(--text-muted) hover:text-(--text-main) hover:bg-(--border-subtle) rounded-lg transition-all outline-none"
                            title="Toggle Light/Dark Mode"
                        >
                            {isDark ? <Sun size={18} /> : <Moon size={18} />}
                        </button>

                        <div className="hidden lg:block w-px h-6 bg-(--border-subtle) mx-2"></div>

                        <button
                            onClick={handleLogout}
                            className="flex items-center justify-center p-2 lg:px-4 lg:py-2 text-(--text-muted) hover:text-red-500 lg:hover:text-(--text-main) lg:hover:bg-(--border-subtle) rounded-lg transition-all outline-none"
                            title="Log Out"
                        >
                            <LogOut size={18} />
                            <span className="hidden lg:inline ml-2 text-sm font-medium">Log Out</span>
                        </button>
                    </div>
                </header>

                {/* Scrollable Page Content */}
                <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 lg:p-8 bg-(--bg-app) transition-colors duration-300 w-full relative">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default Layout;
