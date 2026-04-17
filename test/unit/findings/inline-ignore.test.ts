import { describe, it, expect } from 'vitest';
import { hasInlineIgnore } from '../../../src/findings/inline-ignore.js';

describe('hasInlineIgnore', () => {
  it('detects safetynet:allow on same line', () => {
    expect(hasInlineIgnore('AKIAIOSFODNN7EXAMPLE  # safetynet:allow')).toBe(true);
  });
  it('detects gitleaks:allow on same line', () => {
    expect(hasInlineIgnore('AKIAIOSFODNN7EXAMPLE  # gitleaks:allow')).toBe(true);
  });
  it('returns false for normal line', () => {
    expect(hasInlineIgnore('AKIAIOSFODNN7EXAMPLE')).toBe(false);
  });
  it('returns false for unrelated comment', () => {
    expect(hasInlineIgnore('key = value  # TODO: fix')).toBe(false);
  });
});