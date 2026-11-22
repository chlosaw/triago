import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthContext, type AuthContextValue } from './features/auth/context';

// The starry background draws on a canvas, which jsdom doesn't have.
vi.mock('./components/SpaceBackground', () => ({ SpaceBackground: () => null }));

const signedOut: AuthContextValue = {
  state: { status: 'signed-out' },
  login: vi.fn(),
  register: vi.fn(),
  startDemo: vi.fn(),
  acceptInvite: vi.fn(),
  switchOrg: vi.fn(),
  logout: vi.fn()
};

const visit = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={signedOut}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );

describe('signed-out pages', () => {
  it('shows the homepage at /, not the registration form', () => {
    visit('/');
    expect(screen.getByRole('heading', { name: 'Get started' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('opens registration only from "Create workspace"', async () => {
    visit('/');
    await userEvent.click(screen.getAllByRole('link', { name: 'Create workspace' })[0]!);
    expect(screen.getByRole('heading', { name: 'Create your workspace' })).toBeInTheDocument();
  });

  it('asks for sign-in on links into the app', () => {
    visit('/tickets/123');
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('sends unknown paths to the homepage', () => {
    visit('/nowhere');
    expect(screen.getByRole('heading', { name: 'Get started' })).toBeInTheDocument();
  });
});
