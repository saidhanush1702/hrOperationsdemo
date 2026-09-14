import { useState, useEffect } from 'react';
import { PlusCircle, Loader2, AlertTriangle } from 'lucide-react';
import BaseModal from '../../../components/ui/BaseModal';
import { managementAPI } from '../../../api/apiService';
import AmountInput from '../../../components/ui/AmountInput';
import { getEasternDateString } from '../../../utils/dateUtils';

const AddAdjustmentModal = ({ onClose, onRefresh }) => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    const [formData, setFormData] = useState({
        employee_id: '',
        type: 'PAYOUT', // 'PAYOUT' or 'DEDUCTION'
        amount: '',
        adjustment_date: getEasternDateString(),
        description: ''
    });

    useEffect(() => {
        // Fetch employees to populate the dropdown
        const fetchEmployees = async () => {
            try {
                const res = await managementAPI.getEmployees();
                // Filter only standard employees
                setEmployees(res.data.filter(e => e.role === 'EMPLOYEE' && e.is_active));
            } catch (err) {
                console.error("Failed to load employees", err);
            }
        };
        fetchEmployees();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.employee_id || !formData.amount || !formData.description) {
            return setError("Please fill out all required fields.");
        }
        
        setLoading(true);
        setError('');

        try {
            // Note: You must add this endpoint to your API service and Backend
            await managementAPI.addBalanceAdjustment(formData);
            onRefresh();
            onClose();
        } catch (err) {
            setError(err.response?.data?.error || "Failed to add adjustment.");
            setLoading(false);
        }
    };

    const footer = (
        <div className="flex justify-end gap-3 w-full">
            <button type="button" onClick={onClose} disabled={loading} className="px-5 py-2.5 text-xs font-bold text-(--text-main) bg-(--bg-surface) border border-(--border-subtle) hover:opacity-80 rounded-xl uppercase tracking-widest transition-all outline-none">
                Cancel
            </button>
            <button type="submit" onClick={handleSubmit} disabled={loading} className="px-6 py-2.5 text-xs font-bold text-white bg-(--brand-primary) hover:opacity-90 rounded-xl uppercase tracking-widest transition-all flex items-center gap-2 shadow-sm">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
                Add Adjustment
            </button>
        </div>
    );

    return (
        <BaseModal isOpen={true} onClose={!loading ? onClose : undefined} icon={<PlusCircle size={16} />} title="Add Manual Adjustment" footer={footer}>
            <div className="space-y-4">
                {error && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-100">
                        <AlertTriangle size={16} /> {error}
                    </div>
                )}
                
                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Employee *</label>
                    <select 
                        value={formData.employee_id} 
                        onChange={(e) => setFormData({...formData, employee_id: e.target.value})}
                        className="w-full p-3 bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) rounded-xl text-sm outline-none focus:border-(--brand-primary)"
                    >
                        <option value="">Select an Employee...</option>
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.first_name} {emp.last_name} ({emp.employee_code})</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Adjustment Type</label>
                        <select 
                            value={formData.type} 
                            onChange={(e) => setFormData({...formData, type: e.target.value})}
                            className="w-full p-3 bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) rounded-xl text-sm outline-none focus:border-(--brand-primary) font-semibold"
                        >
                            <option value="PAYOUT">Payout (Reimbursement/Bonus)</option>
                            <option value="DEDUCTION">Deduction (Advance/Fee)</option>
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Date *</label>
                        <input 
                            type="date" 
                            value={formData.adjustment_date} 
                            onChange={(e) => setFormData({...formData, adjustment_date: e.target.value})}
                            className="w-full p-3 bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) rounded-xl text-sm outline-none focus:border-(--brand-primary)"
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Amount ($) *</label>
                    <AmountInput
                        value={formData.amount}
                        onChange={v => setFormData({...formData, amount: v})}
                        className="w-full p-3 bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) rounded-xl text-sm outline-none focus:border-(--brand-primary)"
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-wider">Description *</label>
                    <textarea 
                        rows="2"
                        placeholder="e.g. Travel reimbursement, visa fee deduction..."
                        value={formData.description} 
                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                        className="w-full p-3 bg-(--bg-surface) border border-(--border-subtle) text-(--text-main) rounded-xl text-sm outline-none focus:border-(--brand-primary) resize-none"
                    />
                </div>
            </div>
        </BaseModal>
    );
};

export default AddAdjustmentModal;