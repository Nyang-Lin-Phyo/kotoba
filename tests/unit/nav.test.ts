import { describe, expect, it } from 'vitest';
import { NAV_GROUPS, type NavEntry } from '../../src/shared/nav';

const entries: NavEntry[] = NAV_GROUPS.flatMap((group) => [...group.entries]);

describe('sidebar model', () => {
  it('has unique ids across every group', () => {
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes the three routes implemented in M1', () => {
    const ready = entries.filter((entry) => entry.kind === 'ready');
    const paths = ready.map((entry) => (entry.kind === 'ready' ? entry.path : ''));
    expect(paths).toEqual(expect.arrayContaining(['/', '/profile', '/settings']));
  });

  it('gives every ready entry a distinct root-relative path', () => {
    const paths = entries
      .filter((entry) => entry.kind === 'ready')
      .map((entry) => (entry.kind === 'ready' ? entry.path : ''));
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(path.startsWith('/')).toBe(true);
    }
  });

  it('exposes the M8 immersion routes as ready', () => {
    const paths = entries
      .filter((entry) => entry.kind === 'ready')
      .map((entry) => (entry.kind === 'ready' ? entry.path : ''));
    expect(paths).toEqual(
      expect.arrayContaining(['/immersion', '/reading', '/listening', '/speaking']),
    );
  });

  it('tags every planned entry with the milestone that will implement it', () => {
    const planned = entries.filter((entry) => entry.kind === 'planned');
    for (const entry of planned) {
      expect(entry.kind === 'planned' ? entry.milestone : '').toMatch(/^M\d+[a-z]?$/);
    }
  });

  it('never has an entry that is both ready and planned', () => {
    const readyIds = new Set(
      entries.filter((entry) => entry.kind === 'ready').map((entry) => entry.id),
    );
    const plannedIds = entries
      .filter((entry) => entry.kind === 'planned')
      .map((entry) => entry.id);
    for (const id of plannedIds) {
      expect(readyIds.has(id)).toBe(false);
    }
  });
});
