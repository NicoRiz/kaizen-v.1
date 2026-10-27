import assert from 'node:assert/strict';
import test from 'node:test';
import { applyNextActionCommand, NEXT_ACTION_COLLECTIONS, nextActionViews, persistNextActionChange, reconcileSomedayReferences, somedayActionViews } from '../src/lib/nextActions.js';
import { createEmptyKaizenData, STORAGE_KEYS } from '../src/lib/kaizenData.js';
import { applyChangedRecords, dataFromRecords, deserializeRecordFromSupabase, diffDataRecords, flushQueuedOperations, mergeQueuedRecords, normalizeLegacyData, recordsFromData, serializeRecordForSupabase } from '../src/lib/syncCore.js';

const timestamp = '2026-10-27T10:00:00.000Z';
function fixture() {
  return normalizeLegacyData({ ...createEmptyKaizenData(),
    projects: [{ id: 'p1', title: 'Uno', currentValue: 4 }, { id: 'p2', title: 'Due', status: 'someday' }],
    nextActions: [{ id: 'n', title: 'Standalone', clarifiedText: 'Dettagli', areaId: 'a', completed: false, sourceInboxItemId: 'inbox' }],
    projectActions: [{ id: 'pa', title: 'Collegata', description: 'Progetto', projectId: 'p1', showInNextActions: true, completed: true, completedAt: '2026-10-26T08:00:00.000Z' }],
  }, '2026-10-26T09:00:00.000Z').data;
}
const command = (data, type, values = {}, collection = 'nextActions', id = 'op') => applyNextActionCommand(data,
  { type, actionId: collection === 'nextActions' ? 'n' : 'pa', sourceCollection: collection, ...values }, { id, timestamp });

test('Focus projects only explicit project references, without copying the original or adding project controls', () => {
  const data = fixture();
  assert.deepEqual(nextActionViews(data).map(a => [a.id, a.sourceCollection]), [['n', 'nextActions'], ['pa', 'projectActions']]);
  data.projectActions.push({ id: 'other', projectId: 'p1', title: 'Not promoted', completed: false });
  assert.equal(nextActionViews(data).length, 2);
  assert.equal(nextActionViews({ ...data, projects: [] }).length, 1);
});

test('calendar moves keep source identity, metadata and project link, hide the row and resist repeated submit', () => {
  for (const collection of ['nextActions', 'projectActions']) {
    const data = fixture(), before = structuredClone(data);
    const result = command(data, 'schedule', { schedule: { date: '2026-10-30', startTime: '10:00', endTime: '11:00' } }, collection);
    const item = result.calendarItems[0];
    assert.equal(item.sourceCollection, collection);
    assert.equal(item.sourceTaskId, data[collection][0].id);
    assert.equal(item.sourceProjectId, collection === 'projectActions' ? 'p1' : null);
    assert.equal(item.startTime, '10:00');
    assert.equal(item.endTime, '11:00');
    assert.equal(result[collection][0].completed, data[collection][0].completed);
    assert.equal(nextActionViews(result).some(a => a.sourceCollection === collection), false);
    assert.equal(command(result, 'schedule', { schedule: { date: '2026-10-30' } }, collection, 'retry'), result);
    assert.deepEqual(data, before);
  }
  assert.equal(command(fixture(), 'schedule', { schedule: { date: '2026-10-30' } }).calendarItems[0].allDay, true);
});

test('any action duplicates into the original or another existing project with independent identity and clean state', () => {
  for (const collection of ['nextActions', 'projectActions']) for (const projectId of ['p1', 'p2']) {
    const data = fixture(), result = command(data, 'duplicate', { projectId }, collection);
    const copy = result.projectActions.at(-1);
    assert.equal(copy.projectId, projectId);
    assert.equal(copy.id, 'op');
    assert.equal(copy.completed, false);
    assert.equal(copy.completedAt, null);
    for (const key of ['showInNextActions', 'sourceTaskId', 'sourceInboxItemId', 'legacyTaskId', 'conflictOf', 'calendarItems']) assert.equal(copy[key], undefined);
    assert.equal(result.nextActions, data.nextActions);
    assert.equal(result.calendarItems, data.calendarItems);
    assert.equal(command(result, 'duplicate', { projectId }, collection), result);
    const completedCopy = { ...result, projectActions: result.projectActions.map(a => a.id === copy.id ? { ...a, completed: true } : a) };
    assert.deepEqual(completedCopy[collection].find(a => a.id === data[collection][0].id), data[collection][0]);
  }
});

test('missing projects, removed sources and invalid input reject without creating anything', () => {
  const data = fixture();
  assert.throws(() => command({ ...data, projects: [] }, 'duplicate', { projectId: 'missing' }), /progetto/);
  assert.throws(() => command(data, 'schedule', { schedule: {} }), /data/);
  assert.throws(() => command(data, 'delete', { actionId: 'missing' }), /disponibile/);
  assert.throws(() => command(data, 'edit', { title: ' ' }), /titolo/);
  assert.equal(data.calendarItems.length, 0);
  assert.equal(data.nextActions.length, 1);
});

test('someday stores one view, preserves the original data and reads subsequent source edits', () => {
  for (const collection of ['nextActions', 'projectActions']) {
    const data = fixture(), result = command(data, 'someday', {}, collection);
    assert.equal(result.somedayMaybe.length, 1);
    assert.equal(result[collection].length, data[collection].length);
    assert.equal(nextActionViews(result).some(a => a.sourceCollection === collection), false);
    assert.equal(command(result, 'someday', {}, collection, 'retry'), result);
    const edited = command(result, 'edit', { title: 'Nuovo', description: 'Testo' }, collection);
    assert.equal(somedayActionViews(edited)[0].title, 'Nuovo');
    assert.equal(somedayActionViews(edited)[0].description, 'Testo');
    assert.equal(edited[collection][0].id, data[collection][0].id);
    assert.equal(edited[collection][0].areaId, data[collection][0].areaId);
  }
});

