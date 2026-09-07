import assert from "node:assert/strict";
import test from "node:test";
import {
  createScheduledCalendarItem,
  createTaskDragPayload,
  parseTaskDragPayload,
  updateCalendarItemInCollection,
} from "../src/lib/calendarScheduling.js";
import { createEmptyKaizenData } from "../src/lib/kaizenData.js";
import {
  dataFromRecords,
  diffCollectionRecords,
  recordsFromData,
} from "../src/lib/syncCore.js";

const CREATED_AT = "2026-09-06T08:00:00.000Z";

function nextAction() {
  return {
    id: "task-next-1",
    title: "Preparare presentazione cliente",
    clarifiedText: "Raccogliere dati e preparare le slide",
    completed: false,
    order: 0,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function projectAction() {
  return {
    id: "task-project-1",
    projectId: "project-1",
    title: "Studiare campagna Meta Ads",
    completed: false,
    order: 0,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  };
}

function schedule(sourceTask, id, date, startTime = "") {
  return createScheduledCalendarItem({
    id,
    sourceTask,
    schedule: { date, startTime, endTime: startTime ? "11:00" : "" },
    timestamp: CREATED_AT,
  });
}

test("a Next Action is cloned and survives the local-first record round trip", () => {
  const original = nextAction();
  const sourceTask = parseTaskDragPayload(
    createTaskDragPayload(original, "nextActions"),
  );
  const calendarItem = schedule(sourceTask, "calendar-1", "2026-09-08", "10:00");
  const data = {
    ...createEmptyKaizenData(),
    nextActions: [original],
    calendarItems: [calendarItem],
  };
  const reloaded = dataFromRecords(recordsFromData(data));

  assert.equal(reloaded.nextActions.length, 1);
  assert.equal(reloaded.nextActions[0].id, original.id);
  assert.equal(reloaded.nextActions[0].completed, false);
  assert.equal(reloaded.calendarItems.length, 1);
  assert.equal(reloaded.calendarItems[0].id, "calendar-1");
  assert.equal(reloaded.calendarItems[0].sourceTaskId, original.id);
  assert.equal(reloaded.calendarItems[0].sourceCollection, "nextActions");
  assert.equal(reloaded.calendarItems[0].startTime, "10:00");
});

test("a project action clone preserves both task and project references", () => {
  const original = projectAction();
  const sourceTask = parseTaskDragPayload(
    createTaskDragPayload(original, "projectActions", original.projectId),
  );
  const calendarItem = schedule(sourceTask, "calendar-project-1", "2026-09-09");

  assert.equal(original.projectId, "project-1");
  assert.equal(calendarItem.sourceTaskId, original.id);
  assert.equal(calendarItem.sourceProjectId, original.projectId);
  assert.equal(calendarItem.sourceCollection, "projectActions");
  assert.equal(calendarItem.allDay, true);
});

test("the same task can produce three independently identified schedules", () => {
  const sourceTask = parseTaskDragPayload(
    createTaskDragPayload(projectAction(), "projectActions", "project-1"),
  );
  const items = [
    schedule(sourceTask, "calendar-mon", "2026-09-07", "10:00"),
    schedule(sourceTask, "calendar-wed", "2026-09-09", "15:00"),
    schedule(sourceTask, "calendar-fri", "2026-09-11", "09:00"),
  ];

  assert.equal(new Set(items.map((item) => item.id)).size, 3);
  assert.deepEqual(
    new Set(items.map((item) => item.sourceTaskId)),
    new Set(["task-project-1"]),
  );
});

test("moving one schedule leaves sibling schedules and the source task unchanged", () => {
  const original = projectAction();
  const sourceTask = parseTaskDragPayload(
    createTaskDragPayload(original, "projectActions", original.projectId),
  );
  const items = [
    schedule(sourceTask, "calendar-mon", "2026-09-07", "10:00"),
    schedule(sourceTask, "calendar-wed", "2026-09-09", "15:00"),
    schedule(sourceTask, "calendar-fri", "2026-09-11", "09:00"),
  ];
  const moved = updateCalendarItemInCollection(
    items,
    { ...items[1], date: "2026-09-10", startTime: "16:00", endTime: "17:00" },
    "2026-09-06T09:00:00.000Z",
  );

  assert.equal(moved[0], items[0]);
  assert.equal(moved[2], items[2]);
  assert.equal(moved[1].date, "2026-09-10");
  assert.equal(moved[1].sourceTaskId, original.id);
  assert.equal(original.updatedAt, CREATED_AT);
  assert.equal(original.completed, false);
});

test("deleting one schedule soft-deletes only its calendar record during sync", () => {
  const original = nextAction();
  const sourceTask = parseTaskDragPayload(
    createTaskDragPayload(original, "nextActions"),
  );
  const items = [
    schedule(sourceTask, "calendar-1", "2026-09-07"),
    schedule(sourceTask, "calendar-2", "2026-09-09"),
    schedule(sourceTask, "calendar-3", "2026-09-11"),
  ];
  const previousRecords = recordsFromData({
    ...createEmptyKaizenData(),
    nextActions: [original],
    calendarItems: items,
  });
  const remainingItems = items.filter((item) => item.id !== "calendar-2");
  const changes = diffCollectionRecords(
    previousRecords,
    remainingItems,
    "calendarItems",
    "2026-09-06T10:00:00.000Z",
  );

  assert.equal(remainingItems.length, 2);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].collection, "calendarItems");
  assert.equal(changes[0].id, "calendar-2");
  assert.equal(changes[0].deleted_at, "2026-09-06T10:00:00.000Z");
  assert.equal(original.id, "task-next-1");
});
