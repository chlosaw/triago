import type { ReactNode } from 'react';

/** Hairline card with the design system's blueprint corner marks. */
export function Card({
  className = '',
  children,
  as: Tag = 'div'
}: {
  className?: string;
  children: ReactNode;
  as?: 'div' | 'aside';
}) {
  return (
    <Tag className={`card blueprint ${className}`}>
      <Corners />
      {children}
    </Tag>
  );
}

export function Corners() {
  return (
    <>
      <i className="corner tl" />
      <i className="corner tr" />
      <i className="corner bl" />
      <i className="corner br" />
    </>
  );
}
