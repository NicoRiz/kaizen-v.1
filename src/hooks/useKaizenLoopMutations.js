import { useCallback, useMemo } from "react";
import {
  normalizeDailyPlan,
  normalizeExperiment,
  normalizeJournalEntry,
  normalizeWeeklyReview,
  parseActionRef,
} from "../lib/kaizenLoop.js";
import { createId, nowIso } from "../lib/syncCore.js";

export function useKaizenLoopMutations(setData) {
  const updateCollection = useCallback((collection, updater) => {
    setData((current) => ({
      ...current,
      [collection]: typeof updater === "function" ? updater(current[collection] || [], current) : updater,
    }));
  }, [setData]);

  return useMemo(() => {
    function upsert(collection, item) {
      updateCollection(collection, (items) => {
        const exists = items.some((current) => current.id === item.id);
        return exists ? items.map((current) => current.id === item.id ? item : current) : [item, ...items];
      });
    }
    function addInboxItem(value) {
      const text = value?.trim(); if (!text) return;
      const timestamp = nowIso();
      upsert("inboxItems", { id: createId(), originalText: text, clarifiedText: "", status: "open", createdAt: timestamp, updatedAt: timestamp });
    }
    function saveProject(input) {
      const title = input.title?.trim(); if (!title) return null;
      const timestamp = nowIso(); const id = input.id || createId();
      upsert("projects", { ...input, id, title, desiredOutcome: input.desiredOutcome?.trim() || "", status: input.status || "active", dueDate: input.dueDate || "", lastReviewedAt: input.lastReviewedAt || timestamp, createdAt: input.createdAt || timestamp, updatedAt: timestamp });
      if (input.newActionTitle?.trim()) upsert("projectActions", { id: createId(), projectId: id, title: input.newActionTitle.trim(), completed: false, status: "ready", order: 0, createdAt: timestamp, updatedAt: timestamp, completedAt: null });
      return id;
    }
    function clarifyInboxItem(itemId, result) {
      const timestamp = nowIso(); const clarifiedText = result.clarifiedText?.trim() || "";
      if (result.actionable) {
        const title = result.nextActionTitle?.trim(); if (!title) return;
        if (result.destination === "projects") {
          const projectId = result.projectId || saveProject({ title: result.newProjectTitle, desiredOutcome: result.desiredOutcome, status: "active" });
          if (!projectId) return;
          if (result.projectId && result.desiredOutcome?.trim()) updateCollection("projects", (projects) => projects.map((project) => project.id === projectId ? { ...project, desiredOutcome: result.desiredOutcome.trim(), updatedAt: timestamp } : project));
          upsert("projectActions", { id: createId(), projectId, title, completed: false, status: "ready", order: 999, sourceInboxItemId: itemId, createdAt: timestamp, updatedAt: timestamp, completedAt: null });
        } else if (result.destination === "agenda") {
          upsert("calendarItems", { id: createId(), title, description: clarifiedText, date: result.date, type: "event", allDay: !result.startTime, startTime: result.startTime || null, endTime: result.endTime || null, sourceInboxItemId: itemId, createdAt: timestamp, updatedAt: timestamp });
        } else if (result.destination === "waiting-for") {
          upsert("waitingFor", { id: createId(), title, person: result.waitingForPerson?.trim() || "", description: result.description?.trim() || clarifiedText, sourceInboxItemId: itemId, createdAt: timestamp, updatedAt: timestamp });
        } else {
          upsert("nextActions", { id: createId(), title, completed: false, status: "ready", order: 999, sourceInboxItemId: itemId, clarifiedText, createdAt: timestamp, updatedAt: timestamp, completedAt: null });
        }
      } else if (result.nonActionableDestination === "someday") {
        upsert("somedayMaybe", { id: createId(), title: clarifiedText, description: result.description?.trim() || "", sourceInboxItemId: itemId, createdAt: timestamp, updatedAt: timestamp });
      } else if (result.nonActionableDestination === "archive") {
        upsert("archiveItems", { id: result.archiveItemId || createId(), title: clarifiedText, content: result.description?.trim() || clarifiedText, attachments: result.uploadedAttachments || [], sourceInboxItemId: itemId, createdAt: timestamp, updatedAt: timestamp, archivedAt: timestamp });
      }
      updateCollection("inboxItems", (items) => items.filter((item) => item.id !== itemId));
    }
    function replaceFocusRef(previousRef, nextRef = "") {
      updateCollection("dailyPlans", (plans) => plans.map((plan) => ({ ...plan, primaryActionRef: plan.primaryActionRef === previousRef ? nextRef : plan.primaryActionRef, supportActionRefs: (plan.supportActionRefs || []).map((ref) => ref === previousRef ? nextRef : ref).filter(Boolean), updatedAt: nowIso() })));
    }
    function toggleAction(ref) {
      const { source, id } = parseActionRef(ref); const timestamp = nowIso();
      updateCollection(source, (items) => items.map((item) => { if (item.id !== id) return item; const completed = !item.completed; return { ...item, completed, status: completed ? "completed" : "ready", completedAt: completed ? timestamp : null, updatedAt: timestamp }; }));
    }
    function deleteAction(ref) {
      const { source, id } = parseActionRef(ref); updateCollection(source, (items) => items.filter((item) => item.id !== id)); replaceFocusRef(ref);
    }
    function saveAction(input) {
      const timestamp = nowIso(); const originalSource = input.originalSource || input.source; const targetSource = input.projectId ? "projectActions" : "nextActions"; const previousRef = `${originalSource}:${input.id}`; const nextRef = `${targetSource}:${input.id}`;
      const item = { ...input, source: undefined, originalSource: undefined, projectTitle: undefined, ref: undefined, projectId: input.projectId || undefined, title: input.title.trim(), estimatedMinutes: input.estimatedMinutes ? Number(input.estimatedMinutes) : null, completed: input.status === "completed" || Boolean(input.completed), completedAt: input.status === "completed" ? input.completedAt || timestamp : null, createdAt: input.createdAt || timestamp, updatedAt: timestamp };
      if (originalSource !== targetSource) updateCollection(originalSource, (items) => items.filter((current) => current.id !== input.id));
      upsert(targetSource, item);
      if (previousRef !== nextRef) replaceFocusRef(previousRef, nextRef);
    }
    function moveActionOrder(ref, direction) {
      const { source, id } = parseActionRef(ref);
      updateCollection(source, (items) => { const ordered = [...items].sort((a,b) => (Number(a.order)||0)-(Number(b.order)||0)); const index = ordered.findIndex((item) => item.id === id); const nextIndex = index + direction; if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return items; [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]]; const timestamp = nowIso(); return ordered.map((item, order) => ({ ...item, order, updatedAt: item.id === id || item.id === ordered[index]?.id ? timestamp : item.updatedAt })); });
    }
    function saveDailyPlan(input) {
      const plan = normalizeDailyPlan(input); upsert("dailyPlans", plan);
      const selected = new Set([plan.primaryActionRef, ...plan.supportActionRefs]);
      for (const source of ["nextActions", "projectActions"]) updateCollection(source, (items) => items.map((item) => selected.has(`${source}:${item.id}`) ? { ...item, focusDate: plan.date, updatedAt: nowIso() } : item));
    }
    function saveCalendarItem(input) { const timestamp = nowIso(); if (!input.title?.trim() || !input.date) return; upsert("calendarItems", { ...input, id: input.id || createId(), title: input.title.trim(), description: input.description?.trim() || "", type: input.type || "event", allDay: !input.startTime, startTime: input.startTime || null, endTime: input.endTime || null, createdAt: input.createdAt || timestamp, updatedAt: timestamp }); }
    function saveSimple(collection, bodyKey = "description") { return (input) => { const timestamp = nowIso(); if (!input.title?.trim()) return; upsert(collection, { ...input, id: input.id || createId(), title: input.title.trim(), [bodyKey]: input[bodyKey]?.trim() || "", createdAt: input.createdAt || timestamp, updatedAt: timestamp, ...(collection === "archiveItems" ? { archivedAt: input.archivedAt || timestamp } : {}) }); }; }
    function remove(collection) { return (id) => updateCollection(collection, (items) => items.filter((item) => item.id !== id)); }
    function deleteProject(id) { updateCollection("projects", (items) => items.filter((item) => item.id !== id)); updateCollection("projectActions", (items) => items.filter((item) => item.projectId !== id)); }
    function saveJournalEntry(input) { upsert("journalEntries", normalizeJournalEntry(input)); }
    function saveExperiment(input) { const experiment = normalizeExperiment(input); updateCollection("experiments", (items) => { const cleared = experiment.isPrimary ? items.map((item) => item.id === experiment.id ? item : { ...item, isPrimary: false }) : items; const exists = cleared.some((item) => item.id === experiment.id); return exists ? cleared.map((item) => item.id === experiment.id ? experiment : item) : [experiment, ...cleared]; }); }
    function saveAgentInsight(insight) { upsert("agentInsights", insight); }
    function updateAgentFeedback(insightId, suggestionId, feedback) { updateCollection("agentInsights", (items) => items.map((insight) => insight.id === insightId ? { ...insight, suggestions: (insight.suggestions || []).map((suggestion) => suggestion.id === suggestionId ? { ...suggestion, feedback } : suggestion), updatedAt: nowIso() } : insight)); }
    function setPatternStatus(name, status) { updateCollection("agentInsights", (items) => items.map((insight) => ({ ...insight, patterns: (insight.patterns || []).map((pattern) => pattern.name === name ? { ...pattern, status } : pattern), updatedAt: nowIso() }))); }
    function acceptSuggestion(suggestion) { if (suggestion.kind === "action") saveAction({ id: createId(), source: "nextActions", originalSource: "nextActions", title: suggestion.title, clarifiedText: suggestion.description, status: "ready", completed: false, order: 999 }); else if (suggestion.kind === "experiment") saveExperiment({ problem: suggestion.title, hypothesis: suggestion.description, behavior: suggestion.description, startDate: new Date().toISOString().slice(0,10), durationDays: 7, status: "planned" }); }
    return {
      addInboxItem, clarifyInboxItem, deleteAction, deleteArchiveItem: remove("archiveItems"), deleteCalendarItem: remove("calendarItems"), deleteExperiment: remove("experiments"), deleteJournalEntry: remove("journalEntries"), deleteProject, deleteSomedayMaybe: remove("somedayMaybe"), deleteWaitingFor: remove("waitingFor"), moveActionOrder, saveAction, saveArchiveItem: saveSimple("archiveItems", "content"), saveCalendarItem, saveDailyPlan, saveExperiment, saveJournalEntry, saveProject, saveSomedayMaybe: saveSimple("somedayMaybe"), saveWaitingFor: saveSimple("waitingFor"), saveWeeklyReview: (review) => upsert("weeklyReviews", normalizeWeeklyReview(review)), saveAgentInsight, setPatternStatus, toggleAction, updateAgentFeedback, acceptSuggestion,
    };
  }, [updateCollection]);
}
