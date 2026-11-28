/** Typed access to the original, committed grammar curriculum. */

import raw from '../../data/curriculum/grammar_units.json';

export type GrammarExample = {
  readonly japanese: string;
  readonly reading: string;
  readonly english: string;
};

export type GrammarExercise = {
  readonly id: string;
  readonly prompt: string;
  readonly choices: readonly string[];
  readonly answerIndex: number;
  readonly rationale: string;
};

export type GrammarUnit = {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly prerequisites: readonly string[];
  readonly explanation: string;
  readonly examples: readonly GrammarExample[];
  readonly exercises: readonly GrammarExercise[];
  readonly sourceNote: string;
};

export const grammarUnits: readonly GrammarUnit[] = (raw.units as GrammarUnit[])
  .toSorted((a, b) => a.order - b.order);

export function getGrammarUnit(id: string): GrammarUnit | undefined {
  return grammarUnits.find((unit) => unit.id === id);
}

export function exerciseIds(unit: GrammarUnit): string[] {
  return unit.exercises.map((exercise) => exercise.id);
}

export function isCorrectAnswer(unit: GrammarUnit, exerciseId: string, answerIndex: number): boolean {
  const exercise = unit.exercises.find((item) => item.id === exerciseId);
  return exercise !== undefined && exercise.answerIndex === answerIndex;
}
