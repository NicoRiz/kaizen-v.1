import assert from "node:assert/strict";
import test from "node:test";
import {
  applyChangedRecords,
  dataFromRecords,
  diffCollectionRecords,
  mergeRecords,
  normalizeLegacyData,
  recordsFromData,
} from "../src/lib/syncCore.js";

function action(id, title, updatedAt = "2026-08-15T10:00:00.000Z") {
  return {
    id,
    title,
    completed: false,
    order: 0,
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt,
    completedAt: null,
  };
}

test("Scenario A: PC A B C and empty Supabase keeps A B C", () => {
  const local = recordsFromData({
    nextActions: [action("a", "A"), action("b", "B"), action("c", "C")],
  }).filter((record) => record.collection === "nextActions");

  const result = mergeRecords(local, []);
  const data = dataFromRecords(result.mergedRecords);

  assert.deepEqual(
    data.nextActions.map((item) => item.title).sort(),
    ["A", "B", "C"],
  );
  assert.equal(result.remoteUpserts.length, 3);
});

test("Scenario B: Supabase A B C and phone D E merge to A B C D E", () => {
  const remote = recordsFromData({
    nextActions: [action("a", "A"), action("b", "B"), action("c", "C")],
  }).filter((record) => record.collection === "nextActions");
  const phone = recordsFromData({
    nextActions: [action("d", "D"), action("e", "E")],
  }).filter((record) => record.collection === "nextActions");

  const result = mergeRecords(phone, remote);
  const data = dataFromRecords(result.mergedRecords);

  assert.deepEqual(
    data.nextActions.map((item) => item.title).sort(),
    ["A", "B", "C", "D", "E"],
  );
  assert.deepEqual(
    result.remoteUpserts.map((record) => record.id).sort(),
    ["d", "e"],
  );
});

test("Scenario C: newest updated_at wins when the same record changed twice", () => {
  const local = recordsFromData({
    nextActions: [action("a", "A locale", "2026-08-15T11:00:00.000Z")],
  }).filter((record) => record.collection === "nextActions");
  const remote = recordsFromData({
    nextActions: [action("a", "A remoto", "2026-08-15T10:00:00.000Z")],
  }).filter((record) => record.collection === "nextActions");

  const result = mergeRecords(local, remote);
  const data = dataFromRecords(result.mergedRecords);

  assert.equal(data.nextActions[0].title, "A locale");
  assert.equal(result.conflicts.length, 0);
});

test("Scenario C conservative fallback: same timestamp preserves a conflict copy", () => {
  const local = recordsFromData({
    nextActions: [action("a", "A locale")],
  }).filter((record) => record.collection === "nextActions");
  const remote = recordsFromData({
    nextActions: [action("a", "A remoto")],
  }).filter((record) => record.collection === "nextActions");

  const result = mergeRecords(local, remote, {
    idFactory: () => "copy",
    timestamp: "2026-08-15T12:00:00.000Z",
  });
  const data = dataFromRecords(result.mergedRecords);

  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(
    data.nextActions.map((item) => item.title).sort(),
    ["A locale (conflitto conservato)", "A remoto"],
  );
});

test("Scenario D: offline creation becomes an upsert when the queue flushes", () => {
  const previous = recordsFromData({ nextActions: [action("a", "A")] }).filter(
    (record) => record.collection === "nextActions",
  );
  const next = [action("a", "A"), action("b", "B offline")];
  const changes = diffCollectionRecords(
    previous,
    next,
    "nextActions",
    "2026-08-15T13:00:00.000Z",
  );

  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, "b");
  assert.equal(changes[0].deleted_at, null);
});

test("Scenario E: offline delete writes a tombstone and does not reappear", () => {
  const previous = recordsFromData({
    nextActions: [action("a", "A"), action("b", "B")],
  }).filter((record) => record.collection === "nextActions");
  const changes = diffCollectionRecords(
    previous,
    [action("a", "A")],
    "nextActions",
    "2026-08-15T13:00:00.000Z",
  );
  const merged = applyChangedRecords(previous, changes);
  const data = dataFromRecords(merged);

  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, "b");
  assert.equal(changes[0].deleted_at, "2026-08-15T13:00:00.000Z");
  assert.deepEqual(data.nextActions.map((item) => item.title), ["A"]);
});

test("Legacy records without ids receive stable ids before migration upload", () => {
  const normalized = normalizeLegacyData(
    {
      nextActions: [{ title: "No id", createdAt: "2026-08-15T09:00:00.000Z" }],
    },
    "2026-08-15T10:00:00.000Z",
    () => "generated-id",
  );

  assert.equal(normalized.data.nextActions[0].id, "generated-id");
  assert.equal(
    normalized.data.nextActions[0].updatedAt,
    "2026-08-15T09:00:00.000Z",
  );
});
