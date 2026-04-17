import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { scanDirectory } from '../../src/scanner/directory-scanner.js';
import { chunkIntoFragments } from '../../src/scanner/fragment-reader.js';
import { processFindings } from '../../src/findings/processor.js';
import type { Finding } from '../../src/findings/finding.js';
import { createReporter } from '../../src/report/reporter-factory.js';
import type { AllowlistConfig } from '../../src/findings/allowlist.js';
import type { ProcessorOptions } from '../../src/findings/processor.js';

vi.mock('../../src/classifier/pipeline.js', () => ({
  loadPipeline: vi.fn(),
  classifyFragment: vi.fn(),
}));

import { classifyFragment } from '../../src/classifier/pipeline.js';
import { NerLabel } from '../../src/classifier/types.js';
import { extractSpans } from '../../src/classifier/span-extractor.js';
import { deriveRuleId, deriveTags } from '../../src/classifier/rule-id.js';

const defaultAllowlist: AllowlistConfig = {
  paths: [],
  commits: [],
  stopwords: [],
};

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'credential-aws',
    description: 'AWS credential detected',
    startLine: 1,
    endLine: 1,
    startColumn: 0,
    endColumn: 20,
    match: 'AKIAIOSFODNN7EXAMPLE',
    secret: 'AKIAIOSFODNN7EXAMPLE',
    file: 'secrets/aws-key.txt',
    commit: '',
    author: 'test',
    email: 'test@test.com',
    date: '2025-01-01',
    message: 'init',
    entropy: 0,
    fingerprint: '',
    tags: ['credential', 'aws'],
    confidence: 0.95,
    ...overrides,
  };
}

function classifyMockToFindings(
  filePath: string,
  content: string,
  _startLine: number,
): Finding[] {
  const results = [
    {
      ruleId: 'credential-aws',
      description: 'AWS credential detected',
      startLine: _startLine,
      endLine: _startLine,
      startColumn: 20,
      endColumn: 40,
      match: 'AKIAIOSFODNN7EXAMPLE',
      secret: 'AKIAIOSFODNN7EXAMPLE',
      file: filePath,
      commit: '',
      author: '',
      email: '',
      date: '',
      message: '',
      entropy: 0,
      fingerprint: '',
      tags: ['credential', 'aws'],
      confidence: 0.95,
    },
  ];
  return results;
}

describe('integration: directory scan', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(process.cwd(), 'test-dir-'));
    const secretsDir = path.join(tmpDir, 'secrets');
    const safeDir = path.join(tmpDir, 'safe');
    await fs.mkdir(secretsDir);
    await fs.mkdir(safeDir);
    await fs.writeFile(path.join(secretsDir, 'aws-key.txt'), [
      '[default]',
      'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
      'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      'region = us-east-1',
    ].join('\n'));
    await fs.writeFile(path.join(safeDir, 'hello.ts'), [
      'function greet(name: string): string {',
      '  return `Hello, ${name}!`;',
      '}',
      '',
      'console.log(greet("world"));',
    ].join('\n'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('scans directory, classifies files, and produces findings through processor and reporter', async () => {
    const files = await scanDirectory(tmpDir);
    expect(files.length).toBeGreaterThanOrEqual(2);

    const secretFile = files.find(f => f.endsWith('aws-key.txt'));
    const safeFile = files.find(f => f.endsWith('hello.ts'));
    expect(secretFile).toBeDefined();
    expect(safeFile).toBeDefined();

    const mockClassify = classifyFragment as ReturnType<typeof vi.fn>;
    mockClassify.mockImplementation(async (text: string) => {
      if (text.includes('AKIAIOSFODNN7EXAMPLE')) {
        return [
          {
            token: 'AKIAIOSFODNN7EXAMPLE',
            label: NerLabel.B_CREDENTIAL_AWS,
            confidence: 0.95,
            start: 20,
            end: 40,
          },
        ];
      }
      return [];
    });

    const allFindings: Finding[] = [];
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');
      const fragments = chunkIntoFragments(lines);

      for (const fragment of fragments) {
        const tokens = await classifyFragment(fragment.lines.join('\n'));
        const spans = extractSpans(tokens, fragment.offsetLine);
        for (const span of spans) {
          const findingsForFile = classifyMockToFindings(file, content, span.startLine);
          allFindings.push(...findingsForFile.map(f => ({
            ...f,
            startLine: span.startLine,
            endLine: span.endLine,
            match: span.text,
            secret: span.text,
            confidence: span.maxConfidence,
          })));
        }
      }
    }

    expect(allFindings.length).toBeGreaterThan(0);

    const options: ProcessorOptions = {
      allowlist: defaultAllowlist,
      minConfidence: 0.5,
    };

    const processed = processFindings(allFindings, options);
    expect(processed.length).toBeGreaterThan(0);

    const hasAws = processed.some(f => f.ruleId === 'credential-aws');
    expect(hasAws).toBe(true);

    const reporter = createReporter('json');
    const output = reporter.report(processed);
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(processed.length);
  });

  it('filters findings through allowlist', async () => {
    const files = await scanDirectory(tmpDir);
    const secretFile = files.find(f => f.endsWith('aws-key.txt')) as string;
    const findings = classifyMockToFindings(secretFile, '', 1);

    const options: ProcessorOptions = {
      allowlist: { paths: ['secrets'], commits: [], stopwords: [] },
      minConfidence: 0,
    };

    const processed = processFindings(findings, options);
    expect(processed).toHaveLength(0);
  });

  it('produces sarif output from processed findings', async () => {
    const files = await scanDirectory(tmpDir);
    const secretFile = files.find(f => f.endsWith('aws-key.txt')) as string;
    const findings = classifyMockToFindings(secretFile, '', 1);

    const options: ProcessorOptions = {
      allowlist: defaultAllowlist,
      minConfidence: 0,
    };
    const processed = processFindings(findings, options);

    const reporter = createReporter('sarif');
    const output = reporter.report(processed);
    const parsed = JSON.parse(output);
    expect(parsed.$schema).toContain('sarif');
    expect(parsed.runs).toBeDefined();
    expect(parsed.runs.length).toBeGreaterThan(0);
  });

  it('reads from fixture directory directly', async () => {
    const fixturesDir = path.resolve(process.cwd(), 'test/fixtures');
    const files = await scanDirectory(fixturesDir);
    expect(files.length).toBeGreaterThanOrEqual(2);

    const secretFile = files.find(f => f.endsWith('aws-key.txt'));
    expect(secretFile).toBeDefined();
  });
});