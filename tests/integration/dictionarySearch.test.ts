import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DictionaryService } from '../../src/main/services/dictionary';
import { AppError } from '../../src/shared/errors';
import { pythonCommand } from '../support/python';

const ROOT = path.resolve(import.meta.dirname, '../..');

function fixtureDatabase(output: string): void {
  const script = `
import sys
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'scripts'))})
import build_dictionary, kotoba_data
manifest = kotoba_data.load_manifest(Path(${JSON.stringify(path.join(ROOT, 'data/manifest.json'))}))
build_dictionary.build_dictionary(
    Path(${JSON.stringify(path.join(ROOT, 'data/fixtures/dictionary_fixture.json'))}),
    Path(${JSON.stringify(output)}), manifest, fixture=True)
`;
  execFileSync(pythonCommand(ROOT), ['-c', script], { cwd: ROOT });
}

describe('dictionary service', () => {
  let dir: string;
  let dbPath: string;
  let service: DictionaryService;

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'kotoba-dict-'));
    dbPath = path.join(dir, 'dictionary.db');
    fixtureDatabase(dbPath);
    service = new DictionaryService(dbPath);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds 猫 through kanji, hiragana, katakana and romaji', () => {
    for (const query of ['猫', 'ねこ', 'ネコ', 'neko', 'cat']) {
      const results = service.search({ query, limit: 20, offset: 0 });
      expect(results.map((item) => item.id), query).toContain('jmdict:1000001');
    }
  });

  it('ranks the exact word before compounds with the same prefix', () => {
    const results = service.search({ query: '猫', limit: 20, offset: 0 });
    expect(results[0]?.id).toBe('jmdict:1000001');
  });

  it('keeps homographs as distinct entries', () => {
    const results = service.search({ query: 'はし', limit: 20, offset: 0 });
    expect(results.map((item) => item.id)).toEqual(
      expect.arrayContaining(['jmdict:3000001', 'jmdict:3000002']),
    );
    expect(new Set(results.map((item) => item.id)).size).toBe(results.length);
  });

  it('returns full entry detail by stable id', () => {
    const entry = service.getEntry('jmdict:1000001');
    expect(entry?.canonicalForm).toBe('猫');
    expect(entry?.readings.map((reading) => reading.text)).toContain('ねこ');
    expect(entry?.senses.map((sense) => sense.english)).toContain('cat');
    expect(service.getEntry('missing')).toBeNull();
  });

  it('exposes register tags and form/reading restrictions', () => {
    const tagged = service.getEntry('jmdict:5000001');
    expect(tagged?.senses[0]?.tags).toEqual(expect.arrayContaining(['sl', 'vulg']));

    const restricted = service.getEntry('jmdict:4000001');
    expect(restricted?.readings[0]?.appliesTo).toContain('明日');
    expect(restricted?.senses[0]?.appliesToReadings).toContain('あした');
  });

  it('returns kanji and kana detail', () => {
    expect(service.getKanji('猫')?.readings.map((reading) => reading.reading)).toContain('ねこ');
    expect(service.getKana('か')?.reading).toBe('か');
  });

  it('bounds pagination', () => {
    expect(service.search({ query: '猫', limit: 100, offset: 0 }).length).toBeGreaterThan(0);
    expect(service.search({ query: '猫', limit: 1, offset: 100 }).length).toBe(0);
  });

  it('opens the database read-only', () => {
    expect(() => service.raw.exec('create table nope (x integer)')).toThrow();
  });

  it('reports missing and corrupt databases as DATA_MISSING', () => {
    const missing = path.join(dir, 'missing.db');
    expect(() => new DictionaryService(missing).search({ query: '猫', limit: 5, offset: 0 }))
      .toThrowError(AppError);

    const corrupt = path.join(dir, 'corrupt.db');
    writeFileSync(corrupt, 'not sqlite');
    expect(() => new DictionaryService(corrupt).metadata()).toThrowError(AppError);
  });

  it('exposes fixture metadata from the built database', () => {
    expect(service.metadata()).toMatchObject({ fixture: true, licence: 'CC-BY-SA-4.0' });
  });
});
