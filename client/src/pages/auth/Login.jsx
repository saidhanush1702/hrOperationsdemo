import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, Eye, EyeOff, ArrowLeft, ArrowRight, ShieldCheck, Zap, Wallet, Mail, Lock } from 'lucide-react';
import { authAPI } from '../../api/apiService';
import { ROUTES, ROLES } from '../../utils/constants';
import ForgotPassword from './ForgotPassword';
import BrandMark from '../../components/brand/BrandMark';

/** Where each role lands after signing in. Anything else falls back to the portal. */
export const HOME_FOR_ROLE = {
    [ROLES.SUPER_ADMIN]: ROUTES.SUPER_ADMIN_DASHBOARD,
    [ROLES.ORG_ADMIN]:   ROUTES.MANAGEMENT_DASHBOARD,
    [ROLES.HR]:          ROUTES.MANAGEMENT_DASHBOARD,
    [ROLES.ACCOUNTANT]:  ROUTES.MANAGEMENT_DASHBOARD,
};

const HIGHLIGHTS = [
    { icon: ShieldCheck, title: 'Role-based workspaces', text: 'Workspace admins, talent ops, finance leads and consultants each get exactly the tools they need.' },
    { icon: Zap,         title: 'Time to invoice, automated', text: 'Approved time logs flow straight into billing, pay runs and ledgers.' },
    { icon: Wallet,      title: 'Money in full view', text: 'Balances, payments and pay audits, always current.' },
];

