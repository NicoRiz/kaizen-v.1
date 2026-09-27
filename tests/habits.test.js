import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateAreaRhythm,
  calculateHabitRhythm,
  calculateRhythmSummary,
  dailyHabitProgress,
  deleteHabitLog,
  habitProgressForDate,
  isHabitDueOnDate,
  projectPercentage,
  reconcileHabitContributions,
  upsertHabitLog,
  weeklyHabitProgress,
} from "../src/lib/habits.js";
import { dateKey } from "../src/utils/date.js";

const NOW = "2026-09-27T10:00:00.000Z";

function habit(overrides = {}) {
  return {
    id: "habit-1",
    name: "Leggere",
    areaId: "area-1",
    projectId: null,
    status: "active",
    type: "quantitative",
    frequency: "daily",
    weekdays: [],
    timesPerWeek: null,
    unit: "pagine",
    minimum: 2,
    target: 10,
    startDate: "2026-09-01",
    pausedRanges: [],
    updateProjectProgress: false,
    ...overrides,
  };
}

function log(date, quantity, overrides = {}) {
  return {
    id: `log-${date}-${quantity}`,
    habitId: "habit-1",
    date,
    quantity,
    completed: quantity > 0,
    projectContribution: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function project(overrides = {}) {
  return {
    id: "project-1",
    title: "Finire il libro",
    progressTracking: "quantitative",
    progressUnit: "pagine",
    currentValue: 126,
    targetValue: 352,
    ...overrides,
  };
}

test("habit scheduling supports daily, weekdays and flexible weekly targets", () => {
  assert.equal(isHabitDueOnDate(habit(), "2026-09-27"), true);
  assert.equal(
    isHabitDueOnDate(habit({ frequency: "weekdays", weekdays: [1, 3, 5] }), "2026-09-28"),
    true,
  );
  assert.equal(
    isHabitDueOnDate(habit({ frequency: "weekdays", weekdays: [1, 3, 5] }), "2026-09-29"),
    false,
  );
  assert.equal(
    isHabitDueOnDate(habit({ frequency: "weekly", timesPerWeek: 3 }), "2026-09-29"),
    true,
  );
});

test("start date and paused intervals remove unscheduled commitments", () => {
  const scheduled = habit({
    startDate: "2026-09-10",
    pausedRanges: [{ startedOn: "2026-09-15", endedOn: "2026-09-18" }],
  });

  assert.equal(isHabitDueOnDate(scheduled, "2026-09-09"), false);
  assert.equal(isHabitDueOnDate(scheduled, "2026-09-14"), true);
  assert.equal(isHabitDueOnDate(scheduled, "2026-09-16"), false);
  assert.equal(isHabitDueOnDate(scheduled, "2026-09-19"), true);
});

test("daily quantitative rhythm records extra but caps the score at 100%", () => {
  const targetHabit = habit();
  const cases = [
    [0, 0],
    [2, 20],
    [7, 70],
    [10, 100],
    [15, 100],
  ];

  for (const [quantity, expected] of cases) {
    const progress = dailyHabitProgress(
      targetHabit,
      quantity ? [log("2026-09-27", quantity)] : [],
      "2026-09-27",
    );
    assert.equal(progress.amount, quantity);
    assert.equal(progress.percentage, expected);
  }
});

test("boolean habits score zero or one hundred", () => {
  const booleanHabit = habit({ type: "boolean", target: 1 });
  assert.equal(habitProgressForDate(booleanHabit, [], "2026-09-27").percentage, 0);
  assert.equal(
    habitProgressForDate(
      booleanHabit,
      [log("2026-09-27", 0, { completed: true, quantity: null })],
      "2026-09-27",
    ).percentage,
    100,
  );
});

test("weekly target calculates 0/3 through >3/3 without losing extra sessions", () => {
  const weekly = habit({ type: "boolean", frequency: "weekly", timesPerWeek: 3 });
  const sessions = ["2026-09-21", "2026-09-23", "2026-09-25", "2026-09-26"].map(
    (date, index) => log(date, 0, { id: `weekly-${index}`, completed: true }),
  );

  assert.equal(weeklyHabitProgress(weekly, [], "2026-09-27").percentage, 0);
  assert.ok(Math.abs(weeklyHabitProgress(weekly, sessions.slice(0, 1), "2026-09-27").percentage - 33.33333333333333) < 0.0001);
  assert.ok(Math.abs(weeklyHabitProgress(weekly, sessions.slice(0, 2), "2026-09-27").percentage - 66.66666666666666) < 0.0001);
  assert.equal(weeklyHabitProgress(weekly, sessions.slice(0, 3), "2026-09-27").percentage, 100);
  const extra = weeklyHabitProgress(weekly, sessions, "2026-09-27");
  assert.equal(extra.amount, 4);
  assert.equal(extra.percentage, 100);
});

test("area rhythm averages scheduled habits and excludes an area without commitments", () => {
  const first = habit({ id: "h-1", areaId: "a-1", target: 10 });
  const second = habit({ id: "h-2", areaId: "a-1", target: 10 });
  const future = habit({ id: "h-3", areaId: "a-2", startDate: "2026-10-01" });
  const logs = [
    log("2026-09-27", 10, { id: "l-1", habitId: "h-1" }),
    log("2026-09-27", 5, { id: "l-2", habitId: "h-2" }),
  ];

  assert.equal(calculateAreaRhythm("a-1", [first, second], logs, "2026-09-27", "2026-09-27"), 75);
  assert.equal(calculateAreaRhythm("a-2", [future], logs, "2026-09-27", "2026-09-27"), null);
});

test("general rhythm is the mean of active area rhythms, not the raw mean of habits", () => {
  const areas = [{ id: "a-1" }, { id: "a-2" }, { id: "a-3" }];
  const habits = [
    habit({ id: "h-1", areaId: "a-1" }),
    habit({ id: "h-2", areaId: "a-1" }),
    habit({ id: "h-3", areaId: "a-2" }),
    habit({ id: "h-4", areaId: "a-3", startDate: "2026-10-01" }),
  ];
  const logs = [
    log("2026-09-27", 10, { id: "l-1", habitId: "h-1" }),
    log("2026-09-27", 0, { id: "l-2", habitId: "h-2" }),
    log("2026-09-27", 10, { id: "l-3", habitId: "h-3" }),
  ];
  const summary = calculateRhythmSummary(areas, habits, logs, "2026-09-27", "2026-09-27");

  assert.equal(summary.areaScores.length, 2);
  assert.equal(summary.areaScores[0].value, 50);
  assert.equal(summary.areaScores[1].value, 100);
  assert.equal(summary.general, 75);
});

test("project percentage derives from current and target and caps display at 100%", () => {
  assert.equal(Math.round(projectPercentage(project())), 36);
  assert.equal(projectPercentage(project({ currentValue: 500, targetValue: 352 })), 100);
  assert.equal(projectPercentage(project({ progressTracking: "none" })), null);
});

test("habit log create, edit and delete keep project progress idempotent", () => {
  const linkedHabit = habit({
    projectId: "project-1",
    updateProjectProgress: true,
  });
  const created = upsertHabitLog({
    habit: linkedHabit,
    habitLogs: [],
    input: { date: "2026-09-27", quantity: 12 },
    projects: [project()],
    id: "log-1",
    timestamp: NOW,
  });
  assert.equal(created.projects[0].currentValue, 138);
  assert.equal(created.log.projectContribution, 12);

  const same = upsertHabitLog({
    habit: linkedHabit,
    habitLogs: created.habitLogs,
    input: { date: "2026-09-27", quantity: 12 },
    projects: created.projects,
    id: "ignored",
    timestamp: NOW,
  });
  assert.equal(same.projects[0].currentValue, 138);
  assert.equal(same.habitLogs.length, 1);

  const edited = upsertHabitLog({
    habit: linkedHabit,
    habitLogs: same.habitLogs,
    input: { date: "2026-09-27", quantity: 8 },
    projects: same.projects,
    id: "ignored",
    timestamp: NOW,
  });
  assert.equal(edited.projects[0].currentValue, 134);

  const removed = deleteHabitLog({
    habitLogs: edited.habitLogs,
    logId: "log-1",
    projects: edited.projects,
    timestamp: NOW,
  });
  assert.equal(removed.projects[0].currentValue, 126);
  assert.equal(removed.habitLogs.length, 0);
});

test("disabling project synchronization reverses prior contributions exactly once", () => {
  const before = habit({ projectId: "project-1", updateProjectProgress: true });
  const after = { ...before, updateProjectProgress: false };
  const logs = [log("2026-09-27", 12, { id: "linked", projectId: "project-1", projectContribution: 12 })];
  const reconciled = reconcileHabitContributions({
    habitBefore: before,
    habitAfter: after,
    habitLogs: logs,
    projects: [project({ currentValue: 138 })],
    timestamp: NOW,
  });

  assert.equal(reconciled.projects[0].currentValue, 126);
  assert.equal(reconciled.habitLogs[0].projectContribution, 0);
  assert.equal(reconciled.habitLogs[0].projectId, null);
});

test("date keys use the local calendar date at timezone boundaries", () => {
  const localDate = new Date(2026, 8, 27, 0, 30, 0);
  assert.equal(dateKey(localDate), "2026-09-27");
});

test("multi-day rhythm respects intermediate values and caps each occurrence", () => {
  const targetHabit = habit();
  const logs = [
    log("2026-09-25", 2),
    log("2026-09-26", 15),
    log("2026-09-27", 7),
  ];
  assert.equal(
    calculateHabitRhythm(targetHabit, logs, "2026-09-25", "2026-09-27"),
    (20 + 100 + 70) / 3,
  );
});
