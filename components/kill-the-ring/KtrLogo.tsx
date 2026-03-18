'use client'

import { memo } from 'react'

interface KtrLogoProps {
  className?: string
}

/**
 * KTR brand logo — frequency analyzer crosshair + equalizer bars.
 * Bars use hardcoded primary blue (#4B92FF) for vibrant color.
 * Crosshair uses currentColor so it adapts to parent text color.
 * Derived from public/icon.svg (dark scheme, background removed).
 */
export const KtrLogo = memo(function KtrLogo({ className }: KtrLogoProps) {
  return (
    <svg viewBox="18 16 144 106" className={className} fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="ktr-glow" cx="90" cy="54" r="50" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4B92FF" stopOpacity="0.20" />
          <stop offset="1" stopColor="#4B92FF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── Radial glow behind crosshair ──────────────── */}
      <rect x="18" y="16" width="144" height="106" fill="url(#ktr-glow)" />

      {/* ── Crosshair target (uses currentColor) ─────── */}
      <circle cx="90" cy="46.5" r="19.7" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" />
      <line x1="90" y1="20.8" x2="90" y2="39.7" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" />
      <line x1="90" y1="53.4" x2="90" y2="72.2" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" />
      <line x1="64.3" y1="46.5" x2="83.1" y2="46.5" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" />
      <line x1="96.9" y1="46.5" x2="115.7" y2="46.5" stroke="currentColor" strokeOpacity="0.75" strokeWidth="1.5" />
      <circle cx="90" cy="46.5" r="2" fill="currentColor" />

      {/* ── Equalizer bars (hardcoded primary blue) ──── */}
      <rect x="28.0" y="110.6" width="2.4" height="6.7" rx="1.1" fill="#4B92FF" fillOpacity="0.60" />
      <rect x="34.1" y="107.2" width="2.4" height="10.0" rx="1.1" fill="#4B92FF" fillOpacity="0.63" />
      <rect x="40.2" y="104.7" width="2.4" height="12.5" rx="1.1" fill="#4B92FF" fillOpacity="0.65" />
      <rect x="46.3" y="100.6" width="2.4" height="16.6" rx="1.1" fill="#4B92FF" fillOpacity="0.68" />
      <rect x="52.3" y="102.2" width="2.4" height="15.0" rx="1.1" fill="#4B92FF" fillOpacity="0.66" />
      <rect x="58.4" y="96.4" width="2.4" height="20.8" rx="1.1" fill="#4B92FF" fillOpacity="0.72" />
      <rect x="64.5" y="92.3" width="2.4" height="24.9" rx="1.1" fill="#4B92FF" fillOpacity="0.76" />
      <rect x="70.6" y="85.6" width="2.4" height="31.6" rx="1.1" fill="#4B92FF" fillOpacity="0.80" />
      <rect x="76.7" y="75.6" width="2.4" height="41.6" rx="1.1" fill="#4B92FF" fillOpacity="0.86" />
      <rect x="82.7" y="63.2" width="2.4" height="54.1" rx="1.1" fill="#4B92FF" fillOpacity="0.93" />
      <rect x="88.8" y="34.1" width="2.4" height="83.2" rx="1.1" fill="#4B92FF" fillOpacity="1.00" />
      <rect x="94.9" y="65.7" width="2.4" height="51.6" rx="1.1" fill="#4B92FF" fillOpacity="0.92" />
      <rect x="101.0" y="77.3" width="2.4" height="39.9" rx="1.1" fill="#4B92FF" fillOpacity="0.84" />
      <rect x="107.1" y="88.1" width="2.4" height="29.1" rx="1.1" fill="#4B92FF" fillOpacity="0.78" />
      <rect x="113.1" y="93.9" width="2.4" height="23.3" rx="1.1" fill="#4B92FF" fillOpacity="0.74" />
      <rect x="119.2" y="98.9" width="2.4" height="18.3" rx="1.1" fill="#4B92FF" fillOpacity="0.70" />
      <rect x="125.3" y="102.2" width="2.4" height="15.0" rx="1.1" fill="#4B92FF" fillOpacity="0.66" />
      <rect x="131.4" y="105.6" width="2.4" height="11.6" rx="1.1" fill="#4B92FF" fillOpacity="0.64" />
      <rect x="137.5" y="108.1" width="2.4" height="9.1" rx="1.1" fill="#4B92FF" fillOpacity="0.62" />
      <rect x="143.5" y="109.7" width="2.4" height="7.5" rx="1.1" fill="#4B92FF" fillOpacity="0.61" />
      <rect x="149.6" y="112.2" width="2.4" height="5.0" rx="1.1" fill="#4B92FF" fillOpacity="0.60" />

      {/* ── Baseline ─────────────────────────────────── */}
      <line x1="22" y1="117.2" x2="158" y2="117.2" stroke="#4B92FF" strokeOpacity="0.40" strokeWidth="1" />
    </svg>
  )
})
