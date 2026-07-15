import { parseDateKey } from "../utils/date.js";

export const JOURNAL_ANALYSES_STORAGE_KEY = "kaizen:v1:journalAnalyses";

const VALID_CONFIDENCE = new Set(["low", "medium", "high"]);
const VALID_STEP_TYPES = new Set(["next_step", "experiment", "habit"]);

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanBoolean(value) {
  return Boolean(value);
}

function cleanLimitedItems(value, mapper, limit = 8) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(mapper).filter(Boolean).slice(0, limit);
}

export function formatJournalDate(value) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parseDateKey(value));
}

export function getJournalEntries(notes) {
  return Object.entries(notes || {})
    .map(([date, text]) => ({
      date,
      text: cleanText(text),
    }))
    .filter((entry) => entry.date && entry.text)
    .sort((left, right) => right.date.localeCompare(left.date));
}

export function getPreviousJournalEntries(notes, currentDate, limit = 7) {
  return getJournalEntries(notes)
    .filter((entry) => entry.date < currentDate)
    .slice(0, limit);
}

export function normalizeJournalAnalysis(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const summary = cleanText(value.summary);
  const progress = cleanLimitedItems(value.progress, (item) => {
    const title = cleanText(item?.title);
    const evidence = cleanText(item?.evidence);
    return title || evidence ? { title, evidence } : null;
  });
  const obstacles = cleanLimitedItems(value.obstacles, (item) => {
    const title = cleanText(item?.title);
    const description = cleanText(item?.description);
    if (!title && !description) {
      return null;
    }
    return {
      title,
      description,
      recurring: cleanBoolean(item?.recurring),
    };
  });
  const hypotheses = cleanLimitedItems(value.hypotheses, (item) => {
    const description = cleanText(item?.description);
    const confidence = VALID_CONFIDENCE.has(item?.confidence)
      ? item.confidence
      : "low";
    return description ? { description, confidence } : null;
  });
  const suggestedSteps = cleanLimitedItems(
    value.suggestedSteps,
    (item) => {
      const title = cleanText(item?.title);
      const description = cleanText(item?.description);
      const sourceActivity = cleanText(item?.sourceActivity);
      const type = VALID_STEP_TYPES.has(item?.type) ? item.type : "next_step";

      return title || description
        ? { title, description, sourceActivity, type }
        : null;
    },
    4,
  );
  const patterns = cleanLimitedItems(value.patterns, (item) => {
    const name = cleanText(item?.name);
    const evidence = cleanText(item?.evidence);
    return name || evidence ? { name, evidence } : null;
  });

  if (
    !summary &&
    progress.length === 0 &&
    obstacles.length === 0 &&
    hypotheses.length === 0 &&
    suggestedSteps.length === 0 &&
    patterns.length === 0
  ) {
    return null;
  }

  return {
    summary,
    progress,
    obstacles,
    hypotheses,
    suggestedSteps,
    patterns,
  };
}
