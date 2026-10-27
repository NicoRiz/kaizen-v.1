import assert from 'node:assert/strict';
import test from 'node:test';
import { applyNextActionCommand, NEXT_ACTION_COLLECTIONS, reconcileSomedayReferences, somedayActionViews } from '../src/lib/nextActions.js';
import { createEmptyKaizenData } from '../src/lib/kaizenData.js';
import { nextActionViews, subActionsFor } from '../src/lib/subActions.js';
import { dayHeads } from '../src/lib/dayPlans.js';
import { selectAttention } from '../src/lib/attention.js';
import { calculateRhythmSummary } from '../src/lib/habits.js';
import { applyChangedRecords, dataFromRecords, deserializeRecordFromSupabase, diffDataRecords, flushQueuedOperations, mergeQueuedRecords, normalizeLegacyData, recordsFromData, serializeRecordForSupabase } from '../src/lib/syncCore.js';

const timestamp = '2026-10-27T10:00:00.000Z';
function fixture() {
  return { ...createEmptyKaizenData(),
    projects: [{ id: 'p1', title: 'Uno', currentValue: 4 }, { id: 'p2', title: 'Due' }],
    nextActions: [{ id: 'n', title: 'Standalone', clarifiedText: 'Dettagli', areaId: 'a', completed: false, order: 0, sourceInboxItemId: 'inbox' }],
    projectActions: [{ id: 'pa', title: 'Collegata', description: 'Progetto', projectId: 'p1', showInNextActions: true, completed: true, completedAt: timestamp }],
    subActions: [{ id: 'child', entityId: 'child', parentActionId: 'pa', title: 'Sotto', completed: true, supersedes: [] }],
  };
}
const command = (data, type, values = {}, collection = 'nextActions', id = 'op') => applyNextActionCommand(data,
  { type, actionId: collection === 'nextActions' ? 'n' : 'pa', sourceCollection: collection, ...values }, { id, timestamp });

test('calendar move retains the source identity and details, hides only that row, and is replay-safe', () => {
  for (const collection of ['nextActions', 'projectActions']) {
    const data = fixture();
    const result = command(data, 'schedule', { schedule: { date: '2026-10-30', startTime: '10:00', endTime: '11:00' } }, collection);
    assert.equal(result.calendarItems.length, 1);
    assert.equal(result.calendarItems[0].sourceCollection, collection);
    assert.equal(result.calendarItems[0].sourceTaskId, data[collection][0].id);
    assert.equal(result.calendarItems[0].startTime, '10:00');
    assert.equal(result[collection][0].id, data[collection][0].id);
    assert.equal(result[collection][0].completed, data[collection][0].completed);
    assert.equal(nextActionViews(result).some(a => a.sourceCollection === collection), false);
    assert.equal(command(result, 'schedule', { schedule: { date: '2026-10-30' } }, collection, 'retry'), result);
    assert.deepEqual(result.subActions, data.subActions);
    assert.equal(selectAttention(result, '2026-10-27').next, collection === 'nextActions' ? 0 : 1);
  }
});

test('standalone and linked tasks duplicate independently into any project without copying execution state', () => {
  for (const collection of ['nextActions', 'projectActions']) for (const projectId of ['p1', 'p2']) {
    const data = fixture(), before = structuredClone(data);
    const result = command(data, 'duplicate', { projectId }, collection);
    const copy = result.projectActions.at(-1);
    assert.equal(copy.projectId, projectId);
    assert.equal(copy.id, 'op');
    assert.equal(copy.completed, false);
    assert.equal(copy.completedAt, null);
    assert.equal(copy.showInNextActions, false);
    for (const key of ['sourceTaskId', 'sourceInboxItemId', 'legacyTaskId', 'conflictOf', 'completedDate', 'calendarItems']) assert.equal(copy[key], undefined);
    assert.deepEqual(data, before);
    assert.deepEqual(result.nextActions, data.nextActions);
    assert.deepEqual(result.calendarItems, data.calendarItems);
    assert.equal(subActionsFor(result.subActions, copy.id).length, 0);
    assert.equal(command(result, 'duplicate', { projectId }, collection), result, 'same submission ID is idempotent');
    const completedCopy = { ...result, projectActions: result.projectActions.map(a => a.id === copy.id ? { ...a, completed: true } : a) };
    assert.deepEqual(completedCopy[collection].find(a => a.id === data[collection][0].id), data[collection][0], 'copy completion does not change source');
  }
});

