import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '../../api/apiService';
import { ROUTES, ROLES } from '../../utils/constants';
import ForgotPassword from './ForgotPassword';

/** Where each role lands after signing in. Anything else falls back to the portal. */
export const HOME_FOR_ROLE = {
    [ROLES.SUPER_ADMIN]: ROUTES.SUPER_ADMIN_DASHBOARD,
    [ROLES.ORG_ADMIN]:   ROUTES.MANAGEMENT_DASHBOARD,
    [ROLES.HR]:          ROUTES.MANAGEMENT_DASHBOARD,
    [ROLES.ACCOUNTANT]:  ROUTES.MANAGEMENT_DASHBOARD,
};

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

    const field = 'w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm '
        + 'text-slate-900 placeholder:text-slate-400 outline-none transition-colors '
        + 'focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

    return (
        <div className="min-h-screen w-full bg-white">
            {/* Full-bleed: no card, no surrounding page gutter — the two columns
                fill the whole viewport. On mobile the logo stacks above the form
                so it is never squeezed into an unreadable strip. */}
            <div className="grid min-h-screen w-full grid-cols-1 items-center gap-10 px-6 py-12
                            sm:px-10 lg:grid-cols-2 lg:gap-20 lg:px-20">

                    {/* brand — first on mobile, second on desktop */}
                    <div className="order-first flex justify-center lg:order-last">
                        <h1 className="text-center text-4xl font-bold tracking-tight text-(--text-main) sm:text-5xl lg:text-6xl">
                            HR Operations
                        </h1>
                    </div>

                    {/* form */}
                    <div className="mx-auto w-full max-w-md">
                        {!showForgot ? (
                            <>
                                <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                                    Welcome Back!
                                </h1>

                                <form onSubmit={handleSubmit} className="mt-6 sm:mt-8">
                                    {error && (
                                        <div
                                            role="alert"
                                            className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
                                        >
                                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                            <span>{error}</span>
                                        </div>
                                    )}

                                    <label className="block">
                                        <span className="text-sm text-slate-700">
                                            E-mail <span className="text-red-500">*</span>
                                        </span>
                                        <input
                                            type="email"
                                            required
                                            autoComplete="username"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            className={`mt-1.5 ${field}`}
                                            placeholder="Type your Email"
                                        />
                                    </label>

                                    <div className="mt-5">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <label htmlFor="password" className="text-sm text-slate-700">
                                                Password <span className="text-red-500">*</span>
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => setShowForgot(true)}
                                                className="text-sm text-slate-400 hover:text-slate-600 hover:underline"
                                            >
                                                Forgot your password?
                                            </button>
                                        </div>

                                        <div className="relative mt-1.5">
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
                                                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2
                                                           text-slate-400 transition-colors hover:text-slate-600
                                                           focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                                        className="mt-8 flex w-full items-center justify-center gap-2 rounded-full
                                                   bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white
                                                   transition-colors hover:bg-slate-800
                                                   disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                        {submitting ? 'Signing in…' : 'Sign in'}
                                    </button>
                                </form>
                            </>
                        ) : (
                            <ForgotPassword onClose={() => setShowForgot(false)} />
                        )}
                    </div>
            </div>
        </div>
    );
};

export default Login;
