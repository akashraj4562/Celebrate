// ── src/features/fx/Waterfall.tsx ───────────────────────────────────────────
// A real waterfall photo (public/waterfall.jpg) in a narrow centre column,
// colour-normalized to the Nocturne palette and gently flowing, that DESCENDS
// WITH SCROLL (its reach grows downward as you scroll) and MERGES into a
// full-width real lake photo (public/lake.jpg) at the page end. Driven by two
// CSS vars set on scroll: --reach (how far the fall has descended) and --lake
// (how present the lake is). All visuals are CSS; this only feeds scroll state.

import { useEffect, useRef } from 'react';

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function Waterfall() {
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const prog = Math.min(1, Math.max(0, window.scrollY / max));
        el.style.setProperty('--reach', (0.34 + prog * 0.56).toFixed(3));
        el.style.setProperty('--lake', smoothstep(0.78, 1, prog).toFixed(3));
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={wrap} className="waterfall-scene" aria-hidden="true">
      <div className="wf-fall" />
      <div className="wf-lake" />
    </div>
  );
}