const Login = () => {
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showForgot, setShowForgot] = useState(false);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const res = await authAPI.login({ email: email.trim(), password });
            const { user } = res.data;
            localStorage.setItem('userRole', user.role);
            localStorage.setItem('userName', user.name);
            navigate(HOME_FOR_ROLE[user.role] ?? ROUTES.PORTAL_DASHBOARD, { replace: true });
        } catch (err) {
            setError(err.response?.data?.message || 'Invalid credentials.');
        } finally {
            setSubmitting(false);
        }
    };

    const field = 'w-full h-12 rounded-[14px] border border-white/10 bg-(--input-bg) pl-11 pr-4 text-sm '
        + 'text-(--input-text) placeholder:text-(--input-placeholder) outline-none transition-all '
        + 'hover:border-white/20';

    return (
        <div className="nx-auth relative min-h-screen w-full overflow-hidden bg-[#05060d] text-(--text-main)">
            <div className="nx-auth-bg" aria-hidden="true" />

            <div className="relative z-10 grid min-h-screen lg:grid-cols-[1.15fr_1fr]">

                {/* Story panel */}
                <aside className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex xl:p-16">
                    {/* orbital rig */}
                    <div className="pointer-events-none absolute -right-40 top-1/2 h-[640px] w-[640px] -translate-y-1/2" aria-hidden="true">
                        <div className="nx-spin-slow absolute inset-0 rounded-full border border-violet-400/20">
                            <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-400 shadow-[0_0_18px_6px_rgba(139,123,255,0.6)]" />
                        </div>
                        <div className="nx-spin-rev absolute inset-[90px] rounded-full border border-cyan-300/20">
                            <span className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_16px_5px_rgba(34,211,238,0.55)]" />
                        </div>
                        <div className="nx-spin-slow absolute inset-[190px] rounded-full border border-fuchsia-400/20">
                            <span className="absolute left-0 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-400 shadow-[0_0_16px_5px_rgba(217,70,239,0.5)]" />
                        </div>
                        <div className="absolute inset-[250px] rounded-full bg-[radial-gradient(circle,rgba(139,123,255,0.45),transparent_70%)] blur-xl" />
                    </div>

                    <Link to="/" className="relative inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 backdrop-blur transition-colors hover:border-white/25 hover:text-white">
                        <ArrowLeft size={15} /> Back to home
                    </Link>

                    <div className="relative max-w-xl">
                        <BrandMark size={52} className="drop-shadow-[0_10px_30px_rgba(124,92,255,0.6)]" />
                        <p className="mt-8 font-mono text-xs uppercase tracking-[0.3em] text-cyan-300/80">Operations console</p>
                        <h1 className="mt-4 text-5xl font-extrabold leading-[1.02] tracking-[-0.035em] text-white xl:text-6xl" style={{ fontFamily: 'var(--font-display)' }}>
                            Every engagement.<br />
                            <span className="nx-gradient-text">Every hour. Every dollar.</span>
                        </h1>
                        <p className="mt-6 max-w-md text-base leading-relaxed text-white/60">
                            Sign in to manage your talent, approve time logs, send invoices and run pay runs from one secure console.
                        </p>

                        <ul className="mt-10 space-y-3">
                            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
                                <li key={title} className="flex items-start gap-4 rounded-[18px] border border-white/[0.07] bg-white/[0.03] p-4 backdrop-blur">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-white" style={{ background: 'var(--brand-gradient)' }}>
                                        <Icon size={18} />
                                    </span>
                                    <span>
                                        <span className="block text-sm font-semibold text-white">{title}</span>
                                        <span className="mt-0.5 block text-sm text-white/55">{text}</span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <p className="relative font-mono text-xs text-white/35">© {new Date().getFullYear()} HR Operations</p>
                </aside>

                {/* Sign-in card */}
                <main className="flex items-center justify-center px-5 py-10 sm:px-10">
                    <div className="w-full max-w-[460px]">
                        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white lg:hidden">
                            <ArrowLeft size={15} /> Back to home
                        </Link>

                        <div className="nx-auth-card rounded-[30px] border border-white/10 bg-(--bg-surface) p-7 backdrop-blur-2xl sm:p-10">
                            {!showForgot ? (
                                <>
                                    <div className="flex items-center gap-3">
                                        <BrandMark size={40} />
                                        <div>
                                            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-cyan-300/80">Secure sign-in</p>
                                            <h2 className="text-2xl font-bold tracking-[-0.02em] text-white" style={{ fontFamily: 'var(--font-display)' }}>
                                                Welcome Back!
                                            </h2>
                                        </div>
                                    </div>

                                    <form onSubmit={handleSubmit} className="mt-8">
                                        {error && (
                                            <div
                                                role="alert"
                                                className="mb-5 flex items-start gap-2 rounded-[14px] border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300"
                                            >
                                                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                                <span>{error}</span>
                                            </div>
                                        )}

                                        <label className="block">
                                            <span className="text-sm text-white/70">
                                                E-mail <span className="text-rose-400">*</span>
                                            </span>
                                            <div className="relative mt-2">
                                                <Mail size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
                                                <input
                                                    type="email"
                                                    required
                                                    autoComplete="username"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    className={field}
                                                    placeholder="Type your Email"
                                                />
                                            </div>
                                        </label>

                                        <div className="mt-5">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <label htmlFor="password" className="text-sm text-white/70">
                                                    Password <span className="text-rose-400">*</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowForgot(true)}
                                                    className="text-sm text-violet-300/80 transition-colors hover:text-violet-200"
                                                >
                                                    Forgot your password?
                                                </button>
                                            </div>

                                            <div className="relative mt-2">
                                                <Lock size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
                                                <input
                                                    id="password"
                                                    type={showPassword ? 'text' : 'password'}
                                                    required
                                                    autoComplete="current-password"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    className={`${field} pr-12`}
                                                    placeholder="Type your Password"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword((v) => !v)}
                                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                                    title={showPassword ? 'Hide password' : 'Show password'}
                                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-2
                                                               text-white/40 transition-colors hover:text-white
                                                               focus:outline-none"
                                                >
                                                    {showPassword
                                                        ? <EyeOff className="h-5 w-5" />
                                                        : <Eye className="h-5 w-5" />}
                                                </button>
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="group mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-full
                                                       text-sm font-semibold text-white transition-all hover:brightness-110
                                                       disabled:cursor-not-allowed disabled:opacity-60"
                                            style={{ background: 'var(--brand-gradient)', boxShadow: '0 18px 40px -14px var(--brand-glow)' }}
                                        >
                                            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                            {submitting ? 'Signing in…' : 'Sign in'}
                                            {!submitting && <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />}
                                        </button>
                                    </form>

                                    <p className="mt-8 border-t border-white/[0.07] pt-6 text-center text-xs text-white/40">
                                        Protected by role-based access and secure sessions.
                                    </p>
                                </>
                            ) : (
                                <ForgotPassword onClose={() => setShowForgot(false)} />
                            )}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default Login;
