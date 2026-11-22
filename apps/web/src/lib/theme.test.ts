import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, initialTheme, useTheme } from './theme';

const systemPrefers = (light: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: light && query.includes('light') }));

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('theme', () => {
  it("starts light, even on a dark system, then remembers the user's choice", () => {
    systemPrefers(false);
    expect(initialTheme()).toBe('light');
    window.localStorage.setItem('triago-theme', 'dark');
    expect(initialTheme()).toBe('dark');
  });

  it('toggles between dark and light, applies it to the page and saves it', () => {
    applyTheme('dark');
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());

    expect(result.current.theme).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('triago-theme')).toBe('light');
  });

  it('still works when storage is blocked', () => {
    systemPrefers(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(initialTheme()).toBe('light');

    applyTheme('light');
    const { result } = renderHook(() => useTheme());
    act(() => result.current.toggle());
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
