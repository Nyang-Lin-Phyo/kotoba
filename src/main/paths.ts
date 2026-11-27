/**
 * Data-root resolution.
 *
 * The installed app uses Electron's `userData` directory. Development uses a
 * sibling `-dev` directory so running `npm start` can never open (or migrate,
 * or back up over) a real learner's database. Tests and CI point
 * `KOTOBA_DATA_ROOT` at a throwaway directory.
 *
 * Electron is not imported here on purpose: this stays a pure function that unit
 * tests can exercise without a running app.
 */

import path from 'node:path';

export type DataRootSource = 'env' | 'dev' | 'userData';

export type ResolvedDataRoot = {
  readonly root: string;
  readonly source: DataRootSource;
};

export function resolveDataRoot(options: {
  readonly isDev: boolean;
  readonly userDataPath: string;
  /** Defaults to `process.env`, so the real app honours `KOTOBA_DATA_ROOT` too. */
  readonly env?: NodeJS.ProcessEnv;
}): ResolvedDataRoot {
  const override = (options.env ?? process.env).KOTOBA_DATA_ROOT?.trim();
  if (override !== undefined && override.length > 0) {
    return { root: path.resolve(override), source: 'env' };
  }

  const userData = path.resolve(options.userDataPath);

  if (options.isDev) {
    const devRoot = path.resolve(`${userData}-dev`);
    if (devRoot === userData) {
      throw new Error('Refusing to run development against the installed data root');
    }
    return { root: devRoot, source: 'dev' };
  }

  return { root: userData, source: 'userData' };
}
