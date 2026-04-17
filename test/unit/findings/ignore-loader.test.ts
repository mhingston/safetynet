import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

describe('loadIgnoreFingerprints', () => {
  it('loads .safetynetignore when both files exist (safetynet takes precedence)', async () => {
    const { loadIgnoreFingerprints } = await import('../../../src/findings/ignore-loader.js');
    vi.mocked(fs.readFile).mockImplementation(async (p: string) => {
      if (p.toString().includes('.safetynetignore')) return 'abc:file.ts:credential-aws:5';
      if (p.toString().includes('.gitleaksignore')) return 'def:other.ts:credential-aws:10';
      throw new Error('not found');
    });
    const result = await loadIgnoreFingerprints('/tmp/test');
    expect(result.has('abc:file.ts:credential-aws:5')).toBe(true);
    expect(result.has('def:other.ts:credential-aws:10')).toBe(false);
  });

  it('loads .gitleaksignore when only that exists', async () => {
    const { loadIgnoreFingerprints } = await import('../../../src/findings/ignore-loader.js');
    vi.mocked(fs.readFile).mockImplementation(async (p: string) => {
      if (p.toString().includes('.gitleaksignore')) return 'def:other.ts:credential-aws:10';
      throw new Error('not found');
    });
    const result = await loadIgnoreFingerprints('/tmp/test');
    expect(result.has('def:other.ts:credential-aws:10')).toBe(true);
  });

  it('returns empty set when neither exists', async () => {
    const { loadIgnoreFingerprints } = await import('../../../src/findings/ignore-loader.js');
    vi.mocked(fs.readFile).mockRejectedValue(new Error('not found'));
    const result = await loadIgnoreFingerprints('/tmp/test');
    expect(result.size).toBe(0);
  });
});