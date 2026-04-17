import { Command } from 'commander';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import type { SafetynetConfig } from '../config/config.js';
import { parseConfig } from '../config/config.js';
import type { Finding } from '../findings/finding.js';
import type { AllowlistConfig } from '../findings/allowlist.js';

type ReportFormat = 'json' | 'sarif' | 'csv' | 'junit';

interface CommonOptions {
  config?: string;
  reportFormat: ReportFormat;
  failOpen: boolean;
  minConfidence: number;
  threshold: number;
  concurrency: number;
  modelDir?: string;
  model?: string;
}

function applyCliOverrides(config: SafetynetConfig, opts: CommonOptions): SafetynetConfig {
  const result = { ...config };
  result.classifier = { ...config.classifier };
  if (opts.minConfidence !== DEFAULT_CONFIG.classifier.minConfidence) {
    result.classifier.minConfidence = opts.minConfidence;
  }
  if (opts.threshold !== DEFAULT_CONFIG.classifier.threshold) {
    result.classifier.threshold = opts.threshold;
  }
  if (opts.concurrency !== DEFAULT_CONFIG.classifier.concurrency) {
    result.classifier.concurrency = opts.concurrency;
  }
  if (opts.modelDir) {
    result.classifier.modelDir = opts.modelDir;
  }
  if (opts.model) {
    result.classifier.model = opts.model;
  }
  return result;
}

async function loadConfig(opts: CommonOptions): Promise<SafetynetConfig> {
  if (opts.config) {
    const { readFile } = await import('node:fs/promises');
    const toml = await readFile(opts.config, 'utf-8');
    return applyCliOverrides(parseConfig(toml), opts);
  }
  return applyCliOverrides({ ...DEFAULT_CONFIG } as SafetynetConfig, opts);
}

function toAllowlistConfig(config: SafetynetConfig): AllowlistConfig {
  return {
    paths: config.allowlist.paths,
    commits: config.allowlist.commits,
    stopwords: config.allowlist.stopwords,
  };
}

async function runDirectoryScan(source: string, config: SafetynetConfig, opts: CommonOptions): Promise<void> {
  const { scanDirectory } = await import('../scanner/directory-scanner.js');
  const { chunkIntoFragments } = await import('../scanner/fragment-reader.js');
  const { processFindings } = await import('../findings/processor.js');
  const { createReporter } = await import('../report/reporter-factory.js');
  const { loadPipeline } = await import('../classifier/pipeline.js');

  await loadPipeline(config.classifier.model, { maxTokens: config.classifier.maxTokens, modelDir: config.classifier.modelDir });

  const files = await scanDirectory(source);
  const allFindings: Finding[] = [];

  for (const file of files) {
    const { readFile } = await import('node:fs/promises');
    const content = await readFile(file, 'utf-8');
    const lines = content.split('\n');
    const chunks = chunkIntoFragments(lines);
    for (const chunk of chunks) {
      const text = chunk.lines.join('\n');
      const { classifyFragment } = await import('../classifier/pipeline.js');
      const { deriveRuleId } = await import('../classifier/rule-id.js');
      const { NerLabel } = await import('../classifier/types.js');
      try {
        const tokens = await classifyFragment(text);
        for (const token of tokens) {
          if (token.label === NerLabel.O) continue;
          allFindings.push({
            ruleId: deriveRuleId(token.label),
            description: `${token.label} detected`,
            startLine: chunk.offsetLine + (token.start > 0 ? 0 : 0),
            endLine: chunk.offsetLine,
            startColumn: token.start,
            endColumn: token.end,
            match: token.token,
            secret: token.token,
            file,
            commit: '',
            author: '',
            email: '',
            date: '',
            message: '',
            entropy: 0,
            fingerprint: '',
            tags: [],
            confidence: token.confidence,
          });
        }
      } catch (err) {
        if (opts.failOpen) {
          continue;
        }
        throw err;
      }
    }
  }

  const processed = processFindings(allFindings, {
    allowlist: toAllowlistConfig(config),
    minConfidence: config.classifier.minConfidence,
  });

  const reporter = createReporter(opts.reportFormat);
  const output = reporter.report(processed);
  console.log(output);
  process.exitCode = processed.length > 0 ? 1 : 0;
}

