import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import CommandBar from './CommandBar';
import TopProgressBar from '../ui/TopProgressBar';
import { pulseLoading } from '../../utils/loadingBus';
import api from '../../api/axios';

const Layout = ({ children }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const userRole = localStorage.getItem('userRole');
    const userName = localStorage.getItem('userName') || '';

    const [isDark, setIsDark] = useState(() => {
        const savedTheme = localStorage.getItem('theme');
        return savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    });
    const [easternTime, setEasternTime] = useState({ date: '', time: '' });
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = useCallback(() => {
        setIsRefreshing(true);
        window.location.reload();
    }, []);

    // The Nebula design-language overrides in index.css only apply while the
    // signed-in shell is mounted, so public pages keep their own styling.
    useEffect(() => {
        document.documentElement.classList.add('nx-shell');
        return () => document.documentElement.classList.remove('nx-shell');
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

    // Apply the theme resolved in the initial state (saved choice, else system preference).
    useEffect(() => {
        if (isDark) document.documentElement.classList.add('dark');
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
            navigate('/login');
        } catch (err) {
            console.error("Logout failed", err);
        }
    };

    return (
        <div className="nx-canvas relative flex h-screen w-full flex-col overflow-hidden transition-colors duration-300">

            <TopProgressBar />

            <CommandBar
                userName={userName}
                userRole={userRole}
                easternTime={easternTime}
                isDark={isDark}
                onToggleTheme={toggleTheme}
                isRefreshing={isRefreshing}
                onRefresh={handleRefresh}
                onLogout={handleLogout}
            />

            {/* Scrollable Page Content — the bar above is exactly 3.5rem tall, which
                any full-height page layout would measure against. */}
            <main className="relative flex-1 w-full overflow-x-hidden overflow-y-auto p-3 sm:p-4 lg:p-5">
                {children}
            </main>
        </div>
    );
};

export default Layout;
