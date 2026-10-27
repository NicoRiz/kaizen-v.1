import { addDays, dateKey, parseDateKey } from "../utils/date.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const HABIT_STATUSES = ["active", "paused", "archived"];
export const HABIT_TYPES = ["boolean", "quantitative"];
export const HABIT_FREQUENCIES = ["daily", "weekdays", "weekly"];

export function numericValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function clampPercentage(value) {
  return Math.max(0, Math.min(100, numericValue(value)));
}

export function formatNumber(value, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits }).format(
    numericValue(value),
  );
}

export function startOfWeek(value) {
  const date = parseDateKey(value);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return dateKey(date);
}

export function endOfWeek(value) {
  return addDays(startOfWeek(value), 6);
}

export function daysBetween(start, end) {
  if (!start || !end || start > end) {
    return [];
  }

  const days = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

function rangeContains(range, value) {
  const start = range?.startedOn || range?.startDate;
  const end = range?.endedOn || range?.endDate;
  return Boolean(start && value >= start && (!end || value <= end));
}

export function isHabitActiveOnDate(habit, value) {
  if (!habit || !value || (habit.startDate && value < habit.startDate)) {
    return false;
  }

  if (habit.archivedAt && value >= dateKey(new Date(habit.archivedAt))) {
    return false;
  }

  return !(habit.pausedRanges || []).some((range) => rangeContains(range, value));
}

export function isHabitDueOnDate(habit, value) {
  if (!isHabitActiveOnDate(habit, value)) {
    return false;
  }

  if (habit.frequency === "weekdays") {
    return (habit.weekdays || []).includes(parseDateKey(value).getDay());
  }

  return habit.frequency === "daily" || habit.frequency === "weekly";
}

export function logsForHabit(logs, habitId, start, end) {
  return logs.filter(
    (log) =>
      log.habitId === habitId &&
      (!start || log.date >= start) &&
      (!end || log.date <= end),
  );
}

export function logAmount(habit, log) {
  if (!log) {
    return 0;
  }

  if (habit.type === "boolean") {
    return log.completed ? 1 : 0;
  }

  return Math.max(0, numericValue(log.quantity));
}

export function targetForHabit(habit) {
  if (habit.type === "boolean") {
    return 1;
  }

  return Math.max(0.000001, numericValue(habit.target, 1));
}

export function dailyHabitProgress(habit, logs, value) {
  const amount = logsForHabit(logs, habit.id, value, value).reduce(
    (sum, log) => sum + logAmount(habit, log),
    0,
  );
  const target = targetForHabit(habit);

  return {
    amount,
    target,
    percentage: clampPercentage((amount / target) * 100),
  };
}

export function weeklyHabitProgress(habit, logs, value) {
  const start = startOfWeek(value);
  const end = endOfWeek(value);
  const amount = logsForHabit(logs, habit.id, start, end).reduce(
    (sum, log) => sum + logAmount(habit, log),
    0,
  );
  const target = Math.max(1, numericValue(habit.timesPerWeek, habit.target || 1));

  return {
    amount,
    end,
    start,
    target,
    percentage: clampPercentage((amount / target) * 100),
  };
}

export function habitProgressForDate(habit, logs, value) {
  return habit.frequency === "weekly"
    ? weeklyHabitProgress(habit, logs, value)
    : dailyHabitProgress(habit, logs, value);
}

function weeklySegments(start, end) {
  const segments = [];
  let cursor = start;

  while (cursor <= end) {
    const weekStart = startOfWeek(cursor);
    const weekEnd = endOfWeek(cursor);
    segments.push({
      start: cursor > weekStart ? cursor : weekStart,
      end: end < weekEnd ? end : weekEnd,
      fullStart: weekStart,
      fullEnd: weekEnd,
    });
    cursor = addDays(weekEnd, 1);
  }

  return segments;
}

function weeklySegmentScore(habit, logs, segment) {
  const fullEligibleDays = daysBetween(segment.fullStart, segment.fullEnd).filter((day) =>
    isHabitActiveOnDate(habit, day),
  );
  const eligibleDays = daysBetween(segment.start, segment.end).filter((day) =>
    isHabitActiveOnDate(habit, day),
  );

  if (eligibleDays.length === 0 || fullEligibleDays.length === 0) {
    return null;
  }

  const fullTarget = Math.max(
    1,
    numericValue(habit.timesPerWeek, habit.target || 1),
  );
  const expected = Math.max(
    1,
    Math.ceil(fullTarget * (eligibleDays.length / fullEligibleDays.length)),
  );
  const amount = logsForHabit(logs, habit.id, segment.start, segment.end).reduce(
    (sum, log) => sum + logAmount(habit, log),
    0,
  );

  return clampPercentage((amount / expected) * 100);
}

export function calculateHabitRhythm(habit, logs, start, end) {
  if (!habit || !start || !end || start > end) {
    return null;
  }

  if (habit.frequency === "weekly") {
    const scores = weeklySegments(start, end)
      .map((segment) => weeklySegmentScore(habit, logs, segment))
      .filter((score) => score !== null);

    if (scores.length === 0) {
      return null;
    }

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }

  const scheduledDays = daysBetween(start, end).filter((day) =>
    isHabitDueOnDate(habit, day),
  );

  if (scheduledDays.length === 0) {
    return null;
  }

  return (
    scheduledDays.reduce(
      (sum, day) => sum + dailyHabitProgress(habit, logs, day).percentage,
      0,
    ) / scheduledDays.length
  );
}

export function calculateAreaRhythm(areaId, habits, logs, start, end) {
  const scores = habits
    .filter((habit) => habit.areaId === areaId)
    .map((habit) => calculateHabitRhythm(habit, logs, start, end))
    .filter((score) => score !== null);

  if (scores.length === 0) {
    return null;
  }

  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}

export function calculateRhythmSummary(areas, habits, logs, start, end) {
  const areaScores = areas
    .map((area) => ({
      area,
      value: calculateAreaRhythm(area.id, habits, logs, start, end),
    }))
    .filter((item) => item.value !== null);
  const general = areaScores.length
    ? areaScores.reduce((sum, item) => sum + item.value, 0) / areaScores.length
    : null;

  return { areaScores, general };
}

export function periodRange(period, end = dateKey()) {
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "3m" ? 90 : 365;
  return { end, start: addDays(end, -(days - 1)), days };
}

export function buildRhythmSeries(areas, habits, logs, period, end = dateKey()) {
  const range = periodRange(period, end);
  const bucketSize = period === "7d" ? 1 : period === "30d" ? 3 : period === "3m" ? 7 : 30;
  const points = [];

  for (let cursor = range.start; cursor <= range.end; cursor = addDays(cursor, bucketSize)) {
    const bucketEnd = addDays(cursor, bucketSize - 1) > range.end
      ? range.end
      : addDays(cursor, bucketSize - 1);
    const summary = calculateRhythmSummary(areas, habits, logs, cursor, bucketEnd);
    points.push({ date: bucketEnd, ...summary });
  }

  return { ...range, points };
}

export function projectPercentage(project) {
  if (project?.progressTracking !== "quantitative") {
    return null;
  }

  const target = numericValue(project.targetValue);
  return target > 0
    ? clampPercentage((numericValue(project.currentValue) / target) * 100)
    : 0;
}

export function contributionForLog(habit, log) {
  if (!habit?.updateProjectProgress || !habit.projectId) {
    return 0;
  }

  return logAmount(habit, log);
}

function adjustProject(projects, projectId, delta, timestamp) {
  if (!projectId || !delta) {
    return projects;
  }

  return projects.map((project) =>
    project.id === projectId && project.progressTracking === "quantitative"
      ? {
          ...project,
          currentValue: Math.max(0, numericValue(project.currentValue) + delta),
          updatedAt: timestamp,
        }
      : project,
  );
}

export function upsertHabitLog({ habit, habitLogs, input, projects, id, timestamp }) {
  const existing = habitLogs.find(
    (log) => log.habitId === habit.id && log.date === input.date,
  );
  const nextLog = {
    ...(existing || {}),
    id: existing?.id || id,
    habitId: habit.id,
    date: input.date,
    quantity:
      habit.type === "quantitative" ? Math.max(0, numericValue(input.quantity)) : null,
    completed:
      habit.type === "boolean" ? Boolean(input.completed) : numericValue(input.quantity) > 0,
    note: (input.note || "").trim(),
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };
  const oldContribution = numericValue(existing?.projectContribution);
  const oldProjectId = existing?.projectId || null;
  const nextContribution = contributionForLog(habit, nextLog);
  nextLog.projectId = nextContribution ? habit.projectId : null;
  nextLog.projectContribution = nextContribution;

  let nextProjects = adjustProject(projects, oldProjectId, -oldContribution, timestamp);
  nextProjects = adjustProject(
    nextProjects,
    nextLog.projectId,
    nextContribution,
    timestamp,
  );

  return {
    habitLogs: existing
      ? habitLogs.map((log) => (log.id === existing.id ? nextLog : log))
      : [nextLog, ...habitLogs],
    projects: nextProjects,
    log: nextLog,
  };
}

export function deleteHabitLog({ habitLogs, logId, projects, timestamp }) {
  const log = habitLogs.find((item) => item.id === logId);
  return {
    habitLogs: habitLogs.filter((item) => item.id !== logId),
    projects: adjustProject(
      projects,
      log?.projectId,
      -numericValue(log?.projectContribution),
      timestamp,
    ),
  };
}

export function reconcileHabitContributions({
  habitBefore,
  habitAfter,
  habitLogs,
  projects,
  timestamp,
}) {
  let nextProjects = projects;
  const nextLogs = habitLogs.map((log) => {
    if (log.habitId !== habitAfter.id) {
      return log;
    }

    const oldContribution = numericValue(log.projectContribution);
    const oldProjectId = log.projectId || habitBefore?.projectId || null;
    const nextContribution = contributionForLog(habitAfter, log);
    const nextProjectId = nextContribution ? habitAfter.projectId : null;

    nextProjects = adjustProject(nextProjects, oldProjectId, -oldContribution, timestamp);
    nextProjects = adjustProject(nextProjects, nextProjectId, nextContribution, timestamp);

    return {
      ...log,
      projectId: nextProjectId,
      projectContribution: nextContribution,
      updatedAt: timestamp,
    };
  });

  return { habitLogs: nextLogs, projects: nextProjects };
}

export function daysAgoLabel(value, today = dateKey()) {
  const delta = Math.round(
    (parseDateKey(today).getTime() - parseDateKey(value).getTime()) / DAY_MS,
  );
  if (delta === 0) return "Oggi";
  if (delta === 1) return "Ieri";
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }).format(
    parseDateKey(value),
  );
}
