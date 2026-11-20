import { useState } from 'react';
import { useCorrectText } from '../../api/queries';

/**
 * "Fix spelling & grammar" for one text field. Applies the correction in place
 * and offers Undo, so the author always has the last word.
 */
export function GrammarButton({
  value,
  onChange,
  label = 'Fix spelling & grammar'
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const correct = useCorrectText();
  const [previous, setPrevious] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const run = () =>
    correct.mutate(value, {
      onSuccess: (result) => {
        if (result.changed) {
          setPrevious(value);
          onChange(result.text);
          setMessage('Corrected.');
        } else {
          setPrevious(null);
          setMessage('No changes needed.');
        }
      },
      onError: (error) => setMessage(error.message)
    });

  return (
    <span className="grammar-row">
      <button type="button" className="link-btn" disabled={!value.trim() || correct.isPending} onClick={run}>
        {correct.isPending ? 'Checking…' : label}
      </button>
      {previous !== null && (
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            onChange(previous);
            setPrevious(null);
            setMessage('Change undone.');
          }}
        >
          Undo
        </button>
      )}
      <span className="grammar-status" role="status">
        {message}
      </span>
    </span>
  );
}
