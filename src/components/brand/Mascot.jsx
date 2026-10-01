import React, { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

// 3D characters rendered in Blender (Cycles) from Quaternius's CC0 "Ultimate
// Animated Character Pack", restyled in the brand palette. Clips are WebM
// (VP9 with transparency); stills are WebP.
const CLIPS = {
  female: { idle: '/characters/female-idle.webm', celebrate: '/characters/female-victory.webm', still: '/characters/female-still.webp', cheer: '/characters/female-cheer.webp' },
  male: { idle: '/characters/male-idle.webm', celebrate: '/characters/male-victory.webm', still: '/characters/male-still.webp', cheer: '/characters/male-cheer.webp' },
};

// Safari cannot draw VP9 transparency, so it gets the still frames instead.
const canPlayAlphaVideo = () => {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  const ua = navigator.userAgent;
  const safari = /safari/i.test(ua) && !/chrome|chromium|crios|android|edg|fxios|firefox/i.test(ua);
  return !safari && Boolean(document.createElement('video').canPlayType('video/webm; codecs="vp9"'));
};

const Clip = ({ src, visible }) => {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (visible) {
      video.currentTime = 0;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [visible]);
  return (
    <video
      ref={ref}
      src={src}
      muted
      loop
      playsInline
      autoPlay={visible}
      preload="auto"
      disablePictureInPicture
      className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
    />
  );
};

/**
 * The ResumeATS character. Moods: "idle" (relaxed, breathing; "wave" is an
 * alias kept for older callers) and "celebrate" (cheering). Clips load once
 * the character scrolls into view and crossfade when the mood changes.
 * Reduced motion (and Safari) show a still frame. Decorative: hidden from
 * assistive technology.
 */
const Mascot = ({ mood = 'idle', character = 'female', className = '' }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '200px' });
  const reduceMotion = useReducedMotion();
  const [videoReady, setVideoReady] = useState(false);
  const clips = CLIPS[character] || CLIPS.female;
  const celebrating = mood === 'celebrate';

  // Decide after mount so prerendered HTML (always the still) matches.
  useEffect(() => {
    setVideoReady(canPlayAlphaVideo());
  }, []);

  const useVideo = videoReady && inView && !reduceMotion;

  return (
    <span ref={ref} className={`relative block aspect-square ${className}`} aria-hidden="true">
      {/* Soft contact shadow under the feet (renders sit at ~92% of the frame). */}
      <span className="absolute left-[51.5%] top-[89.5%] h-[6%] w-[36%] -translate-x-1/2 rounded-[50%] bg-slate-900/25 blur-[7px] dark:bg-black/50" />
      {useVideo ? (
        <>
          <Clip src={clips.idle} visible={!celebrating} />
          <Clip src={clips.celebrate} visible={celebrating} />
        </>
      ) : (
        <img
          src={celebrating ? clips.cheer : clips.still}
          alt=""
          className={`absolute inset-0 h-full w-full object-contain ${reduceMotion ? '' : 'float-slow'}`}
          loading="lazy"
          decoding="async"
          draggable="false"
        />
      )}
    </span>
  );
};

export default Mascot;
