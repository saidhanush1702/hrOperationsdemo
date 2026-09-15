import AmountInput from '../../../components/ui/AmountInput';
import { cx } from '../../../components/ui/kit';

// How an engagement decides what to pay each period.
//
// The options are NOT shared between pay types, because the two reach the ledger
// by opposite routes:
//
//   W2  — HOURS : approved hours x pay rate
//         LCA   : the LCA wage for the period; pay runs ACCRUE the difference
//                 (earned - paid) onto the ledger as the consultant's buffer.
//
//   C2C — HOURS : approved hours x pay rate, the long-standing behaviour
//         FIXED : a flat amount per period. Earnings still reach the ledger the
//                 usual C2C way — priced at the pay rate when the invoice is PAID —
//                 and pay runs then WITHDRAW the flat figure from that accrued
//                 balance each period, leaving the remainder carried.
//
// So LCA accrues and FIXED withdraws. Offering either on the wrong pay type would
// post money in the wrong direction, which is why each is confined to its own.
//
// Shared by the create and detail views so the two forms can never drift apart.
const W2_OPTIONS = [
    ['HOURS', 'Hourly',          'Approved hours × pay rate'],
    ['LCA',   'As per LCA wage', 'Pay the LCA wage for the period'],
];

const C2C_OPTIONS = [
    ['HOURS', 'Hours × pay rate', 'Approved hours × pay rate'],
    ['FIXED', 'Fixed pay',        'Pay a flat amount, drawn from the ledger'],
];

const PayoutBasisPicker = ({ entry, index, isW2 = true, editable = true, isEditing = true, onChange }) => {
    const OPTIONS = isW2 ? W2_OPTIONS : C2C_OPTIONS;

    // payout_basis is authoritative; fall back to the legacy flag for rows saved
    // before the basis column existed. A basis belonging to the other pay type
    // reads as plain hourly.
    const raw   = entry.payout_basis || (entry.run_as_per_lca_wage ? 'LCA' : 'HOURS');
    const basis = OPTIONS.some(([v]) => v === raw) ? raw : 'HOURS';

    const setBasis = (value) => {
        onChange('payout_basis', value);
        // Kept in sync so anything still reading the old flag agrees with the basis.
        onChange('run_as_per_lca_wage', value === 'LCA');
        if (value !== 'FIXED') onChange('fixed_pay_per_period', '');
    };

    return (
        <div className="flex w-full flex-col gap-2">
            <span className="nx-label mb-0">{isW2 ? 'Payout basis' : 'C2C payout basis'}</span>

            <div className="grid gap-2 sm:grid-cols-2">
                {OPTIONS.map(([value, label, hint]) => {
                    const on = basis === value;
                    return (
                        <label
                            key={value}
                            title={hint}
                            className={cx(
                                'flex items-start gap-3 rounded-[14px] border px-3 py-2.5 transition-all',
                                editable ? 'cursor-pointer' : 'cursor-default opacity-80',
                                on ? 'border-(--brand-primary) bg-(--brand-primary)/8' : 'border-(--border-subtle) hover:border-(--brand-primary)/40',
                            )}
                        >
                            <input
                                type="radio"
                                name={`payout_basis_${index}`}
                                className="sr-only"
                                checked={on}
                                disabled={!editable}
                                onChange={() => setBasis(value)}
                            />
                            <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-transparent' : 'border-(--border-subtle)')} style={on ? { background: 'var(--brand-gradient)' } : undefined}>
                                {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                            </span>
                            <span className="min-w-0">
                                <span className="block text-sm font-semibold text-(--text-main)">{label}</span>
                                <span className="block text-[11px] text-(--text-muted)">{hint}</span>
                            </span>
                        </label>
                    );
                })}
            </div>

            {basis === 'FIXED' && (
                <div className="flex max-w-[280px] flex-col gap-1">
                    <span className="nx-label mb-0">Fixed pay / period *</span>
                    <AmountInput
                        value={entry.fixed_pay_per_period ?? ''}
                        disabled={!isEditing}
                        onChange={v => onChange('fixed_pay_per_period', v)}
                        className="nx-input"
                    />
                    <span className="text-[11px] leading-relaxed text-(--text-muted)">
                        Paid every period regardless of hours worked. Invoice earnings keep accruing to
                        the ledger at the pay rate; pay runs draw this amount back out and the remainder
                        carries forward.
                    </span>
                </div>
            )}
        </div>
    );
};

export default PayoutBasisPicker;
