import { useState } from 'react';
import { UserPlus, Loader2, AlertTriangle } from 'lucide-react';
import { managementAPI } from '../../../api/apiService';
import BaseModal from '../../../components/ui/BaseModal';

const AddHRModal = ({ isOpen, onClose, onRefresh, role = 'HR' }) => {
    const [formData, setFormData] = useState({
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        role: role
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!formData.first_name || !formData.last_name || !formData.email || !formData.password) {
            return setError('All fields are required.');
        }

        setLoading(true);
        try {
            await managementAPI.createTeamMember(formData); 
            onRefresh();
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || `Failed to create ${role.replace('_', ' ')}.`);
        } finally {
            setLoading(false);
        }
    };

    const displayRole = role === 'ORG_ADMIN' ? 'Admin' : role === 'ACCOUNTANT' ? 'Accountant' : 'HR Representative';

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} icon={<UserPlus size={16} />} title={`Add New ${displayRole}`}>
            <div className="space-y-4">
                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100">
                        <AlertTriangle size={16} /> {error}
                    </div>
                )}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">First Name *</label>
                        <input 
                            type="text" 
                            value={formData.first_name} 
                            onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                            className="w-full p-3 bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) rounded-xl text-sm outline-none focus:border-(--brand-primary)"
                            placeholder="John"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Last Name *</label>
                        <input 
                            type="text" 
                            value={formData.last_name} 
                            onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                            className="w-full p-3 bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) rounded-xl text-sm outline-none focus:border-(--brand-primary)"
                            placeholder="Doe"
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Email Address *</label>
                    <input 
                        type="email" 
                        value={formData.email} 
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        className="w-full p-3 bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) rounded-xl text-sm outline-none focus:border-(--brand-primary)"
                        placeholder="name@company.com"
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Temporary Password *</label>
                    <input 
                        type="password" 
                        value={formData.password} 
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        className="w-full p-3 bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) rounded-xl text-sm outline-none focus:border-(--brand-primary)"
                        placeholder="Create a temporary password"
                    />
                </div>
                
                <div className="pt-2 flex justify-end gap-3 w-full">
                    <button type="button" onClick={onClose} disabled={loading} className="px-5 py-2.5 text-xs font-bold text-(--text-main) bg-(--bg-surface) border border-(--border-subtle) hover:opacity-80 rounded-xl uppercase tracking-widest transition-all outline-none">
                        Cancel
                    </button>
                    <button type="submit" onClick={handleSubmit} disabled={loading} className="px-6 py-2.5 text-xs font-bold text-white bg-(--brand-primary) hover:opacity-90 rounded-xl uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm">
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                        Save {displayRole}
                    </button>
                </div>
            </div>
        </BaseModal>
    );
};

export default AddHRModal;