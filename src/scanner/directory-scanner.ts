import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { isBinaryFile } from './fragment-reader.js';

export interface ScanOptions {
  maxFileSize?: number;
}

const DEFAULT_MAX_FILE_SIZE = 1024 * 1024;

export async function scanDirectory(dir: string, options: ScanOptions = {}): Promise<string[]> {
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const files: string[] = [];
  await walk(dir, dir, files, maxFileSize);
  return files;
}

async function walk(baseDir: string, currentDir: string, files: string[], maxFileSize: number): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.name !== '.gitignore') continue;
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      await walk(baseDir, fullPath, files, maxFileSize);
    } else {
      if (isBinaryFile(fullPath)) continue;
      const stat = await fs.stat(fullPath);
      if (stat.size > maxFileSize) continue;
      files.push(fullPath);
    }
  }
}