/** HR Operations product mark: a faceted hexagon carrying an "H" monogram. */
const BrandMark = ({ size = 36, className = '' }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        className={className}
        aria-hidden="true"
    >
        <defs>
            <linearGradient id="nx-brand-fill" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
                <stop stopColor="#7C5CFF" />
                <stop offset="0.55" stopColor="#B14DFF" />
                <stop offset="1" stopColor="#22D3EE" />
            </linearGradient>
            <linearGradient id="nx-brand-stroke" x1="24" y1="12" x2="24" y2="36" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFFFFF" stopOpacity="0.98" />
                <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.6" />
            </linearGradient>
        </defs>
        <path d="M24 2.5 43 13.5v21L24 45.5 5 34.5v-21L24 2.5Z" fill="url(#nx-brand-fill)" />
        <path d="M24 2.5 43 13.5 24 24.5 5 13.5 24 2.5Z" fill="#FFFFFF" fillOpacity="0.16" />
        <path d="M24 24.5v21L5 34.5v-21l19 11Z" fill="#000000" fillOpacity="0.12" />
        <path d="M17 16.5v15M31 16.5v15M17 24h14" stroke="url(#nx-brand-stroke)" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
);

export default BrandMark;
