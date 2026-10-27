import { createScheduledCalendarItem } from './calendarScheduling.js';
import { STORAGE_KEYS } from './kaizenData.js';

export const NEXT_ACTION_COLLECTIONS = ['nextActions', 'projectActions', 'calendarItems', 'somedayMaybe'];
const isSource = name => ['nextActions', 'projectActions'].includes(name);

// Read existing promoted project references without adding project features.
export function nextActionViews(data) {
  const activeProjects = new Set(data.projects.filter(project => !project.status || project.status === 'active').map(project => project.id));
  return [
    ...data.nextActions.filter(action => action.showInNextActions !== false).map(action => ({ ...action, sourceCollection: 'nextActions' })),
    ...data.projectActions.filter(action => action.showInNextActions && activeProjects.has(action.projectId))
      .map(action => ({ ...action, sourceCollection: 'projectActions' })),
  ];
}

export function somedayActionViews(data) {
  return data.somedayMaybe.map(item => {
    const source = isSource(item.sourceCollection) ? data[item.sourceCollection].find(action => action.id === item.sourceTaskId) : null;
    return source ? { ...item, title: source.title, description: source.description ?? source.clarifiedText ?? '' } : item;
  });
}

// An existing project editor may remove a source: preserve its deferred note.
export function reconcileSomedayReferences(previous, next, timestamp) {
  let changed = false;
  const somedayMaybe = next.somedayMaybe.map(item => {
    if (!isSource(item.sourceCollection) || !item.sourceTaskId || next[item.sourceCollection].some(action => action.id === item.sourceTaskId)) return item;
    changed = true;
    const source = previous[item.sourceCollection].find(action => action.id === item.sourceTaskId);
    const { sourceCollection, sourceTaskId, ...snapshot } = item;
    return { ...snapshot, title: source?.title ?? item.title,
      description: source?.description ?? source?.clarifiedText ?? item.description ?? '', updatedAt: timestamp,
      projectId: next.projects.some(project => project.id === item.projectId) ? item.projectId : null };
  });
  return changed ? { ...next, somedayMaybe } : next;
}

export function applyNextActionCommand(data, command, { id, timestamp }) {
  const { sourceCollection, actionId, type } = command;
  if (!isSource(sourceCollection)) throw new Error('Azione non disponibile.');
  const source = data[sourceCollection].find(action => action.id === actionId);
  if (!source) throw new Error('L’azione non è più disponibile.');
  const patch = changes => ({ ...data, [sourceCollection]: data[sourceCollection].map(action => action.id === actionId ? { ...action, ...changes, updatedAt: timestamp } : action) });
  if (type === 'edit') {
    const title = command.title?.trim();
    if (!title) throw new Error('Inserisci un titolo.');
    return patch({ title, description: (command.description || '').trim(), ...(sourceCollection === 'nextActions' ? { areaId: command.areaId ?? source.areaId ?? null } : {}) });
  }
  if (type === 'duplicate') {
    if (data.projectActions.some(action => action.id === id)) return data;
    const project = data.projects.find(project => project.id === command.projectId);
    if (!project) throw new Error('Scegli un progetto disponibile.');
    // Copy content only: no completion, identity, event or source references.
    const copy = { id, projectId: project.id, title: source.title,
      description: source.description ?? source.clarifiedText ?? '', areaId: source.areaId || project.areaId || null,
      completed: false, completedAt: null, createdAt: timestamp, updatedAt: timestamp,
      order: Math.max(-1, ...data.projectActions.filter(action => action.projectId === project.id).map(action => Number(action.order) || 0)) + 1 };
    return { ...data, projectActions: [...data.projectActions, copy] };
  }
  if (type === 'schedule' || type === 'someday') {
    if (source.showInNextActions === false) return data;
    const hidden = patch({ showInNextActions: false });
    if (type === 'schedule') {
      const item = createScheduledCalendarItem({ id, timestamp, schedule: command.schedule,
        sourceTask: { sourceCollection, sourceTaskId: actionId, sourceProjectId: source.projectId,
          title: source.title, description: source.description ?? source.clarifiedText ?? '' } });
      if (!item) throw new Error('Scegli una data valida.');
      return { ...hidden, calendarItems: [...data.calendarItems, item] };
    }
    if (data.somedayMaybe.some(item => item.sourceCollection === sourceCollection && item.sourceTaskId === actionId)) return hidden;
    return { ...hidden, somedayMaybe: [...data.somedayMaybe, { id, title: source.title,
      description: source.description ?? source.clarifiedText ?? '', sourceCollection, sourceTaskId: actionId,
      projectId: source.projectId || null, areaId: source.areaId || null, createdAt: timestamp, updatedAt: timestamp }] };
  }
  if (type === 'delete') {
    if (sourceCollection === 'projectActions') return patch({ showInNextActions: false });
    return { ...data, nextActions: data.nextActions.filter(action => action.id !== actionId),
      somedayMaybe: data.somedayMaybe.filter(item => !(item.sourceCollection === sourceCollection && item.sourceTaskId === actionId)),
      calendarItems: data.calendarItems.map(item => item.sourceCollection === sourceCollection && item.sourceTaskId === actionId
        ? { ...item, sourceCollection: null, sourceTaskId: null, sourceProjectId: null, updatedAt: timestamp } : item) };
  }
  throw new Error('Operazione non disponibile.');
}

// Only the new menu operations opt into this coordinated local save. The
// stable persistence path for all other features remains unchanged.
export function persistNextActionChange(data, names, records, queue, storage = window.localStorage) {
  const entries = [...names.map(name => [STORAGE_KEYS[name], data[name]]),
    [STORAGE_KEYS.syncCache, { savedAt: new Date().toISOString(), records }], [STORAGE_KEYS.syncQueue, queue]];
  const written = [];
  try {
    for (const [key, value] of entries) {
      const serialized = JSON.stringify(value), previous = storage.getItem(key);
      if (previous === serialized) continue;
      storage.setItem(key, serialized);
      written.push([key, previous]);
    }
    return true;
  } catch {
    for (const [key] of written) storage.removeItem(key);
    for (const [key, previous] of written) if (previous !== null) storage.setItem(key, previous);
    return false;
  }
}
