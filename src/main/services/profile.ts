/**
 * Profile lifecycle.
 *
 * The schema supports several profiles; the UI currently shows exactly one.
 * Creating a profile writes the profile row and its first goal version in a
 * single transaction, so a profile can never exist without goals.
 */

import type { ProfileState } from '../../shared/contracts';
import { AppError } from '../../shared/errors';
import type { ProfileInput, ProfileUpdateInput } from '../../shared/schemas';
import { transaction, type Db } from '../database/connection';
import { insertGoalVersion, listGoalVersions } from '../database/repositories/goalVersions';
import {
  countProfiles,
  findProfileById,
  getActiveProfile,
  insertProfile,
  updateProfileRow,
} from '../database/repositories/profiles';

export function getProfileState(db: Db): ProfileState | null {
  const profile = getActiveProfile(db);
  if (profile === null) {
    return null;
  }
  return { profile, goals: listGoalVersions(db, profile.id) };
}

export function requireActiveProfileState(db: Db): ProfileState {
  const state = getProfileState(db);
  if (state === null) {
    throw AppError.notFound('No profile exists yet. Finish setup first.');
  }
  return state;
}

export function createProfile(db: Db, input: ProfileInput, nowMs: number): ProfileState {
  const nowIso = new Date(nowMs).toISOString();

  return transaction(db, () => {
    if (countProfiles(db) > 0) {
      throw AppError.conflict(
        'A profile already exists. Switching between profiles is not built yet.',
      );
    }

    const profile = insertProfile(db, input, nowIso);
    insertGoalVersion(
      db,
      profile.id,
      {
        effectiveDate: input.startDate,
        dailyMinutes: input.dailyMinutes,
        dailyNewWords: input.dailyNewWords,
      },
      nowIso,
    );

    return { profile, goals: listGoalVersions(db, profile.id) };
  });
}

export function updateProfile(db: Db, patch: ProfileUpdateInput, nowMs: number): ProfileState {
  const current = getActiveProfile(db);
  if (current === null) {
    throw AppError.notFound('No profile exists yet. Finish setup first.');
  }

  const nowIso = new Date(nowMs).toISOString();
  transaction(db, () => {
    updateProfileRow(db, current.id, patch, nowIso);
  });

  const profile = findProfileById(db, current.id);
  if (profile === null) {
    throw AppError.dataMissing('The profile could not be read back after updating.');
  }
  return { profile, goals: listGoalVersions(db, profile.id) };
}
