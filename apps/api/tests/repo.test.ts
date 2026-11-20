import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../../..');

/** True when git would ignore the path (exit code 0 from `git check-ignore`). */
function ignored(file: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', file], { cwd: root });
    return true;
  } catch {
    return false;
  }
}

describe('repository hygiene', () => {
  it('never lets env files with secrets into git, but shares the example', () => {
    for (const file of ['.env', '.env.local', '.env.production', 'apps/api/.env.local']) {
      expect(ignored(file), file).toBe(true);
    }
    expect(ignored('.env.example')).toBe(false);
  });
});
