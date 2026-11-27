import { useCallback } from 'react';
import type { KanaScript } from '../../../shared/contracts';
import { useAsync } from '../../lib/useAsync';

export function useKanaCatalog() {
  const load = useCallback(() => window.kotoba.kana.catalog(), []);
  return useAsync(load);
}

export function useKanaSummary() {
  const load = useCallback(() => window.kotoba.kana.summary(), []);
  return useAsync(load);
}

export function useKanaReviewQueue() {
  const load = useCallback(() => window.kotoba.kana.reviewQueue(), []);
  return useAsync(load);
}

export function useKanaLesson(script: KanaScript, groupId: string) {
  const load = useCallback(() => window.kotoba.kana.lesson({ script, groupId }), [script, groupId]);
  return useAsync(load);
}
