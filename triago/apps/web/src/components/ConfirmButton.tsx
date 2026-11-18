import { useEffect, useState, type ReactNode } from 'react';

interface ConfirmButtonProps {
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  className?: string;
  'aria-label'?: string;
}

/** A button that needs a second click within a few seconds before it acts. */
export function ConfirmButton({ children, confirmLabel, onConfirm, className = '', ...rest }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={`${className} ${armed ? 'is-armed' : ''}`}
      aria-label={armed ? confirmLabel : rest['aria-label']}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? confirmLabel : children}
    </button>
  );
}
