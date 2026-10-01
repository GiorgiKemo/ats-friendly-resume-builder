import { useEffect, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

/**
 * Steps through a list of durations (ms), looping by default. The timeline only
 * runs while `ref` is on screen and the tab is visible; with reduced motion it
 * rests on the final step so the finished scene is shown without animation.
 */
export default function useSceneTimeline(ref, durations, { loop = true, once = false } = {}) {
  const reduceMotion = useReducedMotion();
  const inView = useInView(ref, { amount: 0.35, once });
  const lastStep = durations.length - 1;
  const [step, setStep] = useState(0);
  const [pageVisible, setPageVisible] = useState(true);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const sync = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const running = !reduceMotion && inView && pageVisible;

  useEffect(() => {
    if (!running) return undefined;
    if (!loop && step >= lastStep) return undefined;
    const timer = setTimeout(() => {
      setStep((current) => (current >= lastStep ? (loop ? 0 : current) : current + 1));
    }, durations[step] ?? 1000);
    return () => clearTimeout(timer);
  }, [running, step, durations, lastStep, loop]);

  return reduceMotion ? lastStep : step;
}
