import assert from "node:assert/strict";
import test from "node:test";
import { applySubActionCommand, subActionsFor, visibleSubActions, checklistProgress, nextActionViews, orphanSubActions } from "../src/lib/subActions.js";
import { selectAttention } from "../src/lib/attention.js";
import { createEmptyKaizenData } from "../src/lib/kaizenData.js";
import { recordsFromData, dataFromRecords, diffDataRecords, mergeQueuedRecords, reconcileSyncRecords, createDuplicateRemovalPlan, normalizeLegacyData } from "../src/lib/syncCore.js";
import { fetchAllRemoteRecords } from "../src/lib/remoteRecords.js";

const stamp = "2026-10-13T10:00:00.000Z";
const base = () => ({ ...createEmptyKaizenData(), projects: [{ id: "p", title: "Project" }], projectActions: [{ id: "a", projectId: "p", title: "Action", completed: false, description: "Keep", createdAt: stamp, updatedAt: stamp }], nextActions: [{ id: "n", title: "Existing", completed: false }] });
const command = (data, input, id) => applySubActionCommand(data, input, { id, timestamp: stamp });
const add = (data, title, id) => command(data, { type: "create", parentActionId: "a", title }, id);
const children = (data) => subActionsFor(data.subActions, "a");
function merge(a, b) {
  const records = new Map([...recordsFromData(a), ...recordsFromData(b)].map((record) => [`${record.collection}:${record.id}`, record]));
  return dataFromRecords([...records.values()]);
}

test("create, rename and delete keep parent records intact; retries do not duplicate", () => {
  const initial = base();
  const snapshot = structuredClone(initial);
  let data = add(initial, " First ", "one");
  assert.equal(children(data)[0].title, "First");
  assert.equal(add(data, "First", "one"), data);
  data = command(data, { type: "rename", id: "one", title: "Renamed" }, "rename");
  assert.equal(children(data)[0].title, "Renamed");
  assert.equal(children(data)[0].entityId, "one");
  data = command(data, { type: "delete", id: "rename" }, "delete");
  assert.equal(children(data).length, 0);
  assert.equal(data.subActions.length, 3, "history retained");
  assert.deepEqual(data.projectActions, initial.projectActions);
  assert.deepEqual(data.nextActions, initial.nextActions);
  assert.deepEqual(initial, snapshot);
});

test("reorder persists order without changing titles, completion or logical identities", () => {
  let data = add(add(add(base(), "First", "one"), "Second", "two"), "Third", "three");
  data = command(data, { type: "move", id: "three", direction: -1 }, "move");
  assert.deepEqual(children(data).map((item) => item.entityId), ["one", "three", "two"]);
  const restored = dataFromRecords(recordsFromData(data));
  assert.deepEqual(children(restored), children(data));
  assert.equal(command(data, { type: "move", id: "one", direction: -1 }, "outside"), data);
  assert.equal(command(data, { type: "move", id: "three", direction: -1 }, "stale"), data);
});

test("complete all offers completion but never changes the parent or phase-one badges", () => {
  let data = add(add(base(), "First", "one"), "Second", "two");
  const counts = selectAttention(data, "2026-10-13");
  data = command(data, { type: "toggle", id: "one" }, "done1");
  data = command(data, { type: "toggle", id: "two" }, "done2");
  assert.equal(checklistProgress(children(data)).ready, true);
  assert.equal(data.projectActions[0].completed, false);
  assert.deepEqual(selectAttention(data, "2026-10-13"), counts);
  data = command(data, { type: "toggle", id: "done1" }, "reopen");
  assert.equal(checklistProgress(children(data)).ready, false);
  assert.equal(checklistProgress(children(data)).completed, 1);
  assert.equal(children(data)[0].completedAt, null);
  assert.equal(children(data).length, 2);
});

test("blank input, missing parent and nested children are rejected", () => {
  const data = add(base(), "First", "one");
  assert.equal(add(data, "  ", "blank"), data);
  assert.equal(command(data, { type: "create", parentActionId: "one", title: "Nested" }, "bad"), data);
  assert.equal(command(data, { type: "create", parentActionId: "missing", title: "Orphan" }, "bad"), data);
  assert.equal(command(data, { type: "rename", id: "one", title: " " }, "bad"), data);
  assert.equal(checklistProgress([]).ready, false);
});

test("project and Focus refer to the same parent; calendar and children add no attention", () => {
  const data = add(base(), "Child", "one");
  const promoted = { ...data, projectActions: [{ ...data.projectActions[0], showInNextActions: true }] };
  const view = nextActionViews(promoted).find((item) => item.sourceCollection === "projectActions");
  assert.equal(view.id, "a");
  assert.equal(promoted.nextActions.length, 1);
  assert.equal(selectAttention(promoted, "2026-10-13").next, 2);
  assert.equal(selectAttention(promoted, "2026-10-13").projects, 0);
  const closed = { ...promoted, projectActions: [{ ...promoted.projectActions[0], completed: true }] };
  assert.equal(nextActionViews(closed).find((item) => item.id === "a").completed, true);
  assert.equal(selectAttention(closed, "2026-10-13").next, 1);
  assert.equal(children(closed).length, 1);
  assert.equal(nextActionViews({ ...promoted, projects: [{ id: "p", status: "someday" }] }).length, 1);
});

test("legacy actions survive normalization and round-trip with an empty new collection", () => {
  const data = base();
  delete data.subActions;
  const normalized = normalizeLegacyData(data, { timestamp: stamp }).data;
  assert.deepEqual(normalized.projectActions, data.projectActions);
  assert.deepEqual(normalized.subActions, []);
  const restored = dataFromRecords(recordsFromData(normalized));
  assert.deepEqual(restored.projectActions, data.projectActions);
});

