import { useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '../../api/axios';

const ForgotPassword = ({ onClose }) => {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [data, setData] = useState({ email: '', code: '', newPassword: '', confirmPassword: '' });

    const handleSendCode = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/api/auth/forgot-password', { email: data.email });
            setStep(2);
            setMessage({ text: 'Check your email for the code.', type: 'success' });
        } catch (err) {
            setMessage({ text: err.response?.data?.message || 'Error sending code.', type: 'error' });
        } finally { setLoading(false); }
    };

    const handleVerifyCode = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.post('/api/auth/verify-code', { email: data.email, code: data.code });
            setStep(3);
            setMessage({ text: 'Code verified. Enter new password.', type: 'success' });
        } catch (err) {
            setMessage({ text: err.response?.data?.message || 'Invalid code.', type: 'error' });
        } finally { setLoading(false); }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        if (data.newPassword !== data.confirmPassword) {
            return setMessage({ text: 'Passwords do not match.', type: 'error' });
        }
        setLoading(true);
        try {
            await api.post('/api/auth/reset-password', {
                email: data.email, code: data.code, newPassword: data.newPassword
            });
            setMessage({ text: 'Password changed! Please login.', type: 'success' });
            setTimeout(onClose, 2000);
        } catch (err) {
            setMessage({ text: err.response?.data?.message || 'Reset failed.', type: 'error' });
        } finally { setLoading(false); }
    };

    return (
        <div className="space-y-6">
            <button onClick={onClose} className="flex items-center text-(--text-muted) hover:text-(--text-main) transition-colors text-xs font-bold uppercase tracking-widest">
                <ArrowLeft size={14} className="mr-2" /> Back to Login
            </button>

            <div className="text-center">
                <h2 className="text-xl font-bold tracking-tight uppercase italic text-(--text-main) transition-colors duration-300">Reset Password</h2>
                <p className="text-xs text-(--text-muted) mt-1 transition-colors duration-300">Step {step} of 3</p>
            </div>

            {message.text && (
                <div className={`p-3 rounded-lg text-xs font-bold text-center border ${
                    message.type === 'success'
                    ? 'bg-green-500/10 text-green-600 border-green-500/20'
                    : 'bg-red-500/10 text-red-500 border-red-500/20'
                }`}>
                    {message.text}
                </div>
            )}

            {step === 1 && (
                <form onSubmit={handleSendCode} className="space-y-4">
                    <div className="relative group">
                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest block mb-1 ml-1 transition-colors duration-300">Email Address</label>
                        <input
                            type="email" required
                            className="w-full p-3 bg-(--input-bg) text-(--input-text) border border-(--brand-primary)/50 rounded-xl text-sm outline-none focus:border-(--brand-primary) focus:ring-2 focus:ring-(--brand-primary) transition-all placeholder:text-(--input-placeholder)"
                            placeholder="Enter your registered email"
                            value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })}
                        />
                    </div>
                    <button type="submit" disabled={loading} className="w-full py-3 bg-(--brand-primary) text-(--brand-primary-text) text-xs font-bold rounded-xl uppercase tracking-widest hover:opacity-90 flex justify-center focus:ring-4 focus:ring-(--brand-primary)/50 outline-none active:scale-95 transition-all shadow-lg disabled:opacity-50">
                        {loading ? <Loader2 className="animate-spin" /> : 'Send Reset Code'}
                    </button>
                </form>
            )}

            {step === 2 && (
                <form onSubmit={handleVerifyCode} className="space-y-4">
                    <div className="relative group">
                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest block mb-1 ml-1 transition-colors duration-300">Verification Code</label>
                        <input
                            type="text" required maxLength="6"
                            className="w-full p-3 bg-(--input-bg) text-(--input-text) border border-(--brand-primary)/50 rounded-xl text-sm text-center font-bold tracking-[10px] outline-none focus:border-(--brand-primary) focus:ring-2 focus:ring-(--brand-primary) transition-all placeholder:text-(--input-placeholder) placeholder:tracking-normal"
                            placeholder="000000"
                            value={data.code} onChange={(e) => setData({ ...data, code: e.target.value })}
                        />
                    </div>
                    <button type="submit" disabled={loading} className="w-full py-3 bg-(--brand-primary) text-(--brand-primary-text) text-xs font-bold rounded-xl uppercase tracking-widest hover:opacity-90 flex justify-center focus:ring-4 focus:ring-(--brand-primary)/50 outline-none active:scale-95 transition-all shadow-lg disabled:opacity-50">
                        {loading ? <Loader2 className="animate-spin" /> : 'Verify Code'}
                    </button>
                </form>
            )}

            {step === 3 && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest block mb-1 ml-1 transition-colors duration-300">New Password</label>
                            <input
                                type="password" required
                                className="w-full p-3 bg-(--input-bg) text-(--input-text) border border-(--brand-primary)/50 rounded-xl text-sm outline-none focus:border-(--brand-primary) focus:ring-2 focus:ring-(--brand-primary) transition-all placeholder:text-(--input-placeholder)"
                                value={data.newPassword} onChange={(e) => setData({ ...data, newPassword: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest block mb-1 ml-1 transition-colors duration-300">Confirm New Password</label>
                            <input
                                type="password" required
                                className="w-full p-3 bg-(--input-bg) text-(--input-text) border border-(--brand-primary)/50 rounded-xl text-sm outline-none focus:border-(--brand-primary) focus:ring-2 focus:ring-(--brand-primary) transition-all placeholder:text-(--input-placeholder)"
                                value={data.confirmPassword} onChange={(e) => setData({ ...data, confirmPassword: e.target.value })}
                            />
                        </div>
                    </div>
                    <button type="submit" disabled={loading} className="w-full py-3 bg-(--brand-primary) text-(--brand-primary-text) text-xs font-bold rounded-xl uppercase tracking-widest hover:opacity-90 flex justify-center focus:ring-4 focus:ring-(--brand-primary)/50 outline-none active:scale-95 transition-all shadow-lg disabled:opacity-50">
                        {loading ? <Loader2 className="animate-spin" /> : 'Change Password'}
                    </button>
                </form>
            )}
        </div>
    );
};

export default ForgotPassword;
