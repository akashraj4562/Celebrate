// ── src/features/fx/LightningSpine.tsx ──────────────────────────────────────
// A lightning bolt down the centre of the page whose energy DESCENDS WITH SCROLL.
// A blazing "strike head" sits at your scroll position; the bolt above it is a lit
// trail (where you've descended from), the bolt below is dim and not-yet-struck.
// Scrolling down moves the head down — the feeling of descending the bolt.
// Pure 2D canvas; calm static head at top under reduced-motion.

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

    // scroll progress 0..1, eased so the head lags slightly behind the scroll
    let targetP = 0;
    let p = 0;
    const onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      targetP = Math.min(1, Math.max(0, window.scrollY / max));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();

    const SEGS = 34;
    const start = performance.now();
    let raf = 0;

    const seg = (x1: number, y1: number, x2: number, y2: number, width: number, color: string, blur: number) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.lineCap = 'round';
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.stroke();
    };

    const draw = () => {
      const t = (performance.now() - start) / 1000;
      p += (targetP - p) * 0.08; // ease toward scroll position
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const headY = p * H;

      // jagged, slowly-morphing bolt points
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= SEGS; i++) {
        const v = i / SEGS;
        const y = v * H;
        const drift = Math.sin(y * 0.008 + t * 0.5) * W * 0.05;
        const jag = (Math.sin(i * 1.7 + t * 1.1) * 0.55 + Math.sin(i * 0.9 - t * 0.7) * 0.45) * W * 0.16;
        pts.push({ x: cx + drift + jag, y });
      }

      // x position of the strike head along the bolt
      const hi = Math.min(SEGS, Math.floor(p * SEGS));
      const headX = pts[hi].x;

      // draw each segment with brightness from its relation to the head
      for (let i = 0; i < SEGS; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const my = (a.y + b.y) / 2;
        const d = (my - headY) / H; // <0 above head (descended), >0 below (un-struck)
        let lit: number;
        if (d > 0) lit = Math.max(0, 1 - d * 7) * 0.22; // ahead: dim, fast falloff
        else lit = Math.max(0.12, 1 + d * 1.4); // behind: lit trail, slow fade
        const headBoost = Math.exp(-Math.pow((my - headY) / (H * 0.05), 2)); // gaussian at head
        const bright = Math.min(1, lit + headBoost);
        if (bright < 0.04) continue;
        seg(a.x, a.y, b.x, b.y, 70, `rgba(110,160,255,${(0.05 * bright).toFixed(3)})`, 55);
        seg(a.x, a.y, b.x, b.y, 30, `rgba(150,195,255,${(0.14 * bright).toFixed(3)})`, 34);
        seg(a.x, a.y, b.x, b.y, 12, `rgba(150,120,255,${(0.42 * bright).toFixed(3)})`, 20);
        seg(a.x, a.y, b.x, b.y, 5, `rgba(235,242,255,${(0.9 * bright).toFixed(3)})`, 12);
      }

      // the blazing strike head — a bright node + pulse where you are on the page
      const pulse = 0.8 + 0.2 * Math.sin(t * 6);
      ctx.shadowColor = 'rgba(180,210,255,1)';
      ctx.shadowBlur = 55 * pulse;
      ctx.fillStyle = `rgba(240,246,255,${0.9 * pulse})`;
      ctx.beginPath();
      ctx.arc(headX, headY, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return <canvas ref={ref} className="lightning" aria-hidden="true" />;
}
