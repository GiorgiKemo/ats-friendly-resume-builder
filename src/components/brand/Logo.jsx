import React from 'react';

/** Brand mark: a resume page with a check, on the brand blue gradient. */
export const LogoMark = ({ className = 'h-8 w-8' }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="logo-mark-gradient" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#3b82f6" />
        <stop offset="1" stopColor="#4f46e5" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx="9" fill="url(#logo-mark-gradient)" />
    <path d="M10 7.5h8.5L23 12v12.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 9 24.5V9a1.5 1.5 0 0 1 1-1.5Z" fill="#fff" opacity="0.95" />
    <path d="M18.5 7.5V12H23" fill="#c7d2fe" />
    <path d="M12 15.5h6M12 18.5h4" stroke="#93c5fd" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="21.5" cy="22" r="4.6" fill="#10b981" stroke="#fff" strokeWidth="1.4" />
    <path d="m19.6 22.1 1.3 1.3 2.5-2.7" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

/** Mark plus wordmark. */
const Logo = ({ className = '', markClassName = 'h-8 w-8' }) => (
  <span className={`inline-flex items-center gap-2 ${className}`}>
    <LogoMark className={`${markClassName} shrink-0 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-105`} />
    <span className="text-[1.15rem] font-extrabold tracking-tight text-slate-900 dark:text-white">
      Resume<span className="text-blue-600 dark:text-blue-400">ATS</span>
    </span>
  </span>
);

export default Logo;
