import { describe, it, expect } from 'vitest';
import { handleClassifierError } from '../../src/classifier/error-handler.js';

describe('error handling', () => {
  it('model missing → exit 2 by default', () => {
    const result = handleClassifierError(new Error('Model not found'), { failOpen: false });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Model not found');
  });

  it('model missing → exit 0 with --fail-open', () => {
    const result = handleClassifierError(new Error('Model not found'), { failOpen: true });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain('Warning');
  });

  it('corrupt model → exit 2 by default', () => {
    const result = handleClassifierError(new Error('ONNX load failed'), { failOpen: false });
    expect(result.exitCode).toBe(2);
  });

  it('inference timeout → skip fragment, continue', () => {
    const result = handleClassifierError(new Error('Inference timeout'), { failOpen: false });
    expect(result.exitCode).toBe(null);
    expect(result.shouldSkipFragment).toBe(true);
  });

  it('hash verification fails → exit 2 always', () => {
    const result = handleClassifierError(new Error('Integrity check failed'), { failOpen: true });
    expect(result.exitCode).toBe(2);
  });
});