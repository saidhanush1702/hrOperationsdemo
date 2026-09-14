import { useState } from 'react';

const formatAmount = (raw) => {
    const num = parseFloat(String(raw).replace(/,/g, ''));
    if (isNaN(num)) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const AmountInput = ({ value, onChange, placeholder, className, disabled, readOnly, autoFocus }) => {
    const [focused, setFocused] = useState(false);
    const raw = String(value || '').replace(/,/g, '');
    const display = focused || !raw ? raw : formatAmount(raw);

    return (
        <input
            type="text"
            inputMode="decimal"
            value={display}
            placeholder={placeholder || '0.00'}
            disabled={disabled}
            readOnly={readOnly}
            autoFocus={autoFocus}
            className={className}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onWheel={e => e.target.blur()}
            onChange={e => {
                const val = e.target.value.replace(/,/g, '');
                if (val !== '' && !/^\d*\.?\d*$/.test(val)) return;
                onChange && onChange(val);
            }}
        />
    );
};

export default AmountInput;
