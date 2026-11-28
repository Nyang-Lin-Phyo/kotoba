import { describe, expect, it } from 'vitest';
import { suggestReducedNewWords } from '../../src/shared/workloadRules';

describe('workload suggestion', () => {
  it('suggests fewer new words only when due reviews exceed twice the review allocation', () => {
    expect(suggestReducedNewWords(20, 120, 15).needed).toBe(false);
    expect(suggestReducedNewWords(40, 120, 15).needed).toBe(false);
    const heavy = suggestReducedNewWords(41, 120, 15);
    expect(heavy.needed).toBe(true);
    expect(heavy.reviewTarget).toBe(20);
    expect(heavy.suggestedNewWords).toBe(15); // never changes the goal itself
  });
});