async function runProtectScan(source: string, config: SafetynetConfig, opts: CommonOptions): Promise<void> {
  const { ProtectScanner } = await import('../scanner/protect-scanner.js');
  const { chunkIntoFragments } = await import('../scanner/fragment-reader.js');
  const { processFindings } = await import('../findings/processor.js');
  const { createReporter } = await import('../report/reporter-factory.js');
  const { loadPipeline } = await import('../classifier/pipeline.js');

  await loadPipeline(config.classifier.model, { maxTokens: config.classifier.maxTokens, modelDir: config.classifier.modelDir });

  const scanner = new ProtectScanner(source);
  const fileContents = await scanner.getStagedContent();
  const allFindings: Finding[] = [];

  for (const { filePath, content } of fileContents) {
    const lines = content.split('\n');
    const chunks = chunkIntoFragments(lines);
    for (const chunk of chunks) {
      const text = chunk.lines.join('\n');
      const { classifyFragment } = await import('../classifier/pipeline.js');
      const { deriveRuleId } = await import('../classifier/rule-id.js');
      const { NerLabel } = await import('../classifier/types.js');
      try {
        const tokens = await classifyFragment(text);
        for (const token of tokens) {
          if (token.label === NerLabel.O) continue;
          allFindings.push({
            ruleId: deriveRuleId(token.label),
            description: `${token.label} detected`,
            startLine: chunk.offsetLine,
            endLine: chunk.offsetLine,
            startColumn: token.start,
            endColumn: token.end,
            match: token.token,
            secret: token.token,
            file: filePath,
            commit: '',
            author: '',
            email: '',
            date: '',
            message: '',
            entropy: 0,
            fingerprint: '',
            tags: [],
            confidence: token.confidence,
          });
        }
      } catch (err) {
        if (opts.failOpen) {
          continue;
        }
        throw err;
      }
    }
  }

  const processed = processFindings(allFindings, {
    allowlist: toAllowlistConfig(config),
    minConfidence: config.classifier.minConfidence,
  });

  const reporter = createReporter(opts.reportFormat);
  const output = reporter.report(processed);
  console.log(output);
  process.exitCode = processed.length > 0 ? 1 : 0;
}

async function runGitScan(source: string, config: SafetynetConfig, opts: CommonOptions & { commits?: string }): Promise<void> {
  const { GitScanner } = await import('../scanner/git-scanner.js');
  const { processFindings } = await import('../findings/processor.js');
  const { createReporter } = await import('../report/reporter-factory.js');
  const { loadPipeline } = await import('../classifier/pipeline.js');

  await loadPipeline(config.classifier.model, { maxTokens: config.classifier.maxTokens, modelDir: config.classifier.modelDir });

  const scanner = new GitScanner(source);
  const commits = await scanner.getCommitList();
  const allFindings: Finding[] = [];

  for (const commit of commits) {
    if (opts.commits && !opts.commits.includes(commit.oid)) continue;
    const fragments = await scanner.getCommitDiff(commit.oid);
    for (const fragment of fragments) {
      const { classifyFragment } = await import('../classifier/pipeline.js');
      const { deriveRuleId } = await import('../classifier/rule-id.js');
      const { NerLabel } = await import('../classifier/types.js');
      try {
        const tokens = await classifyFragment(fragment.raw);
        for (const token of tokens) {
          if (token.label === NerLabel.O) continue;
          allFindings.push({
            ruleId: deriveRuleId(token.label),
            description: `${token.label} detected`,
            startLine: fragment.startLine,
            endLine: fragment.startLine,
            startColumn: token.start,
            endColumn: token.end,
            match: token.token,
            secret: token.token,
            file: fragment.filePath,
            commit: fragment.commitSha,
            author: fragment.authorName,
            email: fragment.authorEmail,
            date: fragment.commitDate,
            message: fragment.commitMessage,
            entropy: 0,
            fingerprint: '',
            tags: [],
            confidence: token.confidence,
          });
        }
      } catch (err) {
        if (opts.failOpen) {
          continue;
        }
        throw err;
      }
    }
  }

  const processed = processFindings(allFindings, {
    allowlist: toAllowlistConfig(config),
    minConfidence: config.classifier.minConfidence,
  });

  const reporter = createReporter(opts.reportFormat);
  const output = reporter.report(processed);
  console.log(output);
  process.exitCode = processed.length > 0 ? 1 : 0;
}

