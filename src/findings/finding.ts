export interface Finding {
  ruleId: string;
  description: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  match: string;
  secret: string;
  file: string;
  commit: string;
  author: string;
  email: string;
  date: string;
  message: string;
  entropy: number;
  fingerprint: string;
  tags: string[];
  confidence: number;
}

export function shannonEntropy(input: string): number {
  if (input.length === 0) return 0;

  const frequencies = new Map<string, number>();
  for (const char of input) {
    frequencies.set(char, (frequencies.get(char) ?? 0) + 1);
  }

  let entropy = 0;
  const length = input.length;
  for (const count of frequencies.values()) {
    const p = count / length;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}