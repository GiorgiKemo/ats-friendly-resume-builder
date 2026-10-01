import React, { useEffect, useRef, useState } from 'react';
import { Check, ShieldCheck } from '@phosphor-icons/react';
import useHeroReducedMotion from '../../hooks/useHeroReducedMotion';

const HeroScene = () => {
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const reactionTimer = useRef(null);
  const reducedMotion = useHeroReducedMotion();
  const [ready, setReady] = useState(false);
  const [greeting, setGreeting] = useState(null);

  useEffect(() => {
    const abort = new AbortController();
    setReady(false);
    setGreeting(null);
    // Let the headline and fallback paint before loading the 3D runtime.
    const timer = window.setTimeout(async () => {
      try {
        const { createPaperPalScene } = await import('./paperPalScene');
        if (abort.signal.aborted) return;
        const scene = await createPaperPalScene(hostRef.current, {
          reducedMotion,
          signal: abort.signal,
          onUnavailable: () => setReady(false),
        });
        if (abort.signal.aborted) { scene?.dispose(); return; }
        sceneRef.current = scene;
        setReady(Boolean(scene));
      } catch {
        // Keep the illustration usable without WebGL or on a slow network.
        if (!abort.signal.aborted) setReady(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(reactionTimer.current);
      abort.abort();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [reducedMotion]);

  const sayHello = (event, celebrate = false) => {
    const gesture = sceneRef.current?.react({ x: event.clientX, y: event.clientY, keyboard: event.detail === 0, celebrate }) || 'wave';
    setGreeting(gesture);
    window.clearTimeout(reactionTimer.current);
    reactionTimer.current = window.setTimeout(() => setGreeting(null), 2400);
  };
  const startDrag = (event) => {
    if (event.pointerType === 'mouse' && event.button === 0 && sceneRef.current?.startDrag(event.clientX, event.clientY)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  return (
    <div className="paper-pal-scene">
      <button
        type="button"
        className="paper-pal-interaction"
        onClick={sayHello}
        onDoubleClick={(event) => sayHello(event, true)}
        onPointerDown={startDrag}
        onPointerUp={() => sceneRef.current?.endDrag()}
        onPointerCancel={() => sceneRef.current?.endDrag()}
        aria-label="Play with the paper companion and example resume"
        aria-describedby="paper-pal-hint"
      >
        <span className={`paper-pal-fallback ${ready ? 'is-hidden' : ''}`} aria-hidden="true">
          <img className="paper-pal-resume" src="/characters/hero-resume-texture.webp" width="1055" height="1491" alt="" fetchpriority="high" draggable={false} />
          <img className="paper-pal-character" src="/characters/paper-pal-fallback.webp" width="1086" height="1448" alt="" draggable={false} />
        </span>
        <span ref={hostRef} className="paper-pal-canvas" data-renderer={ready ? 'webgl' : 'fallback'} data-motion={reducedMotion ? 'reduced' : 'full'} aria-hidden="true" />
      </button>
      <span className="paper-pal-badge" aria-hidden="true">
        <ShieldCheck size={22} weight="duotone" />
        <span>{greeting === 'scan' ? 'Example scan' : greeting === 'celebrate' ? 'Let’s go!' : greeting ? 'Hello!' : 'ATS check'}</span>
        <Check size={17} weight="bold" />
      </span>
      <span id="paper-pal-hint" className="paper-pal-hint">{reducedMotion ? 'Click to say hello.' : 'Move your cursor · Drag the CV · Click to play'}</span>
      <span className="sr-only" role="status">{greeting === 'scan' ? 'Scanning the example resume. This is a demonstration, not an assessment of your resume.' : greeting ? 'Hello from your paper companion!' : ''}</span>
    </div>
  );
};

export default HeroScene;
