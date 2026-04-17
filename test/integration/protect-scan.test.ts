import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { ProtectScanner } from '../../src/scanner/protect-scanner.js';
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

const defaultAllowlist: AllowlistConfig = {
  paths: [],
  commits: [],
  stopwords: [],
};

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    ruleId: 'credential-aws',
    description: 'AWS credential detected',
    startLine: 2,
    endLine: 2,
    startColumn: 20,
    endColumn: 40,
    match: 'AKIAIOSFODNN7EXAMPLE',
    secret: 'AKIAIOSFODNN7EXAMPLE',
    file: 'config/credentials.txt',
    commit: '',
    author: 'developer',
    email: 'dev@example.com',
    date: '2025-01-01',
    message: 'add config',
    entropy: 0,
    fingerprint: '',
    tags: ['credential', 'aws'],
    confidence: 0.93,
    ...overrides,
  };
}

describe('integration: protect scan', () => {
  let repoDir: string;
  let origExecSync: typeof import('node:child_process').execSync;

  beforeEach(async () => {
    repoDir = await fs.mkdtemp(path.join(process.cwd(), 'protect-repo-'));

    origExecSync = (await import('node:child_process')).execSync;

    const { execSync } = await import('node:child_process');
    execSync('git init', { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test"', { cwd: repoDir });

    await fs.mkdir(path.join(repoDir, 'config'));
    await fs.writeFile(path.join(repoDir, 'config', 'credentials.txt'), [
      '[default]',
      'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
      'aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    ].join('\n'));
    await fs.writeFile(path.join(repoDir, 'safe.txt'), 'Hello world\n');

    const mockClassify = classifyFragment as ReturnType<typeof vi.fn>;
    mockClassify.mockImplementation(async (text: string) => {
      if (text.includes('AKIAIOSFODNN7EXAMPLE')) {
        return [
          {
            token: 'AKIAIOSFODNN7EXAMPLE',
            label: NerLabel.B_CREDENTIAL_AWS,
            confidence: 0.93,
            start: 20,
            end: 40,
          },
        ];
      }
      return [];
    });
  });

  afterEach(async () => {
    await fs.rm(repoDir, { recursive: true, force: true });
  });

  it('scans staged files and processes findings through full pipeline', async () => {
    const { execSync } = await import('node:child_process');
    execSync('git add config/credentials.txt safe.txt', { cwd: repoDir });

    const scanner = new ProtectScanner(repoDir);
    const stagedFiles = scanner.getStagedFiles();
    expect(stagedFiles.length).toBeGreaterThanOrEqual(1);

    const stagedContent = await scanner.getStagedContent();
    expect(stagedContent.length).toBeGreaterThanOrEqual(1);

    const credFile = stagedContent.find(c => c.filePath.endsWith('credentials.txt'));
    expect(credFile).toBeDefined();
    expect((credFile as { filePath: string; content: string }).content).toContain('AKIAIOSFODNN7EXAMPLE');

    const allFindings: Finding[] = [];
    for (const item of stagedContent) {
      const lines = item.content.split('\n');
      const fragments = chunkIntoFragments(lines);
      for (const fragment of fragments) {
        const tokens = await classifyFragment(fragment.lines.join('\n'));
        const spans = extractSpans(tokens, fragment.offsetLine);
        for (const span of spans) {
          allFindings.push({
            ruleId: deriveRuleId(span.tokens[0].label),
            description: `${deriveRuleId(span.tokens[0].label)} detected`,
            startLine: span.startLine,
            endLine: span.endLine,
            startColumn: span.startColumn,
            endColumn: span.endColumn,
            match: span.text,
            secret: span.text,
            file: item.filePath,
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
    }

    expect(allFindings.length).toBeGreaterThan(0);

    const options: ProcessorOptions = {
      allowlist: defaultAllowlist,
      minConfidence: 0.5,
    };
    const processed = processFindings(allFindings, options);
    expect(processed.length).toBeGreaterThan(0);
    expect(processed.some(f => f.ruleId === 'credential-aws')).toBe(true);

    const reporter = createReporter('json');
    const output = reporter.report(processed);
    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(processed.length);
  });

  it('produces junit report from protect-scan findings', async () => {
    const findings = [makeFinding()];
    const options: ProcessorOptions = {
      allowlist: defaultAllowlist,
      minConfidence: 0,
    };
    const processed = processFindings(findings, options);

    const reporter = createReporter('junit');
    const output = reporter.report(processed);
    expect(output).toContain('testsuite');
    expect(output).toContain('credential-aws');
  });

  it('keeps findings when staged content has secrets with no allowlist', async () => {
    const findings = [makeFinding()];
    const options: ProcessorOptions = {
      allowlist: defaultAllowlist,
      minConfidence: 0,
    };
    const processed = processFindings(findings, options);
    expect(processed).toHaveLength(1);
    expect(processed[0].fingerprint).toBeTruthy();
    expect(processed[0].entropy).toBeGreaterThan(0);
  });

  it('filters protect findings by path allowlist', async () => {
    const findings = [makeFinding({ file: 'config/credentials.txt' })];
    const options: ProcessorOptions = {
      allowlist: { paths: ['^config/'], commits: [], stopwords: [] },
      minConfidence: 0,
    };
    const processed = processFindings(findings, options);
    expect(processed).toHaveLength(0);
  });

  it('returns empty staged files when nothing is staged', async () => {
    const scanner = new ProtectScanner(repoDir);
    const staged = scanner.getStagedFiles();
    expect(staged).toHaveLength(0);
  });

  it('handles file path in findings from protect mode', async () => {
    const findings = [makeFinding({ file: 'config/credentials.txt' })];
    const options: ProcessorOptions = {
      allowlist: defaultAllowlist,
      minConfidence: 0,
      redact: 4,
    };
    const processed = processFindings(findings, options);
    expect(processed[0].secret).toMatch(/^AKIA\*+/);
    expect(processed[0].file).toBe('config/credentials.txt');
  });
});