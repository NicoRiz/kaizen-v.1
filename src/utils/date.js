export const WEEK_DAYS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Gio" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Dom" },
];

export function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function parseDateKey(value) {
  return new Date(`${value}T00:00:00`);
}

export function addDays(value, days) {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + days);

  return dateKey(date);
}

export function isBeforeDate(left, right) {
  return parseDateKey(left).getTime() < parseDateKey(right).getTime();
}

export function completionKey(date, taskId) {
  return `${date}:${taskId}`;
}

export function formatDisplayDate(value) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(parseDateKey(value));
}

export function getTasksForDate(tasks, value) {
  const targetDate = parseDateKey(value);
  const targetDay = targetDate.getDay();

  return tasks.filter((task) => {
    const repeatDays = task.repeatDays || [];
    const postponedDates = task.postponedDates || {};
    const carryoverDates = Array.isArray(task.carryoverDates)
      ? task.carryoverDates
      : [];

    if (repeatDays.length > 0) {
      if (postponedDates[value]) {
        return false;
      }

      const isScheduled =
        !isBeforeDate(value, task.date) && repeatDays.includes(targetDay);
      const isCarryover = carryoverDates.includes(value);

      return isScheduled || isCarryover;
    }

    return task.date === value;
  });
}
