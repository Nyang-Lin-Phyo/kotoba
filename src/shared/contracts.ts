/**
 * Contracts shared by main, preload and renderer.
 *
 * This module must stay free of Node and Electron imports (it is bundled into
 * the renderer). The `import type` from `./schemas` is erased at build time, so
 * Zod is not pulled into the renderer bundle.
 */

import type { DateKey } from './date';
import type { ActivityType, CurriculumPhase } from './goals';
import type { AudioPreference, InitialLevel, Interest, JlptTarget, ThemeChoice } from './enums';
import type { KanaGroup, KanaItem, KanaScript } from './kanaData';
import type { KanaStatus } from './kanaRules';
import type {
  AppSettingsInput,
  BackupRestoreInput,
  DictionaryIdInput,
  DictionarySearchInput,
  FamiliarInput,
  GoalInput,
  IntroductionInput,
  LibraryQueryInput,
  KanaAttemptInput,
  KanaLessonInput,
  ProfileInput,
  ProfileUpdateInput,
} from './schemas';
import type { Result } from './errors';

export type { DateKey } from './date';
export type { ActivityType, CurriculumPhase } from './goals';
export type { AudioPreference, InitialLevel, Interest, JlptTarget, ThemeChoice } from './enums';
export type { KanaGroup, KanaItem, KanaScript } from './kanaData';
export type { KanaStatus } from './kanaRules';
export type {
  AppSettingsInput,
  BackupRestoreInput,
  DictionaryIdInput,
  DictionarySearchInput,
  FamiliarInput,
  GoalInput,
  IntroductionInput,
  LibraryQueryInput,
  KanaAttemptInput,
  KanaLessonInput,
  ProfileInput,
  ProfileUpdateInput,
} from './schemas';
export type { AppErrorPayload, ErrorCode, Result } from './errors';

export const CHANNELS = {
  appInfo: 'app:info',
  dataRoot: 'app:data-root',
  profileCreate: 'profile:create',
  profileGetActive: 'profile:get-active',
  profileUpdate: 'profile:update',
  goalsList: 'goals:list',
  goalsSet: 'goals:set',
  plannerGetToday: 'planner:get-today',
  plannerPreview: 'planner:preview',
  plannerGetCalendarDay: 'planner:get-calendar-day',
  plannerGetStats: 'planner:get-stats',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  backupCreate: 'backup:create',
  backupList: 'backup:list',
  backupRestore: 'backup:restore',
  backupExportProgress: 'backup:export-progress',
  kanaCatalog: 'kana:catalog',
  kanaLesson: 'kana:lesson',
  kanaSubmitAttempt: 'kana:submit-attempt',
  kanaReviewQueue: 'kana:review-queue',
  kanaSummary: 'kana:summary',
  studyStart: 'study:start',
  studyPause: 'study:pause',
  studyResume: 'study:resume',
  studyStop: 'study:stop',
  studyGetStatus: 'study:get-status',
  studyAcknowledgeInterrupted: 'study:acknowledge-interrupted',
  immersionAdd: 'immersion:add',
  immersionList: 'immersion:list',
  immersionCorrect: 'immersion:correct',
  dictionarySearch: 'dictionary:search',
  dictionaryGetEntry: 'dictionary:get-entry',
  dictionaryGetKanji: 'dictionary:get-kanji',
  dictionaryGetKana: 'dictionary:get-kana',
  dictionaryMetadata: 'dictionary:metadata',
  learningGetLesson: 'learning:get-lesson',
  learningIntroduce: 'learning:introduce',
  learningSetFamiliar: 'learning:set-familiar',
  learningScheduleFamiliar: 'learning:schedule-familiar',
  learningGetLibrary: 'learning:get-library',
  learningGetSummary: 'learning:get-summary',
  learningGetDetail: 'learning:get-detail',
  learningSetNotes: 'learning:set-notes',
  reviewsGetQueue: 'reviews:get-queue',
  reviewsGetCard: 'reviews:get-card',
  reviewsSubmitRating: 'reviews:submit-rating',
  reviewsUndoLast: 'reviews:undo-last',
} as const;

export type AppInfo = {
  readonly name: string;
  readonly version: string;
  readonly electron: string;
  readonly chrome: string;
  readonly node: string;
  readonly platform: string;
  readonly isDev: boolean;
};

