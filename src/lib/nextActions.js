import { createScheduledCalendarItem } from './calendarScheduling.js';
import { appendDay, dayHeads } from './dayPlans.js';

export const NEXT_ACTION_COLLECTIONS = ['nextActions', 'projectActions', 'calendarItems', 'somedayMaybe', 'dayPlans'];
const isActionCollection = name => ['nextActions', 'projectActions'].includes(name);

// Someday entries point to their source; they are not additional tasks.
export function somedayActionViews(data) {
  return data.somedayMaybe.map(item => {
    const source = isActionCollection(item.sourceCollection)
      ? data[item.sourceCollection].find(action => action.id === item.sourceTaskId) : null;
    return source ? { ...item, title: source.title, description: source.description ?? source.clarifiedText ?? '' } : item;
  });
}

// If a project editor removes a source, keep the deferred note as a standalone
// snapshot rather than leaving a pointer to a task that no longer exists.
export function reconcileSomedayReferences(previous, next, timestamp) {
  let changed = false;
  const somedayMaybe = next.somedayMaybe.map(item => {
    if (!isActionCollection(item.sourceCollection) || !item.sourceTaskId ||
        next[item.sourceCollection].some(action => action.id === item.sourceTaskId)) return item;
    changed = true;
    const source = previous[item.sourceCollection].find(action => action.id === item.sourceTaskId);
    const { sourceCollection, sourceTaskId, ...snapshot } = item;
    return { ...snapshot, updatedAt: timestamp, title: source?.title || item.title,
      description: source?.description ?? source?.clarifiedText ?? item.description ?? '',
      projectId: next.projects.some(project => project.id === snapshot.projectId) ? snapshot.projectId : null };
  });
  return changed ? { ...next, somedayMaybe } : next;
}

export function applyNextActionCommand(data, command, { id, timestamp, today = timestamp.slice(0, 10) }) {
  const { sourceCollection, actionId, type } = command;
  if (!isActionCollection(sourceCollection)) throw new Error('Azione non disponibile.');
  const source = data[sourceCollection].find(action => action.id === actionId);
  if (!source) throw new Error('L’azione non è più disponibile.');
  const patchSource = patch => ({ ...data, [sourceCollection]: data[sourceCollection].map(action =>
    action.id === actionId ? { ...action, ...patch, updatedAt: timestamp } : action) });

  if (type === 'edit') {
    const title = command.title?.trim();
    if (!title) throw new Error('Inserisci un titolo.');
    const patch = { title, description: (command.description || '').trim() };
    if (sourceCollection === 'nextActions') patch.areaId = command.areaId || null;
    return patchSource(patch);
  }
  if (type === 'duplicate') {
    if (data.projectActions.some(action => action.id === id)) return data;
    const project = data.projects.find(item => item.id === command.projectId);
    if (!project) throw new Error('Scegli un progetto disponibile.');
    // Deliberate allowlist: no shared identities, children, completion or scheduling.
    const copy = {
      id, projectId: project.id, title: source.title,
      description: source.description ?? source.clarifiedText ?? '',
      areaId: source.areaId || project.areaId || null,
      order: Math.max(-1, ...data.projectActions.filter(action => action.projectId === project.id).map(action => Number(action.order) || 0)) + 1,
      completed: false, completedAt: null, showInNextActions: false,
      createdAt: timestamp, updatedAt: timestamp,
    };
    return { ...data, projectActions: [...data.projectActions, copy] };
  }
  if (type === 'schedule' || type === 'someday') {
    // A repeated submit cannot move an already moved action a second time.
    if (source.showInNextActions === false) return data;
    const hidden = patchSource({ showInNextActions: false });
    if (type === 'schedule') {
      const item = createScheduledCalendarItem({ id, timestamp, schedule: command.schedule,
        sourceTask: { sourceCollection, sourceTaskId: source.id, sourceProjectId: source.projectId,
          title: source.title, description: source.description ?? source.clarifiedText ?? '' } });
      if (!item) throw new Error('Scegli una data valida.');
      return { ...hidden, calendarItems: [...data.calendarItems, item] };
    }
    if (data.somedayMaybe.some(item => item.sourceCollection === sourceCollection && item.sourceTaskId === actionId)) return hidden;
    return { ...hidden, somedayMaybe: [...data.somedayMaybe, {
      id, title: source.title, description: source.description ?? source.clarifiedText ?? '',
      sourceCollection, sourceTaskId: actionId, projectId: source.projectId || null,
      areaId: source.areaId || null, createdAt: timestamp, updatedAt: timestamp,
    }] };
  }
  if (type === 'delete') {
    // In Focus a project task is only a projection: never delete the original.
    if (sourceCollection === 'projectActions') return patchSource({ showInNextActions: false });
    let result = { ...data,
      nextActions: data.nextActions.filter(action => action.id !== actionId),
      somedayMaybe: data.somedayMaybe.filter(item => !(item.sourceCollection === sourceCollection && item.sourceTaskId === actionId)),
      calendarItems: data.calendarItems.map(item => item.sourceCollection === sourceCollection && item.sourceTaskId === actionId
        ? { ...item, sourceCollection: null, sourceTaskId: null, sourceProjectId: null, updatedAt: timestamp } : item),
    };
    // Keep historical snapshots; remove references from current plan heads.
    for (const plan of dayHeads(data.dayPlans).filter(plan => plan.date >= today)) {
      const priorities = plan.priorities.filter(p => !(p.ref.collection === sourceCollection && p.ref.id === actionId));
      if (priorities.length !== plan.priorities.length) result = appendDay(result, { ...plan, priorities },
        { id: `${id}:${plan.id}`, timestamp, baseIds: [plan.id] });
    }
    return result;
  }
  throw new Error('Operazione non disponibile.');
}
