/** Pure rules for grammar unit progression. */

/** A unit is available only when every prerequisite is in the completed set. */
export function isUnitUnlocked(
  prerequisites: readonly string[],
  completedIds: readonly string[],
): boolean {
  const completed = new Set(completedIds);
  return prerequisites.every((id) => completed.has(id));
}

/** A unit is complete only when every exercise has at least one correct attempt. */
export function isUnitComplete(
  exerciseIds: readonly string[],
  correctIds: readonly string[],
): boolean {
  if (exerciseIds.length === 0) return false;
  const correct = new Set(correctIds);
  return exerciseIds.every((id) => correct.has(id));
}
