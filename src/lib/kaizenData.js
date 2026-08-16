import { JOURNAL_ANALYSES_STORAGE_KEY } from "./journal.js";

export const STORAGE_KEYS = {
  legacyTasks: "kaizen:v1:tasks",
  legacyCompletions: "kaizen:v1:taskCompletions",
  notes: "kaizen:v1:dailyNotes",
  journalAnalyses: JOURNAL_ANALYSES_STORAGE_KEY,
  streak: "kaizen:v1:currentStreak",
  bestStreak: "kaizen:v1:bestStreak",
  lastCheckedDate: "kaizen:v1:lastCheckedDate",
  creditedDates: "kaizen:v1:creditedDates",
  sectionNotes: "kaizen:v1:sectionNotes",
  inboxItems: "kaizen:v1:gtd:inboxItems",
  projects: "kaizen:v1:gtd:projects",
  projectActions: "kaizen:v1:gtd:projectActions",
  nextActions: "kaizen:v1:gtd:nextActions",
  calendarItems: "kaizen:v1:gtd:calendarItems",
  waitingFor: "kaizen:v1:gtd:waitingFor",
  somedayMaybe: "kaizen:v1:gtd:somedayMaybe",
  archiveItems: "kaizen:v1:gtd:archiveItems",
  migration: "kaizen:v1:gtd:migration",
  syncCache: "kaizen:v1:sync:cache",
  syncQueue: "kaizen:v1:sync:queue",
  syncMeta: "kaizen:v1:sync:meta",
  deviceId: "kaizen:v1:deviceId",
};

export const MIGRATION_VERSION = 1;

export const COLLECTIONS = [
  { name: "legacyTasks", storageKey: STORAGE_KEYS.legacyTasks, kind: "array", fallback: [] },
  {
    name: "legacyCompletions",
    storageKey: STORAGE_KEYS.legacyCompletions,
    kind: "objectMap",
    fallback: {},
  },
  { name: "notes", storageKey: STORAGE_KEYS.notes, kind: "objectMap", fallback: {} },
  {
    name: "journalAnalyses",
    storageKey: STORAGE_KEYS.journalAnalyses,
    kind: "objectMap",
    fallback: {},
  },
  { name: "streak", storageKey: STORAGE_KEYS.streak, kind: "singleton", fallback: 0 },
  {
    name: "bestStreak",
    storageKey: STORAGE_KEYS.bestStreak,
    kind: "singleton",
    fallback: 0,
  },
  {
    name: "lastCheckedDate",
    storageKey: STORAGE_KEYS.lastCheckedDate,
    kind: "singleton",
    fallback: "",
  },
  {
    name: "creditedDates",
    storageKey: STORAGE_KEYS.creditedDates,
    kind: "arrayValue",
    fallback: [],
  },
  {
    name: "sectionNotes",
    storageKey: STORAGE_KEYS.sectionNotes,
    kind: "array",
    fallback: [],
  },
  {
    name: "inboxItems",
    storageKey: STORAGE_KEYS.inboxItems,
    kind: "array",
    fallback: [],
  },
  { name: "projects", storageKey: STORAGE_KEYS.projects, kind: "array", fallback: [] },
  {
    name: "projectActions",
    storageKey: STORAGE_KEYS.projectActions,
    kind: "array",
    fallback: [],
  },
  {
    name: "nextActions",
    storageKey: STORAGE_KEYS.nextActions,
    kind: "array",
    fallback: [],
  },
  {
    name: "calendarItems",
    storageKey: STORAGE_KEYS.calendarItems,
    kind: "array",
    fallback: [],
  },
  {
    name: "waitingFor",
    storageKey: STORAGE_KEYS.waitingFor,
    kind: "array",
    fallback: [],
  },
  {
    name: "somedayMaybe",
    storageKey: STORAGE_KEYS.somedayMaybe,
    kind: "array",
    fallback: [],
  },
  {
    name: "archiveItems",
    storageKey: STORAGE_KEYS.archiveItems,
    kind: "array",
    fallback: [],
  },
];

export const COLLECTION_BY_NAME = Object.fromEntries(
  COLLECTIONS.map((collection) => [collection.name, collection]),
);

export function createEmptyKaizenData() {
  return Object.fromEntries(
    COLLECTIONS.map((collection) => [collection.name, cloneValue(collection.fallback)]),
  );
}

export function cloneValue(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}
