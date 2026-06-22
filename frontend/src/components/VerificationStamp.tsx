// Inline verification stamp SVG component (no build plugin needed)
export function VerificationStampSvg({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
      <defs>
        <clipPath id="stamp-clip">
          <circle cx="60" cy="60" r="56"/>
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="56" fill="none" stroke="#dc2626" strokeWidth="4"
              strokeDasharray="12,4" opacity="0.55"/>
      <circle cx="60" cy="60" r="51" fill="none" stroke="#dc2626" strokeWidth="1.5" opacity="0.4"/>
      <polygon points="60,28 64,48 72,38 68,52 82,48 72,58 82,72 66,68 64,82 60,68 56,82 54,68 38,72 48,58 38,48 52,52 48,38 56,48"
               fill="#dc2626" opacity="0.3"/>
      <path id="top-arc" d="M 20,60 A 40,40 0 0,1 100,60" fill="none"/>
      <text fontSize="9.5" fontWeight="700" letterSpacing="3">
        <textPath href="#top-arc" startOffset="25%" textAnchor="middle" fill="#dc2626" opacity="0.45">
          认 证 通 过
        </textPath>
      </text>
      <path id="bot-arc" d="M 100,60 A 40,40 0 0,1 20,60" fill="none"/>
      <text fontSize="9.5" fontWeight="700" letterSpacing="1">
        <textPath href="#bot-arc" startOffset="23%" textAnchor="middle" fill="#dc2626" opacity="0.4">
          DNS.CCOCC ✓
        </textPath>
      </text>
      <path d="M46,62 l8,8 l20,-20" fill="none" stroke="#dc2626" strokeWidth="4"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
    </svg>
  )
}
