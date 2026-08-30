const ACTION_STATUSES = new Set(["ready", "in-progress", "blocked", "completed"]);
const ENERGY_LEVELS = new Set(["low", "medium", "high"]);
const EXPERIMENT_STATUSES = new Set(["planned", "active", "review", "completed"]);
const EXPERIMENT_DECISIONS = new Set(["", "adopt", "modify", "abandon"]);
const INSIGHT_TYPES = new Set([
  "fact",
  "observation",
  "interpretation",
  "hypothesis",
  "suggestion",
]);
const CONFIDENCE_LEVELS = new Set(["low", "medium", "high"]);
const PATTERN_STATUSES = new Set(["observed", "confirmed", "rejected", "archived"]);

export const WEEKLY_REVIEW_STEPS = [
  "Svuota o processa la Inbox",
  "Controlla il calendario passato",
  "Controlla il calendario futuro",
  "Verifica i progetti senza prossima azione",
  "Controlla le azioni bloccate",
  "Controlla gli elementi in attesa e i follow-up",
  "Rivedi Prima o poi / Forse",
  "Rivedi gli esperimenti Kaizen",
  "Scegli i risultati importanti della prossima settimana",
];

function cleanText(value, maxLength = 12000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanList(value, limit = 20) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((item) => cleanText(item, 120)).filter(Boolean))].slice(
    0,
    limit,
  );
}

