import type { Finding } from './finding.js';

export function generateFingerprint(finding: Finding): string {
  if (finding.commit) {
    return `${finding.commit}:${finding.file}:${finding.ruleId}:${finding.startLine}`;
  }
  return `${finding.file}:${finding.ruleId}:${finding.startLine}`;
}