export const TASK_DRAG_TYPE = "application/x-kaizen-task";
export const CALENDAR_ITEM_DRAG_TYPE = "application/x-kaizen-calendar-item";

function cleanOptionalText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function createTaskDragPayload(task, sourceCollection, sourceProjectId = null) {
  return JSON.stringify({
    sourceCollection,
    sourceProjectId: sourceProjectId || task.projectId || null,
    sourceTaskId: task.id,
    title: task.title,
    description: task.description || task.clarifiedText || "",
  });
}

export function parseTaskDragPayload(value) {
  try {
    const payload = JSON.parse(value);

    if (!payload?.sourceTaskId || !payload?.title || !payload?.sourceCollection) {
      return null;
    }

    return {
      sourceCollection: payload.sourceCollection,
      sourceProjectId: cleanOptionalText(payload.sourceProjectId),
      sourceTaskId: payload.sourceTaskId,
      title: payload.title,
      description: payload.description || "",
    };
  } catch {
    return null;
  }
}

export function createScheduledCalendarItem({
  id,
  sourceTask,
  schedule,
  timestamp,
}) {
  const title = sourceTask?.title?.trim();
  const date = schedule?.date;

  if (!id || !title || !date || !sourceTask?.sourceTaskId) {
    return null;
  }

  const startTime = cleanOptionalText(schedule.startTime);
  const endTime = startTime ? cleanOptionalText(schedule.endTime) : null;

  return {
    id,
    title,
    description: (sourceTask.description || "").trim(),
    date,
    allDay: !startTime,
    startTime,
    endTime,
    sourceTaskId: sourceTask.sourceTaskId,
    sourceProjectId: cleanOptionalText(sourceTask.sourceProjectId),
    sourceCollection: sourceTask.sourceCollection,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function updateCalendarItemInCollection(items, itemInput, timestamp) {
  return items.map((item) => {
    if (item.id !== itemInput.id) {
      return item;
    }

    const startTime = cleanOptionalText(itemInput.startTime);

    return {
      ...item,
      title: itemInput.title.trim(),
      description: (itemInput.description || "").trim(),
      date: itemInput.date,
      allDay: !startTime,
      startTime,
      endTime: startTime ? cleanOptionalText(itemInput.endTime) : null,
      updatedAt: timestamp,
    };
  });
}
