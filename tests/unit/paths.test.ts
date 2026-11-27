import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDataRoot } from '../../src/main/paths';

describe('data root resolution', () => {
  it('uses Electron userData in a packaged build', () => {
    const resolved = resolveDataRoot({
      isDev: false,
      userDataPath: '/home/u/.config/Kotoba',
      env: {},
    });
    expect(resolved).toEqual({
      root: path.resolve('/home/u/.config/Kotoba'),
      source: 'userData',
    });
  });

  it('never points development at the installed data root', () => {
    const resolved = resolveDataRoot({
      isDev: true,
      userDataPath: '/home/u/.config/Kotoba',
      env: {},
    });
    expect(resolved.root).toBe(path.resolve('/home/u/.config/Kotoba-dev'));
    expect(resolved.source).toBe('dev');
  });

  it('lets KOTOBA_DATA_ROOT override everything', () => {
    const resolved = resolveDataRoot({
      isDev: true,
      userDataPath: '/home/u/.config/Kotoba',
      env: { KOTOBA_DATA_ROOT: '/tmp/kotoba-test' },
    });
    expect(resolved).toEqual({ root: path.resolve('/tmp/kotoba-test'), source: 'env' });
  });

  it('ignores a blank override', () => {
    const resolved = resolveDataRoot({
      isDev: false,
      userDataPath: '/data/Kotoba',
      env: { KOTOBA_DATA_ROOT: '   ' },
    });
    expect(resolved.source).toBe('userData');
  });

  it('falls back to the real process environment', () => {
    // main.ts calls this without an `env` argument; without the default, the
    // override documented for tests and CI would never reach the app.
    const previous = process.env.KOTOBA_DATA_ROOT;
    process.env.KOTOBA_DATA_ROOT = '/tmp/kotoba-from-process-env';
    try {
      const resolved = resolveDataRoot({ isDev: true, userDataPath: '/data/Kotoba' });
      expect(resolved).toEqual({
        root: path.resolve('/tmp/kotoba-from-process-env'),
        source: 'env',
      });
    } finally {
      if (previous === undefined) delete process.env.KOTOBA_DATA_ROOT;
      else process.env.KOTOBA_DATA_ROOT = previous;
    }
  });
});
