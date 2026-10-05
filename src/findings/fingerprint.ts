import type { Finding } from './finding.js';

export function generateFingerprint(finding: Finding): string {
  const location = `${finding.startLine}:${finding.startColumn}:${finding.endLine}:${finding.endColumn}`;
  if (finding.commit) {
    return `${finding.commit}:${finding.file}:${finding.ruleId}:${location}`;
  }
  return `${finding.file}:${finding.ruleId}:${location}`;
}