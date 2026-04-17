import { describe, it, expect } from 'vitest';
import { processFindings } from '../../../src/findings/processor.js';
import type { Finding } from '../../../src/findings/finding.js';
import type { AllowlistConfig } from '../../../src/findings/allowlist.js';
import type { ProcessorOptions } from '../../../src/findings/processor.js';

const f = (overrides: Partial<Finding> = {}): Finding => ({
  ruleId: 'credential-aws',
  description: 'AWS credential detected',
  startLine: 1,
  endLine: 1,
  startColumn: 0,
  endColumn: 12,
  match: 'AKIAIOSFODNN7EXAMPLE',
  secret: 'AKIAIOSFODNN7EXAMPLE',
  file: 'src/config.ts',
  commit: 'abc123',
  author: 'dev',
  email: 'dev@example.com',
  date: '2025-01-01',
  message: 'init',
  entropy: 0,
  fingerprint: '',
  tags: [],
  confidence: 0.9,
  ...overrides,
});

const defaultAllowlist: AllowlistConfig = {
  paths: [],
  commits: [],
  stopwords: [],
};

const defaultOptions = (overrides: Partial<ProcessorOptions> = {}): ProcessorOptions => ({
  allowlist: defaultAllowlist,
  minConfidence: 0,
  ...overrides,
});

