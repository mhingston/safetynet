import type { Finding } from './finding.js';

export interface AllowlistConfig {
  paths: string[];
  commits: string[];
  stopwords: string[];
}

export function isAllowed(finding: Finding, config: AllowlistConfig): boolean {
  for (const pathPattern of config.paths) {
    try {
      const re = new RegExp(pathPattern);
      if (re.test(finding.file)) return true;
    } catch { /* invalid regex, skip */ }
  }
  if (config.commits.includes(finding.commit)) return true;
  for (const word of config.stopwords) {
    if (finding.secret.toLowerCase().includes(word.toLowerCase())) return true;
  }
  return false;
}