import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowRight, ArrowUpRight, Menu, X, Users, Building, Briefcase, Clock, FileText, Settings,
    Receipt, Wallet, Scale, Building2, History, CircleUser, Globe, ShieldCheck, KeyRound, Lock,
    CloudUpload, Mail, CalendarClock, FileDown, FileSpreadsheet, Timer, Sparkles, LineChart,
    CheckCircle2, Cake, Plane, Layers, Zap, Trophy, LayoutDashboard,
} from 'lucide-react';
import BrandMark from '../../components/brand/BrandMark';
import './landing.css';

const HeroScene = lazy(() => import('./HeroScene'));

// ─── Content ──────────────────────────────────────────────────────────────────

const NAV_LINKS = [
    { id: 'platform', label: 'Platform' },
    { id: 'modules',  label: 'Modules' },
    { id: 'workflow', label: 'Workflow' },
    { id: 'roles',    label: 'Roles' },
    { id: 'security', label: 'Security' },
];

const HERO_STATS = [
    { value: '12+', label: 'Integrated modules' },
    { value: '5',   label: 'Role workspaces' },
    { value: '3',   label: 'Pay models' },
    { value: '1',   label: 'Source of truth' },
];

const MARQUEE = [
    'Talent records', 'Work authorization tracking', 'Document vault', 'Partner contacts', 'Bill & pay rates',
    'Time log approvals', 'Invoice PDFs', 'Payment tracking', 'Pay runs', 'C2C ledgers',
    'Earned vs paid', 'Activity trail', 'Excel exports', 'Consultant self-service',
];

const PILLARS = [
    {
        icon: Layers,
        title: 'One connected record',
        text: 'Consultants, partners, engagements and rates live together, so every screen reads from the same data and nothing is re-keyed.',
    },
    {
        icon: Zap,
        title: 'Hours become cash',
        text: 'Approved time logs flow straight into invoices, pay runs and earnings ledgers — the whole cash cycle in one motion.',
    },
    {
        icon: ShieldCheck,
        title: 'Accountable by design',
        text: 'Role-based workspaces, secure sessions and a per-module activity trail keep every action visible and every user in their lane.',
    },
];

const DASHBOARD_SIGNALS = [
    { icon: Users,    label: 'Active consultants & engagements' },
    { icon: Timer,    label: 'Time logs to review & overdue' },
    { icon: FileText, label: 'Invoices ready to send & overdue' },
    { icon: Wallet,   label: 'Ledger net balance' },
    { icon: Cake,     label: 'Birthdays today' },
    { icon: Trophy,   label: 'Work milestones' },
    { icon: Plane,    label: 'Work authorization expiring in 180 days' },
];

const MODULES = [
    { icon: Users,         tag: 'People',       title: 'Talent',            text: 'Consultant profiles with pay model, origin and consultant type, work authorization records, a secure document vault, offboarding and reactivation, and full engagement history.' },
    { icon: Building,      tag: 'Accounts',     title: 'Partners',          text: 'Partner companies with contacts for HR, accounts, time logs and managers, payment terms, and every engagement ever made with them.' },
    { icon: Briefcase,     tag: 'Assignments',  title: 'Engagements',       text: 'Connect consultants to partners with effective-dated bill rates and discounts, pay rates, W2 / C2C / 1099 pay models, billing cycles and payout basis.' },
    { icon: Clock,         tag: 'Time',         title: 'Time Logs',         text: 'Period generation, consultant submission with mandatory partner approval, attachments converted to PDF, review, admin override, manual entry and missing-period detection.' },
    { icon: FileText,      tag: 'Invoices',     title: 'Billing',           text: 'Generate from approved hours, apply additions and deductions, preview the combined invoice + time log PDF, email the partner and record payments.' },
    { icon: Settings,      tag: 'Rules',        title: 'Billing Rules',     text: 'Per-engagement payment terms, pay-when-paid, invoice recipients and custom notes that land on every invoice automatically.' },
    { icon: Receipt,       tag: 'Payroll',      title: 'Pay Runs',          text: 'Build pay runs from approved time, add line-level adjustments and catch-up lines, refresh against the latest data and lock them in.' },
    { icon: Wallet,        tag: 'Ledgers',      title: 'Earnings Ledger',   text: 'Per-consultant earnings ledgers with C2C postings, manual additions and deductions, repricing previews and W2 pay runs.' },
    { icon: Scale,         tag: 'Assurance',    title: 'Pay Audit',         text: 'An earned-versus-paid audit built from time logs, pay runs and the C2C ledger, so every gap surfaces before it grows.' },
    { icon: Building2,     tag: 'Control',      title: 'Workspace',         text: 'Brand the workspace with your logo and billing mailbox, and manage workspace admins, talent ops and finance leads with one-click access control.' },
    { icon: History,       tag: 'Compliance',   title: 'Activity Trail',    text: 'Creates, updates, approvals and emails are logged per module with who did it and when — right on the page where it happened.' },
    { icon: CircleUser,    tag: 'Self-service', title: 'Consultant Portal', text: 'Consultants follow their engagements, submit time logs with approvals and track their own earnings ledger from any device.' },
];

