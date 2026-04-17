import { describe, it, expect } from 'vitest';
import { buildProgram } from '../../../src/cli/commands.js';

describe('CLI', () => {
  it('registers all subcommands', () => {
    const program = buildProgram();
    const commands = program.commands.map(c => c.name());
    expect(commands).toContain('detect');
    expect(commands).toContain('protect');
    expect(commands).toContain('git');
    expect(commands).toContain('stdin');
    expect(commands).toContain('download');
  });

  it('detect command has all required flags', () => {
    const program = buildProgram();
    const detect = program.commands.find(c => c.name() === 'detect');
    if (!detect) throw new Error('detect command not found');
    const flags = detect.options.map(o => o.long);
    expect(flags).toContain('--source');
    expect(flags).toContain('--config');
    expect(flags).toContain('--report-format');
    expect(flags).toContain('--fail-open');
    expect(flags).toContain('--min-confidence');
    expect(flags).toContain('--threshold');
    expect(flags).toContain('--concurrency');
    expect(flags).toContain('--model-dir');
    expect(flags).toContain('--commits');
  });
});