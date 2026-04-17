import { describe, it, expect } from 'vitest';
import { isKnownFinding } from '../../../src/findings/baseline.js';
import type { Finding } from '../../../src/findings/finding.js';

const f = (file: string, ruleId: string, line: number): Finding => ({
  ruleId, description: '', startLine: line, endLine: line,
  startColumn: 0, endColumn: 1, match: '', secret: '', file, commit: '',
  author: '', email: '', date: '', message: '', entropy: 0, fingerprint: '',
  tags: [], confidence: 0.9,
});

describe('isKnownFinding', () => {
  it('returns true when fingerprint matches baseline', () => {
    const baseline = [f('a.ts', 'credential-aws', 5)];
    const finding = f('a.ts', 'credential-aws', 5);
    expect(isKnownFinding(finding, baseline)).toBe(true);
  });
  it('returns false when no match', () => {
    const baseline = [f('a.ts', 'credential-aws', 5)];
    const finding = f('b.ts', 'credential-aws', 5);
    expect(isKnownFinding(finding, baseline)).toBe(false);
  });
});