const WORKFLOW = [
    { step: '01', title: 'Onboard',    text: 'Register the workspace, add admins, talent ops and finance leads, and welcome consultants with their credentials.' },
    { step: '02', title: 'Contract',   text: 'Create partners and engagements with bill rates, pay rates and billing rules.' },
    { step: '03', title: 'Track time', text: 'Time log periods open for each engagement and consultants log their hours.' },
    { step: '04', title: 'Approve',    text: 'Review the attached partner approval, then approve, send back or override.' },
    { step: '05', title: 'Invoice',    text: 'Approved hours become invoices, rendered to PDF with approvals attached.' },
    { step: '06', title: 'Collect',    text: 'Email partners, record payments and keep overdue balances in sight.' },
    { step: '07', title: 'Pay',        text: 'Run pay runs and post C2C ledgers from the very same approved hours.' },
    { step: '08', title: 'Audit',      text: 'Compare earned against paid and close every period with confidence.' },
];

const ROLES = [
    { icon: Globe,       title: 'Platform Owner',  text: 'Runs the platform: registers workspaces, reviews their admins and switches tenants on or off.', access: ['Mission control', 'Tenants'] },
    { icon: ShieldCheck, title: 'Workspace Admin', text: 'Owns the workspace end to end with every module unlocked.',                                 access: ['Talent modules', 'Billing & pay runs', 'Ledger & pay audit', 'Workspace & team'] },
    { icon: Users,       title: 'Talent Ops',      text: 'Keeps consultants, partners, engagements and time logs moving every day.',                   access: ['Talent', 'Partners', 'Engagements', 'Time Logs'] },
    { icon: LineChart,   title: 'Finance Lead',    text: 'Turns approved time into invoices, pay runs and balanced ledgers.',                            access: ['Talent modules', 'Billing & rules', 'Pay runs', 'Earnings ledger'] },
    { icon: CircleUser,  title: 'Consultant',      text: 'A focused self-service portal for everyday work.',                                              access: ['My overview', 'My engagements', 'My time logs', 'My ledger'] },
];

const CAPABILITIES = [
    { icon: KeyRound,        title: 'Role-based access',     text: 'Every route and API call is guarded by role, so people only see what they are meant to.' },
    { icon: Lock,            title: 'Secure sessions',       text: 'Cookie-based authenticated sessions that sign users out the moment access is revoked.' },
    { icon: ShieldCheck,     title: 'Encrypted credentials', text: 'Passwords are encrypted at rest and reset through emailed one-time codes.' },
    { icon: CloudUpload,     title: 'Cloud file vault',      text: 'Documents, approvals, logos and invoice PDFs are stored in the cloud, not on a server disk.' },
    { icon: Mail,            title: 'Transactional email',   text: 'Welcome credentials, password resets and invoice emails with PDF attachments from your own mailbox.' },
    { icon: CalendarClock,   title: 'Scheduled automation',  text: 'Background jobs keep invoice and time log housekeeping on schedule without anyone pressing a button.' },
    { icon: FileDown,        title: 'PDF engine',            text: 'Invoice PDFs with bill-rate segments and adjustments, with approved time logs merged in.' },
    { icon: FileSpreadsheet, title: 'Excel exports',         text: 'Export talent, billing and ledgers to spreadsheets in a single click.' },
    { icon: Sparkles,        title: 'Eastern-time precision', text: 'Dates, due dates and cut-offs are calculated in US Eastern time across the entire system.' },
];