test('editing preserves unrelated fields and intentional empty descriptions across moves and copies', () => {
  const data = fixture(), result = command(data, 'edit', { title: '  Nuovo  ', description: '', areaId: 'a2' });
  assert.equal(result.nextActions[0].title, 'Nuovo');
  assert.equal(result.nextActions[0].sourceInboxItemId, 'inbox');
  assert.equal(result.nextActions[0].areaId, 'a2');
  assert.equal(somedayActionViews(command(result, 'someday'))[0].description, '');
  assert.equal(command(result, 'duplicate', { projectId: 'p1' }).projectActions.at(-1).description, '');
  const linked = command(data, 'edit', { title: 'Aggiornata', description: 'Note' }, 'projectActions');
  assert.equal(linked.projectActions[0].projectId, 'p1');
  assert.equal(linked.projectActions[0].completedAt, data.projectActions[0].completedAt);
});

test('removal of a project row only hides it, and standalone deletion detaches existing calendar events', () => {
  const data = fixture(), result = command(data, 'delete', {}, 'projectActions');
  assert.equal(result.projectActions.length, 1);
  assert.equal(result.projectActions[0].showInNextActions, false);
  assert.equal(result.projectActions[0].completed, true);
  assert.equal(result.projects, data.projects);
  const scheduled = command(data, 'schedule', { schedule: { date: '2026-10-27' } });
  const deleted = command(scheduled, 'delete');
  assert.equal(deleted.nextActions.length, 0);
  assert.equal(deleted.calendarItems.length, 1);
  assert.equal(deleted.calendarItems[0].sourceTaskId, null);
});

test('project source removal leaves a recoverable standalone note without dangling links', () => {
  const data = command(fixture(), 'someday', {}, 'projectActions');
  const removed = { ...data, projects: data.projects.filter(p => p.id !== 'p1'), projectActions: [] };
  const result = reconcileSomedayReferences(data, removed, timestamp);
  assert.equal(result.somedayMaybe[0].title, 'Collegata');
  assert.equal(result.somedayMaybe[0].sourceTaskId, undefined);
  assert.equal(result.somedayMaybe[0].projectId, null);
  assert.equal(reconcileSomedayReferences(data, data, timestamp), data);
});

test('JSON export/import, Supabase record format, queued retry and restart retain only one copy per operation', async () => {
  const before = fixture();
  let data = command(before, 'duplicate', { projectId: 'p2' });
  data = command(data, 'someday', {}, 'projectActions', 'someday-op');
  data = command(data, 'schedule', { schedule: { date: '2026-10-28' } }, 'nextActions', 'calendar-op');
  const records = recordsFromData(before, '2026-10-26T09:00:00.000Z');
  const changes = diffDataRecords(records, data, NEXT_ACTION_COLLECTIONS, timestamp);
  const cached = applyChangedRecords(records, changes);
  let queue = mergeQueuedRecords([], changes), queueLength = queue.length;
  queue = mergeQueuedRecords(queue, changes);
  assert.equal(queue.length, queueLength);
  const cloud = cached.map(r => serializeRecordForSupabase(r, 'test-user'));
  const restored = dataFromRecords(cloud.map(deserializeRecordFromSupabase));
  assert.deepEqual(restored.nextActions, data.nextActions);
  assert.deepEqual(restored.projectActions.toSorted((a,b) => a.id.localeCompare(b.id)), data.projectActions.toSorted((a,b) => a.id.localeCompare(b.id)));
  assert.deepEqual(restored.somedayMaybe, data.somedayMaybe);
  assert.deepEqual(normalizeLegacyData(JSON.parse(JSON.stringify(restored)), timestamp).data, restored);
  assert.equal(nextActionViews(restored).length, 0);
  const flush = await flushQueuedOperations({ getQueue: () => queue, setQueue: value => { queue = value; }, sendBatch: async () => {} });
  assert.equal(flush.ok, true);
  assert.equal(queue.length, 0);
});

test('menu-specific storage failure rolls back the source, destination, cache and queue', () => {
  const data = fixture(), next = command(data, 'someday');
  const map = new Map([[STORAGE_KEYS.nextActions, JSON.stringify(data.nextActions)], [STORAGE_KEYS.somedayMaybe, '[]']]);
  const before = new Map(map);
  const storage = { getItem: key => map.get(key) ?? null, removeItem: key => map.delete(key), setItem: (key,value) => {
    if (key === STORAGE_KEYS.syncQueue) throw new Error('quota'); map.set(key,value);
  } };
  assert.equal(persistNextActionChange(next, NEXT_ACTION_COLLECTIONS, [], [], storage), false);
  assert.deepEqual(map, before);
  storage.setItem = (key,value) => map.set(key,value);
  assert.equal(persistNextActionChange(next, NEXT_ACTION_COLLECTIONS, [], [], storage), true);
  assert.equal(JSON.parse(map.get(STORAGE_KEYS.somedayMaybe)).length, 1);
});

test('all operations preserve the stable inputs of Progressi, journal, habits and unrelated projects', () => {
  const data = fixture();
  for (const [type, values] of [['schedule', { schedule: { date: '2026-10-28' } }], ['duplicate', { projectId: 'p1' }], ['someday', {}], ['edit', { title: 'Modificata' }], ['delete', {}]]) {
    const result = command(data, type, values);
    for (const key of ['projects', 'habits', 'habitLogs', 'areas', 'notes', 'sectionNotes', 'journalAnalyses', 'streak', 'bestStreak', 'creditedDates']) assert.equal(result[key], data[key]);
  }
});
