interface ToggleProps {
  label: string;
  note: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ label, note, checked, onChange, disabled }: ToggleProps) {
  return (
    <div
      className="toggle-row"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={(event) => {
        if (!disabled && (event.key === ' ' || event.key === 'Enter')) {
          event.preventDefault();
          onChange(!checked);
        }
      }}
    >
      <div className="toggle-copy">
        <span>{label}</span>
        <small>{note}</small>
      </div>
      <div className={`toggle-track ${checked ? 'is-on' : ''}`}>
        <span className="toggle-knob" />
      </div>
    </div>
  );
}
