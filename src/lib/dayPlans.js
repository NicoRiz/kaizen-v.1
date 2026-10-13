import { canonicalHabitLogs, isHabitDueOnDate } from './habits.js';
import { activeProjectActions, subActionHeads } from './subActions.js';

export const refKey = (ref) => `${ref.collection}:${ref.id}`;
export const localZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function dayHeads(revisions = [], date) {
  return subActionHeads(revisions).filter(p => !date || p.date === date).sort((a, b) => a.id.localeCompare(b.id));
}
export function emptyDay(date, timeZone = localZone()) {
  return { date, timeZone, mode: 'planned', priorities: [], availability: null };
}
export function prioritySource(data, priority) {
  return (data[priority.ref.collection] || []).find(item => item.id === priority.ref.id);
}
export function priorityCompleted(data, priority, date) {
  const source = prioritySource(data, priority);
  if (!source) return null;
  if (priority.ref.collection !== 'habits') return Boolean(source.completed);
  const log = canonicalHabitLogs(data.habitLogs || []).find(l => l.habitId === source.id && l.date === date);
  return source.type === 'quantitative' && source.frequency !== 'weekly'
    ? Number(log?.quantity || 0) >= Number(source.target || source.minimum || 1)
    : Boolean(log?.completed);
}
export function priorityCandidates(data, date) {
  return [
    ...(data.nextActions || []).filter(a => !a.completed).map(a => ({ ref: { collection: 'nextActions', id: a.id }, title: a.title, source: a })),
    ...activeProjectActions(data).filter(a => !a.completed).map(a => ({ ref: { collection: 'projectActions', id: a.id }, title: a.title, source: a })),
    ...(data.habits || []).filter(h => isHabitDueOnDate(h, date)).map(h => ({ ref: { collection: 'habits', id: h.id }, title: h.name, source: h })),
  ].filter(item => !item.source.conflictOf);
}
// Small day snapshots (at most five references), immutable IDs, explicit ancestry.
// Concurrent day edits stay separate until the user chooses a version.
export function appendDay(data, next, { id, timestamp, baseIds }) {
  const revisions = data.dayPlans || [];
  if (revisions.some(p => p.id === id)) return data;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next.date) || next.priorities.length > 5 || new Set(next.priorities.map(p => refKey(p.ref))).size !== next.priorities.length) throw new Error('Il piano può contenere fino a 5 priorità diverse.');
  const current = revisions.find(p => p.id === baseIds?.[0]);
  const content = p => JSON.stringify({ date: p.date, timeZone: p.timeZone, mode: p.mode, availability: p.availability, priorities: p.priorities });
  if (baseIds?.length === 1 && current && content(current) === content(next)) return data;
  const revision = { ...next, id, supersedes: baseIds || [], createdAt: timestamp, updatedAt: timestamp };
  return { ...data, dayPlans: [...revisions, revision] };
}
export function changeDay(data, command, meta) {
  const heads = dayHeads(data.dayPlans, command.date);
  if (heads.length > 1 && command.type !== 'resolve') throw new Error('Confronta prima le versioni di questa giornata.');
  const base = command.baseId ? (data.dayPlans || []).find(p => p.id === command.baseId) : heads[0];
  let plan = structuredClone(base || emptyDay(command.date));
  const index = plan.priorities.findIndex(p => refKey(p.ref) === command.key);
  if (command.type === 'resolve') {
    const chosen = heads.find(p => p.id === command.chosenId);
    if (!chosen) return data;
    return appendDay(data, { ...chosen, reason: 'conflict-resolved' }, { ...meta, baseIds: heads.map(p => p.id) });
  }
  if (command.type === 'add') {
    if (plan.priorities.some(p => refKey(p.ref) === refKey(command.ref))) return data;
    const source = prioritySource(data, { ref: command.ref });
    if (!source || !['nextActions', 'projectActions', 'habits'].includes(command.ref.collection)) throw new Error('Attività non più disponibile.');
    if (plan.mode === 'rest') throw new Error('Cambia la giornata da riposo a pianificata prima di aggiungere priorità.');
    plan.priorities.push({ ref: command.ref, title: source.title || source.name, duration: 30, block: null,
      outcome: priorityCompleted(data, { ref: command.ref }, command.date) ? 'completed' : 'incomplete', observedAt: meta.timestamp });
  } else if (command.type === 'remove' && index >= 0) {
    plan.priorities.splice(index, 1);
  } else if (command.type === 'move' && index >= 0) {
    const to = index + command.direction;
    if (to < 0 || to >= plan.priorities.length) return data;
    [plan.priorities[index], plan.priorities[to]] = [plan.priorities[to], plan.priorities[index]];
  } else if (command.type === 'patch' && index >= 0) {
    plan.priorities[index] = { ...plan.priorities[index], ...command.patch, ref: plan.priorities[index].ref };
    if (!Number.isInteger(plan.priorities[index].duration) || plan.priorities[index].duration < 5 || plan.priorities[index].duration > 1440) throw new Error('Scegli una durata da 5 a 1440 minuti.');
  } else if (command.type === 'availability') {
    plan.availability = command.availability;
  } else if (command.type === 'mode') {
    if (command.mode === 'rest' && plan.priorities.length) throw new Error('Rimuovi o riprogramma le priorità prima di segnare una giornata di riposo.');
    plan.mode = command.mode;
  } else if (command.type === 'schedule') {
    plan.priorities = plan.priorities.map(p => Object.hasOwn(command.blocks, refKey(p.ref)) ? { ...p, block: command.blocks[refKey(p.ref)] } : p);
  }
  plan.reason = command.reason || command.type;
  return appendDay(data, plan, { ...meta, baseIds: base ? [base.id] : [] });
}
// Record outcomes only on the date of the action, never rewrite earlier days on
// a later reopening. This adds no writes on render, polling or app startup.
export function observeDayOutcomes(before, after, today, meta) {
  let result = after;
  for (const plan of dayHeads(after.dayPlans, today)) {
    let changed = false;
    const priorities = plan.priorities.map(p => {
      const oldValue = priorityCompleted(before, p, today);
      const newValue = priorityCompleted(after, p, today);
      if (oldValue === newValue) return p;
      changed = true;
      return { ...p, outcome: newValue === null ? 'missing' : newValue ? 'completed' : 'incomplete', observedAt: meta.timestamp };
    });
    if (changed) result = appendDay(result, { ...plan, priorities, reason: 'outcome' }, { ...meta, id: `${meta.id}:${plan.id}`, baseIds: [plan.id] });
  }
  return result;
}
