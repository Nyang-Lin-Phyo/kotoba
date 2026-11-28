import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS, type KotobaApi } from '../shared/contracts';
import type { Result } from '../shared/errors';

// The renderer gets this object and nothing else: no ipcRenderer, no Node, no paths.
function invoke<T>(channel: string, payload?: unknown): Promise<Result<T>> {
  return ipcRenderer.invoke(channel, payload) as Promise<Result<T>>;
}

const api: KotobaApi = {
  appInfo: () => invoke(CHANNELS.appInfo),
  dataRoot: () => invoke(CHANNELS.dataRoot),
  profiles: {
    create: (input) => invoke(CHANNELS.profileCreate, input),
    getActive: () => invoke(CHANNELS.profileGetActive),
    update: (input) => invoke(CHANNELS.profileUpdate, input),
  },
  goals: {
    list: () => invoke(CHANNELS.goalsList),
    set: (input) => invoke(CHANNELS.goalsSet, input),
  },
  planner: {
    getToday: () => invoke(CHANNELS.plannerGetToday),
    preview: (input) => invoke(CHANNELS.plannerPreview, input),
    getCalendarDay: (input) => invoke(CHANNELS.plannerGetCalendarDay, input),
    getStats: () => invoke(CHANNELS.plannerGetStats),
  },
  settings: {
    get: () => invoke(CHANNELS.settingsGet),
    set: (input) => invoke(CHANNELS.settingsSet, input),
  },
  backup: {
    create: () => invoke(CHANNELS.backupCreate),
    list: () => invoke(CHANNELS.backupList),
    restore: (input) => invoke(CHANNELS.backupRestore, input),
    exportProgress: (input) => invoke(CHANNELS.backupExportProgress, input),
  },
  immersion: {
    add: (input) => invoke(CHANNELS.immersionAdd, input),
    list: (input) => invoke(CHANNELS.immersionList, input),
    correct: (input) => invoke(CHANNELS.immersionCorrect, input),
  },
  kana: {
    catalog: () => invoke(CHANNELS.kanaCatalog),
    lesson: (input) => invoke(CHANNELS.kanaLesson, input),
    submitAttempt: (input) => invoke(CHANNELS.kanaSubmitAttempt, input),
    reviewQueue: () => invoke(CHANNELS.kanaReviewQueue),
    summary: () => invoke(CHANNELS.kanaSummary),
  },
  learning: {
    getLesson: () => invoke(CHANNELS.learningGetLesson),
    introduce: (input) => invoke(CHANNELS.learningIntroduce, input),
    setFamiliar: (input) => invoke(CHANNELS.learningSetFamiliar, input),
    scheduleFamiliar: (input) => invoke(CHANNELS.learningScheduleFamiliar, input),
    getLibrary: (input) => invoke(CHANNELS.learningGetLibrary, input),
    getSummary: () => invoke(CHANNELS.learningGetSummary),
    getDetail: (input) => invoke(CHANNELS.learningGetDetail, input),
    setNotes: (input) => invoke(CHANNELS.learningSetNotes, input),
  },
  reviews: {
    getQueue: () => invoke(CHANNELS.reviewsGetQueue),
    getCard: (input) => invoke(CHANNELS.reviewsGetCard, input),
    submitRating: (input) => invoke(CHANNELS.reviewsSubmitRating, input),
    undoLast: (input) => invoke(CHANNELS.reviewsUndoLast, input),
  },
  study: {
    start: (input) => invoke(CHANNELS.studyStart, input),
    pause: () => invoke(CHANNELS.studyPause),
    resume: () => invoke(CHANNELS.studyResume),
    stop: () => invoke(CHANNELS.studyStop),
    getStatus: () => invoke(CHANNELS.studyGetStatus),
    acknowledgeInterrupted: (input) => invoke(CHANNELS.studyAcknowledgeInterrupted, input),
  },
  dictionary: {
    search: (input) => invoke(CHANNELS.dictionarySearch, input),
    getEntry: (input) => invoke(CHANNELS.dictionaryGetEntry, input),
    getKanji: (input) => invoke(CHANNELS.dictionaryGetKanji, input),
    getKana: (input) => invoke(CHANNELS.dictionaryGetKana, input),
    metadata: () => invoke(CHANNELS.dictionaryMetadata),
  },
  immersionStudy: {
    analyze: (input) => invoke(CHANNELS.immersionAnalyze, input),
    analysis: (input) => invoke(CHANNELS.immersionAnalysis, input),
    mine: (input) => invoke(CHANNELS.immersionMine, input),
    queue: (input) => invoke(CHANNELS.immersionQueue, input),
    queueCount: () => invoke(CHANNELS.immersionQueueCount),
    dismiss: (input) => invoke(CHANNELS.immersionDismiss, input),
    importFile: () => invoke(CHANNELS.mediaImport),
    comprehension: (input) => invoke(CHANNELS.comprehensionSubmit, input),
  },
  kanji: {
    list: () => invoke(CHANNELS.kanjiList),
    detail: (input) => invoke(CHANNELS.kanjiDetail, input),
    attempt: (input) => invoke(CHANNELS.kanjiAttempt, input),
  },
  grammar: {
    list: () => invoke(CHANNELS.grammarList),
    detail: (input) => invoke(CHANNELS.grammarDetail, input),
    attempt: (input) => invoke(CHANNELS.grammarAttempt, input),
  },
};

contextBridge.exposeInMainWorld('kotoba', api);
