import { useEffect, useRef, useState } from "react";
import "./index.css";

type Params = {
  alpha: number;
  epsilon: number;
  particleCount: number;
  speed: number;
  showParticles: boolean;
  showArrows: boolean;
  showField: boolean;
};

type Particle = {
  x: number;
  y: number;
  px: number;
  py: number;
  life: number;
};

const FIELD_W = 150;
const FIELD_H = 100;

/*
  Visual palette.

  Field: cold pale blue, opacity varies with magnitude.
  Tracers: warm orange-red, larger for contrast.
*/
const FIELD_R = 205;
const FIELD_G = 224;
const FIELD_B = 255;

const DOT_R = 255;
const DOT_G = 102;
const DOT_B = 72;

function mulberry32(seed: number) {
  return function random() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randn(random: () => number) {
  let u = 0;
  let v = 0;

  while (u === 0) u = random();
  while (v === 0) v = random();

  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function makeParticle(random: () => number): Particle {
  const margin = 0.08;
  const x = margin + (1 - 2 * margin) * random();
  const y = margin + (1 - 2 * margin) * random();

  return {
    x,
    y,
    px: x,
    py: y,
    life: 0.7 + 0.6 * random(),
  };
}

function makeParticles(n: number, random: () => number): Particle[] {
  return Array.from({ length: n }, () => makeParticle(random));
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function sampleScalarNoise(
  x: number,
  y: number,
  seed: number,
  alpha: number,
  epsilon: number,
) {
  /*
    Fast visual model for a rough scalar field.

    alpha large           -> low frequencies dominate, coherent regions.
    alpha small/negative  -> high frequencies persist, glitchier regions.
    epsilon large         -> stronger mollification, clearer shadow.

    This is not an exact Besov sampler. It is a cheap multiscale
    Fourier-like random field with the intended visual monotonicity.
  */
  let value = 0;
  let norm = 0;

  const randomBase = Math.abs(seed) + 17;
  const octaves = 9;

  for (let j = 0; j < octaves; j++) {
    const freq = 2 ** j;

    const roughWeight = freq ** (-(alpha + 0.55));
    const smoothingWeight = Math.exp(-epsilon * epsilon * freq * freq * 18);
    const weight = roughWeight * smoothingWeight;

    const a1 = Math.sin((randomBase + 13.1 * j) * 12.9898) * 43758.5453;
    const a2 = Math.sin((randomBase + 71.7 * j) * 78.233) * 24634.6345;

    const phase1 = 2 * Math.PI * (a1 - Math.floor(a1));
    const phase2 = 2 * Math.PI * (a2 - Math.floor(a2));

    const angle = 2 * Math.PI * ((j * 0.61803398875 + seed * 0.013) % 1);
    const kx = Math.cos(angle) * freq;
    const ky = Math.sin(angle) * freq;

    value +=
      weight *
      (Math.sin(2 * Math.PI * (kx * x + ky * y) + phase1) +
        0.65 *
          Math.cos(
            2 * Math.PI * ((ky + 0.35) * x - (kx - 0.2) * y) + phase2,
          ));

    norm += Math.abs(weight) * 1.65;
  }

  return norm > 0 ? value / norm : 0;
}

function vectorField(
  x: number,
  y: number,
  seed: number,
  alpha: number,
  epsilon: number,
) {
  /*
    Curl-type vector field from a scalar stream function psi:

        b = (d_y psi, -d_x psi).

    We finite-difference the mollified rough field, so the rendered object
    is a visible shadow of a rough drift.
  */
  const h = 1 / 260;

  const psiY1 = sampleScalarNoise(x, y + h, seed, alpha, epsilon);
  const psiY0 = sampleScalarNoise(x, y - h, seed, alpha, epsilon);
  const psiX1 = sampleScalarNoise(x + h, y, seed, alpha, epsilon);
  const psiX0 = sampleScalarNoise(x - h, y, seed, alpha, epsilon);

  let bx = (psiY1 - psiY0) / (2 * h);
  let by = -(psiX1 - psiX0) / (2 * h);

  const mag = Math.sqrt(bx * bx + by * by);
  const compressed = Math.tanh(0.18 * mag);

  if (mag > 0) {
    bx = (bx / mag) * compressed;
    by = (by / mag) * compressed;
  }

  return [bx, by, compressed] as const;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const fieldCacheRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  const [seed, setSeed] = useState(31);
  const [paused, setPaused] = useState(false);

  const [params, setParams] = useState<Params>({
    alpha: -0.25,
    epsilon: 0.035,
    particleCount: 1200,
    speed: 1,
    showParticles: true,
    showArrows: false,
    showField: true,
  });

  function resetParticles() {
    const random = mulberry32(seed + 1009);
    particlesRef.current = makeParticles(params.particleCount, random);
  }

  useEffect(() => {
    resetParticles();
  }, [params.particleCount, seed]);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    const canvasContext = canvasElement.getContext("2d");
    if (!canvasContext) return;

    const canvas = canvasElement;
    const context = canvasContext;

    const fieldCache = document.createElement("canvas");
    fieldCache.width = FIELD_W;
    fieldCache.height = FIELD_H;
    fieldCacheRef.current = fieldCache;

    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas.getBoundingClientRect();

      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const rebuildFieldCache = () => {
      const cache = fieldCacheRef.current;
      if (!cache) return;

      const cacheContext = cache.getContext("2d");
      if (!cacheContext) return;

      const image = cacheContext.createImageData(FIELD_W, FIELD_H);
      const data = image.data;

      for (let iy = 0; iy < FIELD_H; iy++) {
        for (let ix = 0; ix < FIELD_W; ix++) {
          const x = (ix + 0.5) / FIELD_W;
          const y = (iy + 0.5) / FIELD_H;

          const [, , mag] = vectorField(
            x,
            y,
            seed,
            params.alpha,
            params.epsilon,
          );

          const intensity = clamp(Math.pow(mag, 0.6), 0, 1);
          const alphaByte = Math.floor(
            255 * clamp(0.06 + 0.82 * intensity, 0, 1),
          );

          const offset = 4 * (iy * FIELD_W + ix);
          data[offset] = FIELD_R;
          data[offset + 1] = FIELD_G;
          data[offset + 2] = FIELD_B;
          data[offset + 3] = alphaByte;
        }
      }

      cacheContext.putImageData(image, 0, 0);
    };

    const drawField = () => {
      const rect = canvas.getBoundingClientRect();
      const cache = fieldCacheRef.current;
      if (!cache) return;

      context.imageSmoothingEnabled = false;
      context.drawImage(cache, 0, 0, rect.width, rect.height);
    };

    const drawArrows = () => {
      const rect = canvas.getBoundingClientRect();
      const cols = 24;
      const rows = 15;

      context.strokeStyle = `rgba(${DOT_R},${DOT_G},${DOT_B},0.72)`;
      context.lineWidth = 1;

      for (let iy = 0; iy < rows; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          const x = (ix + 0.5) / cols;
          const y = (iy + 0.5) / rows;

          const [bx, by, mag] = vectorField(
            x,
            y,
            seed,
            params.alpha,
            params.epsilon,
          );

          const px = x * rect.width;
          const py = y * rect.height;
          const len = 22 * mag;

          context.beginPath();
          context.moveTo(px - bx * len * 0.5, py - by * len * 0.5);
          context.lineTo(px + bx * len * 0.5, py + by * len * 0.5);
          context.stroke();
        }
      }
    };

    const stepParticles = () => {
      const dt = 0.006 * params.speed;
      const noise = 0.055 * Math.sqrt(dt);
      const random = Math.random;

      for (const p of particlesRef.current) {
        p.px = p.x;
        p.py = p.y;

        const [bx, by] = vectorField(
          p.x,
          p.y,
          seed,
          params.alpha,
          params.epsilon,
        );

        const nextX = p.x + 0.55 * bx * dt + noise * randn(random);
        const nextY = p.y + 0.55 * by * dt + noise * randn(random);

        /*
          Absorbing boundary for the visualisation:
          when a tracer leaves the square, delete it and respawn it in the
          interior. This avoids artificial-looking accumulation at the edges.
        */
        if (nextX <= 0 || nextX >= 1 || nextY <= 0 || nextY >= 1) {
          const fresh = makeParticle(random);
          p.x = fresh.x;
          p.y = fresh.y;
          p.px = fresh.px;
          p.py = fresh.py;
          p.life = fresh.life;
          continue;
        }

        p.x = nextX;
        p.y = nextY;

        p.life -= dt * 0.035;

        if (p.life <= 0) {
          const fresh = makeParticle(random);
          p.x = fresh.x;
          p.y = fresh.y;
          p.px = fresh.px;
          p.py = fresh.py;
          p.life = fresh.life;
        }
      }
    };

    const drawParticles = () => {
      const rect = canvas.getBoundingClientRect();

      context.fillStyle = `rgba(${DOT_R},${DOT_G},${DOT_B},0.92)`;

      for (const p of particlesRef.current) {
        const px = Math.floor(p.x * rect.width);
        const py = Math.floor(p.y * rect.height);

        context.fillRect(px - 2, py - 2, 5, 5);
      }
    };

    const drawOverlayText = () => {
      const rect = canvas.getBoundingClientRect();

      context.fillStyle = "rgba(0,0,0,0.42)";
      context.fillRect(16, rect.height - 48, 560, 30);

      context.fillStyle = "rgba(245,245,245,0.88)";
      context.font =
        "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

      context.fillText(
        `b^ε = P_ε b      α=${params.alpha.toFixed(
          2,
        )}      ε=${params.epsilon.toFixed(3)}      seed=${seed}`,
        28,
        rect.height - 28,
      );
    };

    const frame = () => {
      const rect = canvas.getBoundingClientRect();

      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, rect.width, rect.height);

      context.fillStyle = "#070707";
      context.fillRect(0, 0, rect.width, rect.height);

      if (params.showField) {
        drawField();
      }

      if (!paused && params.showParticles) {
        stepParticles();
      }

      if (params.showParticles) {
        drawParticles();
      }

      if (params.showArrows) {
        drawArrows();
      }

      drawOverlayText();

      animationRef.current = requestAnimationFrame(frame);
    };

    resize();
    rebuildFieldCache();
    window.addEventListener("resize", resize);

    animationRef.current = requestAnimationFrame(frame);

    return () => {
      window.removeEventListener("resize", resize);

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [params, seed, paused]);

  return (
    <main className="page">
      <section className="stageWrap">
        <canvas ref={canvasRef} className="stage" />
      </section>

      <section className="hero">
        <div className="copy">
          <p className="eyebrow">rough drift / mollification / visible shadow</p>
          <h1>Besov Glitch Field</h1>
          <p className="subtitle">
            A distributional drift cannot be drawn directly. This sketch shows
            its mollified shadow: α controls roughness, ε controls the scale at
            which the field becomes visible.
          </p>
        </div>

        <div className="panel">
          <label>
            <span>
              α <small>regularity</small>
            </span>
            <input
              type="range"
              min="-1.2"
              max="1.2"
              step="0.01"
              value={params.alpha}
              onChange={(event) =>
                setParams((p) => ({
                  ...p,
                  alpha: Number(event.target.value),
                }))
              }
            />
            <output>{params.alpha.toFixed(2)}</output>
          </label>

          <label>
            <span>
              ε <small>mollification</small>
            </span>
            <input
              type="range"
              min="0.005"
              max="0.16"
              step="0.001"
              value={params.epsilon}
              onChange={(event) =>
                setParams((p) => ({
                  ...p,
                  epsilon: Number(event.target.value),
                }))
              }
            />
            <output>{params.epsilon.toFixed(3)}</output>
          </label>

          <label>
            <span>
              N <small>tracers</small>
            </span>
            <input
              type="range"
              min="0"
              max="3500"
              step="100"
              value={params.particleCount}
              onChange={(event) =>
                setParams((p) => ({
                  ...p,
                  particleCount: Number(event.target.value),
                }))
              }
            />
            <output>{params.particleCount}</output>
          </label>

          <label>
            <span>
              v <small>speed</small>
            </span>
            <input
              type="range"
              min="0.1"
              max="4"
              step="0.05"
              value={params.speed}
              onChange={(event) =>
                setParams((p) => ({
                  ...p,
                  speed: Number(event.target.value),
                }))
              }
            />
            <output>{params.speed.toFixed(2)}</output>
          </label>

          <div className="toggles">
            <button
              className={params.showField ? "active" : ""}
              onClick={() =>
                setParams((p) => ({ ...p, showField: !p.showField }))
              }
            >
              field
            </button>
            <button
              className={params.showParticles ? "active" : ""}
              onClick={() =>
                setParams((p) => ({
                  ...p,
                  showParticles: !p.showParticles,
                }))
              }
            >
              tracers
            </button>
            <button
              className={params.showArrows ? "active" : ""}
              onClick={() =>
                setParams((p) => ({ ...p, showArrows: !p.showArrows }))
              }
            >
              arrows
            </button>
          </div>

          <div className="buttons">
            <button onClick={() => setPaused((value) => !value)}>
              {paused ? "resume" : "pause"}
            </button>
            <button onClick={() => setSeed((s) => s + 1)}>new seed</button>
            <button onClick={resetParticles}>reset tracers</button>
          </div>

          <div className="legend">
            <p className="legendTitle">how to read it</p>
            <dl>
              <div>
                <dt>field opacity</dt>
                <dd>magnitude of the mollified drift</dd>
              </div>
              <div>
                <dt>arrows</dt>
                <dd>direction of the drift vector</dd>
              </div>
              <div>
                <dt>orange dots</dt>
                <dd>tracers moving in the visible shadow</dd>
              </div>
              <div>
                <dt>α large</dt>
                <dd>coherent regions, smoother drift</dd>
              </div>
              <div>
                <dt>α negative</dt>
                <dd>high-frequency, distributional glitch</dd>
              </div>
              <div>
                <dt>ε large</dt>
                <dd>stronger smoothing, clearer shadow</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>
    </main>
  );
}