export type DataRootInfo = {
  readonly root: string;
  readonly databaseFile: string;
  readonly backupsDir: string;
  readonly source: 'env' | 'dev' | 'userData';
};

export type ProfilePreferences = {
  readonly romaji: boolean;
  readonly furigana: boolean;
  readonly audio: AudioPreference;
  readonly desiredRetention?: number;
};

export type Profile = {
  readonly id: string;
  readonly displayName: string;
  readonly startDate: DateKey;
  readonly horizonMonths: number;
  readonly timezone: string;
  readonly initialLevel: InitialLevel;
  readonly targetJlpt: JlptTarget | null;
  readonly interests: readonly Interest[];
  readonly preferences: ProfilePreferences;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type GoalVersion = {
  readonly id: string;
  readonly effectiveDate: DateKey;
  readonly dailyMinutes: number;
  readonly dailyNewWords: number;
  readonly createdAt: string;
};

export type ProfileState = {
  readonly profile: Profile;
  readonly goals: readonly GoalVersion[];
};

export type PlanAssignment = {
  readonly activityType: ActivityType;
  readonly minutes: number;
  /** Non-null only for the vocabulary row, whose unit is words rather than minutes. */
  readonly words: number | null;
};

export type DayStatus = 'before-start' | 'scheduled' | 'after-horizon';
export type DayRelative = 'past' | 'today' | 'future';

export type PlanDay = {
  readonly dayKey: DateKey;
  readonly eligible: boolean;
  readonly relative: DayRelative;
  readonly status: DayStatus;
  readonly curriculumDay: number | null;
  readonly curriculumWeek: number | null;
  readonly curriculumMonth: number | null;
  readonly phase: CurriculumPhase | null;
  readonly targetMinutes: number;
  readonly targetWords: number;
  readonly assignments: readonly PlanAssignment[];
  readonly goalVersionId: string | null;
};

export type Horizon = {
  readonly startDate: DateKey;
  readonly endDateExclusive: DateKey;
  readonly totalDays: number;
  /** 1-based position of today within the horizon, or null when outside it. */
  readonly dayIndex: number | null;
  readonly remainingDays: number;
  readonly completed: boolean;
  readonly beforeStart: boolean;
};

export type MonthProgress = {
  readonly monthKey: string;
  /** Eligible study days in this calendar month, including days still ahead. */
  readonly targetDays: number;
  readonly targetMinutes: number;
  readonly targetWords: number;
  /** Eligible days in this month up to and including today. */
  readonly elapsedDays: number;
  readonly minutesToDate: number;
  readonly wordsToDate: number;
};

export type WeekDay = {
  readonly dayKey: DateKey;
  readonly isToday: boolean;
  readonly eligible: boolean;
};

export type WeekProgress = {
  readonly weekStart: DateKey;
  readonly weekEnd: DateKey;
  readonly days: readonly WeekDay[];
};

export type Actuals = {
  readonly minutes: number;
  /** Measured minutes per activity type; absent means no session of that type today. */
  readonly minutesByActivity: Readonly<Partial<Record<ActivityType, number>>>;
  readonly newWords: number;
  readonly reviewsCompleted: number;
};

export type DashboardData = {
  readonly profile: Profile;
  readonly today: PlanDay;
  readonly actual: Actuals;
  readonly kana: KanaSummary;
  readonly horizon: Horizon;
  readonly month: MonthProgress;
  readonly week: WeekProgress;
  readonly dueReviews: number;
  readonly activeGoal: GoalVersion;
  readonly goals: readonly GoalVersion[];
  /** Plain-language statement of what the numbers do and do not include. */
  readonly trackingNote: string;
};

export type PlanPreview = {
  readonly startDate: DateKey;
  readonly endDateExclusive: DateKey;
  readonly eligibleDays: number;
  readonly curriculumWeeks: number;
  readonly fullWeekMinutes: number;
  readonly fullWeekWords: number;
  readonly totalMinutes: number;
  readonly totalWords: number;
  readonly months: readonly {
    readonly monthKey: string;
    readonly days: number;
    readonly minutes: number;
    readonly words: number;
  }[];
};

export type BackupInfo = {
  readonly fileName: string;
  readonly createdAt: string;
  readonly sizeBytes: number;
  readonly reason: string;
};

export type AppSettings = {
  readonly theme: ThemeChoice;
};

export type RestoreResult = {
  readonly restored: string;
  readonly safetyBackup: string | null;
};

export type KanaSummary = {
  readonly attempts: number;
  readonly accuracy: number;
  readonly unseen: number;
  readonly learning: number;
  readonly verified: number;
  readonly struggling: number;
  readonly due: number;
  readonly total: number;
  readonly perScript: Readonly<Record<KanaScript, { readonly total: number; readonly verified: number }>>;
  /** Status by stable kana id, so a chart can render without one IPC call per group. */
  readonly statuses: Readonly<Record<string, KanaStatus>>;
};

export type KanaLesson = {
  readonly script: KanaScript;
  readonly groupId: string;
  readonly label: string;
  readonly items: readonly KanaItem[];
  readonly statuses: readonly {
    readonly kanaId: string;
    readonly status: KanaStatus;
    readonly dueDay: DateKey | null;
  }[];
};

export type KanaReviewItem = {
  readonly kanaId: string;
  readonly character: string;
  readonly reading: string;
  readonly dueDay: DateKey | null;
  readonly lapses: number;
  readonly failedToday: boolean;
};

export type AttemptResult = {
  readonly correct: boolean;
  readonly expected: string;
  readonly status: KanaStatus;
  readonly verified: boolean;
  readonly eventId: string;
  readonly duplicate: boolean;
};

export type DictionaryResult = {
  readonly id: string;
  readonly canonicalForm: string;
  readonly reading: string;
  readonly english: string;
  readonly priority: number;
  readonly curriculumRank: number | null;
};

export type DictionaryEntry = {
  readonly id: string;
  readonly sourceId: string;
  readonly canonicalForm: string;
  readonly forms: readonly { readonly text: string; readonly common: boolean }[];
  readonly readings: readonly {
    readonly text: string;
    readonly common: boolean;
    readonly appliesTo: readonly string[];
  }[];
  readonly senses: readonly {
    readonly partOfSpeech: string;
    readonly english: string;
    readonly tags: readonly string[];
    readonly appliesToForms: readonly string[];
    readonly appliesToReadings: readonly string[];
  }[];
  readonly kanji: readonly string[];
  readonly priority: number;
  readonly curriculumRank: number | null;
};

export type DictionaryKanji = {
  readonly literal: string;
  readonly grade: number | null;
  readonly strokes: number | null;
  readonly frequency: number | null;
  readonly meanings: string;
  readonly readings: readonly { readonly type: string; readonly reading: string }[];
};

export type DictionaryKana = {
  readonly character: string;
  readonly reading: string;
  readonly script: string;
  readonly tier: string;
};

export type DictionaryMetadata = {
  readonly release: string;
  readonly licence: string;
  readonly attribution: string;
  readonly entryCount: number;
  readonly kanjiCount: number;
  readonly fixture: boolean;
  readonly path: string;
};

export type DayFactsDTO = {
  readonly dayKey: DateKey;
  readonly eligible: boolean;
  readonly targetMinutes: number;
  readonly targetWords: number;
  readonly minutes: number;
  readonly newWords: number;
  readonly reviews: number;
  readonly kanaAttempts: number;
};

export type CalendarDayResult = {
  readonly day: DayFactsDTO;
  readonly curriculumDay: number | null;
  readonly curriculumWeek: number | null;
  readonly phase: CurriculumPhase | null;
  readonly status: 'before-start' | 'scheduled' | 'after-horizon';
};

export type StatsResult = {
  readonly version: 'stats-v1';
  readonly week: { readonly weekStart: DateKey; readonly days: readonly DayFactsDTO[] };
  readonly month: { readonly monthKey: string; readonly days: readonly DayFactsDTO[] };
  readonly horizon: {
    readonly totalDays: number;
    readonly dayIndex: number | null;
    readonly remainingDays: number;
    readonly completed: boolean;
    readonly beforeStart: boolean;
  };
  readonly streak: number;
  readonly phase: CurriculumPhase;
  readonly toDate: {
    readonly targetMinutes: number;
    readonly targetWords: number;
    readonly actualMinutes: number;
    readonly actualWords: number;
  };
  readonly definitions: {
    readonly streak: string;
    readonly accuracy: string;
    readonly verifiedRecognition: string;
  };
};

export type ImmersionLogDTO = {
  readonly id: string;
  readonly dayKey: string;
  readonly startedAt: string;
  readonly durationSeconds: number;
  readonly activityType: ActivityType;
  readonly title: string;
  readonly notes: string;
  readonly deliberate: boolean;
};

export type ImmersionAddDTO = {
  readonly eventId: string;
  readonly durationSeconds: number;
  readonly activityType: ActivityType;
  readonly title: string;
  readonly notes: string;
  readonly deliberate: boolean;
};

export type ImmersionCorrectDTO = {
  readonly eventId: string;
  readonly id: string;
  readonly reason: string;
  readonly durationSeconds?: number;
  readonly title?: string;
  readonly notes?: string;
  readonly deliberate?: boolean;
};

export type ExportInput = { readonly format: 'json' | 'csv'; readonly includeNotes: boolean };

export type LessonItem = {
  readonly itemKey: string;
  readonly form: string;
  readonly reading: string;
  readonly english: string;
  readonly state: 'assigned' | 'introduced' | 'deferred' | 'familiar';
};

export type LearningSummary = {
  readonly introduced: number;
  readonly familiar: number;
  readonly learning: number;
  readonly struggling: number;
  readonly verified: number;
  readonly due: number;
  readonly accuracy: number;
};

export type LessonResult = {
  readonly dayKey: DateKey;
  readonly items: readonly LessonItem[];
  readonly summary: LearningSummary;
};

export type VocabularyLibraryItem = {
  readonly itemKey: string;
  readonly form: string;
  readonly reading: string;
  readonly english: string;
  readonly introducedAt: string | null;
  readonly familiar: boolean;
};

export type VocabularyLibraryResult = {
  readonly items: readonly VocabularyLibraryItem[];
  readonly total: number;
};

export type ReviewQueueItem = {
  readonly cardId: string;
  readonly itemKey: string;
  readonly skill: 'meaning' | 'reading';
  readonly form: string;
  readonly reading: string;
  readonly english: string;
  readonly dueAt: string;
  readonly lapses: number;
};

export type ReviewCardDetail = {
  readonly cardId: string;
  readonly itemKey: string;
  readonly skill: 'meaning' | 'reading';
  readonly stateJson: string;
  readonly dueAt: string;
  readonly reps: number;
  readonly lapses: number;
};

export type VocabularyDetail = {
  readonly itemKey: string;
  readonly form: string;
  readonly reading: string;
  readonly english: string;
  readonly senses: readonly string[];
  readonly notes: string;
  readonly introducedAt: string | null;
  readonly familiar: boolean;
  readonly skills: readonly {
    readonly skill: 'meaning' | 'reading';
    readonly dueAt: string | null;
    readonly reps: number;
    readonly lapses: number;
    readonly state: string;
  }[];
  readonly history: readonly {
    readonly reviewedAt: string;
    readonly dayKey: string;
    readonly rating: number;
    readonly correct: boolean;
    readonly hintUsed: boolean;
  }[];
};

export type RatingInput = {
  readonly cardId: string;
  readonly rating: 1 | 2 | 3 | 4;
  readonly expectedStateJson: string;
  readonly responseMs: number;
  readonly hintUsed: boolean;
  readonly eventId: string;
};

export type RatingResult = {
  readonly correct: boolean;
  readonly dueAtMs: number;
  readonly rating: number;
  readonly duplicate: boolean;
};

export type TimerStatus = {
  readonly active: boolean;
  readonly sessionId: string | null;
  readonly activityType: ActivityType | null;
  readonly status: 'running' | 'paused' | 'stopped' | 'interrupted' | null;
  readonly elapsedSeconds: number;
  readonly dayKey: DateKey | null;
  readonly interruptedSessions: readonly string[];
};

export type StudyStartInput = {
  readonly activityType: ActivityType;
};

export type AcknowledgeInterruptedInput = {
  readonly sessionId: string;
};

/** The only surface exposed to the renderer through the preload bridge. */
export type KotobaApi = {
  appInfo(): Promise<Result<AppInfo>>;
  dataRoot(): Promise<Result<DataRootInfo>>;
  profiles: {
    create(input: ProfileInput): Promise<Result<ProfileState>>;
    getActive(): Promise<Result<ProfileState | null>>;
    update(input: ProfileUpdateInput): Promise<Result<ProfileState>>;
  };
  goals: {
    list(): Promise<Result<GoalVersion[]>>;
    set(input: GoalInput): Promise<Result<GoalVersion[]>>;
  };
  planner: {
    getToday(): Promise<Result<DashboardData>>;
    preview(input: ProfileInput): Promise<Result<PlanPreview>>;
    getCalendarDay(input: { readonly dayKey: DateKey }): Promise<Result<CalendarDayResult>>;
    getStats(): Promise<Result<StatsResult>>;
  };
  settings: {
    get(): Promise<Result<AppSettings>>;
    set(input: AppSettingsInput): Promise<Result<AppSettings>>;
  };
  backup: {
    create(): Promise<Result<BackupInfo>>;
    list(): Promise<Result<BackupInfo[]>>;
    restore(input: BackupRestoreInput): Promise<Result<RestoreResult>>;
    exportProgress(input: ExportInput): Promise<Result<{ readonly saved: boolean }>>;
  };
  kana: {
    catalog(): Promise<Result<readonly KanaGroup[]>>;
    lesson(input: KanaLessonInput): Promise<Result<KanaLesson>>;
    submitAttempt(input: KanaAttemptInput): Promise<Result<AttemptResult>>;
    reviewQueue(): Promise<Result<readonly KanaReviewItem[]>>;
    summary(): Promise<Result<KanaSummary>>;
  };
  study: {
    start(input: StudyStartInput): Promise<Result<TimerStatus>>;
    pause(): Promise<Result<TimerStatus>>;
    resume(): Promise<Result<TimerStatus>>;
    stop(): Promise<Result<TimerStatus>>;
    getStatus(): Promise<Result<TimerStatus>>;
    acknowledgeInterrupted(input: AcknowledgeInterruptedInput): Promise<Result<TimerStatus>>;
  };
  immersion: {
    add(input: ImmersionAddDTO): Promise<Result<ImmersionLogDTO>>;
    list(input: { readonly offset: number; readonly limit: number }): Promise<Result<readonly ImmersionLogDTO[]>>;
    correct(input: ImmersionCorrectDTO): Promise<Result<ImmersionLogDTO>>;
  };
  dictionary: {
    search(input: DictionarySearchInput): Promise<Result<readonly DictionaryResult[]>>;
    getEntry(input: DictionaryIdInput): Promise<Result<DictionaryEntry | null>>;
    getKanji(input: DictionaryIdInput): Promise<Result<DictionaryKanji | null>>;
    getKana(input: DictionaryIdInput): Promise<Result<DictionaryKana | null>>;
    metadata(): Promise<Result<DictionaryMetadata>>;
  };
  learning: {
    getLesson(): Promise<Result<LessonResult>>;
    introduce(input: IntroductionInput): Promise<Result<{ readonly introduced: boolean; readonly duplicate: boolean }>>;
    setFamiliar(input: FamiliarInput): Promise<Result<LearningSummary>>;
    scheduleFamiliar(input: IntroductionInput): Promise<Result<{ readonly scheduled: boolean }>>;
    getLibrary(input: LibraryQueryInput): Promise<Result<VocabularyLibraryResult>>;
    getSummary(): Promise<Result<LearningSummary>>;
    getDetail(input: { readonly itemId: string }): Promise<Result<VocabularyDetail | null>>;
    setNotes(input: { readonly itemId: string; readonly notes: string }): Promise<Result<{ readonly saved: boolean }>>;
  };
  reviews: {
    getQueue(): Promise<Result<{ readonly items: readonly ReviewQueueItem[]; readonly remaining: number }>>;
    getCard(input: { readonly cardId: string }): Promise<Result<ReviewCardDetail | null>>;
    submitRating(input: RatingInput): Promise<Result<RatingResult>>;
    undoLast(input: { readonly cardId: string; readonly eventId: string }): Promise<Result<{ readonly restored: boolean; readonly dueAtMs: number }>>;
  };
};
