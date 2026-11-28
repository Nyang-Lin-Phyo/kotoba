import { describe, expect, it } from 'vitest';
import {
  exerciseIds,
  getGrammarUnit,
  grammarUnits,
  isCorrectAnswer,
} from '../../src/shared/grammarData';
import { isUnitUnlocked } from '../../src/shared/grammarRules';

describe('original grammar curriculum data', () => {
  it('has a small, well-formed set of units', () => {
    expect(grammarUnits.length).toBeGreaterThanOrEqual(5);
    expect(grammarUnits.length).toBeLessThanOrEqual(10);
    const ids = grammarUnits.map((unit) => unit.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const unit of grammarUnits) {
      expect(unit.explanation.length).toBeGreaterThan(20);
      expect(unit.sourceNote.toLowerCase()).toContain('original');
      expect(unit.examples.length).toBeGreaterThan(0);
      expect(unit.exercises.length).toBeGreaterThan(0);
      for (const example of unit.examples) {
        expect(example.japanese.length).toBeGreaterThan(0);
        expect(example.reading.length).toBeGreaterThan(0);
        expect(example.english.length).toBeGreaterThan(0);
      }
      for (const exercise of unit.exercises) {
        expect(exercise.choices.length).toBeGreaterThanOrEqual(2);
        expect(exercise.answerIndex).toBeGreaterThanOrEqual(0);
        expect(exercise.answerIndex).toBeLessThan(exercise.choices.length);
        expect(exercise.rationale.length).toBeGreaterThan(0);
      }
    }
  });

  it('has prerequisites that form a DAG and reference real units', () => {
    const completed = new Set<string>();
    const remaining = [...grammarUnits];
    while (remaining.length > 0) {
      const ready = remaining.filter((unit) => isUnitUnlocked(unit.prerequisites, [...completed]));
      expect(ready.length).toBeGreaterThan(0); // no cycle, no unknown prerequisite
      for (const unit of ready) {
        expect(unit.prerequisites.every((id) => grammarUnits.some((u) => u.id === id))).toBe(true);
        completed.add(unit.id);
        remaining.splice(remaining.indexOf(unit), 1);
      }
    }
  });

  it('exposes answers and exercises for progress tracking', () => {
    const first = grammarUnits[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(getGrammarUnit(first.id)).toBe(first);
    expect(getGrammarUnit('does-not-exist')).toBeUndefined();
    expect(exerciseIds(first)).toContain(first.exercises[0]?.id);
    expect(isCorrectAnswer(first, first.exercises[0]?.id ?? '', first.exercises[0]?.answerIndex ?? 0)).toBe(true);
    expect(isCorrectAnswer(first, first.exercises[0]?.id ?? '', 999)).toBe(false);
  });
});
