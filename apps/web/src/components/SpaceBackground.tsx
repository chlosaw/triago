import type { CSSProperties } from 'react';

/** Line icons in a 24×24 box, as SVG path data (stroked). */
const ICON_PATHS = {
  mail: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', 'm22 7-10 6L2 7'],
  headphones: [
    'M3 18v-6a9 9 0 0 1 18 0v6',
    'M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z'
  ],
  // A ticket as a sheet of paper: folded corner and a few lines of text.
  ticket: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 9h2M8 13h8M8 17h8']
} as const;

type IconName = keyof typeof ICON_PATHS;

/**
 * A few icons, placed by hand where there is no text: the band above the hero, the
 * gutter between the two columns and the right edge. x and y are percentages of the
 * page; duration and delay (seconds) keep them out of step with each other.
 */
const ICONS: { name: IconName; x: number; y: number; size: number; duration: number; delay: number }[] = [
  { name: 'mail', x: 31, y: 5, size: 30, duration: 26, delay: 0 },
  { name: 'ticket', x: 46, y: 9, size: 26, duration: 32, delay: -8 },
  { name: 'headphones', x: 63, y: 4, size: 28, duration: 29, delay: -14 },
  { name: 'ticket', x: 53, y: 30, size: 34, duration: 34, delay: -5 },
  { name: 'mail', x: 54, y: 56, size: 28, duration: 27, delay: -19 },
  { name: 'headphones', x: 52, y: 80, size: 30, duration: 31, delay: -11 },
  { name: 'mail', x: 96, y: 24, size: 26, duration: 30, delay: -3 },
  { name: 'ticket', x: 97, y: 52, size: 30, duration: 28, delay: -16 },
  { name: 'headphones', x: 95, y: 82, size: 26, duration: 33, delay: -22 }
];

/** Seeded linear congruential generator (a = 1103515245, c = 12345, m = 2^31). */
let seed = 42;
function seededRandom() {
  seed = (Math.imul(1103515245, seed) + 12345) & 0x7fffffff;
  return seed / 2147483648;
}

/** One box-shadow per star, positioned in container query units of `.space-stars-field`. */
function starShadows(count: number) {
  return Array.from({ length: count }, () => `${seededRandom() * 100}cqw ${seededRandom() * 100}cqh #fff`).join(', ');
}

// Sparse and still: the stars set the mood, the few icons are the only movement.
const STAR_LAYERS = [
  { className: 'space-stars-sm', shadow: starShadows(160) },
  { className: 'space-stars-md', shadow: starShadows(60) }
];

/**
 * The signed-out pages' background: a still star field and nine faint icons that
 * drift slowly in the empty areas. The drift is pure CSS (transform and opacity
 * only) and runs only for people who haven't asked their system for reduced motion.
 * Never used inside the app.
 */
export function SpaceBackground() {
  return (
    <div className="space-bg" aria-hidden="true">
      <div className="space-stars-field">
        {STAR_LAYERS.map((layer) => (
          <div key={layer.className} className={`space-stars ${layer.className}`} style={{ boxShadow: layer.shadow }} />
        ))}
      </div>
      {ICONS.map((icon, index) => (
        <svg
          key={index}
          className="space-icon"
          viewBox="0 0 24 24"
          width={icon.size}
          height={icon.size}
          style={
            {
              left: `${icon.x}%`,
              top: `${icon.y}%`,
              '--drift-duration': `${icon.duration}s`,
              '--drift-delay': `${icon.delay}s`
            } as CSSProperties
          }
        >
          {ICON_PATHS[icon.name].map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      ))}
    </div>
  );
}
