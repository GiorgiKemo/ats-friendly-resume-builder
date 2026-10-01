import { useSyncExternalStore } from 'react';

const preference = '(prefers-reduced-motion: reduce)';
const subscribe = (onChange) => {
  const query = window.matchMedia(preference);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const snapshot = () => window.matchMedia(preference).matches;

// Unlike the animation library's initial-value hook, this also updates live.
export default function useHeroReducedMotion() {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
