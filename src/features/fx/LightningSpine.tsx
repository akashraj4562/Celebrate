// ── src/features/fx/LightningSpine.tsx ──────────────────────────────────────
// A glowing lightning bolt running down the centre of the page (replaces the
// helix "spine", per the owner's reference). A jagged vertical path that morphs
// continuously, drawn in glow passes (wide soft → core bright) with a gentle
// flicker. Pure 2D canvas; a single calm frame under reduced-motion.

import { useEffect, useRef } from 'react';

export function LightningSpine() {
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

    const SEGS = 30;
    const start = performance.now();
    let raf = 0;

    const path = (pts: { x: number; y: number }[], width: number, color: string, blur: number) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.stroke();
    };

    const draw = () => {
      const t = (performance.now() - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;

      // jagged, continuously-morphing bolt path
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= SEGS; i++) {
        const v = i / SEGS;
        const y = v * H;
        const drift = Math.sin(y * 0.008 + t * 0.9) * W * 0.05;
        const jag =
          (Math.sin(i * 1.7 + t * 2.2) * 0.55 + Math.sin(i * 0.9 - t * 1.4) * 0.45) * W * 0.16;
        pts.push({ x: cx + drift + jag, y });
      }

      // gentle flicker (smooth, non-strobing) with rare brighter flashes
      const flash = 0.62 + 0.18 * Math.sin(t * 5.0) + 0.12 * Math.sin(t * 17.0);

      path(pts, 16, `rgba(110,160,255,${0.07 * flash})`, 26); // wide halo
      path(pts, 7, `rgba(150,195,255,${0.16 * flash})`, 16); // mid glow
      path(pts, 2.2, `rgba(150,120,255,${0.5 * flash})`, 12); // violet edge
      path(pts, 1.2, `rgba(235,242,255,${0.92 * flash})`, 8); // white core
      ctx.shadowBlur = 0;

      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="lightning" aria-hidden="true" />;
}
