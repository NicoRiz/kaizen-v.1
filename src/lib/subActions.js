// Immutable revisions prevent concurrent upserts from overwriting each other.
// supersedes expresses causality; wall-clock order never discards an edit.
export function subActionHeads(revisions = []) {
  const superseded = new Set(revisions.flatMap((item) => item.supersedes || []));
  return revisions.filter((item) => !superseded.has(item.id));
}

export function visibleSubActions(revisions = []) {
  const families = new Map();
  for (const item of subActionHeads(revisions)) {
    const entityId = item.entityId || item.id;
    const family = families.get(entityId) || [];
    family.push(item);
    families.set(entityId, family);
  }
  return [...families.entries()].flatMap(([entityId, family]) => family.filter((item) => !item.deleted).map((item) => ({
    ...item, entityId, conflictOf: family.length > 1 ? entityId : null,
    deletionConflict: family.some((version) => version.deleted),
  })));
}

export function subActionsFor(revisions = [], parentActionId) {
  return visibleSubActions(revisions).filter((item) => item.parentActionId === parentActionId).sort((a, b) =>
    (Number(a.order) || 0) - (Number(b.order) || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function checklistProgress(items) {
  const families = new Map();
  for (const item of items) {
    const key = item.entityId || item.id;
    const family = families.get(key) || [];
    family.push(item);
    families.set(key, family);
  }
  const total = families.size;
  const completed = [...families.values()].filter((family) => family.every((item) => item.completed && !item.deletionConflict)).length;
  const hasConflicts = items.some((item) => item.conflictOf);
  return { total, completed, hasConflicts, percentage: total ? completed / total * 100 : 0,
    ready: total > 0 && completed === total && !hasConflicts };
}

export function activeProjectActions(data) {
  const ids = new Set((data.projects || []).filter((project) => !project.status || project.status === "active").map((project) => project.id));
  return (data.projectActions || []).filter((action) => ids.has(action.projectId));
}

// View projections only: a promoted action stays in projectActions, with its ID.
export function nextActionViews(data) {
  return [
    ...(data.nextActions || []).map((action) => ({ ...action, sourceCollection: "nextActions" })),
    ...activeProjectActions(data).filter((action) => action.showInNextActions)
      .map((action) => ({ ...action, sourceCollection: "projectActions" })),
  ];
}

export function orphanSubActions(data) {
  const projects = new Set((data.projects || []).map((project) => project.id));
  const parents = new Set((data.projectActions || []).filter((action) => projects.has(action.projectId)).map((action) => action.id));
  return visibleSubActions(data.subActions).filter((item) => !parents.has(item.parentActionId));
}

// Commands append revisions only, leave parents untouched and are idempotent
// when retried with the same operation ID. No additional nesting is accepted.
export function applySubActionCommand(data, command, { id, timestamp }) {
  const items = data.subActions || [];
  if (!id || items.some((item) => item.id === id || item.id.startsWith(`${id}:`))) return data;
  const heads = subActionHeads(items);
  // A saved edit from an older UI snapshot becomes a visible branch instead
  // of being silently dropped when another device has already changed it.
  const current = items.find((item) => item.id === command.id && !item.deleted);
  const parentId = command.parentActionId || current?.parentActionId;
  const parent = (data.projectActions || []).find((action) => action.id === parentId);
  const validParent = parent && (data.projects || []).some((project) => project.id === parent.projectId);
  const append = (next) => ({ ...data, subActions: [...items, ...next] });
  const revision = (item, changes, revisionId = id, supersedes = [item.id]) => {
    const { conflictOf, conflictPreservedAt, deletionConflict, ...original } = item;
    return { ...original, ...changes, id: revisionId, entityId: item.entityId || item.id,
      supersedes, updatedAt: timestamp };
  };
  if (command.type === "create") {
    const title = command.title?.trim();
    if (!validParent || !title) return data;
    const siblings = subActionsFor(items, parentId);
    return append([{ id, entityId: id, supersedes: [], parentActionId: parentId, title,
      completed: false, completedAt: null, deleted: false,
      order: siblings.reduce((max, item) => Math.max(max, Number(item.order) || 0), -1) + 1,
      createdAt: timestamp, updatedAt: timestamp }]);
  }
  if (!current) return data;
  if (command.type === "delete") return append([revision(current, { deleted: true })]);
  if (command.type === "attach" && validParent) return current.parentActionId === parentId ? data : append([revision(current, { parentActionId: parentId })]);
  if (command.type === "rename" && command.title?.trim()) return current.title === command.title.trim() ? data : append([revision(current, { title: command.title.trim() })]);
  if (command.type === "toggle") return append([revision(current, { completed: !current.completed, completedAt: current.completed ? null : timestamp })]);
  if (command.type === "move" && [-1, 1].includes(command.direction)) {
    const siblings = subActionsFor(items, current.parentActionId);
    if (siblings.some((item) => item.conflictOf)) return data;
    const from = siblings.findIndex((item) => item.id === current.id);
    if (from < 0) return data;
    const to = from + command.direction;
    if (to < 0 || to >= siblings.length) return data;
    [siblings[from], siblings[to]] = [siblings[to], siblings[from]];
    return append(siblings.flatMap((item, index) => item.order === index ? [] : [revision(item, { order: index }, `${id}:${item.entityId}`)]));
  }
  if (["useConflict", "discardConflict"].includes(command.type)) {
    if (!heads.some((item) => item.id === current.id)) return data;
    const family = heads.filter((item) => (item.entityId || item.id) === (current.entityId || current.id));
    if (family.length < 2) return data;
    const chosen = command.type === "useConflict" ? current : family.filter((item) => item.id !== current.id).sort((a, b) => a.id < b.id ? -1 : 1)[0];
    const supersedes = command.type === "useConflict" ? family.map((item) => item.id) : [current.id, chosen.id];
    return append([revision(chosen, {}, id, supersedes)]);
  }
  return data;
}
