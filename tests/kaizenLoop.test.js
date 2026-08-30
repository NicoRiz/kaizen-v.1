import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentContext,
  getDailyPlan,
  migrateKaizenLoopData,
  normalizeAgentOutput,
  normalizeDailyPlan,
  normalizeExperiment,
  normalizeJournalEntry,
  requestKaizenAgent,
  resolveDailyFocus,
  selectEvidenceBackedPatterns,
  selectUnifiedActions,
} from "../src/lib/kaizenLoop.js";

const timestamp = "2026-08-29T09:00:00.000Z";

test("Kaizen Loop migration is additive and idempotent", () => {
  const legacy = {
    sectionNotes: [
      { id: "dream-1", section: "oneiros", title: "Il ponte", content: "Un ponte rosso", createdAt: timestamp, updatedAt: timestamp },
      { id: "skill-1", section: "skills", title: "Partire piccolo", content: "Due minuti bastano", createdAt: timestamp, updatedAt: timestamp },
      { id: "knowledge-1", section: "knowledge", title: "Riferimento", content: "Testo", createdAt: timestamp, updatedAt: timestamp },
    ],
    notes: { "2026-08-28": "Giornata utile" },
    journalAnalyses: { "2026-08-28": { summary: "Sintesi legacy" } },
    legacyTasks: [{ id: "task-1", title: "Task legacy", createdAt: timestamp }],
  };
  const first = migrateKaizenLoopData(legacy, timestamp);
  const second = migrateKaizenLoopData(first.data, timestamp);

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.equal(first.data.journalEntries.length, 2);
  assert.equal(second.data.journalEntries.length, 2);
  assert.equal(first.data.sectionNotes.length, 3);
  assert.equal(first.data.nextActions[0].title, "Task legacy");
  assert.equal(second.data.nextActions.length, 1);
  assert.equal(first.legacyPreserved, true);
});

test("Oneiros migration preserves original text and metadata", () => {
  const result = migrateKaizenLoopData({
    sectionNotes: [{ id: "dream-2", section: "oneiros", title: "Mare", content: "Acqua molto calma", createdAt: timestamp, updatedAt: timestamp }],
  }, timestamp);
  const dream = result.data.journalEntries[0];

  assert.equal(dream.type, "dream");
  assert.equal(dream.title, "Mare");
  assert.equal(dream.text, "Acqua molto calma");
  assert.equal(dream.recordedAt, timestamp);
  assert.equal(result.data.sectionNotes[0].content, "Acqua molto calma");
});

test("Unified action selector includes independent and project actions once", () => {
  const actions = selectUnifiedActions({
    projects: [{ id: "p1", title: "Casa" }],
    nextActions: [{ id: "a1", title: "Telefonare", completed: false }],
    projectActions: [{ id: "a2", projectId: "p1", title: "Misurare parete", completed: false }],
  });

  assert.deepEqual(actions.map((item) => item.ref).sort(), ["nextActions:a1", "projectActions:a2"]);
  assert.equal(actions.find((item) => item.id === "a2").projectTitle, "Casa");
});

test("Daily Focus stores references without duplicating actions", () => {
  const source = { projects: [], nextActions: [{ id: "a1", title: "A", completed: false }, { id: "a2", title: "B", completed: false }], projectActions: [] };
  const actions = selectUnifiedActions(source);
  const plan = normalizeDailyPlan({ date: "2026-08-29", primaryActionRef: "nextActions:a1", supportActionRefs: ["nextActions:a2", "nextActions:a2"] }, timestamp);
  const focus = resolveDailyFocus(plan, actions);

  assert.equal(source.nextActions.length, 2);
  assert.equal(plan.supportActionRefs.length, 1);
  assert.equal(focus.primary.id, "a1");
  assert.equal(focus.support[0].id, "a2");
  assert.equal(getDailyPlan([plan], "2026-08-29").id, plan.id);
});