// ─── Building blocks ──────────────────────────────────────────────────────────

const useReveal = (rootRef) => {
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return undefined;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        root.querySelectorAll('.lp-reveal').forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [rootRef]);
};

const TiltCard = ({ children, className = '' }) => {
    const ref = useRef(null);
    const onMove = (e) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const px = (e.clientX - rect.left) / rect.width - 0.5;
        const py = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.transform = `perspective(900px) rotateX(${(-py * 10).toFixed(2)}deg) rotateY(${(px * 12).toFixed(2)}deg)`;
        el.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(1)}%`);
    };
    const onLeave = () => {
        if (ref.current) ref.current.style.transform = '';
    };
    return (
        <div ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} className={`lp-tilt ${className}`}>
            {children}
        </div>
    );
};

const Eyebrow = ({ children }) => (
    <p className="lp-mono inline-flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-cyan-300/80">
        <span className="h-px w-8 bg-gradient-to-r from-transparent to-cyan-300/80" />
        {children}
    </p>
);

const SectionHeading = ({ eyebrow, title, text, center = false }) => (
    <div className={`lp-reveal max-w-3xl ${center ? 'mx-auto text-center' : ''}`}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="lp-display mt-5 text-4xl font-bold leading-[1.05] text-white sm:text-5xl">{title}</h2>
        {text && <p className="mt-5 text-base leading-relaxed text-white/60 sm:text-lg">{text}</p>}
    </div>
);

const IconOrb = ({ icon: Icon, size = 20, className = '' }) => (
    <span
        className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-white ${className}`}
        style={{ background: 'linear-gradient(135deg, #7C5CFF, #B14DFF 55%, #22D3EE)', boxShadow: '0 12px 30px -10px rgba(124,92,255,0.7)' }}
    >
        <Icon size={size} />
    </span>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

