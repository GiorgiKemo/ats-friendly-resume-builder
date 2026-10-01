import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import useHeroReducedMotion from '../../hooks/useHeroReducedMotion';

/** Flat paper plane, shown when WebGL is unavailable. */
export const PaperPlaneFallback = ({ tone = 'light' }) => (
  <svg viewBox="0 0 200 200" className="paper-plane-fallback" aria-hidden="true">
    <path d="M36 112c34-6 62-20 96-46" fill="none" stroke={tone === 'light' ? '#93c5fd' : 'rgba(255,255,255,.55)'} strokeWidth="3" strokeLinecap="round" strokeDasharray="2 9" />
    <path d="M168 44 58 96l40 14z" fill="#ffffff" stroke="#bfdbfe" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="m168 44-70 66 10 40z" fill="#e0e7ff" stroke="#bfdbfe" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="m98 110 10 40 12-30z" fill="#c7d2fe" />
  </svg>
);
PaperPlaneFallback.propTypes = { tone: PropTypes.oneOf(['light', 'dark']) };

/**
 * The paper-plane WebGL scenes. "send" folds the example resume into a plane
 * and launches it; "cta" shows the plane hovering. Loads once the scene is
 * near the viewport. Exposes `celebrate()` (returns false when it could not
 * play, e.g. reduced motion or no WebGL).
 */
const PaperPlaneScene = forwardRef(function PaperPlaneScene({ variant = 'send', className = '', onLaunch, fallback = null }, ref) {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const launchRef = useRef(onLaunch);
  const reducedMotion = useHeroReducedMotion();
  const [near, setNear] = useState(false);
  const [status, setStatus] = useState('loading');
  launchRef.current = onLaunch;

  useImperativeHandle(ref, () => ({ celebrate: () => Boolean(sceneRef.current?.celebrate?.()) }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setNear(true);
      observer.disconnect();
    }, { rootMargin: '300px 0px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) return undefined;
    const abort = new AbortController();
    setStatus('loading');
    import('../three/planeScenes').then(async ({ createSendScene, createCtaScene }) => {
      if (abort.signal.aborted || !hostRef.current) return;
      const create = variant === 'cta' ? createCtaScene : createSendScene;
      const scene = await create(hostRef.current, {
        reducedMotion,
        signal: abort.signal,
        onUnavailable: () => {
          setStatus('fallback');
          launchRef.current?.();
        },
        onLaunch: () => launchRef.current?.(),
      });
      if (abort.signal.aborted) {
        scene?.dispose();
        return;
      }
      sceneRef.current = scene;
      setStatus(scene ? 'webgl' : 'fallback');
    }).catch(() => {
      if (abort.signal.aborted) return;
      setStatus('fallback');
      launchRef.current?.();
    });
    return () => {
      abort.abort();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [near, reducedMotion, variant]);

  return (
    <div ref={hostRef} className={`paper-plane-scene ${className}`} data-renderer={status} aria-hidden="true">
      {status === 'fallback' && fallback}
    </div>
  );
});

PaperPlaneScene.propTypes = {
  variant: PropTypes.oneOf(['send', 'cta']),
  className: PropTypes.string,
  onLaunch: PropTypes.func,
  fallback: PropTypes.node,
};

export default PaperPlaneScene;
