// ── src/features/fx/BackgroundFX.tsx ────────────────────────────────────────
// A living, continuously-playing background — the Active-Theory technique: a
// full-screen WebGL fragment shader rendering a slow, domain-warped fluid in the
// Nocturne palette (magenta / violet / cyan over near-black). Runs on rAF; falls
// back to the CSS aurora if WebGL is unavailable; renders a single static frame
// under prefers-reduced-motion.

import { useEffect, useRef } from 'react';

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0,0.0)), c = hash(i + vec2(0.0,1.0)), d = hash(i + vec2(1.0,1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.02; a *= 0.5; } return v; }

void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  float agar = u_res.x / u_res.y;
  vec2 p = vec2(uv.x * agar, uv.y) * 2.2;
  float t = u_time * 0.045;

  // domain warp for a flowing, fluid motion
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  float n = fbm(p + 2.1 * q + t * 0.4);
  float m = fbm(p * 1.25 + 3.0 * q - t * 0.7);
  float c = fbm(p * 0.85 - 2.0 * q + t * 0.6);

  vec3 base    = vec3(0.027, 0.027, 0.047);
  vec3 violet  = vec3(0.48, 0.42, 1.0);
  vec3 magenta = vec3(1.0, 0.36, 0.56);
  vec3 cyan    = vec3(0.21, 0.88, 1.0);

  vec3 col = base;
  col += violet  * smoothstep(0.35, 0.95, n) * 0.55;
  col += magenta * smoothstep(0.50, 1.05, m) * 0.34;
  col += cyan    * smoothstep(0.55, 1.05, c) * 0.28;

  // gentle vignette so content stays readable toward the centre/edges
  col *= 1.0 - 0.45 * length(uv - 0.5);
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function BackgroundFX() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = (canvas.getContext('webgl', { antialias: false, depth: false }) ||
      canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      canvas.style.display = 'none'; // CSS aurora remains as the fallback
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
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener('resize', resize);

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let raf = 0;
    const draw = (time: number) => {
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    if (reduce) {
      draw(14); // one calm static frame
    } else {
      const loop = () => {
        draw((performance.now() - start) / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="bg-canvas" aria-hidden="true" />;
}
