import { describe, it, expect } from 'vitest';
import { isAllowed } from '../../../src/findings/allowlist.js';
import type { Finding } from '../../../src/findings/finding.js';

const f = (file: string, secret: string, commit: string): Finding => ({
  ruleId: 'credential-aws', description: '', startLine: 1, endLine: 1,
  startColumn: 0, endColumn: 1, match: secret, secret, file, commit,
  author: '', email: '', date: '', message: '', entropy: 0, fingerprint: '',
  tags: [], confidence: 0.9,
});

describe('isAllowed', () => {
  it('allows by path regex', () => {
    const config = { paths: ['^vendor/'], commits: [] as string[], stopwords: [] as string[] };
    expect(isAllowed(f('vendor/lib/a.ts', 'AKIA...', ''), config)).toBe(true);
    expect(isAllowed(f('src/config.ts', 'AKIA...', ''), config)).toBe(false);
  });
  it('allows by commit', () => {
    const config = { paths: [] as string[], commits: ['abc123'], stopwords: [] as string[] };
    expect(isAllowed(f('src/a.ts', 'AKIA...', 'abc123'), config)).toBe(true);
    expect(isAllowed(f('src/a.ts', 'AKIA...', 'def456'), config)).toBe(false);
  });
  it('allows by stopword in secret', () => {
    const config = { paths: [] as string[], commits: [] as string[], stopwords: ['example'] };
    expect(isAllowed(f('a.ts', 'example_key', ''), config)).toBe(true);
    expect(isAllowed(f('a.ts', 'AKIAIOSFODNN', ''), config)).toBe(false);
  });
});