test('no projects, missing sources and invalid schedules fail without mutating anything', () => {
  const data = fixture();
  assert.throws(() => command({ ...data, projects: [] }, 'duplicate', { projectId: 'missing' }), /progetto/);
  assert.throws(() => command(data, 'schedule', { schedule: {} }), /data/);
  assert.throws(() => command(data, 'delete', { actionId: 'missing' }), /disponibile/);
  assert.throws(() => command(data, 'edit', { title: ' ' }), /titolo/);
  assert.equal(data.calendarItems.length, 0);
  assert.equal(data.nextActions.length, 1);
});

test('someday moves one view, preserves metadata and source/checklist, and resolves later edits live', () => {
  for (const collection of ['nextActions', 'projectActions']) {
    const data = fixture();
    const result = command(data, 'someday', {}, collection);
    assert.equal(result.somedayMaybe.length, 1);
    assert.equal(result[collection].length, data[collection].length);
    assert.equal(nextActionViews(result).some(a => a.sourceCollection === collection), false);
    assert.deepEqual(result.subActions, data.subActions);
    assert.equal(command(result, 'someday', {}, collection, 'retry'), result);
    const edited = command(result, 'edit', { title: 'Nuovo', description: 'Testo', areaId: 'a2' }, collection);
    assert.equal(somedayActionViews(edited)[0].title, 'Nuovo');
    assert.equal(somedayActionViews(edited)[0].description, 'Testo');
    assert.equal(edited[collection][0].id, data[collection][0].id);
  }
});

test('editing retains unrelated metadata, project links and completion', () => {
  const data = fixture();
  const result = command(data, 'edit', { title: '  Nuovo  ', description: ' Testo ', areaId: 'a2' });
  assert.equal(result.nextActions[0].title, 'Nuovo');
  assert.equal(result.nextActions[0].description, 'Testo');
  assert.equal(result.nextActions[0].sourceInboxItemId, 'inbox');
  assert.equal(result.nextActions[0].areaId, 'a2');
  const linked = command(data, 'edit', { title: 'Aggiornata', description: 'Note' }, 'projectActions');
  assert.equal(linked.projectActions[0].projectId, 'p1');
  assert.equal(linked.projectActions[0].completedAt, timestamp);
});

test('an explicitly cleared description stays empty in subsequent moves and copies', () => {
  const data = command(fixture(), 'edit', { title: 'Standalone', description: '' });
  const moved = command(data, 'someday');
  assert.equal(somedayActionViews(moved)[0].description, '');
  assert.equal(command(data, 'duplicate', { projectId: 'p1' }).projectActions.at(-1).description, '');
  assert.equal(command(data, 'schedule', { schedule: { date: '2026-10-28' } }).calendarItems[0].description, '');
});

test('removing a project source preserves the deferred note without a dangling reference', () => {
  const data = command(fixture(), 'someday', {}, 'projectActions');
  const removed = { ...data, projects: data.projects.filter(p => p.id !== 'p1'), projectActions: [] };
  const result = reconcileSomedayReferences(data, removed, timestamp);
  assert.equal(result.somedayMaybe[0].title, 'Collegata');
  assert.equal(result.somedayMaybe[0].description, 'Progetto');
  assert.equal(result.somedayMaybe[0].sourceTaskId, undefined);
  assert.equal(result.somedayMaybe[0].sourceCollection, undefined);
  assert.equal(result.somedayMaybe[0].projectId, null);
  assert.equal(result.somedayMaybe[0].updatedAt, timestamp);
  assert.equal(reconcileSomedayReferences(data, data, timestamp), data);
});

