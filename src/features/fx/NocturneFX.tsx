// ── src/features/fx/NocturneFX.tsx ──────────────────────────────────────────
// The Nocturne interaction layer (design-language UX, after activetheory.net):
//   • a custom glowing cursor — a precise dot + an eased ring that swells over
//     anything interactive (the Active-Theory "reactive pointer");
//   • a spotlight that tracks the pointer and blends into the aurora, so the
//     dark canvas feels lit by the cursor;
//   • a one-shot intro reveal that wipes away on load.
// Pointer-driven only on fine pointers; fully disabled under reduced-motion.

import { useEffect, useState } from 'react';
import './nocturne-fx.css';

export function NocturneFX() {
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = window.matchMedia('(pointer: fine)').matches;

    // Intro reveal — skipped entirely when the user prefers reduced motion.
    const introMs = reduce ? 0 : 1500;
    const introTimer = window.setTimeout(() => setIntro(false), introMs);

    if (reduce || !fine) return () => window.clearTimeout(introTimer);

    const root = document.documentElement;
    const dot = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'cursor-dot';
    ring.className = 'cursor-ring';
    dot.setAttribute('aria-hidden', 'true');
    ring.setAttribute('aria-hidden', 'true');
    document.body.append(ring, dot);
    document.body.classList.add('has-custom-cursor');

    const HOVER = 'a,button,input,textarea,select,label,[role="switch"],[role="button"],.card-head,.inner-opt,.seg button,.chip button';
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let rx = tx;
    let ry = ty;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      root.style.setProperty('--mx', `${tx}px`);
      root.style.setProperty('--my', `${ty}px`);
      dot.style.transform = `translate(${tx}px, ${ty}px)`;
      const hot = !!(e.target as Element | null)?.closest?.(HOVER);
      document.body.classList.toggle('cursor-hot', hot);
    };
    const onDown = () => document.body.classList.add('cursor-down');
    const onUp = () => document.body.classList.remove('cursor-down');
    const loop = () => {
      rx += (tx - rx) * 0.18; // eased ring follow — the trailing weight
      ry += (ty - ry) * 0.18;
      ring.style.transform = `translate(${rx}px, ${ry}px)`;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    raf = requestAnimationFrame(loop);

    return () => {
      window.clearTimeout(introTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.body.classList.remove('has-custom-cursor', 'cursor-hot', 'cursor-down');
      dot.remove();
      ring.remove();
    };
  }, []);

  return (
    <>
      <div className="cursor-glow" aria-hidden="true" />
      {intro && (
        <div className="intro" aria-hidden="true">
          <span className="intro-word grad-text">Celebrate</span>
        </div>
      )}
    </>
  );
}
