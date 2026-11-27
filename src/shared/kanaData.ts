/**
 * Typed access to the committed kana catalogue.
 *
 * The JSON is original data authored for this project, so there is no external
 * licence to verify. Ids are stable: a future edit to the catalogue must keep
 * them, because learner progress is keyed by id, not by row position.
 */

import catalogue from '../../data/curriculum/kana.json';

export type KanaScript = 'hiragana' | 'katakana';
export type KanaTier = 'basic' | 'extended';

export type KanaItem = {
  readonly id: string;
  readonly script: KanaScript;
  readonly tier: KanaTier;
  readonly groupId: string;
  readonly character: string;
  readonly reading: string;
  readonly example?: {
    readonly japanese: string;
    readonly english: string;
  };
};

export type KanaGroup = {
  readonly id: string;
  readonly script: KanaScript;
  readonly label: string;
  readonly tier: KanaTier;
  readonly items: readonly KanaItem[];
};

export const KANA_GROUPS: readonly KanaGroup[] = catalogue.groups as KanaGroup[];

const BY_ID = new Map<string, KanaItem>(
  KANA_GROUPS.flatMap((group) => group.items).map((item) => [item.id, item]),
);

export function findKanaItem(id: string): KanaItem | undefined {
  return BY_ID.get(id);
}
