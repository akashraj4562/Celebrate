// ── src/features/fx/BackgroundFX.tsx ────────────────────────────────────────
// The "dirty fishtank" (after activetheory.net + the owner's metaphor):
//   • a PEOPLE layer always playing behind the glass — a real <video> at
//     /tank.mp4 if present, otherwise a procedural crowd of drifting silhouettes
//     so it's never blank;
//   • murky WATER on top — a WebGL fluid that REACTS to the pointer (swirls +
//     brightens around it);
//   • the cursor is a WIPE CLOTH — moving it clears the murk locally to reveal
//     the people behind, and the murk heals back over ~1.2s.
// Falls back gracefully (no WebGL → CSS aurora; reduced-motion → calm static).

import { useEffect, useRef, useState } from 'react';

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p,0.0,1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;       // normalized, y up
uniform vec3 u_trail[24];   // x, y (norm, y up), strength 0..1
uniform int u_count;

float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p),f=fract(p);
  float a=hash(i),b=hash(i+vec2(1.,0.)),c=hash(i+vec2(0.,1.)),d=hash(i+vec2(1.,1.));
  vec2 u=f*f*(3.-2.*f); return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
float fbm(vec2 p){ float v=0.,a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.02; a*=.5; } return v; }

void main(){
  vec2 uv = gl_FragCoord.xy/u_res.xy;
  float asp = u_res.x/u_res.y;
  vec2 auv = vec2(uv.x*asp, uv.y);
  vec2 am  = vec2(u_mouse.x*asp, u_mouse.y);

  float t = u_time*0.04;
  float md = distance(auv, am);
  float infl = smoothstep(0.55, 0.0, md);                 // 1 near the pointer
  vec2 dir = md > 0.001 ? (auv-am)/md : vec2(0.0);
  vec2 p = auv*2.2 + dir*infl*0.35;                       // fluid pushed around the pointer

  vec2 q = vec2(fbm(p+vec2(0.0,t)), fbm(p+vec2(5.2,1.3)-t));
  float n = fbm(p + 2.1*q + t*0.5 + infl*0.6);
  float g = fbm(p*1.3 - q + t*0.3);
  float c = fbm(p*0.8 + t*0.6);

  // murky dirty-tank water — dark teal-green with faint brand flow
  vec3 col = vec3(0.02,0.05,0.05);
  col += vec3(0.05,0.34,0.30) * smoothstep(0.30,0.95,n) * 0.55;
  col += vec3(0.42,0.36,0.95) * smoothstep(0.55,1.05,g) * 0.22;
  col += vec3(0.20,0.85,1.00) * smoothstep(0.60,1.05,c) * 0.18;
  col += vec3(0.25,0.6,0.7) * infl * 0.22;                // brighten near pointer
  col += (hash(gl_FragCoord.xy*0.5 + t*60.0) - 0.5) * 0.06; // grain (dirty glass)

  // cursor wipe — clears the murk near the recent pointer trail, fading by age
  float clear = 0.0;
  for(int i=0;i<24;i++){
    if(i>=u_count) break;
    vec3 tp = u_trail[i];
    float d = distance(auv, vec2(tp.x*asp, tp.y));
    clear = max(clear, smoothstep(0.17, 0.0, d) * tp.z);
  }
  float alpha = mix(0.82, 0.02, clear);                   // wiped → transparent → people show
  float rim = smoothstep(0.0,0.45,clear) * smoothstep(0.9,0.45,clear); // wet-wipe edge
  col = mix(col, col*1.4 + 0.05, clear*0.6) + vec3(0.25,0.6,0.7)*rim*0.25;
  gl_FragColor = vec4(col, alpha);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
  return s;
}

// Procedural "people behind frosted glass" — drifting head+shoulder silhouettes.
function drawCrowd(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, w, h);
  const N = 16;
  for (let i = 0; i < N; i++) {
    const depth = 0.35 + (i % 5) * 0.16; // back→front
    const seed = i * 12.9898;
    const baseX = ((Math.sin(seed) * 0.5 + 0.5) + time * 0.012 * (0.5 + depth)) % 1.2 - 0.1;
    const sway = Math.sin(time * 0.6 * depth + i) * 14 * depth;
    const x = baseX * w + sway;
    const bob = Math.sin(time * 1.1 * depth + i * 2) * 6 * depth;
    const y = h * (0.55 + (i % 3) * 0.13) + bob;
    const s = 34 * depth;
    const a = 0.18 + depth * 0.28;
    ctx.fillStyle = `rgba(205,212,238,${a})`;
    // shoulders
    ctx.beginPath();
    ctx.ellipse(x, y + s * 1.1, s * 1.25, s * 0.9, 0, Math.PI, 0);
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.arc(x, y, s * 0.62, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function BackgroundFX() {
  const waterRef = useRef<HTMLCanvasElement>(null);
  const crowdRef = useRef<HTMLCanvasElement>(null);
  const [hasVideo, setHasVideo] = useState(false);

  // People layer: procedural crowd (skipped once a real video is playing).
  useEffect(() => {
    if (hasVideo) return;
    const canvas = crowdRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);
    const start = performance.now();
    let raf = 0;
    const loop = () => {
      drawCrowd(ctx, window.innerWidth, window.innerHeight, (performance.now() - start) / 1000);
      if (!reduce) raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [hasVideo]);

  // Water layer: mouse-reactive WebGL fluid + cursor wipe reveal.
  useEffect(() => {
    const canvas = waterRef.current;
    if (!canvas) return;
    const gl = (canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false, depth: false }) ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      canvas.style.display = 'none';
      return;
    }
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) {
      canvas.style.display = 'none';
      return;
    }
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      canvas.style.display = 'none';
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uMouse = gl.getUniformLocation(prog, 'u_mouse');
    const uTrail = gl.getUniformLocation(prog, 'u_trail');
    const uCount = gl.getUniformLocation(prog, 'u_count');
    const dpr = Math.min(window.devicePixelRatio || 1, 1.4);

    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    // pointer trail (normalized, y-up), aged out over LIFE ms
    const LIFE = 1200;
    let mouse: [number, number] = [0.5, 0.5];
    const trail: { x: number; y: number; t: number }[] = [];
    const onMove = (e: PointerEvent) => {
      mouse = [e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight];
      trail.push({ x: mouse[0], y: mouse[1], t: performance.now() });
      if (trail.length > 48) trail.shift();
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let raf = 0;
    const TR = new Float32Array(24 * 3);
    const draw = () => {
      const now = performance.now();
      // newest-first, within LIFE
      let count = 0;
      for (let i = trail.length - 1; i >= 0 && count < 24; i--) {
        const age = now - trail[i].t;
        if (age > LIFE) break;
        TR[count * 3] = trail[i].x;
        TR[count * 3 + 1] = trail[i].y;
        TR[count * 3 + 2] = 1 - age / LIFE;
        count++;
      }
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uMouse, mouse[0], mouse[1]);
      gl.uniform3fv(uTrail, TR);
      gl.uniform1i(uCount, count);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    if (reduce) {
      draw();
    } else {
      const loop = () => {
        draw();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <div className="tank" aria-hidden="true">
      <video
        className="tank-video"
        src="/tank.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        style={{ opacity: hasVideo ? 1 : 0 }}
        onCanPlay={() => setHasVideo(true)}
        onError={() => setHasVideo(false)}
      />
      {!hasVideo && <canvas ref={crowdRef} className="tank-crowd" />}
      <canvas ref={waterRef} className="tank-water" />
    </div>
  );
}
