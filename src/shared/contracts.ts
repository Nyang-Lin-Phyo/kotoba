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
  GoalInput,
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
  GoalInput,
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
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  backupCreate: 'backup:create',
  backupList: 'backup:list',
  backupRestore: 'backup:restore',
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
  };
  settings: {
    get(): Promise<Result<AppSettings>>;
    set(input: AppSettingsInput): Promise<Result<AppSettings>>;
  };
  backup: {
    create(): Promise<Result<BackupInfo>>;
    list(): Promise<Result<BackupInfo[]>>;
    restore(input: BackupRestoreInput): Promise<Result<RestoreResult>>;
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
};
