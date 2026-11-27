/**
 * Resolution of the immutable dictionary database path.
 *
 * Pure so the dev/packaged distinction is unit-testable. The packaged path is
 * verified by a real packaged run, not assumed.
 */

import path from 'node:path';

export function resolveDictionaryPath(options: {
  readonly isPackaged: boolean;
  readonly appPath: string;
  readonly resourcesPath: string;
  readonly env?: NodeJS.ProcessEnv;
}): string {
  const override = (options.env ?? process.env).KOTOBA_DICTIONARY_PATH?.trim();
  if (override !== undefined && override.length > 0) {
    return path.resolve(override);
  }

  if (options.isPackaged) {
    // Forge copies `resources/dictionaries` to `<resources>/dictionaries`.
    return path.resolve(options.resourcesPath, 'dictionaries', 'dictionary.db');
  }
  return path.resolve(options.appPath, 'resources', 'dictionaries', 'dictionary.db');
}
