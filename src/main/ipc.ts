/**
 * IPC surface.
 *
 * Every handler: checks the sender origin, validates the payload with a schema,
 * runs the operation, and returns a `Result`. Nothing throws across the bridge,
 * and an unexpected failure never leaks a stack trace or a filesystem path.
 */

import { app, dialog, ipcMain } from 'electron';
import {
  CHANNELS,
  type AppInfo,
  type DataRootInfo,
  type ExportInput,
  type ImmersionAddDTO,
  type ImmersionCorrectDTO,
  type KanjiAttemptInput,
  type GrammarAttemptInput,
  type GoalVersion,
  type PlanPreview,
  type ProfileState,
} from '../shared/contracts';
import { err, isAppError, ok, type Result } from '../shared/errors';
import { todayInZone } from '../shared/date';
import {
  appSettingsInputSchema,
  backupRestoreSchema,
  dictionaryIdSchema,
  dictionarySearchSchema,
  familiarSchema,
  exportInputSchema,
  immersionAddSchema,
  immersionCorrectSchema,
  kanjiAttemptSchema,
  grammarAttemptSchema,
  paginationSchema,
  goalInputSchema,
  calendarDaySchema,
  learningIdSchema,
  itemOnlySchema,
  notesSchema,
  libraryQuerySchema,
  kanaAttemptInputSchema,
  kanaLessonInputSchema,
  noInputSchema,
  ratingSchema,
  reviewCardIdSchema,
  undoReviewSchema,
  profileInputSchema,
  profileUpdateSchema,
  studyStartSchema,
  acknowledgeInterruptedSchema,
  type BackupRestoreInput,
  type DictionaryIdInput,
  type DictionarySearchInput,
  type FamiliarInput,
  type IntroductionInput,
  type NotesInput,
  type KanaAttemptInput,
  type LibraryQueryInput,
  type RatingInput,
  type ReviewCardIdInput,
  type UndoReviewInput,
  type KanaLessonInput,
  type StudyStartInput,
  type AcknowledgeInterruptedInput,
} from '../shared/schemas';
import type { DatabaseManager } from './database/manager';
import type { Db } from './database/connection';
import { getActiveProfile } from './database/repositories/profiles';
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
import { getCalendarDay, getStats } from './services/stats';
import type { TimerService } from './services/timer';
import type { DictionaryService } from './services/dictionary';
import type { CardFactory } from './services/learning';
import { clearSchedulerCache } from './services/fsrsScheduler';
import {
  getKanjiDetail,
  listPersonalKanji,
  submitKanjiAttempt,
} from './services/kanjiStudy';
import {
  getGrammarDetail,
  listGrammarUnits,
  submitGrammarAttempt,
} from './services/grammarStudy';
import { addExternalLog, correctExternalLog, listExternalLogs } from './services/immersion';
import { buildExportPayload, writeProgressExport } from './services/progressExport';
import {
  getCardDetail,
  getReviewQueue,
  submitRating,
  undoLast,
} from './services/reviews';
import {
  getDetail,
  getLesson,
  getLibrary,
  getSummary,
  introduceWord,
  scheduleFamiliar,
  setFamiliar,
  setNotes,
} from './services/learning';
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
  readonly dictionary: DictionaryService;
  readonly makeCardFactory: (retention?: number) => Promise<CardFactory>;
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

