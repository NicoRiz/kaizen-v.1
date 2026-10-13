import assert from "node:assert/strict";
import test from "node:test";
import { selectAttention, selectHabitAttention } from "../src/lib/attention.js";
import { canonicalHabitLogs, upsertHabitLog } from "../src/lib/habits.js";
import { dataFromRecords, recordsFromData, reconcileSyncRecords, mergeQueuedRecords } from "../src/lib/syncCore.js";
import { dateKey, millisecondsUntilTomorrow } from "../src/utils/date.js";

const day = "2026-10-12"; // Monday
const habit = (extra = {}) => ({ id: "h", type: "boolean", frequency: "daily", status: "active", startDate: "2026-01-01", ...extra });
const log = (extra = {}) => ({ id: "l", habitId: "h", date: day, completed: true, updatedAt: "2026-10-12T10:00:00Z", ...extra });

test("attention follows completion, reopening, creation and deletion without mutating data", () => {
  const data = { inboxItems: [{ id: "i", status: "open" }, { id: "old", status: "clarified" }], nextActions: [{ id: "n", completed: false }], habits: [habit()] };
  const before = structuredClone(data);
  assert.equal(selectAttention(data, day).focus, 3);
  assert.deepEqual(data, before);
  assert.equal(selectAttention({ ...data, nextActions: [{ id: "n", completed: true }] }, day).focus, 2);
  assert.equal(selectAttention(data, day).focus, 3);
  assert.equal(selectAttention({ ...data, nextActions: [...data.nextActions, { id: "new" }] }, day).next, 2);
  assert.equal(selectAttention({ ...data, nextActions: [] }, day).next, 0);
  assert.equal(selectAttention({}, day).focus, 0);
});

test("daily quantities require the target, not merely a nonzero log", () => {
  const h = habit({ type: "quantitative", target: 10 });
  for (const [quantity, expected] of [[0, 1], [2, 1], [10, 0], [15, 0]]) {
    assert.equal(selectHabitAttention([h], [log({ quantity })], day).dailyPending, expected);
  }
});

test("daily and weekly attention stay separate and reset on their own boundary", () => {
  const habits = [habit(), habit({ id: "w", frequency: "weekly", timesPerWeek: 2 })];
  const logs = [log({ date: "2026-10-11" }), log({ id: "w1", habitId: "w", date: "2026-10-11" }), log({ id: "w2", habitId: "w" })];
  assert.equal(selectHabitAttention(habits, logs, day).dailyPending, 1);
  assert.equal(selectHabitAttention(habits, logs, day).weeklyPending, 1);
  const completed = [...logs, log({ id: "w3", habitId: "w", date: "2026-10-13" })];
  assert.equal(selectHabitAttention(habits, completed, day).weeklyPending, 1, "future entries excluded");
  assert.equal(selectHabitAttention(habits, completed, "2026-10-13").weeklyPending, 0);
  assert.equal(selectHabitAttention(habits, completed, "2026-10-18").weeklyPending, 0);
  assert.equal(selectHabitAttention(habits, completed, "2026-10-19").weeklyPending, 1);
  assert.equal(selectHabitAttention([habit()], [log()], day).dailyPending, 0);
  assert.equal(selectHabitAttention([habit()], [log()], "2026-10-13").dailyPending, 1);
});

test("weekdays, pause, archive and start date exclude irrelevant habits", () => {
  const habits = [habit({ frequency: "weekdays", weekdays: [2] }), habit({ id: "p", status: "paused" }), habit({ id: "a", status: "archived" }), habit({ id: "f", startDate: "2026-10-13" }), habit({ id: "r", pausedRanges: [{ startedOn: day }] })];
  assert.equal(selectHabitAttention(habits, [], day).dailyPending, 0);
  assert.equal(selectHabitAttention(habits, [], "2026-10-13").dailyPending, 2);
});

