import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /** Extra content under the input, e.g. a password strength meter. */
  hint?: ReactNode;
}

/** Labelled input whose error message is announced and linked to the field. */
export function TextField({ label, error, hint, ...input }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <div className="field-stack">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...input}
      />
      {hint}
      {error && (
        <span id={errorId} className="field-error">
          {error}
        </span>
      )}
    </div>
  );
}
