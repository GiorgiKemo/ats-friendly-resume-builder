import React, { useRef } from 'react';
import { useInView } from 'framer-motion';

// 24x24 stroke icons. Every shape gets pathLength=1 so the draw-in animation in
// brand-animations.css works for any geometry.
const ICONS = {
  check: ['M9 12l2 2 4-4', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z'],
  document: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h4'],
  sparkles: ['M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z', 'M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 21h14'],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 13l9 5 9-5', 'M3 17.5l9 5 9-5'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  globe: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 7v5l3 3'],
  briefcase: ['M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z', 'M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2', 'M3 13h18'],
  send: ['M22 2L11 13', 'M22 2l-7 20-4-9-9-4z'],
  target: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0z', 'M12 12h.01'],
  pen: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z', 'M17 21v-8H7v8', 'M7 3v5h8'],
  user: ['M20 21a8 8 0 0 0-16 0', 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'],
  heart: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z'],
};

/**
 * Stroke icon that draws itself the first time it scrolls into view and redraws
 * when its `.group` parent is hovered. Decorative: hidden from screen readers.
 */
const AnimatedIcon = ({ name, className = 'h-6 w-6', strokeWidth = 1.8 }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const paths = ICONS[name] || ICONS.check;
  return (
    <svg
      ref={ref}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`draw-icon ${className}`}
      data-drawn={inView ? 'true' : 'false'}
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => <path key={d} d={d} pathLength="1" />)}
    </svg>
  );
};

export default AnimatedIcon;
