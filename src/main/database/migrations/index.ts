import { migration001 } from './001_initial';
import { migration002 } from './002_kana';
import { migration003 } from './003_vocabulary';

export type Migration = {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
};

/**
 * Append-only list. Add new migrations at the end with the next version number;
 * never renumber or edit one that has already been applied to a real database.
 */
export const MIGRATIONS: readonly Migration[] = [migration001, migration002, migration003];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce(
  (highest, migration) => Math.max(highest, migration.version),
  0,
);