const Landing = () => {
    const navigate = useNavigate();
    const rootRef = useRef(null);
    const consoleRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useReveal(rootRef);

    useEffect(() => {
        const root = rootRef.current;
        let raf = 0;

        const onPointer = (e) => {
            root?.style.setProperty('--mx', `${e.clientX}px`);
            root?.style.setProperty('--my', `${e.clientY}px`);
        };

        const onScroll = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                setScrolled(window.scrollY > 24);
                const el = consoleRef.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const progress = Math.min(Math.max(1 - rect.top / window.innerHeight, 0), 1);
                el.style.setProperty('--rx', `${(24 - progress * 24).toFixed(2)}deg`);
                el.style.setProperty('--ry', `${(-8 + progress * 8).toFixed(2)}deg`);
                el.style.setProperty('--sc', `${(0.92 + progress * 0.08).toFixed(3)}`);
            });
        };

        window.addEventListener('pointermove', onPointer, { passive: true });
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('pointermove', onPointer);
            window.removeEventListener('scroll', onScroll);
        };
    }, []);

    const goLogin = () => navigate('/login');
    const scrollTo = (id) => {
        setMenuOpen(false);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <div ref={rootRef} className="lp-root">
            <div className="lp-spotlight" aria-hidden="true" />

            {/* ── Navigation ─────────────────────────────────────────────── */}
            <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
                <div className={`mx-auto flex h-16 max-w-7xl items-center justify-between rounded-full px-3 transition-all duration-500 sm:px-5 ${scrolled ? 'lp-glass' : 'border border-transparent'}`}>
                    <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5">
                        <BrandMark size={34} className="drop-shadow-[0_6px_18px_rgba(124,92,255,0.6)]" />
                        <span className="lp-display text-base font-semibold text-white">HR Operations</span>
                    </button>

                    <nav className="hidden items-center gap-1 md:flex">
                        {NAV_LINKS.map((link) => (
                            <button
                                key={link.id}
                                type="button"
                                onClick={() => scrollTo(link.id)}
                                className="rounded-full px-4 py-2 text-sm text-white/65 transition-colors hover:bg-white/5 hover:text-white"
                            >
                                {link.label}
                            </button>
                        ))}
                    </nav>

                    <div className="flex items-center gap-2">
                        <button type="button" onClick={goLogin} className="lp-btn-primary group inline-flex h-10 items-center gap-2 rounded-full px-5 text-sm font-semibold">
                            Login <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setMenuOpen((v) => !v)}
                            aria-label="Toggle menu"
                            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-white md:hidden"
                        >
                            {menuOpen ? <X size={18} /> : <Menu size={18} />}
                        </button>
                    </div>
                </div>

                {menuOpen && (
                    <div className="lp-glass mx-auto mt-2 max-w-7xl rounded-[24px] p-3 md:hidden">
                        {NAV_LINKS.map((link) => (
                            <button
                                key={link.id}
                                type="button"
                                onClick={() => scrollTo(link.id)}
                                className="block w-full rounded-[14px] px-4 py-3 text-left text-sm text-white/80 hover:bg-white/5"
                            >
                                {link.label}
                            </button>
                        ))}
                    </div>
                )}
            </header>

            {/* ── Hero ───────────────────────────────────────────────────── */}
            <section id="top" className="relative min-h-[100svh] overflow-hidden pt-28">
                <div className="lp-aurora" aria-hidden="true" />
                <div
                    className="absolute inset-0 opacity-60 lg:left-[34%] lg:opacity-100"
                    style={{
                        WebkitMaskImage: 'radial-gradient(ellipse at center, #000 45%, transparent 76%)',
                        maskImage: 'radial-gradient(ellipse at center, #000 45%, transparent 76%)',
                    }}
                >
                    <Suspense fallback={null}>
                        <HeroScene />
                    </Suspense>
                </div>
                <div className="lp-grid-floor" aria-hidden="true" />

                <div className="relative z-10 mx-auto grid min-h-[calc(100svh-7rem)] max-w-7xl items-center gap-10 px-5 pb-16 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
                    <div>
                        <div className="lp-reveal lp-glass inline-flex items-center gap-2.5 rounded-full px-3.5 py-1.5 text-xs text-white/80">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
                            </span>
                            Staffing &amp; HR operations, reimagined
                        </div>

                        <h1 className="lp-reveal lp-display mt-7 text-[2.6rem] font-extrabold leading-[1.02] text-white sm:text-6xl xl:text-7xl" style={{ '--d': '80ms' }}>
                            Run your entire<br />
                            staffing business<br />
                            <span className="lp-neon-text">from one command center.</span>
                        </h1>

                        <p className="lp-reveal mt-7 max-w-xl text-base leading-relaxed text-white/65 sm:text-lg" style={{ '--d': '160ms' }}>
                            HR Operations unites talent records, partner engagements, time logs, billing, pay runs and
                            pay audits in one secure platform — so every approved hour flows cleanly into every invoice
                            and every paycheck.
                        </p>

                        <div className="lp-reveal mt-10 flex flex-wrap items-center gap-3" style={{ '--d': '240ms' }}>
                            <button type="button" onClick={goLogin} className="lp-btn-primary group inline-flex h-13 items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold">
                                Enter the console <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                            </button>
                            <button type="button" onClick={() => scrollTo('modules')} className="lp-btn-ghost inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium">
                                Explore the platform
                            </button>
                        </div>

                        <div className="lp-reveal mt-12 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4" style={{ '--d': '320ms' }}>
                            {HERO_STATS.map((stat) => (
                                <div key={stat.label} className="lp-glass rounded-[18px] px-4 py-3">
                                    <p className="lp-display lp-gradient-text text-2xl font-bold">{stat.value}</p>
                                    <p className="mt-0.5 text-[11px] leading-snug text-white/55">{stat.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Floating activity cards around the 3D core */}
                    <div className="relative hidden h-[620px] lg:block" aria-hidden="true">
                        <div className="lp-float lp-glass absolute left-0 top-16 w-64 rounded-[20px] p-4">
                            <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-emerald-400/15 text-emerald-300"><CheckCircle2 size={18} /></span>
                                <div>
                                    <p className="text-sm font-semibold text-white">Time log approved</p>
                                    <p className="lp-mono text-[11px] text-white/45">40.00 hrs · partner approval attached</p>
                                </div>
                            </div>
                        </div>
                        <div className="lp-float-slow lp-glass absolute right-0 top-40 w-60 rounded-[20px] p-4">
                            <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-violet-400/15 text-violet-300"><FileText size={18} /></span>
                                <div>
                                    <p className="text-sm font-semibold text-white">Invoice emailed</p>
                                    <p className="lp-mono text-[11px] text-white/45">combined PDF · net 30</p>
                                </div>
                            </div>
                        </div>
                        <div className="lp-float-late lp-glass absolute bottom-24 left-10 w-56 rounded-[20px] p-4">
                            <p className="lp-mono text-[10px] uppercase tracking-[0.2em] text-white/45">Earned vs paid</p>
                            <div className="mt-3 flex h-16 items-end gap-1.5">
                                {[55, 80, 62, 95, 70, 88, 76].map((h, i) => (
                                    <span
                                        key={i}
                                        className="lp-bar w-full rounded-t-[4px]"
                                        style={{ height: `${h}%`, animationDelay: `${i * 0.2}s`, background: 'linear-gradient(180deg, #22D3EE, #7C5CFF)' }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="lp-float lp-glass absolute bottom-10 right-6 w-60 rounded-[20px] p-4" style={{ animationDelay: '-2s' }}>
                            <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-cyan-400/15 text-cyan-300"><Wallet size={18} /></span>
                                <div>
                                    <p className="text-sm font-semibold text-white">Pay run locked</p>
                                    <p className="lp-mono text-[11px] text-white/45">ledgers updated</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={() => scrollTo('platform')}
                    className="absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 text-white/40 transition-colors hover:text-white/80 sm:flex"
                >
                    <span className="lp-mono text-[10px] uppercase tracking-[0.3em]">Scroll</span>
                    <span className="flex h-9 w-5 justify-center rounded-full border border-white/20 pt-1.5">
                        <span className="h-2 w-1 animate-bounce rounded-full bg-white/60" />
                    </span>
                </button>
            </section>

            {/* ── Marquee ────────────────────────────────────────────────── */}
            <div className="lp-marquee relative border-y border-white/[0.06] bg-white/[0.02] py-5">
                <div className="lp-marquee-track">
                    {[...MARQUEE, ...MARQUEE].map((item, i) => (
                        <span key={i} className="lp-mono flex items-center gap-6 whitespace-nowrap px-6 text-sm uppercase tracking-[0.18em] text-white/45">
                            {item}
                            <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-violet-400 to-cyan-300" />
                        </span>
                    ))}
                </div>
            </div>

            {/* ── Platform ───────────────────────────────────────────────── */}
            <section id="platform" className="relative scroll-mt-24 px-5 py-28 sm:px-8">
                <div className="lp-section-glow left-[-10%] top-20 h-80 w-80 bg-violet-600/40" aria-hidden="true" />
                <div className="relative mx-auto max-w-7xl">
                    <SectionHeading
                        eyebrow="The platform"
                        title={<>One platform.<br /><span className="lp-gradient-text">Zero spreadsheets in between.</span></>}
                        text="Staffing firms juggle people, clients, hours and money across disconnected tools. HR Operations replaces the patchwork with a single, role-aware system that follows work from first engagement to final pay audit."
                    />

                    <div className="mt-16 grid gap-5 md:grid-cols-3">
                        {PILLARS.map((pillar, i) => (
                            <div key={pillar.title} className="lp-reveal" style={{ '--d': `${i * 100}ms` }}>
                                <TiltCard className="lp-glass lp-glow-border h-full rounded-[28px] p-8">
                                    <div className="lp-lift">
                                        <IconOrb icon={pillar.icon} />
                                        <h3 className="lp-display mt-7 text-2xl font-semibold text-white">{pillar.title}</h3>
                                        <p className="mt-3 leading-relaxed text-white/60">{pillar.text}</p>
                                    </div>
                                </TiltCard>
                            </div>
                        ))}
                    </div>

                    <div className="lp-reveal lp-glass mt-6 grid gap-8 rounded-[28px] p-8 lg:grid-cols-[1fr_1.6fr] lg:items-center">
                        <div>
                            <div className="flex items-center gap-3">
                                <IconOrb icon={LayoutDashboard} />
                                <h3 className="lp-display text-2xl font-semibold text-white">Command dashboards</h3>
                            </div>
                            <p className="mt-4 leading-relaxed text-white/60">
                                Every workspace opens on a live dashboard. Tiles jump straight to the filtered view behind the number.
                            </p>
                        </div>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                            {DASHBOARD_SIGNALS.map(({ icon: Icon, label }) => (
                                <div key={label} className="flex items-center gap-3 rounded-[16px] border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                                    <Icon size={16} className="shrink-0 text-cyan-300" />
                                    <span className="text-sm text-white/75">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Modules ────────────────────────────────────────────────── */}
            <section id="modules" className="relative scroll-mt-24 px-5 py-28 sm:px-8">
                <div className="lp-section-glow right-[-8%] top-40 h-96 w-96 bg-cyan-500/25" aria-hidden="true" />
                <div className="relative mx-auto max-w-7xl">
                    <SectionHeading
                        eyebrow="Modules"
                        title={<>Twelve modules.<br /><span className="lp-gradient-text">One operating rhythm.</span></>}
                        text="Everything a staffing operation touches, from the first consultant record to the last audited dollar."
                    />

                    <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {MODULES.map((mod, i) => (
                            <div key={mod.title} className="lp-reveal" style={{ '--d': `${(i % 3) * 90}ms` }}>
                                <TiltCard className="lp-glass lp-glow-border group h-full rounded-[26px] p-7">
                                    <div className="lp-lift">
                                        <div className="flex items-start justify-between">
                                            <IconOrb icon={mod.icon} />
                                            <span className="lp-mono rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/50">{mod.tag}</span>
                                        </div>
                                        <h3 className="lp-display mt-6 flex items-center gap-2 text-xl font-semibold text-white">
                                            {mod.title}
                                            <ArrowUpRight size={16} className="text-cyan-300 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
                                        </h3>
                                        <p className="mt-3 text-sm leading-relaxed text-white/60">{mod.text}</p>
                                    </div>
                                </TiltCard>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Console preview ────────────────────────────────────────── */}
            <section className="relative overflow-hidden px-5 py-20 sm:px-8">
                <div className="relative mx-auto max-w-7xl">
                    <SectionHeading
                        center
                        eyebrow="Inside the console"
                        title={<>Clarity at a <span className="lp-gradient-text">single glance.</span></>}
                        text="A calm, focused workspace where the numbers that matter are always one click from the work behind them."
                    />

                    <div className="mt-16" style={{ perspective: '1600px' }}>
                        <div ref={consoleRef} className="lp-console lp-glass relative mx-auto max-w-6xl overflow-hidden rounded-[28px]">
                            <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
                                <span className="h-3 w-3 rounded-full bg-rose-400/80" />
                                <span className="h-3 w-3 rounded-full bg-amber-300/80" />
                                <span className="h-3 w-3 rounded-full bg-emerald-400/80" />
                                <div className="lp-mono ml-4 flex-1 truncate rounded-full bg-white/5 px-4 py-1 text-xs text-white/40">console / overview</div>
                            </div>

                            <div className="grid gap-5 p-5 sm:p-8 lg:grid-cols-[210px_1fr]">
                                <div className="hidden flex-col gap-1 lg:flex">
                                    {['Overview', 'Talent', 'Engagements', 'Time Logs', 'Billing', 'Pay Runs', 'Pay Audit'].map((item, i) => (
                                        <span
                                            key={item}
                                            className={`rounded-[12px] px-3 py-2 text-sm ${i === 0 ? 'bg-violet-500/15 text-white' : 'text-white/45'}`}
                                        >
                                            {item}
                                        </span>
                                    ))}
                                </div>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                                        {[
                                            { label: 'Active consultants', value: '128', tone: 'text-violet-300' },
                                            { label: 'Pending approvals', value: '14', tone: 'text-amber-300' },
                                            { label: 'Ready to send', value: '9', tone: 'text-cyan-300' },
                                            { label: 'Net balance', value: '$482K', tone: 'text-emerald-300' },
                                        ].map((kpi) => (
                                            <div key={kpi.label} className="rounded-[18px] border border-white/[0.07] bg-white/[0.03] p-4">
                                                <p className="text-xs text-white/45">{kpi.label}</p>
                                                <p className={`lp-display mt-2 text-2xl font-bold ${kpi.tone}`}>{kpi.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                                        <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.03] p-4">
                                            <p className="lp-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Time logs this week</p>
                                            <div className="mt-3 space-y-2">
                                                {[
                                                    { code: 'PL-2041', name: 'A. Morgan', status: 'Approved', tone: 'bg-emerald-400/15 text-emerald-300' },
                                                    { code: 'PL-2037', name: 'R. Chen', status: 'Pending', tone: 'bg-amber-400/15 text-amber-300' },
                                                    { code: 'PL-2029', name: 'S. Patel', status: 'Invoiced', tone: 'bg-violet-400/15 text-violet-300' },
                                                    { code: 'PL-2016', name: 'J. Rivera', status: 'Approved', tone: 'bg-emerald-400/15 text-emerald-300' },
                                                ].map((row) => (
                                                    <div key={row.code} className="flex items-center justify-between rounded-[12px] bg-white/[0.02] px-3 py-2.5">
                                                        <div className="flex items-center gap-3">
                                                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-[11px] font-semibold text-white">
                                                                {row.name.split(' ').map(p => p[0]).join('').replace('.', '')}
                                                            </span>
                                                            <div>
                                                                <p className="text-sm text-white/85">{row.name}</p>
                                                                <p className="lp-mono text-[10px] text-white/40">{row.code}</p>
                                                            </div>
                                                        </div>
                                                        <span className={`rounded-full px-2.5 py-1 text-[11px] ${row.tone}`}>{row.status}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="rounded-[18px] border border-white/[0.07] bg-white/[0.03] p-4">
                                            <p className="lp-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Earned vs paid</p>
                                            <div className="mt-4 flex h-40 items-end gap-2">
                                                {[62, 78, 55, 90, 72, 84, 68, 95].map((h, i) => (
                                                    <div key={i} className="flex h-full flex-1 items-end gap-0.5">
                                                        <span className="lp-bar w-1/2 rounded-t-[4px] bg-violet-400/70" style={{ height: `${h}%`, animationDelay: `${i * 0.15}s` }} />
                                                        <span className="lp-bar w-1/2 rounded-t-[4px] bg-cyan-300/70" style={{ height: `${h - 8}%`, animationDelay: `${i * 0.15 + 0.3}s` }} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="lp-scan" aria-hidden="true" />
                        </div>
                        <p className="mt-5 text-center text-xs text-white/35">Illustrative preview with sample data.</p>
                    </div>
                </div>
            </section>

            {/* ── Workflow ───────────────────────────────────────────────── */}
            <section id="workflow" className="relative scroll-mt-24 px-5 py-28 sm:px-8">
                <div className="lp-section-glow left-1/3 top-10 h-96 w-96 bg-fuchsia-600/25" aria-hidden="true" />
                <div className="relative mx-auto max-w-7xl">
                    <SectionHeading
                        eyebrow="Workflow"
                        title={<>From first hire to <span className="lp-gradient-text">final pay audit.</span></>}
                        text="Eight connected stages, each feeding the next with the same trusted data."
                    />

                    <div className="relative mt-16">
                        <div className="lp-pipeline-line absolute left-0 right-0 top-[27px] hidden h-px lg:block" aria-hidden="true" />
                        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                            {WORKFLOW.map((stage, i) => (
                                <div key={stage.step} className="lp-reveal relative" style={{ '--d': `${(i % 4) * 90}ms` }}>
                                    <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full border border-violet-400/40 bg-[#0b0d1d]">
                                        <span className="lp-node flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400">
                                            <span className="lp-mono text-xs font-semibold text-white">{stage.step}</span>
                                        </span>
                                    </div>
                                    <div className="lp-glass mt-5 rounded-[22px] p-6">
                                        <h3 className="lp-display text-xl font-semibold text-white">{stage.title}</h3>
                                        <p className="mt-2 text-sm leading-relaxed text-white/60">{stage.text}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Roles ──────────────────────────────────────────────────── */}
            <section id="roles" className="relative scroll-mt-24 px-5 py-28 sm:px-8">
                <div className="relative mx-auto max-w-7xl">
                    <SectionHeading
                        eyebrow="Role workspaces"
                        title={<>Five workspaces. <span className="lp-gradient-text">Exactly the right tools.</span></>}
                        text="Each person signs in to a workspace shaped around their job — nothing missing, nothing they should not see."
                    />

                    <div className="mt-16 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
                        {ROLES.map((role, i) => (
                            <div key={role.title} className="lp-reveal" style={{ '--d': `${i * 80}ms` }}>
                                <TiltCard className="lp-glass lp-glow-border flex h-full flex-col rounded-[26px] p-6">
                                    <div className="lp-lift flex h-full flex-col">
                                        <IconOrb icon={role.icon} />
                                        <h3 className="lp-display mt-6 text-xl font-semibold text-white">{role.title}</h3>
                                        <p className="mt-2 text-sm leading-relaxed text-white/60">{role.text}</p>
                                        <ul className="mt-6 space-y-2 border-t border-white/[0.07] pt-5">
                                            {role.access.map((item) => (
                                                <li key={item} className="flex items-center gap-2 text-sm text-white/75">
                                                    <CheckCircle2 size={14} className="shrink-0 text-cyan-300" />
                                                    {item}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </TiltCard>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Security & engine ──────────────────────────────────────── */}
            <section id="security" className="relative scroll-mt-24 px-5 py-28 sm:px-8">
                <div className="lp-section-glow right-[10%] top-24 h-80 w-80 bg-violet-600/30" aria-hidden="true" />
                <div className="relative mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.9fr_1.4fr]">
                    <div className="lg:sticky lg:top-32 lg:self-start">
                        <SectionHeading
                            eyebrow="Security & engine"
                            title={<>Built to be <span className="lp-gradient-text">trusted.</span></>}
                            text="The quiet machinery that keeps sensitive people and payroll data protected, and keeps the work moving on time."
                        />
                        <div className="lp-reveal relative mt-12 hidden h-64 lg:block" aria-hidden="true">
                            <div className="lp-ring inset-0 animate-[spin_30s_linear_infinite]" />
                            <div className="lp-ring inset-8 animate-[spin_22s_linear_infinite_reverse] border-cyan-300/25" />
                            <div className="lp-ring inset-16 animate-[spin_16s_linear_infinite] border-fuchsia-400/25" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className="flex h-24 w-24 items-center justify-center rounded-[26px] bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-[0_0_60px_rgba(124,92,255,0.6)]">
                                    <ShieldCheck size={44} className="text-white" />
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        {CAPABILITIES.map((cap, i) => (
                            <div key={cap.title} className="lp-reveal" style={{ '--d': `${(i % 2) * 90}ms` }}>
                                <div className="lp-glass lp-glow-border h-full rounded-[22px] p-6 transition-transform duration-300 hover:-translate-y-1">
                                    <cap.icon size={22} className="text-cyan-300" />
                                    <h3 className="lp-display mt-4 text-lg font-semibold text-white">{cap.title}</h3>
                                    <p className="mt-2 text-sm leading-relaxed text-white/60">{cap.text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Call to action ─────────────────────────────────────────── */}
            <section className="relative px-5 pb-24 pt-10 sm:px-8">
                <div className="lp-reveal lp-glass relative mx-auto max-w-6xl overflow-hidden rounded-[36px] px-8 py-20 text-center sm:px-16">
                    <div className="lp-aurora opacity-80" aria-hidden="true" />
                    <div className="lp-grid-floor opacity-40" aria-hidden="true" />
                    <div className="relative">
                        <BrandMark size={60} className="mx-auto drop-shadow-[0_12px_36px_rgba(124,92,255,0.7)]" />
                        <h2 className="lp-display mx-auto mt-8 max-w-3xl text-4xl font-bold leading-[1.05] text-white sm:text-6xl">
                            Your operation, <span className="lp-neon-text">in perfect orbit.</span>
                        </h2>
                        <p className="mx-auto mt-6 max-w-xl text-base text-white/60 sm:text-lg">
                            Sign in to your workspace and pick up exactly where your team left off.
                        </p>
                        <button type="button" onClick={goLogin} className="lp-btn-primary group mt-10 inline-flex items-center gap-2 rounded-full px-8 py-4 text-base font-semibold">
                            Login to HR Operations <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                        </button>
                    </div>
                </div>
            </section>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <footer className="relative border-t border-white/[0.06] px-5 py-10 sm:px-8">
                <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
                    <div className="flex items-center gap-2.5">
                        <BrandMark size={28} />
                        <span className="lp-display text-sm font-semibold text-white">HR Operations</span>
                    </div>
                    <nav className="flex flex-wrap justify-center gap-1">
                        {NAV_LINKS.map((link) => (
                            <button key={link.id} type="button" onClick={() => scrollTo(link.id)} className="rounded-full px-3 py-1.5 text-sm text-white/45 hover:text-white">
                                {link.label}
                            </button>
                        ))}
                    </nav>
                    <p className="lp-mono text-xs text-white/35">© {new Date().getFullYear()} HR Operations</p>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
