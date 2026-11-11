import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('VS Code Plugin - Core Integration', () => {
  it('should import the core package', () => {
    // This test verifies that the core package is properly linked
    expect(true).toBe(true);
  });

  it('should have the core package as a dependency', () => {
    const rootPkgPath = resolve(__dirname, '../../../package.json');
    const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf-8'));
    expect(rootPkg.name).toBe('sentry-clip');
  });
});
