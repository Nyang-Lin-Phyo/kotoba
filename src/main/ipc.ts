/**
 * IPC surface.
 *
 * Every handler: checks the sender origin, validates the payload with a schema,
 * runs the operation, and returns a `Result`. Nothing throws across the bridge,
 * and an unexpected failure never leaks a stack trace or a filesystem path.
 */

import { app, ipcMain } from 'electron';
import {
  CHANNELS,
  type AppInfo,
  type DataRootInfo,
  type GoalVersion,
  type PlanPreview,
  type ProfileState,
} from '../shared/contracts';
import { err, isAppError, ok, type Result } from '../shared/errors';
import { todayInZone } from '../shared/date';
import {
  appSettingsInputSchema,
  backupRestoreSchema,
  goalInputSchema,
  kanaAttemptInputSchema,
  kanaLessonInputSchema,
  noInputSchema,
  profileInputSchema,
  profileUpdateSchema,
  studyStartSchema,
  acknowledgeInterruptedSchema,
  type BackupRestoreInput,
  type KanaAttemptInput,
  type KanaLessonInput,
  type StudyStartInput,
  type AcknowledgeInterruptedInput,
} from '../shared/schemas';
import type { DatabaseManager } from './database/manager';
import type { ResolvedDataRoot } from './paths';
import { isTrustedSender } from './security.mts';
import { readAppSettings, writeAppSettings } from './services/appSettings';
import {
  createBackup,
  listBackups,
  maybeDailyBackup,
  restoreBackup,
} from './services/backup';
import { createProfile, getProfileState, updateProfile } from './services/profile';
import { getDashboard, previewPlan, setGoalVersion } from './services/planner';
import type { TimerService } from './services/timer';
import {
  getKanaCatalog,
  getKanaLesson,
  getKanaReviewQueue,
  getKanaSummary,
  submitKanaAttempt,
} from './services/kana';

export function buildAppInfo(isDev: boolean): AppInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron ?? 'unknown',
    chrome: process.versions.chrome ?? 'unknown',
    node: process.versions.node ?? 'unknown',
    platform: process.platform,
    isDev,
  };
}

export type IpcDeps = {
  readonly isDev: boolean;
  readonly allowedOrigins: readonly string[];
  readonly db: DatabaseManager;
  readonly dataRoot: ResolvedDataRoot;
  readonly now: () => number;
  readonly timer: TimerService;
};

/**
 * Structural view of a validation schema. Zod objects satisfy it; declaring it
 * here keeps the handler helper independent of Zod's generics.
 */
type InputSchema<In> = {
  safeParse(value: unknown):
    | { readonly success: true; readonly data: In }
    | {
        readonly success: false;
        readonly error: {
          readonly issues: readonly {
            readonly message: string;
            readonly path: readonly PropertyKey[];
          }[];
        };
      };
};

