import AmountInput from '../../../components/ui/AmountInput';

// How a placement decides what to pay each period.
//
// The options are NOT shared between pay types, because the two reach the balance
// sheet by opposite routes:
//
//   W2  — HOURS : approved hours x pay rate
//         LCA   : the LCA wage for the period; payroll ACCRUES the difference
//                 (earned - paid) onto the balance sheet as the employee's buffer.
//
//   C2C — HOURS : approved hours x pay rate, the long-standing behaviour
//         FIXED : a flat amount per period. Earnings still reach the balance sheet
//                 the usual C2C way — priced at the pay rate when the invoice is
//                 PAID — and payroll then WITHDRAWS the flat figure from that
//                 accrued balance each period, leaving the remainder carried.
//
// So LCA accrues and FIXED withdraws. Offering either on the wrong pay type would
// post money in the wrong direction, which is why each is confined to its own.
//
// Shared by AddPlacementModal and PlacementDetailModal so the create and edit forms
// can never drift apart — they previously did, which is how an existing placement
// ended up still showing the old checkbox.
const W2_OPTIONS = [
    ['HOURS', 'Hourly',          'approved hours × pay rate'],
    ['LCA',   'As per LCA Wage', 'pay the LCA wage for the period'],
];

const C2C_OPTIONS = [
    ['HOURS', 'Hours × Pay Rate', 'approved hours × pay rate'],
    ['FIXED', 'Fixed Pay',        'pay a flat amount, draw it from the balance sheet'],
];

const PayoutBasisPicker = ({ entry, index, isW2 = true, editable = true, isEditing = true, onChange }) => {
    const OPTIONS = isW2 ? W2_OPTIONS : C2C_OPTIONS;

    // payout_basis is authoritative; fall back to the legacy flag for rows saved
    // before the basis column existed. A basis belonging to the other pay type
    // (a placement switched from W2 to C2C, say) reads as plain hourly.
    const raw   = entry.payout_basis || (entry.run_as_per_lca_wage ? 'LCA' : 'HOURS');
    const basis = OPTIONS.some(([v]) => v === raw) ? raw : 'HOURS';

    const setBasis = (value) => {
        onChange('payout_basis', value);
        // Kept in sync so anything still reading the old flag agrees with the basis.
        onChange('run_as_per_lca_wage', value === 'LCA');
        if (value !== 'FIXED') onChange('fixed_pay_per_period', '');
    };

    return (
        <div className="w-full flex flex-col gap-2 animate-in fade-in slide-in-from-top-2">
            <span className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">
                {isW2 ? 'Payout Basis' : 'C2C Payout Basis'}
            </span>

            <div className="flex flex-col sm:flex-row gap-2">
                {OPTIONS.map(([value, label, hint]) => (
                    <label
                        key={value}
                        title={hint}
                        className={`flex-1 flex items-start gap-2 px-3 py-2 rounded-lg border transition-all ${
                            editable ? 'cursor-pointer' : 'cursor-default opacity-80'
                        } ${
                            basis === value
                                ? 'border-(--brand-primary) bg-(--brand-primary)/5'
                                : 'border-(--border-subtle) hover:border-(--brand-primary)/40'
                        }`}
                    >
                        <input
                            type="radio"
                            name={`payout_basis_${index}`}
                            className="mt-0.5 w-3.5 h-3.5 accent-indigo-600 shrink-0"
                            checked={basis === value}
                            disabled={!editable}
                            onChange={() => setBasis(value)}
                        />
                        <span className="min-w-0">
                            <span className="block text-[10px] font-bold text-(--text-main) uppercase tracking-widest">{label}</span>
                            <span className="block text-[9px] text-(--text-muted) font-bold mt-0.5">{hint}</span>
                        </span>
                    </label>
                ))}
            </div>

            {basis === 'FIXED' && (
                <div className="flex flex-col gap-1 max-w-[260px] animate-in fade-in slide-in-from-top-1">
                    <label className="text-[10px] font-bold text-(--text-muted) uppercase tracking-widest">Fixed Pay / Period *</label>
                    <AmountInput
                        value={entry.fixed_pay_per_period ?? ''}
                        disabled={!isEditing}
                        onChange={v => onChange('fixed_pay_per_period', v)}
                        className="px-3 py-2 text-xs font-bold bg-(--bg-surface) text-(--text-main) border border-(--border-subtle) rounded-lg focus:border-(--brand-primary) outline-none disabled:opacity-60"
                    />
                    <span className="text-[9px] text-(--text-muted) font-bold leading-relaxed">
                        Paid every period regardless of hours worked. Invoice earnings keep accruing
                        to the balance sheet at the pay rate; payroll draws this amount back out and
                        the remainder carries forward.
                    </span>
                </div>
            )}
        </div>
    );
};

export default PayoutBasisPicker;
