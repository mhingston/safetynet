import { describe, it, expect } from 'vitest';
import { generateFingerprint } from '../../../src/findings/fingerprint.js';
import type { Finding } from '../../../src/findings/finding.js';

const baseFinding = (overrides: Partial<Finding> = {}): Finding => ({
  ruleId: 'credential-aws', description: '', startLine: 10, endLine: 10,
  startColumn: 0, endColumn: 20, match: 'AKIA...', secret: 'AKIA...',
  file: 'src/config.ts', commit: 'abc123', author: '', email: '', date: '',
  message: '', entropy: 4.5, fingerprint: '', tags: [], confidence: 0.9,
  ...overrides,
});

describe('generateFingerprint', () => {
  it('creates commit-based fingerprint', () => {
    const f = baseFinding({ commit: 'abc123' });
    const fp = generateFingerprint(f);
    expect(fp).toBe('abc123:src/config.ts:credential-aws:10');
  });
  it('creates global fingerprint when no commit', () => {
    const f = baseFinding({ commit: '' });
    const fp = generateFingerprint(f);
    expect(fp).toBe('src/config.ts:credential-aws:10');
  });
});