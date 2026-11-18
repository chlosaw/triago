import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QueryState } from './QueryState';

const query = <T,>(overrides: Partial<{ isPending: boolean; isError: boolean; error: Error | null; data: T }>) => ({
  isPending: false,
  isError: false,
  error: null,
  data: undefined as T | undefined,
  refetch: vi.fn(),
  ...overrides
});

const renderList = (q: ReturnType<typeof query<string[]>>) =>
  render(
    <QueryState query={q} loadingLabel="Loading queue…" isEmpty={(list) => list.length === 0} empty="Nothing here">
      {(list) => (
        <ul>
          {list.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </QueryState>
  );

describe('QueryState', () => {
  it('announces loading', () => {
    renderList(query<string[]>({ isPending: true }));
    expect(screen.getByRole('status')).toHaveTextContent('Loading queue…');
  });

  it('shows the error with a working retry button', async () => {
    const q = query<string[]>({ isError: true, error: new Error('Network down.') });
    renderList(q);
    expect(screen.getByRole('alert')).toHaveTextContent('Network down.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(q.refetch).toHaveBeenCalledOnce();
  });

  it('shows the empty state for an empty list', () => {
    renderList(query<string[]>({ data: [] }));
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders the data once loaded', () => {
    renderList(query<string[]>({ data: ['TRI-1', 'TRI-2'] }));
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['TRI-1', 'TRI-2']);
  });
});
