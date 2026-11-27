/**
 * Application-level settings (currently the theme).
 *
 * Kept separate from profile preferences: theme is a property of the app on this
 * machine, while romaji/furigana/audio preferences belong to a learner profile.
 */

import type { AppSettings } from '../../shared/contracts';
import { THEME_CHOICES, type ThemeChoice } from '../../shared/enums';
import type { AppSettingsInput } from '../../shared/schemas';
import type { Db } from '../database/connection';
import { getSetting, setSetting } from '../database/repositories/settings';

const THEME_KEY = 'theme';

export function readAppSettings(db: Db): AppSettings {
  const raw = getSetting(db, THEME_KEY);
  const theme = (THEME_CHOICES as readonly string[]).includes(raw ?? '')
    ? (raw as ThemeChoice)
    : 'system';
  return { theme };
}

export function writeAppSettings(db: Db, input: AppSettingsInput, nowMs: number): AppSettings {
  setSetting(db, THEME_KEY, input.theme, new Date(nowMs).toISOString());
  return readAppSettings(db);
}
