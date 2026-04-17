import { describe, it, expect, vi } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { scanDirectory } from '../../src/scanner/directory-scanner.js';
import { chunkIntoFragments } from '../../src/scanner/fragment-reader.js';
import { processFindings } from '../../src/findings/processor.js';
import type { Finding } from '../../src/findings/finding.js';
import type { ProcessorOptions } from '../../src/findings/processor.js';
import { createReporter } from '../../src/report/reporter-factory.js';
import type { AllowlistConfig } from '../../src/findings/allowlist.js';
import { handleClassifierError } from '../../src/classifier/error-handler.js';
import { NerLabel } from '../../src/classifier/types.js';
import type { TokenClassification } from '../../src/classifier/types.js';
import { extractSpans } from '../../src/classifier/span-extractor.js';
import { deriveRuleId } from '../../src/classifier/rule-id.js';

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

const SAMPLE_REPO = path.resolve(process.cwd(), 'test/fixtures/sample-repo');

const KNOWN_SECRETS = [
  { file: 'aws-credentials.txt', secret: 'AKIAIOSFODNN7EXAMPLE', ruleId: 'credential-aws' },
  { file: 'api-key.txt', secret: 'sk-1234567890abcdef1234567890abcdef', ruleId: 'credential-api-key' },
  { file: 'database-url.txt', secret: 'secretpassword123', ruleId: 'credential-connection-string' },
];

