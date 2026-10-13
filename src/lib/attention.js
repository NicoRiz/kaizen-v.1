import { habitProgressForDate, isHabitDueOnDate } from "./habits.js";
import { activeProjectActions } from "./subActions.js";

// Counts are projections, never persisted or queued for sync. Calendar entries
// only schedule their source action, so they do not create another commitment.
export function countPendingActions(actions = []) {
  return new Set(actions.filter((item) => !item.completed)
    .map((item) => item.conflictOf || item.id)).size;
}

export function selectHabitAttention(habits = [], logs = [], today) {
  const due = habits.filter((habit) => habit.status === "active" && isHabitDueOnDate(habit, today));
  // A future log cannot satisfy today's commitment.
  const availableLogs = logs.filter((log) => log.date <= today);
  const pending = due.filter((habit) => habitProgressForDate(habit, availableLogs, today).percentage < 100);
  return {
    daily: due.filter((habit) => habit.frequency !== "weekly"),
    weekly: due.filter((habit) => habit.frequency === "weekly"),
    dailyPending: new Set(pending.filter((habit) => habit.frequency !== "weekly").map((habit) => habit.conflictOf || habit.id)).size,
    weeklyPending: new Set(pending.filter((habit) => habit.frequency === "weekly").map((habit) => habit.conflictOf || habit.id)).size,
    logs: availableLogs,
  };
}

export function selectAttention(data, today) {
  const habits = selectHabitAttention(data.habits, data.habitLogs, today);
  const inbox = new Set((data.inboxItems || []).filter((item) => item.status === "open")
    .map((item) => item.conflictOf || item.id)).size;
  const activeActions = activeProjectActions(data);
  const next = countPendingActions(data.nextActions) + countPendingActions(activeActions.filter((action) => action.showInNextActions));
  // A shared action belongs to the Focus navigation total once promoted.
  // Its project still shows its local progress, without adding another nav item.
  const projects = countPendingActions(activeActions.filter((action) => !action.showInNextActions));
  return { inbox, next, projects, daily: habits.dailyPending, weekly: habits.weeklyPending,
    focus: inbox + next + habits.dailyPending + habits.weeklyPending };
}