test("offline queue/reload/reconnect persist revisions without tombstoning their history", () => {
  const initial = base();
  let data = add(initial, "Offline child", "one");
  data = command(data, { type: "toggle", id: "one" }, "done");
  const changes = diffDataRecords(recordsFromData(initial), data, ["subActions"], stamp);
  assert.equal(changes.length, 2);
  assert.ok(changes.every((item) => !item.deleted_at));
  const queue = JSON.parse(JSON.stringify(mergeQueuedRecords([], changes)));
  const first = reconcileSyncRecords({ remoteRecords: recordsFromData(initial), queue });
  const second = reconcileSyncRecords({ remoteRecords: first.records, queue });
  assert.equal(children(dataFromRecords(second.records)).length, 1);
  assert.equal(children(dataFromRecords(second.records))[0].completed, true);
  assert.equal(second.queue.length, 0);
});

test("simultaneous edits to different children converge without conflict", () => {
  const initial = add(add(base(), "First", "one"), "Second", "two");
  const a = command(initial, { type: "toggle", id: "one" }, "a-edit");
  const b = command(initial, { type: "rename", id: "two", title: "Other edit" }, "b-edit");
  const pc = merge(a, b);
  const phone = merge(b, a);
  assert.deepEqual(children(pc), children(phone));
  assert.equal(children(pc)[0].completed, true);
  assert.equal(children(pc)[1].title, "Other edit");
  assert.equal(checklistProgress(children(pc)).hasConflicts, false);
});

test("simultaneous same-child edits survive even when both writes follow the same remote fetch", () => {
  const initial = add(base(), "First", "one");
  const a = command(initial, { type: "toggle", id: "one" }, "a-edit");
  const b = command(initial, { type: "rename", id: "one", title: "Phone edit" }, "b-edit");
  const merged = merge(a, b);
  assert.equal(children(merged).length, 2);
  assert.equal(checklistProgress(children(merged)).total, 1);
  assert.equal(checklistProgress(children(merged)).hasConflicts, true);
  assert.equal(checklistProgress(children(merged)).ready, false);
  const chosen = command(merged, { type: "useConflict", id: "b-edit" }, "resolved");
  assert.equal(children(chosen).length, 1);
  assert.equal(children(chosen)[0].title, "Phone edit");
  assert.equal(chosen.subActions.length, 4);
  assert.equal(createDuplicateRemovalPlan(recordsFromData(chosen)).removeCandidates.filter((item) => item.collection === "subActions").length, 0);
});

test("a stale saved draft becomes a conflict instead of being ignored", () => {
  const initial = add(base(), "First", "one");
  const remote = command(initial, { type: "toggle", id: "one" }, "remote");
  const saved = command(remote, { type: "rename", id: "one", title: "Draft" }, "saved");
  assert.equal(children(saved).length, 2);
  assert.ok(children(saved).some((item) => item.title === "Draft"));
});

test("delete versus edit retains edited content until explicit conflict resolution", () => {
  const initial = add(base(), "First", "one");
  const a = command(initial, { type: "delete", id: "one" }, "a-delete");
  const b = command(initial, { type: "rename", id: "one", title: "Keep me" }, "b-edit");
  const merged = merge(a, b);
  assert.equal(children(merged)[0].deletionConflict, true);
  const keep = command(merged, { type: "useConflict", id: "b-edit" }, "keep");
  assert.equal(children(keep).length, 1);
  assert.equal(children(keep)[0].conflictOf, null);
  const discard = command(merged, { type: "discardConflict", id: "b-edit" }, "discard");
  assert.equal(visibleSubActions(discard.subActions).length, 0);
});

test("concurrent reorder and edit stay visible and block another reorder until resolved", () => {
  const initial = add(add(base(), "First", "one"), "Second", "two");
  const a = command(initial, { type: "move", id: "two", direction: -1 }, "a-move");
  const b = command(initial, { type: "rename", id: "one", title: "Revised" }, "b-edit");
  const merged = merge(a, b);
  assert.ok(children(merged).some((item) => item.title === "Revised"));
  assert.equal(checklistProgress(children(merged)).hasConflicts, true);
  assert.equal(command(merged, { type: "move", id: children(merged)[0].id, direction: 1 }, "blocked"), merged);
});

test("deleting parents retains recoverable orphans that can be reattached", () => {
  const initial = add(base(), "Keep child", "one");
  const removed = { ...initial, projectActions: [{ id: "other", projectId: "p", title: "Other" }] };
  assert.equal(orphanSubActions(removed).length, 1);
  const restored = command(removed, { type: "attach", id: "one", parentActionId: "other" }, "attach");
  assert.equal(orphanSubActions(restored).length, 0);
  assert.equal(subActionsFor(restored.subActions, "other")[0].title, "Keep child");
});

test("remote pagination handles >1000 rows, smaller server caps and failed pages", async () => {
  const rows = Array.from({ length: 1203 }, (_, id) => ({ collection: "subActions", id: String(id) }));
  let fail = false;
  const client = { from(table) {
    assert.equal(table, "kaizen_records");
    const query = { select(_columns, options) { assert.equal(options.count, "exact"); return this; }, eq(key, value) { assert.equal(key, "user_id"); assert.equal(value, "user"); return this; }, order() { return this; }, async range(start) { if (fail && start) return { error: new Error("network") }; if (start >= rows.length) return { error: new Error("416 range outside total") }; return { data: rows.slice(start, start + 100), count: rows.length, error: null }; } };
    return query;
  } };
  assert.equal((await fetchAllRemoteRecords(client, "user")).length, 1203);
  fail = true;
  await assert.rejects(() => fetchAllRemoteRecords(client, "user"), /network/);
});
