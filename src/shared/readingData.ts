/** Typed access to the original beginner reading passages. */

import raw from '../../data/curriculum/reading_passages.json';

export type PassageLine = {
  readonly japanese: string;
  readonly kana: string;
  readonly reading: string;
  readonly english: string;
};

export type PassageGloss = {
  readonly term: string;
  readonly gloss: string;
};

export type PassageExercise = {
  readonly id: string;
  readonly prompt: string;
  readonly choices: readonly string[];
  readonly answerIndex: number;
  readonly rationale: string;
};

export type ReadingPassage = {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly level: string;
  readonly sourceNote: string;
  readonly lines: readonly PassageLine[];
  readonly glosses: readonly PassageGloss[];
  readonly exercises: readonly PassageExercise[];
};

export const passages: readonly ReadingPassage[] = (raw.passages as ReadingPassage[])
  .toSorted((a, b) => a.order - b.order);

export function getPassage(id: string): ReadingPassage | undefined {
  return passages.find((passage) => passage.id === id);
}

export function passageAnswerCorrect(
  passage: ReadingPassage,
  exerciseId: string,
  answerIndex: number,
): boolean {
  return passage.exercises.some(
    (exercise) => exercise.id === exerciseId && exercise.answerIndex === answerIndex,
  );
}
