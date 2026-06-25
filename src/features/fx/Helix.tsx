// ── src/features/fx/Helix.tsx ───────────────────────────────────────────────
// A rotating double-helix motif with a central spine (after activetheory.net):
// two strands of glowing nodes spiral around a vertical axis, joined by faint
// rungs, depth-sorted with perspective (front nodes larger/brighter). Pure 2D
// canvas. A fixed background motif; static under reduced-motion.

import { useEffect, useRef } from 'react';

const STOPS: [number, number, number][] = [
  [255, 93, 143], // magenta
  [123, 107, 255], // violet
  [54, 224, 255], // cyan
];
function colorAt(v: number): string {
  const seg = Math.min(0.9999, v) * 2;
  const i = Math.floor(seg);
  const f = seg - i;
  const a = STOPS[i];
  const b = STOPS[i + 1];
  return `rgb(${(a[0] + (b[0] - a[0]) * f) | 0},${(a[1] + (b[1] - a[1]) * f) | 0},${(a[2] + (b[2] - a[2]) * f) | 0})`;
}

export function Helix() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    let W = 0;
    let H = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const NODES = 48;
    const TURNS = 3.2;
    const start = performance.now();
    let raf = 0;

    const draw = () => {
      const t = (performance.now() - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const top = H * 0.07;
      const bottom = H * 0.93;
      const span = bottom - top;
      const R = Math.min(W * 0.34, 150);
      const rot = t * 0.6;

      // central spine
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx, bottom);
      ctx.stroke();

      // rungs joining the two strands
      for (let i = 0; i < NODES; i++) {
        const v = i / (NODES - 1);
        const y = top + span * v;
        const ang = v * TURNS * Math.PI * 2 + rot;
        const x1 = cx + Math.cos(ang) * R;
        const x2 = cx + Math.cos(ang + Math.PI) * R;
        const z = (Math.sin(ang) + Math.sin(ang + Math.PI)) / 2;
        ctx.strokeStyle = `rgba(170,162,255,${(0.04 + 0.06 * (z + 1)).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y);
        ctx.stroke();
      }

      // the two strands as glowing curves (so the double-helix reads clearly)
      const strandCol = ['rgba(255,93,143,0.55)', 'rgba(54,224,255,0.55)'];
      for (let s = 0; s < 2; s++) {
        ctx.beginPath();
        for (let i = 0; i < NODES; i++) {
          const v = i / (NODES - 1);
          const y = top + span * v;
          const a = v * TURNS * Math.PI * 2 + rot + s * Math.PI;
          const x = cx + Math.cos(a) * R;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = strandCol[s];
        ctx.lineWidth = 2;
        ctx.shadowColor = strandCol[s];
        ctx.shadowBlur = 10;
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      // nodes, depth-sorted back→front
      const pts: { x: number; y: number; z: number; v: number }[] = [];
      for (let i = 0; i < NODES; i++) {
        const v = i / (NODES - 1);
        const y = top + span * v;
        const ang = v * TURNS * Math.PI * 2 + rot;
        for (let s = 0; s < 2; s++) {
          const a = ang + s * Math.PI;
          pts.push({ x: cx + Math.cos(a) * R, y, z: Math.sin(a), v });
        }
      }
      pts.sort((p, q) => p.z - q.z);
      for (const p of pts) {
        const depth = (p.z + 1) / 2; // 0 back, 1 front
        const r = 1.6 + 4.2 * depth;
        const alpha = 0.25 + 0.6 * depth;
        const col = colorAt(p.v);
        ctx.shadowColor = col;
        ctx.shadowBlur = 8 + 12 * depth;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="helix" aria-hidden="true" />;
}