describe('processFindings', () => {
  it('returns empty array for empty input', () => {
    const result = processFindings([], defaultOptions());
    expect(result).toEqual([]);
  });

  it('assigns fingerprint to each finding', () => {
    const finding = f({ commit: 'abc123', file: 'src/config.ts', ruleId: 'credential-aws', startLine: 1 });
    const result = processFindings([finding], defaultOptions());
    expect(result[0].fingerprint).toBe('abc123:src/config.ts:credential-aws:1');
  });

  it('assigns fingerprint without commit when commit is empty', () => {
    const finding = f({ commit: '', file: 'src/app.ts', ruleId: 'credential-aws', startLine: 5 });
    const result = processFindings([finding], defaultOptions());
    expect(result[0].fingerprint).toBe('src/app.ts:credential-aws:5');
  });

  it('calculates entropy for each finding secret', () => {
    const finding = f({ secret: 'AAAA' });
    const result = processFindings([finding], defaultOptions());
    expect(result[0].entropy).toBe(0);
  });

  it('calculates non-zero entropy for varied secrets', () => {
    const finding = f({ secret: 'AKIAIOSFODNN7EXAMPLE' });
    const result = processFindings([finding], defaultOptions());
    expect(result[0].entropy).toBeGreaterThan(0);
  });

  it('filters out baseline findings', () => {
    const finding = f({ commit: 'abc123', file: 'src/config.ts', ruleId: 'credential-aws', startLine: 1 });
    const baseline = [f({ commit: 'abc123', file: 'src/config.ts', ruleId: 'credential-aws', startLine: 1 })];
    const result = processFindings([finding], defaultOptions({ baseline }));
    expect(result).toHaveLength(0);
  });

  it('keeps findings not in baseline', () => {
    const finding = f({ commit: 'abc123', file: 'src/config.ts', ruleId: 'credential-aws', startLine: 1 });
    const baseline = [f({ commit: 'other', file: 'other.ts', ruleId: 'other', startLine: 1 })];
    const result = processFindings([finding], defaultOptions({ baseline }));
    expect(result).toHaveLength(1);
  });

  it('filters allowlist by path regex', () => {
    const finding = f({ file: 'vendor/lib/a.ts' });
    const allowlist: AllowlistConfig = { paths: ['^vendor/'], commits: [], stopwords: [] };
    const result = processFindings([finding], defaultOptions({ allowlist }));
    expect(result).toHaveLength(0);
  });

  it('filters allowlist by commit', () => {
    const finding = f({ commit: 'skipthis' });
    const allowlist: AllowlistConfig = { paths: [], commits: ['skipthis'], stopwords: [] };
    const result = processFindings([finding], defaultOptions({ allowlist }));
    expect(result).toHaveLength(0);
  });

  it('filters allowlist by stopword', () => {
    const finding = f({ secret: 'example_key_value' });
    const allowlist: AllowlistConfig = { paths: [], commits: [], stopwords: ['example'] };
    const result = processFindings([finding], defaultOptions({ allowlist }));
    expect(result).toHaveLength(0);
  });

  it('keeps findings not matching allowlist', () => {
    const finding = f({ file: 'src/app.ts', commit: 'abc123', secret: 'AKIAIOSFODNN7EXAMPLE' });
    const allowlist: AllowlistConfig = { paths: ['^vendor/'], commits: ['othercommit'], stopwords: ['fake'] };
    const result = processFindings([finding], defaultOptions({ allowlist }));
    expect(result).toHaveLength(1);
  });

  it('filters by ignoreFingerprints set', () => {
    const finding = f({ commit: 'abc123', file: 'src/config.ts', ruleId: 'credential-aws', startLine: 1 });
    const ignoreSet = new Set(['abc123:src/config.ts:credential-aws:1']);
    const result = processFindings([finding], defaultOptions({ ignoreFingerprints: ignoreSet }));
    expect(result).toHaveLength(0);
  });

  it('keeps findings whose fingerprints are not ignored', () => {
    const finding = f({ commit: 'abc123', file: 'src/config.ts', ruleId: 'credential-aws', startLine: 1 });
    const ignoreSet = new Set(['other:fingerprint:here:5']);
    const result = processFindings([finding], defaultOptions({ ignoreFingerprints: ignoreSet }));
    expect(result).toHaveLength(1);
  });

  it('filters findings below minConfidence', () => {
    const finding = f({ confidence: 0.3 });
    const result = processFindings([finding], defaultOptions({ minConfidence: 0.5 }));
    expect(result).toHaveLength(0);
  });

  it('keeps findings at or above minConfidence', () => {
    const finding = f({ confidence: 0.5 });
    const result = processFindings([finding], defaultOptions({ minConfidence: 0.5 }));
    expect(result).toHaveLength(1);
  });

  it('does not throttle low-confidence findings (Task 16)', () => {
    const low = f({ confidence: 0.1 });
    const result = processFindings([low], defaultOptions({ minConfidence: 0 }));
    expect(result).toHaveLength(1);
  });

  it('redacts secrets with redact option', () => {
    const finding = f({ secret: 'AKIAIOSFODNN7EXAMPLE' });
    const result = processFindings([finding], defaultOptions({ redact: 4 }));
    expect(result[0].secret).toBe('AKIA****************');
  });

  it('redacts keeping only first character when redact is 1', () => {
    const finding = f({ secret: 'SECRET' });
    const result = processFindings([finding], defaultOptions({ redact: 1 }));
    expect(result[0].secret).toBe('S*****');
  });

  it('does not redact when redact is not set', () => {
    const finding = f({ secret: 'AKIAIOSFODNN7EXAMPLE' });
    const result = processFindings([finding], defaultOptions());
    expect(result[0].secret).toBe('AKIAIOSFODNN7EXAMPLE');
  });

  it('does not mutate original finding objects', () => {
    const original = f({ secret: 'AKIAIOSFODNN7EXAMPLE' });
    const originalSecret = original.secret;
    const originalFingerprint = original.fingerprint;
    const originalEntropy = original.entropy;
    processFindings([original], defaultOptions({ redact: 4 }));
    expect(original.secret).toBe(originalSecret);
    expect(original.fingerprint).toBe(originalFingerprint);
    expect(original.entropy).toBe(originalEntropy);
  });

  it('processes multiple findings independently', () => {
    const findings = [
      f({ secret: 'AAAA', confidence: 0.9 }),
      f({ secret: 'BBBB', confidence: 0.1 }),
    ];
    const result = processFindings(findings, defaultOptions({ minConfidence: 0.5 }));
    expect(result).toHaveLength(1);
    expect(result[0].secret).toBe('AAAA');
  });

  describe('confidence threshold and low-confidence tagging', () => {
    it('reports finding when confidence >= threshold', () => {
      const findings = [f({ confidence: 0.9 })];
      const result = processFindings(findings, defaultOptions({ minConfidence: 0.5, threshold: 0.85 }));
      expect(result).toHaveLength(1);
      expect(result[0].tags).not.toContain('low-confidence');
    });

    it('suppresses finding when confidence < minConfidence', () => {
      const findings = [f({ confidence: 0.4 })];
      const result = processFindings(findings, defaultOptions({ minConfidence: 0.5, threshold: 0.85 }));
      expect(result).toHaveLength(0);
    });

    it('adds low-confidence tag when confidence < threshold but >= minConfidence', () => {
      const findings = [f({ confidence: 0.7 })];
      const result = processFindings(findings, defaultOptions({ minConfidence: 0.5, threshold: 0.85 }));
      expect(result).toHaveLength(1);
      expect(result[0].tags).toContain('low-confidence');
    });
  });
});

describe('deduplicateFindings', () => {
  it('removes duplicate findings by fingerprint', async () => {
    const { deduplicateFindings } = await import('../../../src/findings/processor.js');
    const findings: Finding[] = [
      { ...f(), fingerprint: 'abc:file.ts:credential-aws:1' },
      { ...f(), fingerprint: 'abc:file.ts:credential-aws:1' },
      { ...f(), fingerprint: 'def:file.ts:credential-aws:2' },
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });

  it('returns all unique findings', async () => {
    const { deduplicateFindings } = await import('../../../src/findings/processor.js');
    const findings: Finding[] = [
      { ...f(), fingerprint: 'a' },
      { ...f(), fingerprint: 'b' },
      { ...f(), fingerprint: 'c' },
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(3);
  });
});