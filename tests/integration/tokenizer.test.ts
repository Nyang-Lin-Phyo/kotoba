import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveTokenizerDir } from '../../src/main/dictionary/paths';
import { TokenizerService, MAX_TOKENIZE_CHARS } from '../../src/main/services/tokenizer';

describe('TokenizerService', () => {
  it('normalizes kuromoji features and enforces bounds', async () => {
    let calls = 0;
    const service = new TokenizerService('/unused', async () => {
      calls += 1;
      return {
        tokenize: () => [
          { surface_form: '猫', basic_form: '猫', reading: 'ネコ', pos: '名詞', word_type: 'KNOWN' },
          { surface_form: 'が', basic_form: '*', reading: '*', pos: '助詞', word_type: 'KNOWN' },
        ],
      } as never;
    });

    const tokens = await service.tokenize('猫が');
    expect(tokens).toEqual([
      { surface: '猫', basicForm: '猫', reading: 'ネコ', pos: '名詞', wordType: 'KNOWN', position: 0 },
      { surface: 'が', basicForm: 'が', reading: '', pos: '助詞', wordType: 'KNOWN', position: 1 },
    ]);
    expect(calls).toBe(1); // loaded once
    await service.tokenize('猫が');
    expect(calls).toBe(1);
    await expect(service.tokenize('x'.repeat(MAX_TOKENIZE_CHARS + 1))).rejects.toThrow();
  });

  it('tokenizes real Japanese with the bundled IPADIC assets', async () => {
    const dir = resolveTokenizerDir({
      isPackaged: false,
      appPath: process.cwd(),
      resourcesPath: process.cwd(),
      env: {},
    });
    if (!existsSync(path.join(dir, 'base.dat.gz'))) {
      throw new Error('Run npm run prepare:tokenizer before tests.');
    }
    const tokens = await new TokenizerService(dir).tokenize('猫が すきです');
    expect(tokens.length).toBeGreaterThan(2);
    expect(tokens.some((token) => token.surface === '猫')).toBe(true);
  }, 60_000);
});
