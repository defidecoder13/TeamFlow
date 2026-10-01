'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Shared landing-page motion primitives (Phase 5B).
 *
 * One small vocabulary for the whole page — IntersectionObserver +
 * CSS transitions only, no animation library:
 *
 * - `usePrefersReducedMotion` — mandatory `prefers-reduced-motion` support.
 * - `useClientReady` — true only after client hydration. Hidden reveal
 *   states must NEVER apply before this: SSR HTML ships fully visible so
 *   no-JS renderers, crawlers, and screenshot tools see content. Motion is
 *   an enhancement, never a gate.
 * - `useInViewOnce` — fires once when an element enters the viewport.
 * - `useScrollReveal` — both combined: `visible` is true on the server,
 *   under reduced motion, or once the element scrolls into view.
 *
 * Performance: observers disconnect after firing; only `transform` and
 * `opacity` are ever animated (see `Reveal.tsx`).
 */

// Layout effect on the client (no paint flash), plain effect on the server
// (no SSR warning).
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useClientReady(): boolean {
  const [ready, setReady] = useState(false);
  useIsomorphicLayoutEffect(() => {
    setReady(true);
  }, []);
  return ready;
}
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function useInViewOnce<T extends HTMLElement = HTMLElement>(
  threshold = 0.2,
): { ref: React.RefObject<T | null>; inView: boolean } {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            obs.disconnect();
          }
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, inView };
}

export function useScrollReveal<T extends HTMLElement = HTMLElement>(
  threshold = 0.2,
): { ref: React.RefObject<T | null>; visible: boolean; reduced: boolean } {
  const ready = useClientReady();
  const reduced = usePrefersReducedMotion();
  const { ref, inView } = useInViewOnce<T>(threshold);
  // Visible by default: server HTML, reduced motion, and pre-observer
  // states all show content. The hidden state only exists on the client
  // between hydration and intersection (off-screen — no visual flash).
  return { ref, visible: !ready || reduced ? true : inView, reduced };
}
