export function hasInlineIgnore(line: string): boolean {
  return line.includes('safetynet:allow') || line.includes('gitleaks:allow');
}