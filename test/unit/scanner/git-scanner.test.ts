import { describe, it, expect, vi } from 'vitest';

vi.mock('isomorphic-git', () => ({
  default: {
    log: vi.fn().mockResolvedValue([
      {
        oid: 'abc123',
        commit: {
          message: 'add feature',
          author: { name: 'Dev', email: 'd@test.com' },
          tree: 'tree123',
          parent: [],
        },
      },
    ]),
    readCommit: vi.fn(),
    readTree: vi.fn(),
    readBlob: vi.fn(),
  },
  log: vi.fn(),
  readCommit: vi.fn(),
  readTree: vi.fn(),
  readBlob: vi.fn(),
}));

vi.mock('node:fs', () => ({
  default: {},
}));

describe('GitScanner', () => {
  it('walks commit history and yields fragments', async () => {
    const { GitScanner } = await import('../../../src/scanner/git-scanner.js');
    const scanner = new GitScanner('/repo/path');
    const commits = await scanner.getCommitList();
    expect(commits).toHaveLength(1);
    expect(commits[0].oid).toBe('abc123');
  });
});