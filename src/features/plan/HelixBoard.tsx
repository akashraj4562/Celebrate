// ── src/features/plan/HelixBoard.tsx ────────────────────────────────────────
// Helical scrolling (after activetheory.net): the plan cards are arranged on a
// vertical 3D helix around the centre (the lightning axis). A sticky stage holds
// a rotor; scrolling through the tall wrapper rotates the rotor and slides it
// vertically so each card spirals to the front in turn. The front-most card is
// upright, opaque and interactive; cards rotating away dim, blur and go
// click-through. Pure CSS 3D transforms — the cards stay real, interactive DOM.

import { useEffect, useRef, type ReactNode } from 'react';
import './helix-board.css';

const ANGLE = 36; // degrees between consecutive cards around the axis
const VGAP = 150; // px vertical pitch of the helix
const RADIUS = 520; // px from the axis

export function HelixBoard({ items }: { items: ReactNode[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rotorRef = useRef<HTMLDivElement>(null);
  const N = items.length;

  useEffect(() => {
    const wrap = wrapRef.current;
    const rotor = rotorRef.current;
    if (!wrap || !rotor) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;

    const update = () => {
      const rect = wrap.getBoundingClientRect();
      const total = Math.max(1, wrap.offsetHeight - window.innerHeight);
      const prog = Math.min(1, Math.max(0, -rect.top / total));
      const idx = prog * Math.max(0, N - 1);
      rotor.style.transform = `translateY(${(idx * VGAP).toFixed(1)}px) rotateY(${(-idx * ANGLE).toFixed(2)}deg)`;

      const cards = rotor.children;
      for (let i = 0; i < cards.length; i++) {
        const el = cards[i] as HTMLElement;
        const facing = Math.cos(((i - idx) * ANGLE * Math.PI) / 180); // 1 front, -1 back
        const f = Math.max(0, facing);
        el.style.opacity = (0.12 + 0.88 * f).toFixed(2);
        el.style.filter = facing > 0.25 ? 'none' : 'blur(1.5px)';
        el.style.pointerEvents = facing > 0.65 ? 'auto' : 'none';
        el.style.zIndex = String(Math.round(facing * 100) + 100);
      }
    };

    const onScroll = () => {
      if (reduce) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [N]);

  return (
    <div ref={wrapRef} className="helix-wrap" style={{ height: `${Math.max(2, N) * 40 + 80}vh` }}>
      <div className="helix-stage">
        <div ref={rotorRef} className="helix-rotor">
          {items.map((it, i) => (
            <div
              className="helix-item"
              key={i}
              style={{ transform: `rotateY(${i * ANGLE}deg) translateZ(${RADIUS}px) translateY(${-i * VGAP}px)` }}
            >
              {it}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
