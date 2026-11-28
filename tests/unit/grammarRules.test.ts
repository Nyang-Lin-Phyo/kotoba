import { describe, expect, it } from 'vitest';
import { isUnitUnlocked, isUnitComplete } from '../../src/shared/grammarRules';

describe('grammar prerequisites', () => {
  it('unlocks units only when all prerequisites are complete', () => {
    expect(isUnitUnlocked([], [])).toBe(true);
    expect(isUnitUnlocked(['a'], ['b'])).toBe(false);
    expect(isUnitUnlocked(['a'], ['a', 'b'])).toBe(true);
  });

  it('completes a unit only when every exercise has a correct attempt', () => {
    expect(isUnitComplete(['q1', 'q2'], ['q1'])).toBe(false);
    expect(isUnitComplete(['q1', 'q2'], ['q1', 'q2'])).toBe(true);
    expect(isUnitComplete([], [])).toBe(false);
  });
});
