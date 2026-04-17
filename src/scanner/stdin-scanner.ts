import { readFileSync } from 'node:fs';

export function readStdin(): string {
  return readFileSync('/dev/stdin', 'utf-8');
}