test('deleting a linked row only unpromotes the original project task', () => {
  const data = fixture(), result = command(data, 'delete', {}, 'projectActions');
  assert.equal(result.projectActions.length, 1);
  assert.equal(result.projectActions[0].showInNextActions, false);
  assert.deepEqual(result.subActions, data.subActions);
  assert.deepEqual(result.projects, data.projects);
  assert.equal(result.projectActions[0].completed, true);
});

test('standalone deletion detaches calendar references and current day plans, preserving events and history', () => {
  let data = command(fixture(), 'schedule', { schedule: { date: '2026-10-27' } });
  data = { ...data, dayPlans: [{ id: 'day', date: '2026-10-28', priorities: [{ ref: { collection: 'nextActions', id: 'n' }, title: 'Standalone' }], supersedes: [] }] };
  const result = command(data, 'delete');
  assert.equal(result.nextActions.length, 0);
  assert.equal(result.calendarItems.length, 1);
  assert.equal(result.calendarItems[0].sourceTaskId, null);
  assert.equal(dayHeads(result.dayPlans)[0].priorities.length, 0);
  assert.equal(result.dayPlans[0].priorities[0].title, 'Standalone');
  const past = { ...data, dayPlans: data.dayPlans.map(plan => ({ ...plan, date: '2026-10-20' })) };
  assert.equal(command(past, 'delete').dayPlans, past.dayPlans, 'past heads stay historical snapshots');
});

test('new operations survive JSON import/export, Supabase serialization, queue retry and cache reload', async () => {
  const before = normalizeLegacyData(fixture(), '2026-10-26T09:00:00.000Z').data;
  before.projectActions[0].updatedAt = '2026-10-26T09:00:00.000Z';
  let data = command(before, 'duplicate', { projectId: 'p2' });
  data = command(data, 'someday', {}, 'projectActions', 'someday-op');
  data = command(data, 'schedule', { schedule: { date: '2026-10-28' } }, 'nextActions', 'calendar-op');
  const records = recordsFromData(before, '2026-10-26T09:00:00.000Z');
  const diff = diffDataRecords(records, data, NEXT_ACTION_COLLECTIONS, timestamp);
  const cached = applyChangedRecords(records, diff);
  let queue = mergeQueuedRecords([], diff);
  const originalQueueLength = queue.length;
  queue = mergeQueuedRecords(queue, diff);
  assert.equal(queue.length, originalQueueLength);
  const cloudRows = cached.map(r => serializeRecordForSupabase(r, 'test-user'));
  const restored = dataFromRecords(cloudRows.map(deserializeRecordFromSupabase));
  assert.deepEqual(restored.nextActions, data.nextActions);
  assert.deepEqual(restored.projectActions.toSorted((a, b) => a.id.localeCompare(b.id)), data.projectActions.toSorted((a, b) => a.id.localeCompare(b.id)));
  assert.deepEqual(restored.somedayMaybe, data.somedayMaybe);
  assert.equal(nextActionViews(restored).length, 0);
  assert.deepEqual(normalizeLegacyData(JSON.parse(JSON.stringify(restored)), timestamp).data, restored);
  let sends = 0;
  await flushQueuedOperations({ getQueue: () => queue, setQueue: value => { queue = value; }, sendBatch: async () => { sends++; } });
  assert.equal(sends > 0, true);
  assert.equal(queue.length, 0);
});

test('all operations leave Progressi inputs and quantitative values unchanged', () => {
  const data = fixture();
  const score = calculateRhythmSummary(data.areas, data.habits, data.habitLogs, '2026-10-01', '2026-10-27');
  for (const [type, values] of [['schedule', { schedule: { date: '2026-10-28' } }], ['duplicate', { projectId: 'p1' }], ['someday', {}], ['edit', { title: 'Modificata' }], ['delete', {}]]) {
    const result = command(data, type, values);
    assert.equal(result.projects, data.projects);
    assert.equal(result.habits, data.habits);
    assert.equal(result.habitLogs, data.habitLogs);
    assert.deepEqual(calculateRhythmSummary(result.areas, result.habits, result.habitLogs, '2026-10-01', '2026-10-27'), score);
  }
});
