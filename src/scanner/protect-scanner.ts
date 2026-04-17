import { execSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export class ProtectScanner {
  constructor(private repoPath: string) {}

  getStagedFiles(): string[] {
    const output = execSync('git diff --cached --name-only', {
      cwd: this.repoPath,
      encoding: 'utf-8',
    });
    return output.trim().split('\n').filter(Boolean);
  }

  async getStagedContent(): Promise<{ filePath: string; content: string }[]> {
    const files = this.getStagedFiles();
    const results: { filePath: string; content: string }[] = [];
    for (const file of files) {
      const fullPath = path.join(this.repoPath, file);
      const content = await fs.readFile(fullPath, 'utf-8');
      results.push({ filePath: file, content });
    }
    return results;
  }
}