function clampNumber(value, min, max, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

function isoOrFallback(value, fallback) {
  return value && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function dateFromTimestamp(value, fallback = "") {
  const parsed = value && !Number.isNaN(Date.parse(value)) ? new Date(value) : null;
  return parsed ? parsed.toISOString().slice(0, 10) : fallback;
}

function stableHash(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

export function stableLoopId(prefix, value) {
  return `${prefix}-${stableHash(String(value))}`;
}

export function actionRef(source, id) {
  return `${source}:${id}`;
}

export function parseActionRef(ref) {
  const [source, ...idParts] = String(ref || "").split(":");
  return { source, id: idParts.join(":") };
}

export function normalizeAction(action, source = "nextActions", project = null) {
  const completed = Boolean(action?.completed) || action?.status === "completed";
  const status = completed
    ? "completed"
    : ACTION_STATUSES.has(action?.status)
      ? action.status
      : action?.blockedReason
        ? "blocked"
        : "ready";

  return {
    ...action,
    ref: actionRef(source, action?.id),
    source,
    projectId: action?.projectId || null,
    projectTitle: project?.title || "",
    context: cleanText(action?.context, 80),
    energy: ENERGY_LEVELS.has(action?.energy) ? action.energy : "",
    estimatedMinutes: clampNumber(action?.estimatedMinutes, 1, 1440),
    dueDate: cleanText(action?.dueDate, 20),
    status,
    blockedReason: cleanText(action?.blockedReason, 500),
    focusDate: cleanText(action?.focusDate, 20),
    completed,
  };
}

export function selectUnifiedActions(data, options = {}) {
  const projectsById = new Map((data?.projects || []).map((project) => [project.id, project]));
  const seen = new Set();
  const actions = [];

  for (const action of data?.nextActions || []) {
    const normalized = normalizeAction(action, "nextActions");
    if (action?.id && !seen.has(normalized.ref)) {
      seen.add(normalized.ref);
      actions.push(normalized);
    }
  }

  for (const action of data?.projectActions || []) {
    const normalized = normalizeAction(
      action,
      "projectActions",
      projectsById.get(action?.projectId),
    );
    if (action?.id && !seen.has(normalized.ref)) {
      seen.add(normalized.ref);
      actions.push(normalized);
    }
  }

  return actions
    .filter((action) => options.includeCompleted || !action.completed)
    .sort((left, right) => {
      const statusOrder = { "in-progress": 0, ready: 1, blocked: 2, completed: 3 };
      return (
        (statusOrder[left.status] ?? 4) - (statusOrder[right.status] ?? 4) ||
        (Number(left.order) || 0) - (Number(right.order) || 0) ||
        left.title.localeCompare(right.title, "it")
      );
    });
}

export function filterUnifiedActions(actions, filters = {}) {
  return (actions || []).filter((action) => {
    if (filters.context && action.context !== filters.context) return false;
    if (filters.energy && action.energy !== filters.energy) return false;
    if (filters.projectId && action.projectId !== filters.projectId) return false;
    if (filters.status && action.status !== filters.status) return false;
    if (
      filters.availableMinutes &&
      action.estimatedMinutes &&
      action.estimatedMinutes > Number(filters.availableMinutes)
    ) return false;
    return true;
  });
}

export function normalizeDailyPlan(input, timestamp = new Date().toISOString()) {
  const date = cleanText(input?.date, 20) || timestamp.slice(0, 10);
  const primaryActionRef = cleanText(input?.primaryActionRef, 300);
  const supportActionRefs = cleanList(input?.supportActionRefs, 2).filter(
    (ref) => ref !== primaryActionRef,
  );

  return {
    id: input?.id || `daily-plan:${date}`,
    date,
    primaryActionRef,
    supportActionRefs,
    ifThen: {
      if: cleanText(input?.ifThen?.if, 500),
      then: cleanText(input?.ifThen?.then, 500),
    },
    intention: cleanText(input?.intention, 2000),
    createdAt: isoOrFallback(input?.createdAt, timestamp),
    updatedAt: timestamp,
  };
}

export function getDailyPlan(plans, date) {
  return normalizeDailyPlan((plans || []).find((plan) => plan.date === date) || { date });
}

export function resolveDailyFocus(plan, actions) {
  const actionsByRef = new Map((actions || []).map((action) => [action.ref, action]));
  return {
    primary: actionsByRef.get(plan?.primaryActionRef) || null,
    support: (plan?.supportActionRefs || [])
      .slice(0, 2)
      .map((ref) => actionsByRef.get(ref) || null),
  };
}

export function normalizeJournalEntry(input, timestamp = new Date().toISOString()) {
  const type = input?.type === "dream" ? "dream" : "daily";
  const date = cleanText(input?.date, 20) || timestamp.slice(0, 10);
  const base = {
    id: input?.id || `${type}:${date}:${stableHash(input?.recordedAt || input?.text || timestamp)}`,
    type,
    date,
    createdAt: isoOrFallback(input?.createdAt, timestamp),
    updatedAt: timestamp,
  };

  if (type === "dream") {
    return {
      ...base,
      recordedAt: isoOrFallback(input?.recordedAt, timestamp),
      captureMethod: ["text", "voice"].includes(input?.captureMethod)
        ? input.captureMethod
        : "text",
      title: cleanText(input?.title, 200),
      text: cleanText(input?.text),
      emotions: cleanList(input?.emotions),
      vividness: clampNumber(input?.vividness, 1, 5),
      people: cleanList(input?.people),
      places: cleanList(input?.places),
      themes: cleanList(input?.themes),
      lucid: typeof input?.lucid === "boolean" ? input.lucid : null,
      noDreamRemembered: Boolean(input?.noDreamRemembered),
      links: cleanList(input?.links, 12),
    };
  }

  return {
    ...base,
    freeText: cleanText(input?.freeText ?? input?.text),
    prompts: {
      happened: cleanText(input?.prompts?.happened, 4000),
      progress: cleanText(input?.prompts?.progress, 4000),
      obstacle: cleanText(input?.prompts?.obstacle, 4000),
      tomorrow: cleanText(input?.prompts?.tomorrow, 4000),
    },
    metrics: {
      energy: clampNumber(input?.metrics?.energy, 1, 5),
      focus: clampNumber(input?.metrics?.focus, 1, 5),
      satisfaction: clampNumber(input?.metrics?.satisfaction, 1, 5),
    },
  };
}

export function normalizeExperiment(input, timestamp = new Date().toISOString()) {
  const durationDays = clampNumber(input?.durationDays, 1, 365, 7);
  return {
    id: input?.id || `experiment:${stableHash(`${input?.problem}-${timestamp}`)}`,
    problem: cleanText(input?.problem, 2000),
    hypothesis: cleanText(input?.hypothesis, 2000),
    behavior: cleanText(input?.behavior, 2000),
    ifThen: {
      if: cleanText(input?.ifThen?.if, 500),
      then: cleanText(input?.ifThen?.then, 500),
    },
    startDate: cleanText(input?.startDate, 20) || timestamp.slice(0, 10),
    durationDays,
    metric: cleanText(input?.metric, 500),
    reviewDate: cleanText(input?.reviewDate, 20),
    status: EXPERIMENT_STATUSES.has(input?.status) ? input.status : "planned",
    result: cleanText(input?.result, 3000),
    decision: EXPERIMENT_DECISIONS.has(input?.decision) ? input.decision : "",
    isPrimary: Boolean(input?.isPrimary),
    createdAt: isoOrFallback(input?.createdAt, timestamp),
    updatedAt: timestamp,
  };
}

function legacyDream(note, timestamp) {
  const recordedAt = isoOrFallback(note?.createdAt, timestamp);
  return normalizeJournalEntry(
    {
      id: `legacy-dream:${note.id || stableHash(JSON.stringify(note))}`,
      type: "dream",
      date: dateFromTimestamp(recordedAt, timestamp.slice(0, 10)),
      recordedAt,
      title: note?.title,
      text: note?.content,
      createdAt: recordedAt,
      captureMethod: "text",
    },
    isoOrFallback(note?.updatedAt, recordedAt),
  );
}

export function migrateKaizenLoopData(input, timestamp = new Date().toISOString()) {
  const data = {
    ...input,
    dailyPlans: [...(input?.dailyPlans || [])],
    journalEntries: [...(input?.journalEntries || [])],
    experiments: [...(input?.experiments || [])],
    agentInsights: [...(input?.agentInsights || [])],
    weeklyReviews: [...(input?.weeklyReviews || [])],
    personalStrategies: [...(input?.personalStrategies || [])],
    archiveItems: [...(input?.archiveItems || [])],
    nextActions: [...(input?.nextActions || [])],
  };
  const ids = {
    journalEntries: new Set(data.journalEntries.map((item) => item.id)),
    agentInsights: new Set(data.agentInsights.map((item) => item.id)),
    personalStrategies: new Set(data.personalStrategies.map((item) => item.id)),
    archiveItems: new Set(data.archiveItems.map((item) => item.id)),
    nextActions: new Set(data.nextActions.map((item) => item.id)),
  };
  const counts = { dreams: 0, journals: 0, analyses: 0, strategies: 0, references: 0, tasks: 0 };

  for (const task of input?.legacyTasks || []) {
    if (!cleanText(task?.title, 500)) continue;
    const id = `legacy-task:${task.id || stableHash(JSON.stringify(task))}`;
    if (ids.nextActions.has(id)) continue;
    const completed = Boolean(task.completed);
    data.nextActions.push({
      id,
      title: cleanText(task.title, 500),
      completed,
      status: completed ? "completed" : "ready",
      order: data.nextActions.length,
      source: "legacy-task",
      legacyTaskId: task.id || "",
      createdAt: isoOrFallback(task.createdAt, timestamp),
      updatedAt: isoOrFallback(task.updatedAt || task.createdAt, timestamp),
      completedAt: completed ? isoOrFallback(task.completedAt, timestamp) : null,
    });
    ids.nextActions.add(id);
    counts.tasks += 1;
  }

  for (const note of input?.sectionNotes || []) {
    if (note?.section === "oneiros") {
      const entry = legacyDream(note, timestamp);
      if (!ids.journalEntries.has(entry.id)) {
        data.journalEntries.push(entry);
        ids.journalEntries.add(entry.id);
        counts.dreams += 1;
      }
      continue;
    }

    if (note?.section === "skills") {
      const id = `legacy-strategy:${note.id || stableHash(JSON.stringify(note))}`;
      if (!ids.personalStrategies.has(id)) {
        data.personalStrategies.push({
          id,
          title: cleanText(note.title, 200) || "Strategia personale",
          content: cleanText(note.content),
          source: "legacy-skills",
          createdAt: isoOrFallback(note.createdAt, timestamp),
          updatedAt: isoOrFallback(note.updatedAt, timestamp),
        });
        ids.personalStrategies.add(id);
        counts.strategies += 1;
      }
      continue;
    }

    if (["knowledge", "sharkmo"].includes(note?.section)) {
      const id = `legacy-reference:${note.id || stableHash(JSON.stringify(note))}`;
      if (!ids.archiveItems.has(id)) {
        data.archiveItems.push({
          id,
          title: cleanText(note.title, 200) || "Riferimento legacy",
          content: cleanText(note.content),
          source: `legacy-${note.section}`,
          createdAt: isoOrFallback(note.createdAt, timestamp),
          updatedAt: isoOrFallback(note.updatedAt, timestamp),
          archivedAt: isoOrFallback(note.updatedAt || note.createdAt, timestamp),
        });
        ids.archiveItems.add(id);
        counts.references += 1;
      }
    }
  }

  for (const [date, text] of Object.entries(input?.notes || {})) {
    if (!cleanText(text)) continue;
    const id = `legacy-journal:${date}`;
    if (!ids.journalEntries.has(id)) {
      data.journalEntries.push(
        normalizeJournalEntry({ id, type: "daily", date, freeText: text }, timestamp),
      );
      ids.journalEntries.add(id);
      counts.journals += 1;
    }
  }

  for (const [date, analysis] of Object.entries(input?.journalAnalyses || {})) {
    if (!analysis) continue;
    const id = `legacy-analysis:${date}`;
    if (!ids.agentInsights.has(id)) {
      data.agentInsights.push({
        id,
        date,
        mode: "journal",
        legacyAnalysis: analysis,
        statements: [],
        suggestions: [],
        patterns: [],
        inputRefs: [`legacy-journal:${date}`],
        includeDreams: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      ids.agentInsights.add(id);
      counts.analyses += 1;
    }
  }

  return {
    changed: Object.values(counts).some((count) => count > 0),
    counts,
    data,
    legacyPreserved: true,
  };
}

function normalizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      recordId: cleanText(item?.recordId, 300),
      date: cleanText(item?.date, 20),
      excerpt: cleanText(item?.excerpt, 240),
    }))
    .filter((item) => item.recordId && item.date)
    .slice(0, 12);
}

export function normalizeAgentOutput(value) {
  if (!value || typeof value !== "object") return null;
  const statements = (Array.isArray(value.statements) ? value.statements : [])
    .map((item) => ({
      type: INSIGHT_TYPES.has(item?.type) ? item.type : "observation",
      text: cleanText(item?.text, 2000),
      confidence: CONFIDENCE_LEVELS.has(item?.confidence) ? item.confidence : "low",
      evidence: normalizeEvidence(item?.evidence),
    }))
    .filter((item) => item.text)
    .slice(0, 12);
  const suggestions = (Array.isArray(value.suggestions) ? value.suggestions : [])
    .map((item, index) => ({
      id: cleanText(item?.id, 200) || `suggestion-${index + 1}`,
      title: cleanText(item?.title, 200),
      description: cleanText(item?.description, 1200),
      kind: ["action", "experiment", "reflection"].includes(item?.kind)
        ? item.kind
        : "reflection",
      evidence: normalizeEvidence(item?.evidence),
      feedback: ["accepted", "modified", "rejected"].includes(item?.feedback)
        ? item.feedback
        : "",
    }))
    .filter((item) => item.title || item.description)
    .slice(0, 3);
  const patterns = (Array.isArray(value.patterns) ? value.patterns : [])
    .map((item) => ({
      name: cleanText(item?.name, 200),
      description: cleanText(item?.description, 1200),
      scope: ["work", "behavior", "energy", "oneiros", "other"].includes(item?.scope)
        ? item.scope
        : "other",
      confidence: CONFIDENCE_LEVELS.has(item?.confidence) ? item.confidence : "low",
      status: PATTERN_STATUSES.has(item?.status) ? item.status : "observed",
      evidence: normalizeEvidence(item?.evidence),
    }))
    .filter((item) => item.name && new Set(item.evidence.map((entry) => entry.date)).size > 1)
    .slice(0, 6);
  const summary = cleanText(value.summary, 2000);

  return summary || statements.length || suggestions.length || patterns.length
    ? { summary, statements, suggestions, patterns }
    : null;
}

export function selectEvidenceBackedPatterns(agentInsights) {
  const groups = new Map();

  for (const insight of agentInsights || []) {
    for (const pattern of insight.patterns || []) {
      const key = cleanText(pattern.name, 200).toLocaleLowerCase("it");
      if (!key) continue;
      const group = groups.get(key) || { ...pattern, evidence: [] };
      group.evidence.push(...normalizeEvidence(pattern.evidence));
      if (pattern.status && pattern.status !== "observed") group.status = pattern.status;
      groups.set(key, group);
    }
  }

  return [...groups.values()]
    .map((pattern) => ({
      ...pattern,
      evidence: [...new Map(pattern.evidence.map((item) => [`${item.recordId}:${item.date}`, item])).values()],
    }))
    .filter((pattern) => new Set(pattern.evidence.map((item) => item.date)).size > 1)
    .sort((left, right) => right.evidence.length - left.evidence.length);
}

export function buildAgentContext({
  data,
  date,
  includeDreams = false,
  mode = "journal",
}) {
  const journalEntries = (data?.journalEntries || [])
    .filter((entry) => entry.date <= date)
    .filter((entry) => includeDreams || entry.type !== "dream")
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 8)
    .map((entry) => ({
      id: entry.id,
      type: entry.type,
      date: entry.date,
      ...(entry.type === "dream"
        ? {
            title: cleanText(entry.title, 200),
            text: cleanText(entry.text, 4000),
            emotions: cleanList(entry.emotions),
            themes: cleanList(entry.themes),
          }
        : {
            freeText: cleanText(entry.freeText, 5000),
            prompts: entry.prompts,
            metrics: entry.metrics,
          }),
    }));
  const actions = selectUnifiedActions(data)
    .slice(0, 40)
    .map(({ ref, title, projectTitle, context, energy, estimatedMinutes, status, dueDate }) => ({
      ref,
      title: cleanText(title, 240),
      projectTitle: cleanText(projectTitle, 200),
      context,
      energy,
      estimatedMinutes,
      status,
      dueDate,
    }));
  const strategies = (data?.personalStrategies || []).slice(0, 12).map((item) => ({
    id: item.id,
    title: cleanText(item.title, 160),
    content: cleanText(item.content, 1600),
  }));
  const feedback = (data?.agentInsights || [])
    .flatMap((insight) => insight.suggestions || [])
    .filter((suggestion) => suggestion.feedback)
    .slice(-20)
    .map(({ title, feedback }) => ({ title: cleanText(title, 200), feedback }));

  return { mode, date, includeDreams, journalEntries, actions, strategies, feedback };
}

