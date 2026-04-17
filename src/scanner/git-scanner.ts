import git, { type ReadCommitResult, type CommitObject, type TreeEntry } from 'isomorphic-git';
import * as fs from 'node:fs';
import type { Fragment } from './types.js';

export class GitScanner {
  constructor(private repoPath: string) {}

  async getCommitList(): Promise<ReadCommitResult[]> {
    return git.log({ fs, dir: this.repoPath });
  }

  async getCommitDiff(oid: string): Promise<Fragment[]> {
    const commit = await git.readCommit({ fs, dir: this.repoPath, oid });
    const commitObj: CommitObject = commit.commit;
    const treeOid = commitObj.tree;
    const parentOid = commitObj.parent?.[0];

    const currentFiles = await this.readTreeFiles(treeOid);
    const parentFiles = parentOid
      ? await this.readTreeFilesFromCommit(parentOid)
      : new Map<string, string>();

    const fragments: Fragment[] = [];
    const allPaths = new Set([...currentFiles.keys(), ...parentFiles.keys()]);

    for (const filePath of allPaths) {
      const currentContent = currentFiles.get(filePath);
      const parentContent = parentFiles.get(filePath);

      if (currentContent === undefined) continue;

      if (parentContent === undefined) {
        const lines = currentContent.split('\n');
        for (let i = 0; i < lines.length; i++) {
          fragments.push(this.buildFragment(filePath, i + 1, lines[i], oid, commitObj));
        }
        continue;
      }

      if (currentContent !== parentContent) {
        const addedLines = this.diffLines(parentContent, currentContent);
        for (const { lineNum, text } of addedLines) {
          fragments.push(this.buildFragment(filePath, lineNum, text, oid, commitObj));
        }
      }
    }

    return fragments;
  }

  private buildFragment(
    filePath: string,
    startLine: number,
    raw: string,
    commitOid: string,
    commitObj: CommitObject,
  ): Fragment {
    return {
      raw,
      filePath,
      startLine,
      commitSha: commitOid,
      authorName: commitObj.author.name,
      authorEmail: commitObj.author.email,
      commitDate: new Date(commitObj.author.timestamp * 1000).toISOString(),
      commitMessage: commitObj.message,
      windowsFilePath: filePath.replace(/\//g, '\\'),
      symlinkFile: '',
    };
  }

  private diffLines(oldText: string, newText: string): { lineNum: number; text: string }[] {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const result: { lineNum: number; text: string }[] = [];

    let oi = 0;
    let ni = 0;

    while (oi < oldLines.length && ni < newLines.length) {
      if (oldLines[oi] === newLines[ni]) {
        oi++;
        ni++;
      } else {
        const matchIdx = oldLines.indexOf(newLines[ni], oi + 1);
        if (matchIdx !== -1) {
          while (oi < matchIdx) oi++;
          oi++;
          ni++;
        } else {
          result.push({ lineNum: ni + 1, text: newLines[ni] });
          ni++;
        }
      }
    }

    while (ni < newLines.length) {
      result.push({ lineNum: ni + 1, text: newLines[ni] });
      ni++;
    }

    return result;
  }

  private async readTreeFiles(treeOid: string): Promise<Map<string, string>> {
    const files = new Map<string, string>();
    await this.walkTree(treeOid, '', files);
    return files;
  }

  private async readTreeFilesFromCommit(commitOid: string): Promise<Map<string, string>> {
    const parentCommit = await git.readCommit({ fs, dir: this.repoPath, oid: commitOid });
    return this.readTreeFiles(parentCommit.commit.tree);
  }

  private async walkTree(treeOid: string, prefix: string, files: Map<string, string>): Promise<void> {
    const tree = await git.readTree({ fs, dir: this.repoPath, oid: treeOid });
    for (const entry of tree.tree as TreeEntry[]) {
      const entryPath = prefix ? `${prefix}/${entry.path}` : entry.path;
      if (entry.type === 'tree') {
        await this.walkTree(entry.oid, entryPath, files);
      } else if (entry.type === 'blob') {
        if (this.isBinaryPath(entryPath)) continue;
        try {
          const blob = await git.readBlob({ fs, dir: this.repoPath, oid: entry.oid });
          const content = new TextDecoder().decode(blob.blob);
          files.set(entryPath, content);
        } catch {
          // skip unreadable blobs
        }
      }
    }
  }

  private isBinaryPath(filePath: string): boolean {
    const binaryExts = /\.(?:jpg|jpeg|png|gif|bmp|svg|ico|tif|tiff|eot|ttf|woff|woff2|otf|dll|exe|pdb|bin|pdf|doc|docx|xls|xlsx|so|dylib|a|lib|o|pyc|class|jar|war|wasm)$/i;
    return binaryExts.test(filePath);
  }
}