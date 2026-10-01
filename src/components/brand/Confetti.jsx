import React, { useMemo } from 'react';

const COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#ffffff'];

// Small deterministic generator so the burst looks the same on every render
// (and in prerendered HTML) without relying on Math.random during render.
const seeded = (seed) => {
  let value = seed % 2147483647 || 1;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
};

/**
 * A burst of confetti from a point. Re-mount (change `key`) or toggle `active`
 * to replay. Purely decorative and hidden from assistive technology.
 */
const Confetti = ({ active = true, count = 36, x = '50%', y = '45%', spread = 260, seed = 7, className = '' }) => {
  const pieces = useMemo(() => {
    const random = seeded(seed);
    return Array.from({ length: count }, (_, index) => {
      const angle = random() * Math.PI * 2;
      const distance = spread * (0.35 + random() * 0.65);
      const isRound = random() > 0.7;
      return {
        id: index,
        style: {
          '--x': x,
          '--y': y,
          '--dx': `${Math.cos(angle) * distance}px`,
          '--dy': `${Math.sin(angle) * distance * 0.7 - 60}px`,
          '--rot': `${Math.round(random() * 720 - 360)}deg`,
          '--c': COLORS[Math.floor(random() * COLORS.length)],
          '--w': `${isRound ? 8 : 6 + random() * 6}px`,
          '--h': `${isRound ? 8 : 9 + random() * 8}px`,
          '--r': isRound ? '999px' : '2px',
          '--d': `${1300 + random() * 900}ms`,
          '--delay': `${Math.round(random() * 160)}ms`,
        },
      };
    });
  }, [count, seed, spread, x, y]);

  return (
    <div className={`confetti ${className}`} data-active={active ? 'true' : 'false'} aria-hidden="true">
      {pieces.map((piece) => <span key={piece.id} className="confetti-piece" style={piece.style} />)}
    </div>
  );
};

export default Confetti;
