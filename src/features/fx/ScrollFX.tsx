// ── src/features/fx/ScrollFX.tsx ────────────────────────────────────────────
// Scroll as motion (the Active-Theory feel): cards & panels rise/fade in as they
// enter the viewport, and section containers parallax-drift as you scroll. Pure
// transforms on rAF; disabled entirely under prefers-reduced-motion (content just
// shows). The hidden pre-reveal state is gated behind body.nfx-ready so the app
// is fully visible if this never runs.

import { useEffect } from 'react';

const REVEAL = '.card, .panel, .past-card, .pv-person, .moment-section';
const PARALLAX = '.board-group, .pv-grid';

export function ScrollFX() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.body.classList.add('nfx-ready');

    // 1) Reveal-on-scroll — stagger siblings for a cascading entrance.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          const sibs = el.parentElement ? Array.from(el.parentElement.children) : [el];
          const idx = Math.max(0, sibs.indexOf(el));
          el.style.transitionDelay = `${Math.min(idx * 60, 300)}ms`;
          el.classList.add('nfx-in');
          io.unobserve(el);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.1 },
    );
    const seen = new WeakSet<Element>();
    const observe = () => {
      document.querySelectorAll(REVEAL).forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          io.observe(el);
        }
      });
    };
    observe();
    // Re-observe as React mounts new cards (generate, archive, etc.).
    const mo = new MutationObserver(() => observe());
    mo.observe(document.body, { childList: true, subtree: true });

    // 2) Parallax — section containers drift relative to scroll for depth.
    let ticking = false;
    let raf = 0;
    const apply = () => {
      const mid = window.innerHeight / 2;
      document.querySelectorAll<HTMLElement>(PARALLAX).forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const off = (center - mid) / window.innerHeight; // -1..1 across the viewport
        const depth = i % 2 === 0 ? 18 : 10; // alternate columns drift at different rates
        el.style.transform = `translate3d(0, ${(-off * depth).toFixed(2)}px, 0)`;
      });
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(apply);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    apply();

    return () => {
      io.disconnect();
      mo.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
      document.body.classList.remove('nfx-ready');
    };
  }, []);

  return null;
}