function registerHandler<In, Out>(config: {
  readonly channel: string;
  readonly schema: InputSchema<In>;
  readonly allowedOrigins: readonly string[];
  readonly run: (input: In) => Out | Promise<Out>;
}): void {
  ipcMain.handle(config.channel, async (event, raw: unknown): Promise<Result<Out>> => {
    if (!isTrustedSender(event.senderFrame?.url, config.allowedOrigins)) {
      return err('VALIDATION', 'This request did not come from the Kotoba window.');
    }

    const parsed = config.schema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return err(
        'VALIDATION',
        issue?.message ?? 'The request was rejected.',
        issue !== undefined && issue.path.length > 0 ? issue.path.map(String).join('.') : undefined,
      );
    }

    try {
      return ok(await config.run(parsed.data));
    } catch (cause) {
      if (isAppError(cause)) {
        return { ok: false, error: cause.toPayload() };
      }
      console.error(`[ipc] ${config.channel} failed`, cause);
      return err('INTERNAL', 'The main process hit an unexpected error. The details were logged.');
    }
  });
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { allowedOrigins } = deps;
  const db = () => deps.db.get();

  registerHandler<undefined, AppInfo>({
    channel: CHANNELS.appInfo,
    schema: noInputSchema,
    allowedOrigins,
    run: () => buildAppInfo(deps.isDev),
  });

  registerHandler<undefined, DataRootInfo>({
    channel: CHANNELS.dataRoot,
    schema: noInputSchema,
    allowedOrigins,
    run: () => ({
      root: deps.dataRoot.root,
      databaseFile: deps.db.file,
      backupsDir: deps.db.backupsDir,
      source: deps.dataRoot.source,
    }),
  });

  registerHandler<Parameters<typeof createProfile>[1], ProfileState>({
    channel: CHANNELS.profileCreate,
    schema: profileInputSchema,
    allowedOrigins,
    run: (input) => {
      const nowMs = deps.now();
      const state = createProfile(db(), input, nowMs);
      maybeDailyBackup(
        db(),
        deps.db.backupsDir,
        nowMs,
        todayInZone(state.profile.timezone, nowMs),
      );
      return state;
    },
  });

  registerHandler<undefined, ProfileState | null>({
    channel: CHANNELS.profileGetActive,
    schema: noInputSchema,
    allowedOrigins,
    run: () => getProfileState(db()),
  });

  registerHandler<Parameters<typeof updateProfile>[1], ProfileState>({
    channel: CHANNELS.profileUpdate,
    schema: profileUpdateSchema,
    allowedOrigins,
    run: (input) => updateProfile(db(), input, deps.now()),
  });

  registerHandler<undefined, GoalVersion[]>({
    channel: CHANNELS.goalsList,
    schema: noInputSchema,
    allowedOrigins,
    run: () => {
      const state = getProfileState(db());
      return state === null ? [] : [...state.goals];
    },
  });

  registerHandler<Parameters<typeof setGoalVersion>[1], GoalVersion[]>({
    channel: CHANNELS.goalsSet,
    schema: goalInputSchema,
    allowedOrigins,
    run: (input) => setGoalVersion(db(), input, deps.now()),
  });

  registerHandler<undefined, ReturnType<typeof getDashboard>>({
    channel: CHANNELS.plannerGetToday,
    schema: noInputSchema,
    allowedOrigins,
    run: () => getDashboard(db(), deps.now()),
  });

  registerHandler<Parameters<typeof previewPlan>[0], PlanPreview>({
    channel: CHANNELS.plannerPreview,
    schema: profileInputSchema,
    allowedOrigins,
    run: (input) => previewPlan(input),
  });

  registerHandler<undefined, ReturnType<typeof readAppSettings>>({
    channel: CHANNELS.settingsGet,
    schema: noInputSchema,
    allowedOrigins,
    run: () => readAppSettings(db()),
  });

  registerHandler<Parameters<typeof writeAppSettings>[1], ReturnType<typeof readAppSettings>>({
    channel: CHANNELS.settingsSet,
    schema: appSettingsInputSchema,
    allowedOrigins,
    run: (input) => writeAppSettings(db(), input, deps.now()),
  });

  registerHandler<undefined, ReturnType<typeof createBackup>>({
    channel: CHANNELS.backupCreate,
    schema: noInputSchema,
    allowedOrigins,
    run: () => createBackup(db(), deps.db.backupsDir, deps.now(), 'manual'),
  });

  registerHandler<undefined, ReturnType<typeof listBackups>>({
    channel: CHANNELS.backupList,
    schema: noInputSchema,
    allowedOrigins,
    run: () => listBackups(deps.db.backupsDir),
  });

  registerHandler<BackupRestoreInput, ReturnType<typeof restoreBackup>>({
    channel: CHANNELS.backupRestore,
    schema: backupRestoreSchema,
    allowedOrigins,
    run: (input) => restoreBackup(deps.db, input.fileName, deps.now()),
  });

  registerHandler<undefined, ReturnType<typeof getKanaCatalog>>({
    channel: CHANNELS.kanaCatalog,
    schema: noInputSchema,
    allowedOrigins,
    run: () => getKanaCatalog(),
  });

  registerHandler<KanaLessonInput, ReturnType<typeof getKanaLesson>>({
    channel: CHANNELS.kanaLesson,
    schema: kanaLessonInputSchema,
    allowedOrigins,
    run: (input) => getKanaLesson(db(), input, deps.now()),
  });

  registerHandler<KanaAttemptInput, ReturnType<typeof submitKanaAttempt>>({
    channel: CHANNELS.kanaSubmitAttempt,
    schema: kanaAttemptInputSchema,
    allowedOrigins,
    run: (input) => submitKanaAttempt(db(), input, input.eventId, deps.now()),
  });

  registerHandler<undefined, ReturnType<typeof getKanaReviewQueue>>({
    channel: CHANNELS.kanaReviewQueue,
    schema: noInputSchema,
    allowedOrigins,
    run: () => getKanaReviewQueue(db(), deps.now()),
  });

  registerHandler<undefined, ReturnType<typeof getKanaSummary>>({
    channel: CHANNELS.kanaSummary,
    schema: noInputSchema,
    allowedOrigins,
    run: () => getKanaSummary(db(), deps.now()),
  });

  registerHandler<StudyStartInput, ReturnType<TimerService['start']>>({
    channel: CHANNELS.studyStart,
    schema: studyStartSchema,
    allowedOrigins,
    run: (input) => deps.timer.start(input.activityType),
  });

  registerHandler<undefined, ReturnType<TimerService['pause']>>({
    channel: CHANNELS.studyPause,
    schema: noInputSchema,
    allowedOrigins,
    run: () => deps.timer.pause(),
  });

  registerHandler<undefined, ReturnType<TimerService['resume']>>({
    channel: CHANNELS.studyResume,
    schema: noInputSchema,
    allowedOrigins,
    run: () => deps.timer.resume(),
  });

  registerHandler<undefined, ReturnType<TimerService['stop']>>({
    channel: CHANNELS.studyStop,
    schema: noInputSchema,
    allowedOrigins,
    run: () => deps.timer.stop(),
  });

  registerHandler<undefined, ReturnType<TimerService['status']>>({
    channel: CHANNELS.studyGetStatus,
    schema: noInputSchema,
    allowedOrigins,
    run: () => deps.timer.status(),
  });

  registerHandler<AcknowledgeInterruptedInput, ReturnType<TimerService['acknowledgeInterrupted']>>({
    channel: CHANNELS.studyAcknowledgeInterrupted,
    schema: acknowledgeInterruptedSchema,
    allowedOrigins,
    run: (input) => deps.timer.acknowledgeInterrupted(input.sessionId),
  });
}
