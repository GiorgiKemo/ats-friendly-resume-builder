import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import HeroPages from './HeroPages';
import { pageEm } from './heroLayout';

const SCAN_MESSAGE = 'Scanning the example resume. This is a demonstration, not an assessment of your resume.';
// If the 3D runtime is slow to arrive, show the finished pages instead of a blank one.
const INTRO_GRACE_MS = 1500;
const SCENE_START_TIMEOUT_MS = 1800;
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Drives the hero scene. The resume pages are HTML, framed on the stage; the
 * 3D runtime (loaded after first paint) animates them and adds a WebGL layer
 * for the check mark and file tiles. Without WebGL the pages stay put.
 * Status: loading → webgl | static (runtime late) | fallback (no WebGL).
 */
export function useHeroScene(reducedMotion) {
  const sceneRef = useRef(null);
  const hostRef = useRef(null);
  const pagesRef = useRef(null);
  const stageRef = useRef(null);
  const runtimeRef = useRef(null);
  const lateRef = useRef(false);
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  // Frame the pages on the stage before first paint, and whenever it resizes.
  useIsomorphicLayoutEffect(() => {
    const scene = sceneRef.current;
    const stage = stageRef.current;
    if (!scene || !stage) return undefined;
    const measure = () => {
      const area = scene.getBoundingClientRect();
      const box = stage.getBoundingClientRect();
      if (!area.width || !box.width) return;
      const values = {
        '--stage-x': `${box.left + box.width / 2 - area.left}px`,
        '--stage-y': `${box.top + box.height / 2 - area.top}px`,
        '--stage-w': `${box.width}px`,
        '--stage-h': `${box.height}px`,
        '--page-em': `${pageEm(box.width, box.height)}px`,
      };
      for (const [name, value] of Object.entries(values)) scene.style.setProperty(name, value);
      runtimeRef.current?.resize();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scene);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    lateRef.current = false;
    if (reducedMotion) {
      setStatus('fallback');
      return () => abort.abort();
    }

    setStatus('loading');
    const grace = window.setTimeout(() => {
      lateRef.current = true;
      setStatus((current) => (current === 'loading' ? 'static' : current));
    }, INTRO_GRACE_MS);
    const start = async () => {
      try {
        const { createHeroScene } = await import('../three/heroScene');
        if (abort.signal.aborted || !hostRef.current) return;
        const runtime = await createHeroScene({
          host: hostRef.current,
          scene: sceneRef.current,
          pages: pagesRef.current,
          stage: stageRef.current,
        }, {
          reducedMotion,
          skipIntro: lateRef.current,
          signal: abort.signal,
          onUnavailable: () => setStatus('fallback'),
          onScan: () => setMessage(SCAN_MESSAGE),
        });
        if (abort.signal.aborted) {
          runtime?.dispose();
          return;
        }
        runtimeRef.current = runtime;
        window.clearTimeout(grace);
        setStatus(runtime ? 'webgl' : 'fallback');
      } catch {
        // No WebGL (or it failed to start): the HTML pages stay as they are.
        if (!abort.signal.aborted) setStatus('fallback');
      }
    };
    let idleCallback = 0;
    let timer = 0;
    if (typeof window.requestIdleCallback === 'function') {
      idleCallback = window.requestIdleCallback(() => { void start(); }, { timeout: SCENE_START_TIMEOUT_MS });
    } else {
      timer = window.setTimeout(start, 250);
    }
    return () => {
      window.clearTimeout(timer);
      if (idleCallback) window.cancelIdleCallback?.(idleCallback);
      window.clearTimeout(grace);
      abort.abort();
      runtimeRef.current?.dispose();
      runtimeRef.current = null;
    };
  }, [reducedMotion]);

  return { sceneRef, hostRef, pagesRef, stageRef, runtimeRef, status, message, setMessage };
}

/** Layers behind the hero copy: aurora, cursor light, pages and the WebGL canvas. */
export function HeroBackdrop({ hero }) {
  return (
    <div ref={hero.sceneRef} className="home-hero-scene" data-renderer={hero.status}>
      <div className="home-hero-aurora" aria-hidden="true"><span /><span /><span /><span /></div>
      <div className="home-hero-spot" aria-hidden="true" />
      <HeroPages ref={hero.pagesRef} state={hero.status} />
      <div ref={hero.hostRef} className="home-hero-canvas" aria-hidden="true" />
    </div>
  );
}

/** The interactive area over the pages: drag to turn, click to re-scan. */
export function HeroStage({ hero, reducedMotion }) {
  const drag = useRef(null);
  const { stageRef, runtimeRef, status, message, setMessage } = hero;
  const interactive = status === 'webgl' && !reducedMotion;

  const replay = () => {
    if (drag.current?.moved) return;
    if (runtimeRef.current?.replay()) {
      setMessage('');
      window.requestAnimationFrame(() => setMessage(SCAN_MESSAGE));
    }
  };
  const startDrag = (event) => {
    if (event.button !== 0 || !runtimeRef.current?.startDrag(event.clientX, event.clientY)) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.dragging = 'true';
  };
  const moveDrag = (event) => {
    if (drag.current && Math.hypot(event.clientX - drag.current.x, event.clientY - drag.current.y) > 6) drag.current.moved = true;
  };
  const endDrag = (event) => {
    runtimeRef.current?.endDrag();
    event.currentTarget.dataset.dragging = 'false';
    // Let the click that ends a drag through, then forget the drag.
    window.setTimeout(() => { drag.current = null; }, 0);
  };

  return (
    <div ref={stageRef} className="home-hero-stage" data-renderer={status} data-interactive={interactive}>
      <button
        type="button"
        className="home-hero-stage-control"
        onClick={replay}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        disabled={!interactive}
        aria-label="Replay the example resume scan"
        aria-describedby="home-hero-stage-hint"
      />
      <span id="home-hero-stage-hint" className="home-hero-stage-hint">
        {interactive ? 'Drag to turn the pages · Click to scan again' : 'Example resumes'}
      </span>
      <span className="sr-only" role="status">{message}</span>
    </div>
  );
}

const heroShape = PropTypes.shape({
  sceneRef: PropTypes.object.isRequired,
  hostRef: PropTypes.object.isRequired,
  pagesRef: PropTypes.object.isRequired,
  stageRef: PropTypes.object.isRequired,
  runtimeRef: PropTypes.object.isRequired,
  status: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  setMessage: PropTypes.func.isRequired,
});
HeroBackdrop.propTypes = { hero: heroShape.isRequired };
HeroStage.propTypes = { hero: heroShape.isRequired, reducedMotion: PropTypes.bool };
