import test from 'node:test';
import assert from 'node:assert/strict';
import { appendDay, changeDay, dayHeads, emptyDay, observeDayOutcomes, priorityCompleted, refKey } from '../src/lib/dayPlans.js';
import { calendarInterval, calendarWarnings, instant, manualBlock, parseWindows, planCalendarItems, proposeSchedule, zonedParts } from '../src/lib/timeBlocking.js';
import { createEmptyKaizenData } from '../src/lib/kaizenData.js';
import { analyzeDuplicateRecords, dataFromRecords, diffDataRecords, mergeQueuedRecords, reconcileSyncRecords, recordsFromData } from '../src/lib/syncCore.js';
import { selectAttention } from '../src/lib/attention.js';
import { applySubActionCommand, subActionsFor } from '../src/lib/subActions.js';
import { writeStorageBatch } from '../src/utils/storage.js';

const date = '2026-10-14', zone = 'Europe/Rome', timestamp = '2026-10-14T06:00:00Z';
const now = instant(date, '08:00', zone);
let serial = 0;
const meta = (id = `op-${++serial}`) => ({ id, timestamp });
const ref = (id, collection = 'nextActions') => ({ collection, id });
function fixture() {
  return { ...createEmptyKaizenData(), nextActions: Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, title: `Azione ${i}`, completed: false, createdAt: timestamp })),
    projects: [{ id: 'p', title: 'Progetto', status: 'active' }], projectActions: [{ id: 'pa', projectId: 'p', title: 'Progetto azione', completed: false }],
    habits: [{ id: 'h', name: 'Lettura', type: 'quantitative', frequency: 'daily', target: 10, status: 'active', startDate: '2026-01-01' }] };
}
function add(data, id, collection = 'nextActions') { return changeDay(data, { date, type: 'add', ref: ref(id, collection) }, meta()); }
function planned(count = 2, availability = { windows: parseWindows('09:00-12:00, 14:00-18:00'), breaks: parseWindows('15:00-15:15'), margin: 5, reserve: 20 }) {
  let data = fixture();
  data = appendDay(data, { ...emptyDay(date, zone), availability }, { ...meta(), baseIds: [] });
  for (let i = 0; i < count; i++) data = add(data, `a${i}`);
  return data;
}
function propose(data, options = {}) { return proposeSchedule(data, dayHeads(data.dayPlans, date)[0], { now, ...options }); }
function patch(data, id, patch) { return changeDay(data, { date, type: 'patch', key: refKey(ref(id)), patch }, meta()); }