async function runStdinScan(config: SafetynetConfig, opts: CommonOptions): Promise<void> {
  const { readStdin } = await import('../scanner/stdin-scanner.js');
  const { chunkIntoFragments } = await import('../scanner/fragment-reader.js');
  const { processFindings } = await import('../findings/processor.js');
  const { createReporter } = await import('../report/reporter-factory.js');
  const { loadPipeline } = await import('../classifier/pipeline.js');

  await loadPipeline(config.classifier.model, { maxTokens: config.classifier.maxTokens, modelDir: config.classifier.modelDir });

  const content = readStdin();
  const lines = content.split('\n');
  const chunks = chunkIntoFragments(lines);
  const allFindings: Finding[] = [];

  for (const chunk of chunks) {
    const text = chunk.lines.join('\n');
    const { classifyFragment } = await import('../classifier/pipeline.js');
    const { deriveRuleId } = await import('../classifier/rule-id.js');
    const { NerLabel } = await import('../classifier/types.js');
    try {
      const tokens = await classifyFragment(text);
      for (const token of tokens) {
        if (token.label === NerLabel.O) continue;
        allFindings.push({
          ruleId: deriveRuleId(token.label),
          description: `${token.label} detected`,
          startLine: chunk.offsetLine,
          endLine: chunk.offsetLine,
          startColumn: token.start,
          endColumn: token.end,
          match: token.token,
          secret: token.token,
          file: 'stdin',
          commit: '',
          author: '',
          email: '',
          date: '',
          message: '',
          entropy: 0,
          fingerprint: '',
          tags: [],
          confidence: token.confidence,
        });
      }
    } catch (err) {
      if (opts.failOpen) {
        continue;
      }
      throw err;
    }
  }

  const processed = processFindings(allFindings, {
    allowlist: toAllowlistConfig(config),
    minConfidence: config.classifier.minConfidence,
  });

  const reporter = createReporter(opts.reportFormat);
  const output = reporter.report(processed);
  console.log(output);
  process.exitCode = processed.length > 0 ? 1 : 0;
}

