import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// Mount inside Suspense so focus moves only after the destination is ready.
export default function RouteAccessibility() {
  const { pathname, hash } = useLocation();
  const previousPath = useRef(pathname);

  useEffect(() => {
    const changedPage = previousPath.current !== pathname;
    previousPath.current = pathname;
    const frame = requestAnimationFrame(() => {
      if (hash) {
        let anchor;
        try {
          anchor = document.getElementById(decodeURIComponent(hash.slice(1)));
        } catch {
          return;
        }
        if (anchor) {
          anchor.scrollIntoView({ behavior: 'instant', block: 'start' });
          anchor.setAttribute('tabindex', '-1');
          anchor.focus({ preventScroll: true });
          return;
        }
      }
      if (!changedPage) return;
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      const heading = document.querySelector('#main-content h1');
      const target = heading || document.getElementById('main-content');
      target?.setAttribute('tabindex', '-1');
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash]);

  return null;
}
