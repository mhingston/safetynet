import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processFindings } from '../../src/findings/processor.js';
import type { Finding } from '../../src/findings/finding.js';
import { createReporter } from '../../src/report/reporter-factory.js';
import type { AllowlistConfig } from '../../src/findings/allowlist.js';
import type { ProcessorOptions } from '../../src/findings/processor.js';
import { chunkIntoFragments } from '../../src/scanner/fragment-reader.js';
import { extractSpans } from '../../src/classifier/span-extractor.js';
import { deriveRuleId, deriveTags } from '../../src/classifier/rule-id.js';
import { NerLabel } from '../../src/classifier/types.js';

vi.mock('../../src/classifier/pipeline.js', () => ({
  loadPipeline: vi.fn(),
  classifyFragment: vi.fn(),
}));

import { classifyFragment } from '../../src/classifier/pipeline.js';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'credential-aws',
    description: 'AWS Access Key detected',
    startLine: 1,
    endLine: 1,
    startColumn: 20,
    endColumn: 40,
    match: 'AKIAIOSFODNN7EXAMPLE',
    secret: 'AKIAIOSFODNN7EXAMPLE',
    file: 'stdin',
    commit: '',
    author: '',
    email: '',
    date: '',
    message: '',
    entropy: 0,
    fingerprint: '',
    tags: ['credential', 'aws'],
    confidence: 0.92,
    ...overrides,
  };
}

const defaultAllowlist: AllowlistConfig = {
  paths: [],
  commits: [],
  stopwords: [],
};

const stdinContent = [
  '[default]',
  'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
  'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  'region = us-east-1',
].join('\n');

describe('integration: stdin scan', () => {
  beforeEach(() => {
    const mockClassify = classifyFragment as ReturnType<typeof vi.fn>;
    mockClassify.mockImplementation(async (text: string) => {
      if (text.includes('AKIAIOSFODNN7EXAMPLE')) {
        return [
          {
            token: 'AKIAIOSFODNN7EXAMPLE',
            label: NerLabel.B_CREDENTIAL_AWS,
            confidence: 0.92,
            start: 20,
            end: 40,
          },
        ];
      }
      return [];
    });
  });

  it('chunks stdin content, classifies fragments, and produces findings', async () => {
    const lines = stdinContent.split('\n');
    const fragments = chunkIntoFragments(lines);

    const allFindings: Finding[] = [];
    for (const fragment of fragments) {
      const tokens = await classifyFragment(fragment.lines.join('\n'));
      const spans = extractSpans(tokens, fragment.offsetLine);
      for (const span of spans) {
        const ruleId = deriveRuleId(span.tokens[0].label);
        const tags = deriveTags(span.tokens[0].label);
        allFindings.push({
          ruleId,
          description: `${ruleId} detected`,
          startLine: span.startLine,
          endLine: span.endLine,
          startColumn: span.startColumn,
          endColumn: span.endColumn,
          match: span.text,
          secret: span.text,
          file: 'stdin',
          commit: '',
          author: '',
          email: '',
          date: '',
          message: '',
          entropy: 0,
          fingerprint: '',
          tags,
          confidence: span.maxConfidence,
        });
      }
    }

    expect(allFindings.length).toBeGreaterThan(0);

    const options: ProcessorOptions = {
      allowlist: defaultAllowlist,
      minConfidence: 0.5,
    };
    const processed = processFindings(allFindings, options);
    expect(processed.length).toBeGreaterThan(0);
    expect(processed[0].file).toBe('stdin');
    expect(processed[0].fingerprint).toBeTruthy();
    expect(processed[0].entropy).toBeGreaterThan(0);
  });

  it('produces json report from stdin findings', async () => {
    const findings = [makeFinding()];
    const options: ProcessorOptions = {
      allowlist: defaultAllowlist,
      minConfidence: 0,
    };
    const processed = processFindings(findings, options);

    const reporter = createReporter('json');
    const output = reporter.report(processed);
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].file).toBe('stdin');
  });

  it('produces csv report from stdin findings', async () => {
    const findings = [makeFinding()];
    const options: ProcessorOptions = {
      allowlist: defaultAllowlist,
      minConfidence: 0,
    };
    const processed = processFindings(findings, options);

    const reporter = createReporter('csv');
    const output = reporter.report(processed);
    expect(output).toContain('file');
    expect(output).toContain('stdin');
  });

  it('filters stdin findings through allowlist by stopword', async () => {
    const findings = [makeFinding({ secret: 'AKIAIOSFODNN7EXAMPLE' })];
    const options: ProcessorOptions = {
      allowlist: { paths: [], commits: [], stopwords: ['EXAMPLE'] },
      minConfidence: 0,
    };
    const processed = processFindings(findings, options);
    expect(processed).toHaveLength(0);
  });

  it('redacts secrets in stdin findings', async () => {
    const findings = [makeFinding({ secret: 'AKIAIOSFODNN7EXAMPLE' })];
    const options: ProcessorOptions = {
      allowlist: defaultAllowlist,
      minConfidence: 0,
      redact: 4,
    };
    const processed = processFindings(findings, options);
    expect(processed[0].secret).toBe('AKIA****************');
  });

  it('produces empty findings for safe stdin content', async () => {
    const safeContent = 'const x = 42;\nconsole.log(x);';
    const lines = safeContent.split('\n');
    const fragments = chunkIntoFragments(lines);

    const allFindings: Finding[] = [];
    for (const fragment of fragments) {
      const tokens = await classifyFragment(fragment.lines.join('\n'));
      const spans = extractSpans(tokens, fragment.offsetLine);
      for (const span of spans) {
        allFindings.push({
          ruleId: deriveRuleId(span.tokens[0].label),
          description: '',
          startLine: span.startLine,
          endLine: span.endLine,
          startColumn: span.startColumn,
          endColumn: span.endColumn,
          match: span.text,
          secret: span.text,
          file: 'stdin',
          commit: '',
          author: '',
          email: '',
          date: '',
          message: '',
          entropy: 0,
          fingerprint: '',
          tags: deriveTags(span.tokens[0].label),
          confidence: span.maxConfidence,
        });
      }
    }

    expect(allFindings).toHaveLength(0);
  });
});