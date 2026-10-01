import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';

const SCAN_MESSAGE = 'Scanning the example resume. This is a demonstration, not an assessment of your resume.';

/**
 * Loads the hero's WebGL scene after first paint. The canvas fills the hero
 * section (`hostRef`) and frames the composition on the stage (`stageRef`).
 * Falls back to a flat illustration without WebGL.
 */
export function useHeroScene(reducedMotion) {
  const hostRef = useRef(null);
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const abort = new AbortController();
    setStatus('loading');
    const timer = window.setTimeout(async () => {
      try {
        const { createHeroScene } = await import('../three/heroScene');
        if (abort.signal.aborted || !hostRef.current || !stageRef.current) return;
        const scene = await createHeroScene(hostRef.current, {
          stage: stageRef.current,
          reducedMotion,
          signal: abort.signal,
          onUnavailable: () => setStatus('fallback'),
          onScan: () => setMessage(SCAN_MESSAGE),
        });
        if (abort.signal.aborted) {
          scene?.dispose();
          return;
        }
        sceneRef.current = scene;
        setStatus(scene ? 'webgl' : 'fallback');
      } catch {
        // No WebGL (or it failed to start): keep the flat illustration.
        if (!abort.signal.aborted) setStatus('fallback');
      }
    }, 120);
    return () => {
      window.clearTimeout(timer);
      abort.abort();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [reducedMotion]);

  return { hostRef, stageRef, sceneRef, status, message, setMessage };
}

/** Full-bleed canvas layer; sits behind the hero content. */
export function HeroCanvas({ hero }) {
  return <div ref={hero.hostRef} className="home-hero-canvas" data-renderer={hero.status} aria-hidden="true" />;
}

const FallbackPage = () => {
  const ref = useRef(null);
  useEffect(() => {
    let cancelled = false;
    import('../three/resumeArt').then(({ drawExampleResume }) => {
      if (cancelled || !ref.current) return;
      const { canvas } = drawExampleResume(900);
      const context = ref.current.getContext('2d');
      ref.current.width = canvas.width;
      ref.current.height = canvas.height;
      context.drawImage(canvas, 0, 0);
    });
    return () => { cancelled = true; };
  }, []);
  return (
    <span className="home-hero-fallback" aria-hidden="true">
      <span className="home-hero-fallback-page home-hero-fallback-page--back" />
      <span className="home-hero-fallback-page home-hero-fallback-page--middle" />
      <canvas ref={ref} className="home-hero-fallback-page" width="900" height="1273" />
    </span>
  );
};

/** The interactive area over the 3D composition: drag to turn, click to re-scan. */
export function HeroStage({ hero, reducedMotion }) {
  const drag = useRef(null);
  const { stageRef, sceneRef, status, message, setMessage } = hero;

  const replay = () => {
    if (drag.current?.moved) return;
    if (sceneRef.current?.replay()) {
      setMessage('');
      window.requestAnimationFrame(() => setMessage(SCAN_MESSAGE));
    }
  };
  const startDrag = (event) => {
    if (event.button !== 0 || !sceneRef.current?.startDrag(event.clientX, event.clientY)) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.dragging = 'true';
  };
  const moveDrag = (event) => {
    if (drag.current && Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 6) drag.current.moved = true;
  };
  const endDrag = (event) => {
    sceneRef.current?.endDrag();
    event.currentTarget.dataset.dragging = 'false';
    // Let the click that ends a drag through, then forget the drag.
    window.setTimeout(() => { drag.current = null; }, 0);
  };

  return (
    <div ref={stageRef} className="home-hero-stage" data-renderer={status} data-interactive={status === 'webgl' && !reducedMotion}>
      {status === 'fallback' && <FallbackPage />}
      <button
        type="button"
        className="home-hero-stage-control"
        onClick={replay}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        disabled={status !== 'webgl' || reducedMotion}
        aria-label="Replay the example resume scan"
        aria-describedby="home-hero-stage-hint"
      />
      <span id="home-hero-stage-hint" className="home-hero-stage-hint">
        {status === 'webgl' && !reducedMotion ? 'Drag to turn the pages · Click to scan again' : 'Example resume'}
      </span>
      <span className="sr-only" role="status">{message}</span>
    </div>
  );
}

const heroShape = PropTypes.shape({
  hostRef: PropTypes.object.isRequired,
  stageRef: PropTypes.object.isRequired,
  sceneRef: PropTypes.object.isRequired,
  status: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  setMessage: PropTypes.func.isRequired,
});
HeroCanvas.propTypes = { hero: heroShape.isRequired };
HeroStage.propTypes = { hero: heroShape.isRequired, reducedMotion: PropTypes.bool };
