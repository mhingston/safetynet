import { describe, it, expect } from 'vitest';
import { chunkIntoFragments } from '../../../src/scanner/fragment-reader.js';

describe('chunkIntoFragments', () => {
  it('chunks content into overlapping fragments', () => {
    const lines = Array.from({ length: 600 }, (_, i) => `line ${i}`);
    const fragments = chunkIntoFragments(lines, 250, 50);
    expect(fragments).toHaveLength(3);
    expect(fragments[0].lines).toHaveLength(250);
    expect(fragments[1].offsetLine).toBe(201);
  });

  it('returns single fragment for short content', () => {
    const lines = ['line 0', 'line 1', 'line 2'];
    const fragments = chunkIntoFragments(lines, 250, 50);
    expect(fragments).toHaveLength(1);
    expect(fragments[0].lines).toHaveLength(3);
  });
});