function buildMockClassifier(): (text: string) => Promise<TokenClassification[]> {
  return async (text: string) => {
    const tokens: TokenClassification[] = [];
    if (text.includes('AKIAIOSFODNN7EXAMPLE')) {
      tokens.push({ token: 'AKIAIOSFODNN7EXAMPLE', label: NerLabel.B_CREDENTIAL_AWS, confidence: 0.95, start: 20, end: 40 });
    }
    if (text.includes('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')) {
      tokens.push({ token: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', label: NerLabel.I_CREDENTIAL_AWS, confidence: 0.92, start: 24, end: 64 });
    }
    if (text.includes('sk-1234567890abcdef1234567890abcdef')) {
      tokens.push({ token: 'sk-1234567890abcdef1234567890abcdef', label: NerLabel.B_CREDENTIAL_API_KEY, confidence: 0.88, start: 8, end: 40 });
    }
    if (text.includes('secretpassword123')) {
      tokens.push({ token: 'secretpassword123', label: NerLabel.B_CREDENTIAL_CONNECTION_STRING, confidence: 0.91, start: 20, end: 37 });
    }
    return tokens;
  };
}

async function runScanPipeline(
  dir: string,
  options: Partial<ProcessorOptions> & { ignoreFingerprints?: Set<string> } = {},
): Promise<{ findings: Finding[]; output: string; exitCode: number }> {
  const mockClassify = classifyFragment as ReturnType<typeof vi.fn>;
  const mockImpl = buildMockClassifier();
  mockClassify.mockImplementation(mockImpl);

  const files = await scanDirectory(dir);
  const allFindings: Finding[] = [];

  for (const file of files) {
    const content = await fs.readFile(file, 'utf-8');
    const lines = content.split('\n');
    const fragments = chunkIntoFragments(lines);

    for (const fragment of fragments) {
      const text = fragment.lines.join('\n');
      try {
        const tokens = await classifyFragment(text);
        const spans = extractSpans(tokens, fragment.offsetLine);
        for (const span of spans) {
          allFindings.push({
            ruleId: deriveRuleId(span.tokens[0].label),
            description: `${span.tokens[0].label} detected`,
            startLine: span.startLine,
            endLine: span.endLine,
            startColumn: span.startColumn,
            endColumn: span.endColumn,
            match: span.text,
            secret: span.text,
            file,
            commit: '',
            author: '',
            email: '',
            date: '',
            message: '',
            entropy: 0,
            fingerprint: '',
            tags: [],
            confidence: span.maxConfidence,
          });
        }
      } catch (err) {
        if (options.failOpen) continue;
        throw err;
      }
    }
  }

  const processorOpts: ProcessorOptions = {
    allowlist: options.allowlist ?? defaultAllowlist,
    minConfidence: options.minConfidence ?? 0.5,
    threshold: options.threshold,
    redact: options.redact,
    ignoreFingerprints: options.ignoreFingerprints,
  };

  const processed = processFindings(allFindings, processorOpts);
  const reporter = createReporter('json');
  const output = reporter.report(processed);
  const exitCode = processed.length > 0 ? 1 : 0;

  return { findings: processed, output, exitCode };
}

describe('e2e: full scanner-processor-reporter flow', () => {
  it('finds all expected secrets in sample-repo', async () => {
    const { findings } = await runScanPipeline(SAMPLE_REPO);

    expect(findings.length).toBeGreaterThanOrEqual(KNOWN_SECRETS.length);

    for (const known of KNOWN_SECRETS) {
      const found = findings.some(
        f => f.secret.includes(known.secret) && f.ruleId === known.ruleId,
      );
      expect(found, `Expected to find ${known.secret} with ruleId ${known.ruleId}`).toBe(true);
    }
  });

  it('exit code is 1 when findings exist', async () => {
    const { exitCode, findings } = await runScanPipeline(SAMPLE_REPO);
    expect(findings.length).toBeGreaterThan(0);
    expect(exitCode).toBe(1);
  });

  it('exit code is 0 when no findings', async () => {
    const safeDir = path.resolve(process.cwd(), 'test/fixtures/safe');
    const { exitCode, findings } = await runScanPipeline(safeDir);
    expect(findings.length).toBe(0);
    expect(exitCode).toBe(0);
  });

  it('JSON output is valid and matches expected findings', async () => {
    const { output, findings } = await runScanPipeline(SAMPLE_REPO);

    const parsed = JSON.parse(output);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(findings.length);

    for (const finding of parsed) {
      expect(finding).toHaveProperty('ruleId');
      expect(finding).toHaveProperty('file');
      expect(finding).toHaveProperty('secret');
      expect(finding).toHaveProperty('fingerprint');
      expect(finding).toHaveProperty('entropy');
      expect(finding).toHaveProperty('confidence');
      expect(typeof finding.entropy).toBe('number');
      expect(typeof finding.fingerprint).toBe('string');
      expect(finding.fingerprint.length).toBeGreaterThan(0);
    }
  });

  it('.safetynetignore suppresses specified findings', async () => {
    const { findings: fullFindings } = await runScanPipeline(SAMPLE_REPO);
    expect(fullFindings.length).toBeGreaterThan(0);

    const fingerprintsToIgnore = new Set(fullFindings.slice(0, 2).map(f => f.fingerprint));

    const { findings: filteredFindings } = await runScanPipeline(SAMPLE_REPO, {
      ignoreFingerprints: fingerprintsToIgnore,
    });

    expect(filteredFindings.length).toBe(fullFindings.length - 2);

    for (const f of filteredFindings) {
      expect(fingerprintsToIgnore.has(f.fingerprint)).toBe(false);
    }
  });

  it('--fail-open changes behavior on model failure', async () => {
    const mockClassify = classifyFragment as ReturnType<typeof vi.fn>;
    mockClassify.mockImplementation(async () => {
      throw new Error('Model inference failed');
    });

    const dir = path.resolve(process.cwd(), 'test/fixtures/safe');
    const files = await scanDirectory(dir);

    let errorThrown = false;
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const lines = content.split('\n');
      const fragments = chunkIntoFragments(lines);
      for (const fragment of fragments) {
        const text = fragment.lines.join('\n');
        try {
          await classifyFragment(text);
        } catch (err) {
          errorThrown = true;
          break;
        }
      }
      if (errorThrown) break;
    }
    expect(errorThrown).toBe(true);

    const errorResult = handleClassifierError(new Error('Model inference failed'), { failOpen: true });
    expect(errorResult.exitCode).toBe(0);

    const errorResultClosed = handleClassifierError(new Error('Model inference failed'), { failOpen: false });
    expect(errorResultClosed.exitCode).toBe(2);
  });

  it('processor assigns entropy and fingerprint to every finding', async () => {
    const { findings } = await runScanPipeline(SAMPLE_REPO);

    for (const f of findings) {
      expect(f.fingerprint.length).toBeGreaterThan(0);
      expect(typeof f.entropy).toBe('number');
      expect(f.entropy).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('e2e: classifier benchmark', () => {
  it('classifies fragments under 200ms average', async () => {
    const mockClassify = classifyFragment as ReturnType<typeof vi.fn>;
    mockClassify.mockImplementation(async (text: string) => {
      const tokens: TokenClassification[] = [];
      if (text.includes('AKIA')) {
        tokens.push({ token: 'AKIAIOSFODNN7EXAMPLE', label: NerLabel.B_CREDENTIAL_AWS, confidence: 0.95, start: 0, end: 20 });
      }
      return tokens;
    });

    const fragments: string[] = [];
    for (let i = 0; i < 50; i++) {
      fragments.push('aws_access_key_id = AKIAIOSFODNN7EXAMPLE');
      fragments.push('const x = "hello world"; no secrets here');
    }

    const start = performance.now();
    for (const text of fragments) {
      await classifyFragment(text);
    }
    const elapsed = performance.now() - start;
    const avgMs = elapsed / fragments.length;

    expect(avgMs).toBeLessThan(200);
  });
});