import type { Category, Priority } from '@triago/shared';

/** 16px square icon per ticket type, in the style of issue-type icons. */
export function CategoryIcon({ category, size = 16 }: { category: Category; size?: number }) {
  const shapes: Record<Category, { fill: string; glyph: JSX.Element }> = {
    bug: { fill: '#e2483d', glyph: <circle cx="8" cy="8" r="3.2" fill="#fff" /> },
    request: {
      fill: '#22a06b',
      glyph: <path d="M8 4.5v7M4.5 8h7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    },
    question: {
      fill: '#1d7afc',
      glyph: (
        <path
          d="M6.2 6.4a1.9 1.9 0 1 1 2.6 1.75c-.5.22-.8.6-.8 1.1v.35M8 11.6v.1"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      )
    },
    billing: {
      fill: '#8f7ee7',
      glyph: (
        <path
          d="M9.8 5.6c-.4-.5-1-.8-1.8-.8-1 0-1.8.5-1.8 1.3 0 1.9 3.6 1 3.6 3 0 .8-.8 1.4-1.8 1.4-.8 0-1.5-.3-1.9-.9M8 3.8v8.4"
          fill="none"
          stroke="#fff"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      )
    }
  };
  const { fill, glyph } = shapes[category];
  return (
    <svg className="type-icon" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <rect width="16" height="16" rx="3" fill={fill} />
      {glyph}
    </svg>
  );
}

/** Priority arrows: two up for urgent, one up for high, equals for medium, one down for low. */
export function PriorityIcon({ priority, size = 16 }: { priority: Priority; size?: number }) {
  const stroke = { fill: 'none', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const paths: Record<Priority, JSX.Element> = {
    urgent: (
      <g stroke="#c9372c" {...stroke}>
        <path d="M4 8.5 8 4.5l4 4" />
        <path d="M4 12.5 8 8.5l4 4" />
      </g>
    ),
    high: <path d="M4 10.5 8 6.5l4 4" stroke="#e2483d" {...stroke} />,
    medium: (
      <g stroke="#d97008" {...stroke}>
        <path d="M4 6.5h8" />
        <path d="M4 10h8" />
      </g>
    ),
    low: <path d="M4 6.5 8 10.5l4-4" stroke="#1d7afc" {...stroke} />
  };
  return (
    <svg className="priority-icon" viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      {paths[priority]}
    </svg>
  );
}

/** Round avatar with initials, coloured per person so teammates are easy to tell apart. */
export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const palette = ['#0c66e4', '#1f845a', '#ae2e24', '#6e5dc6', '#a54800', '#206a83', '#943d73'];
  const index = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length;
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: palette[index] }}
      aria-hidden="true"
    >
      {initials || '?'}
    </span>
  );
}
