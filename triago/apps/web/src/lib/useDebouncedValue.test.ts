import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('only updates once the value stops changing', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: '' }
    });

    rerender({ value: 'r' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 're' });
    act(() => vi.advanceTimersByTime(200));
    // 400ms of typing, but never a 300ms pause: still the first value.
    expect(result.current).toBe('');

    act(() => vi.advanceTimersByTime(300));
    expect(result.current).toBe('re');
  });
});
