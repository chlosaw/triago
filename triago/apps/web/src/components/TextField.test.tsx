import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TextField } from './TextField';

describe('TextField', () => {
  it('labels the input', () => {
    render(<TextField label="Work email" />);
    expect(screen.getByLabelText('Work email')).toBeInstanceOf(HTMLInputElement);
  });

  it('marks the input invalid and links it to the error message', () => {
    render(<TextField label="Work email" error="Enter a valid email address." />);
    const input = screen.getByLabelText('Work email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a valid email address.');
  });

  it('is not marked invalid without an error', () => {
    render(<TextField label="Work email" />);
    expect(screen.getByLabelText('Work email')).not.toHaveAttribute('aria-invalid');
  });
});
