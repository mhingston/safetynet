import type { Finding } from './finding.js';
import { generateFingerprint } from './fingerprint.js';

export function isKnownFinding(finding: Finding, baseline: Finding[]): boolean {
  const fp = generateFingerprint(finding);
  return baseline.some(b => generateFingerprint(b) === fp);
}

export async function loadBaseline(path: string): Promise<Finding[]> {
  const fs = await import('node:fs/promises');
  const content = await fs.readFile(path, 'utf-8');
  return JSON.parse(content) as Finding[];
}