test('day references preserve originals, refuse duplicates, allow 1–5 and reorder/remove without deleting actions', () => {
  const original = fixture(); let data = add(original, 'a0');
  assert.deepEqual(data.nextActions, original.nextActions);
  assert.equal(add(data, 'a0'), data);
  for (let i = 1; i < 5; i++) data = add(data, `a${i}`);
  assert.throws(() => add(data, 'a5'), /5 priorità/);
  data = changeDay(data, { date, type: 'move', key: refKey(ref('a1')), direction: -1 }, meta());
  assert.equal(dayHeads(data.dayPlans, date)[0].priorities[0].ref.id, 'a1');
  data = changeDay(data, { date, type: 'remove', key: refKey(ref('a1')) }, meta());
  assert.equal(data.nextActions.length, 6);
  assert.equal(dayHeads(data.dayPlans, '2026-10-15').length, 0);
});
test('unchanged saves and replay do not create additional revisions', () => {
  const data = planned(1), plan = dayHeads(data.dayPlans)[0];
  assert.equal(changeDay(data, { type: 'patch', date, key: refKey(ref('a0')), patch: { duration: 30 } }, meta()), data);
  const m = meta(); const after = changeDay(data, { type: 'move', date, key: refKey(ref('a0')), direction: -1 }, m);
  assert.equal(after, data);
  const next = changeDay(data, { type: 'patch', date, patch: { duration: 45 }, key: refKey(ref('a0')) }, m);
  assert.equal(appendDay(next, plan, m), next);
});
test('completion in the original collection records daily outcomes; next-day reopening preserves history', () => {
  const before = add(fixture(), 'pa', 'projectActions');
  const after = { ...before, projectActions: before.projectActions.map(p => ({ ...p, completed: true })) };
  const observed = observeDayOutcomes(before, after, date, meta());
  const p = dayHeads(observed.dayPlans)[0].priorities[0];
  assert.equal(p.outcome, 'completed'); assert.equal(priorityCompleted(observed, p, date), true);
  const reopened = { ...observed, projectActions: before.projectActions };
  assert.equal(observeDayOutcomes(observed, reopened, '2026-10-15', meta()).dayPlans, observed.dayPlans);
});
test('habit priority refers to its dated daily quantity/session, not a duplicate habit', () => {
  const data = add(fixture(), 'h', 'habits'), p = dayHeads(data.dayPlans)[0].priorities[0];
  assert.equal(priorityCompleted(data, p, date), false);
  data.habitLogs.push({ id: 'l', habitId: 'h', date, quantity: 10, completed: true });
  assert.equal(priorityCompleted(data, p, date), true);
  assert.equal(priorityCompleted(data, p, '2026-10-15'), false);
});
test('checklist completion never completes parent or priority and leaves Phase 1 counts intact', () => {
  let data = add(fixture(), 'pa', 'projectActions'); const baseline = selectAttention(data, date);
  data = applySubActionCommand(data, { type: 'create', parentActionId: 'pa', title: 'Passo' }, meta('child'));
  data = applySubActionCommand(data, { type: 'toggle', id: 'child' }, meta('done'));
  assert.equal(subActionsFor(data.subActions, 'pa')[0].completed, true);
  assert.equal(priorityCompleted(data, dayHeads(data.dayPlans)[0].priorities[0], date), false);
  assert.deepEqual(selectAttention(data, date), baseline);
});
test('rest, unplanned and missing sources remain distinguishable without deletion', () => {
  const original = fixture(); assert.equal(dayHeads(original.dayPlans, date).length, 0);
  const rest = changeDay(original, { type: 'mode', date, mode: 'rest' }, meta());
  assert.equal(dayHeads(rest.dayPlans)[0].mode, 'rest');
  assert.throws(() => add(rest, 'a0'), /riposo/);
  const data = add(original, 'a0');
  assert.throws(() => changeDay(data, { type: 'mode', date, mode: 'rest' }, meta()), /Rimuovi/);
  const missing = { ...data, nextActions: [] };
  assert.equal(priorityCompleted(missing, dayHeads(data.dayPlans)[0].priorities[0], date), null);
  assert.equal(missing.dayPlans.length, data.dayPlans.length);
});
test('independent offline branches survive upload races, round trips and explicit resolution', () => {
  const base = planned(1), baseRecords = recordsFromData(base);
  const a = patch(base, 'a0', { duration: 45 }), b = patch(base, 'a0', { duration: 60 });
  const qa = mergeQueuedRecords([], diffDataRecords(baseRecords, a, ['dayPlans']));
  const qb = mergeQueuedRecords([], diffDataRecords(baseRecords, b, ['dayPlans']));
  const server = new Map(baseRecords.map(r => [`${r.collection}:${r.id}`, r]));
  for (const q of [qa, qb]) for (const op of q) server.set(`${op.record.collection}:${op.record.id}`, op.record);
  const reconciled = reconcileSyncRecords({ remoteRecords: [...server.values()], queue: JSON.parse(JSON.stringify(qa)) });
  const data = dataFromRecords(reconciled.records);
  assert.equal(dayHeads(data.dayPlans, date).length, 2);
  assert.throws(() => propose(data), /conflitto/);
  assert.throws(() => patch(data, 'a0', { duration: 90 }), /versioni/);
  const chosen = dayHeads(data.dayPlans, date)[0];
  const resolved = changeDay(data, { type: 'resolve', date, chosenId: chosen.id }, meta());
  assert.equal(dayHeads(resolved.dayPlans, date).length, 1);
  assert.equal(resolved.dayPlans.length, data.dayPlans.length + 1);
  assert.deepEqual(resolved.nextActions, data.nextActions);
  assert.equal(analyzeDuplicateRecords(recordsFromData(resolved)).groups?.some(g => g.collection === 'dayPlans') || false, false);
});
test('a stale saved form becomes a visible branch; versions for different days do not conflict', () => {
  const base = planned(1), baseId = dayHeads(base.dayPlans)[0].id;
  let data = patch(base, 'a0', { duration: 45 });
  data = changeDay(data, { type: 'patch', date, baseId, key: refKey(ref('a0')), patch: { duration: 60 } }, meta());
  assert.equal(dayHeads(data.dayPlans, date).length, 2);
  data = changeDay(data, { type: 'add', date: '2026-10-15', ref: ref('a1') }, meta());
  assert.equal(dayHeads(data.dayPlans, '2026-10-15').length, 1);
});
test('availability is mandatory and input intervals are validated', () => {
  assert.throws(() => propose(add(fixture(), 'a0')), /fasce disponibili/);
  assert.throws(() => parseWindows('17:00-09:00'), /fasce/);
  assert.throws(() => parseWindows('25:00-26:00'), /fasce/);
  assert.deepEqual(parseWindows(''), []);
});
test('automatic plan merges overlapping events, honours breaks and margin, keeps original durations and reserves capacity', () => {
  let data = planned(3);
  data.calendarItems = [
    { id: 'e1', title: 'Uno', date, startTime: '09:00', endTime: '10:00', timeZone: zone },
    { id: 'e2', title: 'Due', date, startTime: '09:30', endTime: '10:30', timeZone: zone },
  ];
  data = patch(data, 'a0', { duration: 60 });
  const result = propose(data);
  assert.equal(zonedParts(result.blocks['nextActions:a0'].startAt, zone).time, '10:35');
  assert.equal((Date.parse(result.blocks['nextActions:a0'].endAt) - Date.parse(result.blocks['nextActions:a0'].startAt)) / 60000, 60);
  assert.equal(zonedParts(result.blocks['nextActions:a1'].startAt, zone).time, '14:00');
  assert.equal(data.nextActions.every(a => !a.completed), true);
});
test('reserve includes margins and a short day does not silently shorten priorities', () => {
  let data = planned(2, { windows: parseWindows('09:00-10:00'), breaks: [], margin: 5, reserve: 20 });
  data = patch(data, 'a0', { duration: 45 });
  const result = propose(data);
  assert.equal(result.blocks['nextActions:a0'], undefined, '45 plus margin exceeds the 48 minute budget');
  assert.equal(result.unplaced[0].duration, 45);
  assert.ok(result.blocks['nextActions:a1']);
});
test('constraints and deadline restrict proposals instead of changing duration', () => {
  let data = planned(2);
  data = patch(data, 'a0', { earliest: '11:00', latest: '11:45' });
  data = patch(data, 'a1', { deadlineDate: '2026-10-13' });
  const result = propose(data);
  assert.equal(zonedParts(result.blocks['nextActions:a0'].startAt, zone).time, '11:00');
  assert.equal(result.blocks['nextActions:a1'], undefined);
});
test('all-day, unknown duration and cross-midnight events protect the occupied day', () => {
  const data = planned(1);
  data.calendarItems = [{ id: 'all', title: 'Tutto', date, allDay: true, timeZone: zone }];
  assert.equal(propose(data).unplaced.length, 1);
  data.calendarItems = [{ id: 'unknown', title: 'Visita', date, startTime: '08:00', timeZone: zone }];
  const result = propose(data); assert.equal(result.unplaced.length, 1); assert.equal(result.warnings.length, 1);
  data.calendarItems = [{ id: 'overnight', title: 'Turno', date: '2026-10-13', startTime: '23:00', endTime: '10:00', timeZone: zone }];
  assert.equal(zonedParts(propose(data).blocks['nextActions:a0'].startAt, zone).time, '10:05');
});
test('DST gaps/ambiguity are rejected, day length and cross-zone projection use real instants', () => {
  assert.throws(() => instant('2026-03-29', '02:30', zone), /ambiguo/);
  assert.throws(() => instant('2026-10-25', '02:30', zone), /ambiguo/);
  assert.equal((instant('2026-03-30', '00:00', zone) - instant('2026-03-29', '00:00', zone)) / 3600000, 23);
  assert.equal((instant('2026-10-26', '00:00', zone) - instant('2026-10-25', '00:00', zone)) / 3600000, 25);
  const data = patch(planned(1), 'a0', { block: manualBlock({ date, timeZone: zone }, '09:00', 30) });
  assert.equal(planCalendarItems(data, 'America/New_York')[0].startTime, '03:00');
  assert.equal(dayHeads(data.dayPlans)[0].date, date);
});
test('manual moves and removing a block preserve identity, source and historical blocks', () => {
  let data = planned(1), originals = structuredClone(data.nextActions);
  data = patch(data, 'a0', { block: manualBlock({ date, timeZone: zone }, '10:00', 30) });
  const old = dayHeads(data.dayPlans)[0].id;
  data = patch(data, 'a0', { duration: 45, block: manualBlock({ date, timeZone: zone }, '14:00', 45) });
  data = patch(data, 'a0', { block: null });
  assert.equal(planCalendarItems(data).length, 0);
  assert.ok(data.dayPlans.find(p => p.id === old).priorities[0].block);
  assert.deepEqual(data.nextActions, originals);
  assert.throws(() => manualBlock({ date, timeZone: zone }, '23:45', 30), /supera/);
});
test('reorganize keeps completed, ongoing and fixed blocks while relocating future and expired incomplete blocks', () => {
  let data = planned(5);
  const plan = dayHeads(data.dayPlans)[0];
  for (let i = 0; i < 5; i++) data = patch(data, `a${i}`, { block: manualBlock(plan, ['09:00', '10:00', '11:00', '14:00', '08:00'][i], 30), fixed: i === 2 });
  data.nextActions[0].completed = true;
  const result = propose(data, { now: instant(date, '10:15', zone), reorganize: true });
  assert.equal(result.blocks['nextActions:a0'], undefined);
  assert.equal(result.blocks['nextActions:a1'], undefined);
  assert.equal(result.blocks['nextActions:a2'], undefined);
  assert.ok(result.blocks['nextActions:a3']); assert.ok(result.blocks['nextActions:a4']);
  assert.ok(Date.parse(result.blocks['nextActions:a3'].startAt) >= instant(date, '10:35', zone));
});
test('unplaced movable blocks are retained and successful proposals cannot overlap them', () => {
  let data = planned(2, { windows: parseWindows('09:00-11:00'), breaks: [], margin: 0, reserve: 0 });
  const plan = dayHeads(data.dayPlans)[0];
  data = patch(data, 'a0', { block: manualBlock(plan, '09:00', 30), latest: '08:00' });
  const result = propose(data, { reorganize: true });
  assert.equal(result.unplaced[0].key, 'nextActions:a0');
  assert.equal(zonedParts(result.blocks['nextActions:a1'].startAt, zone).time, '09:30');
});
test('remote calendar overlaps are reported without deleting any records', () => {
  let data = planned(1);
  data = patch(data, 'a0', { block: manualBlock(dayHeads(data.dayPlans)[0], '10:00', 30) });
  data.calendarItems = [{ id: 'remote', title: 'Nuovo impegno', date, startTime: '10:15', endTime: '11:00', timeZone: zone }];
  const before = JSON.stringify(data); assert.equal(calendarWarnings(data).length, 1); assert.equal(JSON.stringify(data), before);
});
test('proposing or reading historical data never writes revisions; 100 meaningful edits remain bounded', () => {
  let data = planned(5); const before = JSON.stringify(data);
  for (let i = 0; i < 10; i++) propose(data);
  assert.equal(JSON.stringify(data), before);
  for (let i = 0; i < 100; i++) data = patch(data, 'a0', { duration: i % 2 ? 30 : 45 });
  assert.ok(JSON.stringify(data.dayPlans).length < 250000);
  assert.deepEqual(dataFromRecords(recordsFromData(data)).dayPlans, data.dayPlans);
});
test('quota failure rolls back all changed keys and identical saves perform zero writes', () => {
  const map = new Map([['actions', '[1]'], ['plans', '[2]'], ['cache', '[3]']]);
  let writes = 0;
  const storage = { getItem: k => map.get(k) ?? null, removeItem: k => map.delete(k), setItem(k, v) { writes++; if (k === 'cache' && v.length > 4) throw new Error('QuotaExceededError'); map.set(k, v); } };
  assert.equal(writeStorageBatch([['actions', [1]], ['plans', [2]]], storage), true); assert.equal(writes, 0);
  assert.equal(writeStorageBatch([['actions', [1, 2]], ['plans', [2, 3]], ['cache', [3, 4]]], storage), false);
  assert.deepEqual([...map].sort(), [['actions', '[1]'], ['cache', '[3]'], ['plans', '[2]']]);
});

