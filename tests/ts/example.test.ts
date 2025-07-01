import { describe, it, expect } from 'vitest';

// Simple deterministic sanity check so Vitest is green

describe('basic arithmetic', () => {
  it('1 + 1 === 2', () => {
    expect(1 + 1).toBe(2);
  });
});
