import { shannonEntropy } from './finding.js';
import type { Finding } from './finding.js';
import { generateFingerprint } from './fingerprint.js';
import { isKnownFinding } from './baseline.js';
import { isAllowed, type AllowlistConfig } from './allowlist.js';

export interface ProcessorOptions {
  baseline?: Finding[];
  allowlist: AllowlistConfig;
  minConfidence: number;
  threshold?: number;
  redact?: number;
  ignoreFingerprints?: Set<string>;
}

export function processFindings(findings: Finding[], options: ProcessorOptions): Finding[] {
  const processed: Finding[] = [];
  for (const finding of findings) {
    const f = { ...finding };
    f.fingerprint = generateFingerprint(f);
    f.entropy = shannonEntropy(f.secret);

    if (options.baseline && isKnownFinding(f, options.baseline)) continue;
    if (isAllowed(f, options.allowlist)) continue;
    if (options.ignoreFingerprints?.has(f.fingerprint)) continue;
    if (f.confidence < options.minConfidence) continue;
    if (options.threshold !== undefined && f.confidence < options.threshold) {
      f.tags = [...f.tags, 'low-confidence'];
    }

    if (options.redact) {
      const r = options.redact;
      f.secret = f.secret.slice(0, r) + '*'.repeat(Math.max(0, f.secret.length - r));
    }

    processed.push(f);
  }
  return processed;
}

export function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter(f => {
    if (seen.has(f.fingerprint)) return false;
    seen.add(f.fingerprint);
    return true;
  });
}