export async function requestKaizenAgent(context, options = {}) {
  const isOnline = options.online ?? (typeof navigator === "undefined" || navigator.onLine);
  if (!isOnline) {
    const error = new Error("Sei offline. Il resto di Kaizen Loop continua a funzionare in locale.");
    error.code = "offline";
    throw error;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 20000);
  const fetcher = options.fetcher || fetch;

  try {
    const response = await fetcher("/api/kaizen-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(context),
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || "L'Agente Kaizen non è disponibile in questo momento.");
    }
    const analysis = normalizeAgentOutput(result.analysis);
    if (!analysis) {
      const error = new Error("La risposta dell'Agente Kaizen non è valida. Nessun dato è stato modificato.");
      error.code = "invalid-output";
      throw error;
    }
    return analysis;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("L'analisi ha impiegato troppo tempo. Puoi riprovare senza perdere il journal.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getWeekStart(dateValue) {
  const date = new Date(`${dateValue}T12:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return date.toISOString().slice(0, 10);
}

export function normalizeWeeklyReview(input, timestamp = new Date().toISOString()) {
  const weekStart = cleanText(input?.weekStart, 20) || getWeekStart(timestamp.slice(0, 10));
  const completedSteps = cleanList(input?.completedSteps, WEEKLY_REVIEW_STEPS.length).filter(
    (value) => /^\d+$/.test(value),
  );
  return {
    id: input?.id || `weekly-review:${weekStart}`,
    weekStart,
    completedSteps,
    currentStep: clampNumber(input?.currentStep, 0, WEEKLY_REVIEW_STEPS.length - 1, 0),
    nextWeekOutcomes: cleanList(input?.nextWeekOutcomes, 3),
    notes: cleanText(input?.notes, 4000),
    status: input?.status === "completed" ? "completed" : "in-progress",
    createdAt: isoOrFallback(input?.createdAt, timestamp),
    updatedAt: timestamp,
  };
}
