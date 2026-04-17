import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseIgnoreFile } from './ignore-file.js';

export async function loadIgnoreFingerprints(dir: string): Promise<Set<string>> {
  const safetynetPath = path.join(dir, '.safetynetignore');
  const gitleaksPath = path.join(dir, '.gitleaksignore');

  let safetynetContent = '';
  let gitleaksContent = '';

  try { safetynetContent = await fs.readFile(safetynetPath, 'utf-8'); } catch { /* not found */ }
  try { gitleaksContent = await fs.readFile(gitleaksPath, 'utf-8'); } catch { /* not found */ }

  const safetynetFps = parseIgnoreFile(safetynetContent);
  const gitleaksFps = parseIgnoreFile(gitleaksContent);

  if (safetynetContent) return safetynetFps;
  return gitleaksFps;
}