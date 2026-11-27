import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pythonCommand } from '../support/python';

describe('pythonCommand', () => {
  it('uses PATH python on Windows instead of the Linux venv path', () => {
    expect(pythonCommand('/repo', 'win32', {})).toBe('python');
  });

  it('uses the repo venv on Linux when no override is set', () => {
    expect(pythonCommand('/repo', 'linux', {})).toBe(path.join('/repo', '.venv', 'bin', 'python'));
  });

  it('honours an explicit override on any platform', () => {
    expect(pythonCommand('/repo', 'win32', { KOTOBA_PYTHON: 'py -3.12' })).toBe('py -3.12');
  });
});