test("calendar schedules, deferred projects and conflict copies do not multiply commitments", () => {
  const data = { nextActions: [{ id: "n" }, { id: "n-copy", conflictOf: "n" }], calendarItems: [{ id: "c1", sourceTaskId: "n" }, { id: "c2", sourceTaskId: "n" }], projects: [{ id: "p" }, { id: "s", status: "someday" }, { id: "a", status: "archived" }], projectActions: [{ id: "p1", projectId: "p" }, { id: "p2", projectId: "p", completed: true }, { id: "s1", projectId: "s" }, { id: "a1", projectId: "a" }, { id: "orphan", projectId: "gone" }] };
  assert.equal(selectAttention(data, day).focus, 1);
  assert.equal(selectAttention(data, day).projects, 1);
});

test("same habit/day on two devices has one deterministic value; edits target that value", () => {
  const logs = [log({ id: "a", quantity: 6 }), log({ id: "b", quantity: 5 })];
  const data = { habits: [habit({ type: "quantitative", target: 10 })], habitLogs: logs };
  const before = structuredClone(data);
  assert.equal(selectAttention(data, day).daily, 1, "do not add 6+5");
  assert.deepEqual(selectAttention(data, day), selectAttention({ ...data, habitLogs: [...logs].reverse() }, day));
  assert.equal(canonicalHabitLogs(logs)[0].id, "b");
  const changed = upsertHabitLog({ habit: data.habits[0], habitLogs: logs, input: { date: day, quantity: 10 }, projects: [], id: "unused", timestamp: "2026-10-12T12:00:00Z" });
  assert.equal(changed.log.id, "b");
  assert.equal(changed.habitLogs.length, 2);
  assert.equal(selectAttention({ ...data, habitLogs: changed.habitLogs }, day).daily, 0);
  assert.deepEqual(data, before);
});

test("quick completion and reopening preserve the existing habit note", () => {
  const existing = log({ note: "Keep the context of this session" });
  const result = upsertHabitLog({ habit: habit(), habitLogs: [existing], input: { date: day, completed: false }, projects: [], id: "unused", timestamp: "2026-10-12T12:00:00Z" });
  assert.equal(result.log.note, existing.note);
  assert.equal(result.log.completed, false);
  assert.equal(result.log.createdAt, existing.createdAt || "2026-10-12T12:00:00Z");
});

test("sync round trip preserves records and recalculates equal counts on both devices", () => {
  const data = { nextActions: [{ id: "n", title: "Keep", completed: false }], habits: [habit()], habitLogs: [log()], sectionNotes: [{ id: "note", section: "journal", content: "Preserve this" }] };
  const records = recordsFromData(data, "2026-10-12T10:00:00Z");
  const before = structuredClone(records);
  const hydrated = dataFromRecords(records);
  assert.deepEqual(selectAttention(hydrated, day), selectAttention(data, day));
  assert.deepEqual(records, before);
  const remote = records.find((record) => record.collection === "nextActions");
  const offline = { ...remote, data: { ...remote.data, completed: true }, version: 2 };
  const plan = reconcileSyncRecords({ queue: mergeQueuedRecords([], [offline]), remoteRecords: records });
  const pc = dataFromRecords(plan.records);
  const phone = dataFromRecords([...plan.records].reverse());
  assert.equal(selectAttention(pc, day).next, 0);
  assert.deepEqual(selectAttention(pc, day), selectAttention(phone, day));
  assert.equal(pc.sectionNotes[0].content, "Preserve this");
});

test("concurrent edits preserve conflict records but count the action once", () => {
  const remote = recordsFromData({ nextActions: [{ id: "n", title: "Remote" }] }).find((record) => record.collection === "nextActions");
  const local = { ...remote, data: { ...remote.data, title: "Offline" } };
  const plan = reconcileSyncRecords({ queue: mergeQueuedRecords([], [local]), remoteRecords: [remote] });
  assert.equal(dataFromRecords(plan.records).nextActions.length, 2);
  assert.equal(selectAttention(dataFromRecords(plan.records), day).next, 1);
});

test("next midnight follows the local calendar including DST instead of a fixed 24 hours", () => {
  for (const value of [new Date(2026, 9, 12, 23, 59, 59, 950), new Date(2026, 2, 29), new Date(2026, 9, 25)]) {
    const delay = millisecondsUntilTomorrow(value);
    const next = new Date(value.getTime() + delay);
    assert.ok(delay > 0);
    assert.equal(next.getHours(), 0);
    assert.equal(next.getMinutes(), 0);
    assert.notEqual(dateKey(next), dateKey(value));
  }
});