test('saving an unchanged sub-action title does not grow revision history', () => {
  const data = applySubActionCommand(fixture(), { type: 'create', parentActionId: 'pa', title: 'Passo' }, meta('step'));
  assert.equal(applySubActionCommand(data, { type: 'rename', id: 'step', title: ' Passo ' }, meta()), data);
  assert.equal(applySubActionCommand(data, { type: 'attach', id: 'step', parentActionId: 'pa' }, meta()), data);
});

test('a dated project priority counts in Focus once, returning to GTD the next day', () => {
  const data = add(fixture(), 'pa', 'projectActions');
  assert.equal(selectAttention(data, date).projects, 0);
  assert.equal(selectAttention(data, date).next, 7);
  data.projectActions[0].showInNextActions = true;
  assert.equal(selectAttention(data, date).next, 7);
  data.projectActions[0].showInNextActions = false;
  assert.equal(selectAttention(data, '2026-10-15').projects, 1);
  assert.equal(selectAttention(data, '2026-10-15').next, 6);
});

test('legacy floating calendar times use the saved plan zone on another device', () => {
  const priorZone = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const data = planned(1);
    data.calendarItems = [{ id: 'floating', title: 'Impegno storico', date, startTime: '09:00', endTime: '11:00' }];
    assert.equal(zonedParts(propose(data).blocks['nextActions:a0'].startAt, zone).time, '11:05');
  } finally { if (priorZone === undefined) delete process.env.TZ; else process.env.TZ = priorZone; }
});
