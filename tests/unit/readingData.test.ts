import { describe, expect, it } from 'vitest';
import { getPassage, passages } from '../../src/shared/readingData';

describe('original reading passages', () => {
  it('has short graded passages with reviewed answer keys', () => {
    expect(passages.length).toBeGreaterThanOrEqual(4);
    const ids = passages.map((passage) => passage.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const passage of passages) {
      expect(passage.sourceNote.toLowerCase()).toContain('original');
      expect(passage.lines.length).toBeGreaterThan(0);
      expect(passage.glosses.length).toBeGreaterThan(0);
      expect(passage.exercises.length).toBeGreaterThan(0);
      for (const line of passage.lines) {
        expect(line.japanese.length).toBeGreaterThan(0);
        expect(line.kana.length).toBeGreaterThan(0);
        expect(line.reading.length).toBeGreaterThan(0);
        expect(line.english.length).toBeGreaterThan(0);
      }
      for (const exercise of passage.exercises) {
        expect(exercise.choices.length).toBeGreaterThanOrEqual(2);
        expect(exercise.answerIndex).toBeGreaterThanOrEqual(0);
        expect(exercise.answerIndex).toBeLessThan(exercise.choices.length);
        expect(exercise.rationale.length).toBeGreaterThan(0);
      }
    }
  });

  it('looks passages up by id', () => {
    expect(getPassage(passages[0]?.id ?? '')).toBe(passages[0]);
    expect(getPassage('missing')).toBeUndefined();
  });
});
