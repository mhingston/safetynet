export function parseIgnoreFile(content: string): Set<string> {
  const fingerprints = new Set<string>();
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    fingerprints.add(trimmed);
  }
  return fingerprints;
}