import { useEffect, useRef } from 'react';

/** Line icons in a 24×24 box, as SVG path data (stroked). */
const ICON_PATHS: Record<string, string[]> = {
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 7-10 6L2 7'],
  headset: [
    'M4 14v-3a8 8 0 0 1 16 0v3',
    'M4 12h1a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 5 18H4a1.5 1.5 0 0 1-1.5-1.5v-3A1.5 1.5 0 0 1 4 12z',
    'M19 12h1a1.5 1.5 0 0 1 1.5 1.5v3A1.5 1.5 0 0 1 20 18h-1a1.5 1.5 0 0 1-1.5-1.5v-3A1.5 1.5 0 0 1 19 12z',
    'M20 18v.5a3 3 0 0 1-3 3h-3'
  ],
  headphones: [
    'M3 18v-6a9 9 0 0 1 18 0v6',
    'M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z'
  ],
  phone: [
    'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z'
  ],
  // A ticket as a sheet of paper: folded corner and a few lines of text.
  ticket: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 9h2M8 13h8M8 17h8']
};
const ICON_NAMES = Object.keys(ICON_PATHS);

/** Screen area per icon; smaller = more crowded. */
const AREA_PER_ICON = 11000;
const MAX_ICONS = 140;
const MIN_ICONS = 24;
/** Pixels per second. */
const MIN_SPEED = 18;
const MAX_SPEED = 70;

type Body = {
  paths: Path2D[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  size: number;
  r: number;
  mass: number;
  alpha: number;
};

function makeBodies(width: number, height: number): Body[] {
  const count = Math.max(MIN_ICONS, Math.min(MAX_ICONS, Math.round((width * height) / AREA_PER_ICON)));
  const paths = Object.fromEntries(ICON_NAMES.map((n) => [n, ICON_PATHS[n]!.map((d) => new Path2D(d))]));
  const bodies: Body[] = [];
  for (let i = 0; i < count; i++) {
    const depth = Math.random(); // 0 = far, 1 = near
    const size = 16 + depth * 26;
    const r = size * 0.52;
    // Try a few spots so icons don't start on top of each other.
    let x = 0;
    let y = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      x = r + Math.random() * (width - 2 * r);
      y = r + Math.random() * (height - 2 * r);
      if (bodies.every((b) => Math.hypot(b.x - x, b.y - y) > b.r + r + 2)) break;
    }
    const speed = 22 + Math.random() * 38;
    const heading = Math.random() * Math.PI * 2;
    bodies.push({
      paths: paths[ICON_NAMES[i % ICON_NAMES.length]!]!,
      x,
      y,
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.4,
      size,
      r,
      mass: r * r,
      alpha: 0.16 + depth * 0.34
    });
  }
  return bodies;
}

function step(bodies: Body[], dt: number, width: number, height: number) {
  for (const b of bodies) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.angle += b.spin * dt;
    // Bounce off the edges.
    if (b.x < b.r) {
      b.x = b.r;
      b.vx = Math.abs(b.vx);
    } else if (b.x > width - b.r) {
      b.x = width - b.r;
      b.vx = -Math.abs(b.vx);
    }
    if (b.y < b.r) {
      b.y = b.r;
      b.vy = Math.abs(b.vy);
    } else if (b.y > height - b.r) {
      b.y = height - b.r;
      b.vy = -Math.abs(b.vy);
    }
  }

  // Elastic collisions between icons (treated as discs).
  for (let i = 0; i < bodies.length; i++) {
    const a = bodies[i]!;
    for (let j = i + 1; j < bodies.length; j++) {
      const b = bodies[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minDist = a.r + b.r;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist || distSq === 0) continue;

      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const ny = dy / dist;

      // Push apart so they don't stick together.
      const overlap = minDist - dist;
      const total = a.mass + b.mass;
      a.x -= nx * overlap * (b.mass / total);
      a.y -= ny * overlap * (b.mass / total);
      b.x += nx * overlap * (a.mass / total);
      b.y += ny * overlap * (a.mass / total);

      // Exchange momentum along the contact normal.
      const relVel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relVel > 0) continue; // already separating
      const impulse = (-2 * relVel) / total;
      a.vx -= impulse * b.mass * nx;
      a.vy -= impulse * b.mass * ny;
      b.vx += impulse * a.mass * nx;
      b.vy += impulse * a.mass * ny;

      // A glancing hit sets them spinning.
      const tangential = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx;
      a.spin += tangential * 0.01;
      b.spin -= tangential * 0.01;
    }
  }

  // Keep things drifting: no runaway speeds or spins, no dead stops.
  for (const b of bodies) {
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) {
      b.vx *= MAX_SPEED / speed;
      b.vy *= MAX_SPEED / speed;
    } else if (speed < MIN_SPEED) {
      if (speed === 0) {
        b.vx = MIN_SPEED;
      } else {
        b.vx *= MIN_SPEED / speed;
        b.vy *= MIN_SPEED / speed;
      }
    }
    b.spin = Math.max(-3, Math.min(3, b.spin));
  }
}

function draw(ctx: CanvasRenderingContext2D, bodies: Body[], width: number, height: number) {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const b of bodies) {
    const scale = b.size / 24;
    ctx.save();
    ctx.globalAlpha = b.alpha;
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle);
    ctx.scale(scale, scale);
    ctx.translate(-12, -12);
    ctx.lineWidth = 1.4;
    for (const p of b.paths) ctx.stroke(p);
    ctx.restore();
  }
}

/** Seeded linear congruential generator (a = 1103515245, c = 12345, m = 2^31). */
let seed = 42;
function seededRandom() {
  seed = (Math.imul(1103515245, seed) + 12345) & 0x7fffffff;
  return seed / 2147483648;
}

/** One box-shadow per star, positioned in container query units of `.space-stars-field`. */
function starShadows(count: number) {
  return Array.from({ length: count }, () => {
    const x = seededRandom() * 100;
    const y = seededRandom() * 100;
    return `${x}cqw ${y}cqh #fff`;
  }).join(', ');
}

// Order matters: it matches the seeded sequence of the original Sass version.
const STAR_LAYERS = [
  { className: 'space-stars-sm', shadow: starShadows(300) },
  { className: 'space-stars-md', shadow: starShadows(200) },
  { className: 'space-stars-lg', shadow: starShadows(100) }
];

export function SpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    let bodies: Body[] = [];
    let frame = 0;
    let last = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const grew = rect.width > width * 1.3 || rect.height > height * 1.3;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (bodies.length === 0 || grew) bodies = makeBodies(width, height);
      draw(ctx, bodies, width, height);
    };

    const tick = (now: number) => {
      // Cap the step so a background tab doesn't teleport everything.
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      step(bodies, dt, width, height);
      draw(ctx, bodies, width, height);
      frame = requestAnimationFrame(tick);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!reduceMotion) frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="space-bg" aria-hidden>
      <div className="space-stars-field">
        {STAR_LAYERS.map((layer) => (
          <div key={layer.className} className={`space-stars ${layer.className}`} style={{ boxShadow: layer.shadow }} />
        ))}
      </div>
      <canvas ref={canvasRef} className="space-canvas" />
    </div>
  );
}