test("Journal normalization is bounded and supports no-dream records", () => {
  const dream = normalizeJournalEntry({ type: "dream", date: "2026-08-29", noDreamRemembered: true, vividness: 9, emotions: [" calma ", "calma"] }, timestamp);
  const daily = normalizeJournalEntry({ type: "daily", date: "2026-08-29", text: "Testo", metrics: { energy: 0, focus: 4, satisfaction: 8 } }, timestamp);

  assert.equal(dream.noDreamRemembered, true);
  assert.equal(dream.vividness, 5);
  assert.deepEqual(dream.emotions, ["calma"]);
  assert.equal(daily.freeText, "Testo");
  assert.deepEqual(daily.metrics, { energy: 1, focus: 4, satisfaction: 5 });
});

test("Experiment normalization validates state, duration and decision", () => {
  const experiment = normalizeExperiment({ problem: "Parto tardi", behavior: "Preparare il tavolo", durationDays: 0, status: "unknown", decision: "invented" }, timestamp);
  assert.equal(experiment.durationDays, 1);
  assert.equal(experiment.status, "planned");
  assert.equal(experiment.decision, "");
});

test("Agent output is structured, limited to three suggestions and rejects single-day patterns", () => {
  const output = normalizeAgentOutput({
    summary: "Sintesi",
    statements: [{ type: "fact", text: "Fatto", confidence: "high", evidence: [{ recordId: "j1", date: "2026-08-28" }] }],
    suggestions: [1,2,3,4].map((value) => ({ id: `s${value}`, title: `S${value}`, description: "D", kind: "action" })),
    patterns: [
      { name: "Uno", evidence: [{ recordId: "j1", date: "2026-08-28" }] },
      { name: "Due", evidence: [{ recordId: "j1", date: "2026-08-28" }, { recordId: "j2", date: "2026-08-29" }] },
    ],
  });
  assert.equal(output.suggestions.length, 3);
  assert.deepEqual(output.patterns.map((item) => item.name), ["Due"]);
  assert.equal(output.statements[0].type, "fact");
});

test("Pattern selector requires evidence distributed across different days", () => {
  const patterns = selectEvidenceBackedPatterns([
    { patterns: [{ name: "Energia dopo camminata", description: "Possibile relazione", scope: "energy", confidence: "low", status: "observed", evidence: [{ recordId: "j1", date: "2026-08-27" }] }] },
    { patterns: [{ name: "Energia dopo camminata", description: "Possibile relazione", scope: "energy", confidence: "medium", status: "confirmed", evidence: [{ recordId: "j2", date: "2026-08-29" }] }] },
    { patterns: [{ name: "Solo oggi", evidence: [{ recordId: "j3", date: "2026-08-29" }] }] },
  ]);
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].evidence.length, 2);
  assert.equal(patterns[0].status, "confirmed");
});

test("Agent context excludes Oneiros unless explicitly enabled", () => {
  const data = {
    journalEntries: [
      normalizeJournalEntry({ id: "daily", type: "daily", date: "2026-08-29", freeText: "Giornata" }, timestamp),
      normalizeJournalEntry({ id: "dream", type: "dream", date: "2026-08-29", text: "Sogno" }, timestamp),
    ],
    nextActions: [], projectActions: [], projects: [], personalStrategies: [], agentInsights: [],
  };
  const excluded = buildAgentContext({ data, date: "2026-08-29", includeDreams: false });
  const included = buildAgentContext({ data, date: "2026-08-29", includeDreams: true });
  assert.deepEqual(excluded.journalEntries.map((item) => item.id), ["daily"]);
  assert.deepEqual(included.journalEntries.map((item) => item.id).sort(), ["daily", "dream"]);
});

test("Agent request fails gracefully offline", async () => {
  await assert.rejects(() => requestKaizenAgent({}, { online: false }), /offline/i);
});

test("Agent request rejects invalid structured output without changing data", async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({ analysis: { summary: "" } }) });
  await assert.rejects(() => requestKaizenAgent({}, { fetcher, online: true }), /non è valida/i);
});
