import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDictionaryPath } from '../../src/main/dictionary/paths';

describe('dictionary path resolution', () => {
  it('uses the app path in development', () => {
    expect(
      resolveDictionaryPath({
        isPackaged: false,
        appPath: '/home/u/kotoba',
        resourcesPath: '/unused',
        env: {},
      }),
    ).toBe(path.resolve('/home/u/kotoba/resources/dictionaries/dictionary.db'));
  });

  it('uses the resources path when packaged', () => {
    expect(
      resolveDictionaryPath({
        isPackaged: true,
        appPath: '/unused',
        resourcesPath: '/opt/kotoba/resources',
        env: {},
      }),
    ).toBe(path.resolve('/opt/kotoba/resources/dictionaries/dictionary.db'));
  });

  it('lets KOTOBA_DICTIONARY_PATH override both', () => {
    expect(
      resolveDictionaryPath({
        isPackaged: true,
        appPath: '/unused',
        resourcesPath: '/opt/kotoba/resources',
        env: { KOTOBA_DICTIONARY_PATH: '/tmp/test-dictionary.db' },
      }),
    ).toBe(path.resolve('/tmp/test-dictionary.db'));
  });
});
