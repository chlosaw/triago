import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as renderBare, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NoteForm } from './NotesPanel';

// The form's grammar button uses a query mutation, so it needs a client.
const render = (ui: ReactElement) =>
  renderBare(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('NoteForm', () => {
  it('blocks an empty note with the schema message and does not submit', async () => {
    const onSubmit = vi.fn();
    render(<NoteForm submitLabel="Add note" pending={false} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('New note'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Write something first.');
    expect(screen.getByLabelText('New note')).toHaveAttribute('aria-invalid', 'true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the trimmed note and clears the field on success', async () => {
    const onSubmit = vi.fn((_body: string, reset: () => void) => reset());
    render(<NoteForm submitLabel="Add note" pending={false} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('New note'), '  Called the customer.  ');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));

    expect(onSubmit).toHaveBeenCalledWith('Called the customer.', expect.any(Function));
    expect(screen.getByLabelText('New note')).toHaveValue('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a server error and disables the button while saving', () => {
    render(<NoteForm submitLabel="Add note" pending serverError="Ticket not found." onSubmit={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Ticket not found.');
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});
