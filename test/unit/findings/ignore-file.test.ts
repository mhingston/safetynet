import { describe, it, expect } from 'vitest';
import { parseIgnoreFile } from '../../../src/findings/ignore-file.js';

describe('parseIgnoreFile', () => {
  it('parses fingerprint lines ignoring comments and blanks', () => {
    const content = `# comment\n\nabc123:src/a.ts:credential-aws:5\ndef456:src/b.ts:injection:10\n`;
    const result = parseIgnoreFile(content);
    expect(result).toEqual(new Set(['abc123:src/a.ts:credential-aws:5', 'def456:src/b.ts:injection:10']));
  });
  it('returns empty set for empty content', () => {
    expect(parseIgnoreFile('')).toEqual(new Set());
  });
});