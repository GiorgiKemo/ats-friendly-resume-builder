import React from 'react';

/**
 * The ResumeATS character: a friendly job seeker drawn in the brand palette.
 * Moods: "idle" (gentle bob), "wave" (hello) and "celebrate" (jumping, arms up).
 * Motion lives in src/styles/brand-animations.css and respects reduced motion.
 */
const Mascot = ({ mood = 'idle', className = '', skin = '#f2c4a0', hair = '#1e293b', shirt = '#2563eb' }) => (
  <svg
    viewBox="0 0 200 250"
    className={`mascot ${className}`}
    data-mood={mood}
    aria-hidden="true"
    focusable="false"
  >
    <ellipse cx="100" cy="244" rx="56" ry="6" fill="#0f172a" opacity="0.08" />
    <g className="mascot-body">
      {/* Left arm (behind the torso) */}
      <g className="mascot-limb mascot-arm-left">
        <path d="M62 170 L40 136" stroke={shirt} strokeWidth="17" strokeLinecap="round" />
        <path d="M40 136 L33 104" stroke={skin} strokeWidth="13" strokeLinecap="round" />
        <circle cx="32" cy="99" r="9" fill={skin} />
      </g>

      {/* Torso with a collar */}
      <path d="M52 250 C52 192 70 160 100 160 C130 160 148 192 148 250 Z" fill={shirt} />
      <path d="M86 161 L100 182 L114 161" fill="#ffffff" opacity="0.9" />
      <rect x="92" y="128" width="16" height="26" rx="7" fill={skin} />

      {/* Right arm (in front) */}
      <g className="mascot-limb mascot-arm-right">
        <path d="M138 170 L160 136" stroke={shirt} strokeWidth="17" strokeLinecap="round" />
        <path d="M160 136 L167 104" stroke={skin} strokeWidth="13" strokeLinecap="round" />
        <circle cx="168" cy="99" r="9" fill={skin} />
      </g>

      <g className="mascot-head">
        <circle cx="62" cy="106" r="7" fill={skin} />
        <circle cx="138" cy="106" r="7" fill={skin} />
        <circle cx="100" cy="100" r="39" fill={skin} />
        <path d="M60 99 C57 64 80 50 102 50 C126 50 145 66 141 97 C133 82 118 76 101 78 C85 79 70 87 60 99 Z" fill={hair} />
        <ellipse className="mascot-eye" cx="86" cy="104" rx="4.2" ry="5.2" fill="#0f172a" />
        <ellipse className="mascot-eye" cx="114" cy="104" rx="4.2" ry="5.2" fill="#0f172a" />
        <circle cx="76" cy="117" r="5.5" fill="#fb7185" opacity="0.35" />
        <circle cx="124" cy="117" r="5.5" fill="#fb7185" opacity="0.35" />
        <path className="mascot-mouth-smile" d="M88 118 Q100 129 112 118" stroke="#0f172a" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        <g className="mascot-mouth-open">
          <path d="M87 116 Q100 136 113 116 Z" fill="#7f1d1d" />
          <path d="M93 126 Q100 131 107 126 Q100 122 93 126 Z" fill="#fb7185" />
        </g>
      </g>
    </g>
  </svg>
);

export default Mascot;