async function runDownload(modelDir: string, modelOverride?: string): Promise<void> {
  const { loadPipeline } = await import('../classifier/pipeline.js');
  const config = { ...DEFAULT_CONFIG } as SafetynetConfig;
  const modelId = modelOverride ?? (config.classifier.model || 'answerdotai/modernbert-base-safetynet');
  console.log(`Downloading model ${modelId} to ${modelDir}...`);
  try {
    await loadPipeline(modelId, { maxTokens: config.classifier.maxTokens });
    console.log('Model downloaded successfully.');
  } catch (err) {
    console.error('Failed to download model:', err);
    process.exitCode = 2;
  }
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('safetynet')
    .description('Secret detection powered by ML')
    .version('0.1.0');

  program
    .command('detect')
    .description('Scan a directory or file for secrets')
    .option('--source <path>', 'source directory or file to scan', '.')
    .option('--config <path>', 'path to .safetynet.toml config file')
    .option('--report-format <format>', 'output format: json, sarif, csv, junit', 'json')
    .option('--fail-open', 'exit 0 on classifier failure instead of exit 2', false)
    .option('--min-confidence <number>', 'minimum confidence to report', Number.parseFloat, DEFAULT_CONFIG.classifier.minConfidence)
    .option('--threshold <number>', 'confidence threshold', Number.parseFloat, DEFAULT_CONFIG.classifier.threshold)
    .option('--concurrency <number>', 'worker pool concurrency', Number.parseInt, DEFAULT_CONFIG.classifier.concurrency)
    .option('--model-dir <path>', 'model directory path')
    .option('--model <id>', 'override the classifier model ID')
    .option('--commits <sha>', 'specific commit to scan')
    .action(async (opts) => {
      try {
        const config = await loadConfig(opts as CommonOptions);
        await runDirectoryScan(opts.source, config, opts as CommonOptions);
      } catch (err) {
        if (opts.failOpen) {
          process.exitCode = 0;
        } else {
          console.error('Error:', err instanceof Error ? err.message : String(err));
          process.exitCode = 2;
        }
      }
    });

  program
    .command('protect')
    .description('Pre-commit hook scan for secrets')
    .option('--source <path>', 'repository path', '.')
    .option('--config <path>', 'path to .safetynet.toml config file')
    .option('--report-format <format>', 'output format: json, sarif, csv, junit', 'json')
    .option('--fail-open', 'exit 0 on classifier failure instead of exit 2', false)
    .option('--min-confidence <number>', 'minimum confidence to report', Number.parseFloat, DEFAULT_CONFIG.classifier.minConfidence)
    .option('--threshold <number>', 'confidence threshold', Number.parseFloat, DEFAULT_CONFIG.classifier.threshold)
    .option('--concurrency <number>', 'worker pool concurrency', Number.parseInt, DEFAULT_CONFIG.classifier.concurrency)
    .option('--model-dir <path>', 'model directory path')
    .option('--model <id>', 'override the classifier model ID')
    .action(async (opts) => {
      try {
        const config = await loadConfig(opts as CommonOptions);
        await runProtectScan(opts.source, config, opts as CommonOptions);
      } catch (err) {
        if (opts.failOpen) {
          process.exitCode = 0;
        } else {
          console.error('Error:', err instanceof Error ? err.message : String(err));
          process.exitCode = 2;
        }
      }
    });

  program
    .command('git')
    .description('Scan git history for secrets')
    .option('--source <path>', 'repository path', '.')
    .option('--config <path>', 'path to .safetynet.toml config file')
    .option('--report-format <format>', 'output format: json, sarif, csv, junit', 'json')
    .option('--fail-open', 'exit 0 on classifier failure instead of exit 2', false)
    .option('--min-confidence <number>', 'minimum confidence to report', Number.parseFloat, DEFAULT_CONFIG.classifier.minConfidence)
    .option('--threshold <number>', 'confidence threshold', Number.parseFloat, DEFAULT_CONFIG.classifier.threshold)
    .option('--concurrency <number>', 'worker pool concurrency', Number.parseInt, DEFAULT_CONFIG.classifier.concurrency)
    .option('--model-dir <path>', 'model directory path')
    .option('--model <id>', 'override the classifier model ID')
    .option('--commits <sha>', 'specific commit range to scan')
    .action(async (opts) => {
      try {
        const config = await loadConfig(opts as CommonOptions);
        await runGitScan(opts.source, config, opts as CommonOptions & { commits?: string });
      } catch (err) {
        if (opts.failOpen) {
          process.exitCode = 0;
        } else {
          console.error('Error:', err instanceof Error ? err.message : String(err));
          process.exitCode = 2;
        }
      }
    });

  program
    .command('stdin')
    .description('Read content from stdin and scan for secrets')
    .option('--config <path>', 'path to .safetynet.toml config file')
    .option('--report-format <format>', 'output format: json, sarif, csv, junit', 'json')
    .option('--fail-open', 'exit 0 on classifier failure instead of exit 2', false)
    .option('--min-confidence <number>', 'minimum confidence to report', Number.parseFloat, DEFAULT_CONFIG.classifier.minConfidence)
    .option('--threshold <number>', 'confidence threshold', Number.parseFloat, DEFAULT_CONFIG.classifier.threshold)
    .option('--concurrency <number>', 'worker pool concurrency', Number.parseInt, DEFAULT_CONFIG.classifier.concurrency)
    .option('--model-dir <path>', 'model directory path')
    .option('--model <id>', 'override the classifier model ID')
    .action(async (opts) => {
      try {
        const config = await loadConfig(opts as CommonOptions);
        await runStdinScan(config, opts as CommonOptions);
      } catch (err) {
        if (opts.failOpen) {
          process.exitCode = 0;
        } else {
          console.error('Error:', err instanceof Error ? err.message : String(err));
          process.exitCode = 2;
        }
      }
    });

  program
    .command('download')
    .description('Download the classification model')
    .option('--model-dir <path>', 'directory to download model to')
    .option('--model <id>', 'override the classifier model ID')
    .action(async (opts) => {
      await runDownload(opts.modelDir ?? '', opts.model);
    });

  return program;
}