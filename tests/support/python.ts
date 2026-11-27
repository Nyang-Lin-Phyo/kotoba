import path from 'node:path';

/**
 * Python executable for tests that generate a fixture database.
 *
 * On Windows the CI runner gets `python` on PATH from actions/setup-python,
 * while local WSL development uses the repo's .venv. KOTOBA_PYTHON overrides
 * both when a specific interpreter is needed.
 */
export function pythonCommand(
  repoRoot: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.KOTOBA_PYTHON?.trim();
  if (override !== undefined && override.length > 0) return override;
  if (platform === 'win32') return 'python';
  return path.join(repoRoot, '.venv', 'bin', 'python');
}
