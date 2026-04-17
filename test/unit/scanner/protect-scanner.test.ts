import { describe, it, expect, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn().mockReturnValue('src/staged.ts\nsrc/other.ts\n'),
}));

describe('ProtectScanner', () => {
  it('returns list of staged files', async () => {
    const { ProtectScanner } = await import('../../../src/scanner/protect-scanner.js');
    const scanner = new ProtectScanner('/repo/path');
    const files = scanner.getStagedFiles();
    expect(files).toContain('src/staged.ts');
  });
});