function retentionFor(db: Db): number {
  return getActiveProfile(db)?.preferences.desiredRetention ?? 0.9;
}

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
    run: (input) => {
      const updated = updateProfile(db(), input, deps.now());
      if (input.preferences?.desiredRetention !== undefined) clearSchedulerCache();
      return updated;
    },
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

  registerHandler<ImmersionAddDTO, ReturnType<typeof addExternalLog>>({
    channel: CHANNELS.immersionAdd,
    schema: immersionAddSchema,
    allowedOrigins,
    run: (input) => addExternalLog(db(), input, input.eventId, deps.now()),
  });

  registerHandler<{ readonly offset: number; readonly limit: number }, ReturnType<typeof listExternalLogs>>({
    channel: CHANNELS.immersionList,
    schema: paginationSchema,
    allowedOrigins,
    run: (input) => listExternalLogs(db(), input.offset, input.limit),
  });

  registerHandler<ImmersionCorrectDTO, ReturnType<typeof correctExternalLog>>({
    channel: CHANNELS.immersionCorrect,
    schema: immersionCorrectSchema,
    allowedOrigins,
    run: (input) => {
      const { id, reason, ...patch } = input;
      return correctExternalLog(db(), id, { ...patch, reason }, input.eventId, deps.now());
    },
  });

  registerHandler<ExportInput, { readonly saved: boolean }>({
    channel: CHANNELS.backupExportProgress,
    schema: exportInputSchema,
    allowedOrigins,
    run: async (input) => {
      const extension = input.format === 'json' ? 'json' : 'csv';
      const result = await dialog.showSaveDialog({
        title: 'Export Kotoba progress',
        defaultPath: `kotoba-progress-${new Date(deps.now()).toISOString().slice(0, 10)}.${extension}`,
        filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
      });
      if (result.canceled || result.filePath === undefined) return { saved: false };
      const payload = buildExportPayload(db(), deps.now());
      writeProgressExport(payload, input.format, input.includeNotes, result.filePath);
      return { saved: true };
    },
  });

  registerHandler<undefined, ReturnType<typeof listPersonalKanji>>({
    channel: CHANNELS.kanjiList,
    schema: noInputSchema,
    allowedOrigins,
    run: () => listPersonalKanji(db(), deps.now()),
  });

  registerHandler<DictionaryIdInput, ReturnType<typeof getKanjiDetail>>({
    channel: CHANNELS.kanjiDetail,
    schema: dictionaryIdSchema,
    allowedOrigins,
    run: (input) => getKanjiDetail(db(), (literal) => deps.dictionary.getKanji(literal), input.id, deps.now()),
  });

  registerHandler<KanjiAttemptInput, ReturnType<typeof submitKanjiAttempt>>({
    channel: CHANNELS.kanjiAttempt,
    schema: kanjiAttemptSchema,
    allowedOrigins,
    run: (input) => submitKanjiAttempt(db(), input, deps.now()),
  });

  registerHandler<undefined, ReturnType<typeof listGrammarUnits>>({
    channel: CHANNELS.grammarList,
    schema: noInputSchema,
    allowedOrigins,
    run: () => listGrammarUnits(db()),
  });

  registerHandler<DictionaryIdInput, ReturnType<typeof getGrammarDetail>>({
    channel: CHANNELS.grammarDetail,
    schema: dictionaryIdSchema,
    allowedOrigins,
    run: (input) => getGrammarDetail(db(), input.id),
  });

  registerHandler<GrammarAttemptInput, ReturnType<typeof submitGrammarAttempt>>({
    channel: CHANNELS.grammarAttempt,
    schema: grammarAttemptSchema,
    allowedOrigins,
    run: (input) => submitGrammarAttempt(db(), input, deps.now()),
  });

  registerHandler<DictionarySearchInput, ReturnType<DictionaryService['search']>>({
    channel: CHANNELS.dictionarySearch,
    schema: dictionarySearchSchema,
    allowedOrigins,
    run: (input) => deps.dictionary.search(input),
  });

  registerHandler<DictionaryIdInput, ReturnType<DictionaryService['getEntry']>>({
    channel: CHANNELS.dictionaryGetEntry,
    schema: dictionaryIdSchema,
    allowedOrigins,
    run: (input) => deps.dictionary.getEntry(input.id),
  });

  registerHandler<DictionaryIdInput, ReturnType<DictionaryService['getKanji']>>({
    channel: CHANNELS.dictionaryGetKanji,
    schema: dictionaryIdSchema,
    allowedOrigins,
    run: (input) => deps.dictionary.getKanji(input.id),
  });

  registerHandler<DictionaryIdInput, ReturnType<DictionaryService['getKana']>>({
    channel: CHANNELS.dictionaryGetKana,
    schema: dictionaryIdSchema,
    allowedOrigins,
    run: (input) => deps.dictionary.getKana(input.id),
  });

  registerHandler<{ readonly dayKey: string }, ReturnType<typeof getCalendarDay>>({
    channel: CHANNELS.plannerGetCalendarDay,
    schema: calendarDaySchema,
    allowedOrigins,
    run: (input) => getCalendarDay(db(), input.dayKey),
  });

  registerHandler<undefined, ReturnType<typeof getStats>>({
    channel: CHANNELS.plannerGetStats,
    schema: noInputSchema,
    allowedOrigins,
    run: () => getStats(db(), deps.now()),
  });

  registerHandler<undefined, ReturnType<DictionaryService['metadata']>>({
    channel: CHANNELS.dictionaryMetadata,
    schema: noInputSchema,
    allowedOrigins,
    run: () => deps.dictionary.metadata(),
  });

  registerHandler<undefined, ReturnType<typeof getLesson>>({
    channel: CHANNELS.learningGetLesson,
    schema: noInputSchema,
    allowedOrigins,
    run: () => getLesson(db(), deps.dictionary, deps.now()),
  });

  registerHandler<IntroductionInput, ReturnType<typeof introduceWord>>({
    channel: CHANNELS.learningIntroduce,
    schema: learningIdSchema,
    allowedOrigins,
    run: async (input) =>
      introduceWord(
        db(), deps.dictionary, input, input.eventId, deps.now(),
        await deps.makeCardFactory(retentionFor(db())),
      ),
  });

  registerHandler<FamiliarInput, ReturnType<typeof setFamiliar>>({
    channel: CHANNELS.learningSetFamiliar,
    schema: familiarSchema,
    allowedOrigins,
    run: (input) => setFamiliar(db(), deps.dictionary, input, deps.now()),
  });

  registerHandler<IntroductionInput, ReturnType<typeof scheduleFamiliar>>({
    channel: CHANNELS.learningScheduleFamiliar,
    schema: learningIdSchema,
    allowedOrigins,
    run: async (input) => scheduleFamiliar(db(), await deps.makeCardFactory(retentionFor(db())), input, deps.now()),
  });

  registerHandler<LibraryQueryInput, ReturnType<typeof getLibrary>>({
    channel: CHANNELS.learningGetLibrary,
    schema: libraryQuerySchema,
    allowedOrigins,
    run: (input) => getLibrary(db(), input),
  });

  registerHandler<undefined, ReturnType<typeof getLesson>['summary']>({
    channel: CHANNELS.learningGetSummary,
    schema: noInputSchema,
    allowedOrigins,
    run: () => getSummary(db(), deps.now()),
  });

  registerHandler<{ readonly itemId: string }, ReturnType<typeof getDetail>>({
    channel: CHANNELS.learningGetDetail,
    schema: itemOnlySchema,
    allowedOrigins,
    run: (input) => getDetail(db(), input.itemId),
  });

  registerHandler<NotesInput, ReturnType<typeof setNotes>>({
    channel: CHANNELS.learningSetNotes,
    schema: notesSchema,
    allowedOrigins,
    run: (input) => setNotes(db(), input.itemId, input.notes),
  });

  registerHandler<undefined, ReturnType<typeof getReviewQueue>>({
    channel: CHANNELS.reviewsGetQueue,
    schema: noInputSchema,
    allowedOrigins,
    run: () => getReviewQueue(db(), deps.now(), 20),
  });

  registerHandler<ReviewCardIdInput, ReturnType<typeof getCardDetail>>({
    channel: CHANNELS.reviewsGetCard,
    schema: reviewCardIdSchema,
    allowedOrigins,
    run: (input) => getCardDetail(db(), input.cardId),
  });

  registerHandler<RatingInput, ReturnType<typeof submitRating>>({
    channel: CHANNELS.reviewsSubmitRating,
    schema: ratingSchema,
    allowedOrigins,
    run: (input) => submitRating(db(), input, input.eventId, deps.now()),
  });

  registerHandler<UndoReviewInput, ReturnType<typeof undoLast>>({
    channel: CHANNELS.reviewsUndoLast,
    schema: undoReviewSchema,
    allowedOrigins,
    run: (input) => undoLast(db(), input, deps.now()),
  });
}
