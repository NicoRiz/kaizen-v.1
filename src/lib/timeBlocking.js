import { dayHeads, localZone, priorityCompleted, prioritySource, refKey } from './dayPlans.js';

const MINUTE = 60000;
export function zonedParts(value, timeZone = localZone()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function nextDate(date) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10);
}
export function minutes(time) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
}
// Resolve wall time in the plan's IANA zone. Reject DST gaps and ambiguous
// clocks, rather than silently move a user-selected time by an hour.
export function instant(date, time, zone = localZone()) {
  if (time === '24:00') return instant(nextDate(date), '00:00', zone);
  if (minutes(time) === null) throw new Error('Orario non valido.');
  const target = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set();
  for (const delta of [-36, 0, 36]) {
    const sample = target + delta * 3600000;
    const p = zonedParts(sample, zone);
    offsets.add(Date.parse(`${p.date}T${p.time}:00Z`) - sample);
  }
  const matches = [...offsets].map(offset => target - offset).filter(value => {
    const p = zonedParts(value, zone); return p.date === date && p.time === time;
  });
  if (matches.length !== 1) throw new Error('Orario inesistente o ambiguo per il cambio dell’ora: scegli un altro orario.');
  return matches[0];
}
export function parseWindows(value) {
  if (!value.trim()) return [];
  const windows = value.split(',').map(part => {
    const [start, end, extra] = part.trim().split('-').map(s => s.trim());
    const a = minutes(start), b = end === '24:00' ? 1440 : minutes(end);
    if (extra || a === null || b === null || b <= a) throw new Error('Usa fasce come 09:00-12:30, 14:00-18:00.');
    return { start, end };
  });
  return windows;
}
export function mergeIntervals(intervals) {
  const result = [];
  for (const interval of intervals.filter(i => i.end > i.start).sort((a, b) => a.start - b.start)) {
    const last = result.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else result.push({ start: interval.start, end: interval.end });
  }
  return result;
}
export function subtractIntervals(windows, occupied) {
  let result = mergeIntervals(windows);
  for (const busy of mergeIntervals(occupied)) result = result.flatMap(w => busy.end <= w.start || busy.start >= w.end ? [w] : [
    { start: w.start, end: Math.min(w.end, busy.start) }, { start: Math.max(w.start, busy.end), end: w.end },
  ].filter(i => i.end > i.start));
  return result;
}
export function calendarInterval(item, zone = localZone()) {
  if (item.startAt && item.endAt) {
    const start = Date.parse(item.startAt), end = Date.parse(item.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Intervallo da verificare.');
    return { start, end, uncertain: false };
  }
  if (!item.date) return null;
  const eventZone = item.timeZone || zone;
  const start = instant(item.date, item.allDay || !item.startTime ? '00:00' : item.startTime, eventZone);
  if (item.allDay || !item.startTime) return { start, end: instant(item.endDate ? nextDate(item.endDate) : nextDate(item.date), '00:00', eventZone), uncertain: false };
  if (!item.endTime || item.endTime === item.startTime) return { start, end: instant(nextDate(item.date), '00:00', eventZone), uncertain: true };
  const endDate = item.endDate || (item.endTime < item.startTime ? nextDate(item.date) : item.date);
  return { start, end: instant(endDate, item.endTime, eventZone), uncertain: false };
}
export function planCalendarItems(data, zone = localZone()) {
  const plans = dayHeads(data.dayPlans);
  return plans.flatMap(plan => plan.priorities.filter(p => p.block).map(p => {
    const conflict = plans.filter(other => other.date === plan.date).length > 1;
    const start = zonedParts(p.block.startAt, zone), end = zonedParts(p.block.endAt, zone);
    const source = prioritySource(data, p);
    return { id: `priority:${plan.id}:${refKey(p.ref)}`, title: `${conflict ? 'Da rivedere · ' : 'Priorità · '}${source?.title || source?.name || p.title}`,
      date: start.date, startTime: start.time, endTime: end.time, endDate: end.date, startAt: p.block.startAt, endAt: p.block.endAt,
      allDay: false, priorityDate: plan.date, priorityKey: refKey(p.ref), priorityRevision: plan.id,
      description: `Piano del ${plan.date} · ${plan.timeZone}. Modifica orario e durata da Oggi.`, sourceCollection: p.ref.collection, sourceTaskId: p.ref.id };
  }));
}
export function validateAvailability(a) {
  if (!a || !Array.isArray(a.windows) || !a.windows.length) throw new Error('Indica prima le tue fasce disponibili.');
  if (!Number.isFinite(a.margin) || a.margin < 0 || a.margin > 120 || !Number.isFinite(a.reserve) || a.reserve < 0 || a.reserve > 90) throw new Error('Margine: 0–120 minuti. Tempo libero: 0–90%.');
  return a;
}
export function planningContext(data, plan, { now = Date.now(), reorganize = false, protectedKeys = [] } = {}) {
  const a = validateAvailability(plan.availability);
  const warnings = [];
  const dayStart = instant(plan.date, '00:00', plan.timeZone), dayEnd = instant(nextDate(plan.date), '00:00', plan.timeZone);
  const convert = w => ({ start: instant(plan.date, w.start, plan.timeZone), end: instant(plan.date, w.end, plan.timeZone) });
  const earliestStart = Number.isFinite(now) ? Math.ceil((now + MINUTE) / MINUTE) * MINUTE : now;
  const windows = mergeIntervals(a.windows.map(convert).map(w => ({ start: Math.max(w.start, earliestStart), end: w.end })));
  const breaks = (a.breaks || []).map(convert);
  const frozen = p => priorityCompleted(data, p, plan.date) || p.fixed || protectedKeys.includes(refKey(p.ref)) || (p.block && Date.parse(p.block.startAt) <= now && Date.parse(p.block.endAt) > now);
  const candidates = plan.priorities.filter(p => !priorityCompleted(data, p, plan.date) && prioritySource(data, p) && (!p.block || reorganize && !frozen(p)));
  const ignore = new Set(candidates.filter(p => p.block).map(p => refKey(p.ref)));
  const events = [...(data.calendarItems || []), ...planCalendarItems(data).filter(item => !(item.priorityRevision === plan.id && ignore.has(item.priorityKey)))];
  const occupied = [];
  for (const item of events) {
    try {
      const interval = calendarInterval(item, plan.timeZone);
      if (!interval || interval.end <= dayStart || interval.start >= dayEnd) continue;
      if (interval.uncertain) warnings.push(`“${item.title}” non ha una durata certa: tempo riservato fino a fine giornata.`);
      occupied.push({ start: interval.start - a.margin * MINUTE, end: interval.end + a.margin * MINUTE });
    } catch {
      // Unknown clock/date must not accidentally expose a free calendar day.
      if (item.date <= plan.date && (item.endDate || nextDate(item.date)) >= plan.date) {
        occupied.push({ start: dayStart, end: dayEnd }); warnings.push(`Verifica data e orario di “${item.title}”.`);
      }
    }
  }
  return { candidates, free: subtractIntervals(windows, [...occupied, ...breaks]), warnings, margin: a.margin, reserve: a.reserve };
}
export function proposeSchedule(data, plan, options = {}) {
  if (dayHeads(data.dayPlans, plan.date).length > 1) throw new Error('Risolvi prima il conflitto del piano.');
  const context = planningContext(data, plan, options);
  let free = context.free;
  const capacity = free.reduce((sum, w) => sum + (w.end - w.start) / MINUTE, 0);
  let budget = capacity * (1 - context.reserve / 100);
  const blocks = {}, unplaced = [];
  for (const p of context.candidates) {
    const duration = p.duration * MINUTE;
    const source = prioritySource(data, p);
    const dueDate = p.deadlineDate || source?.dueDate || source?.deadline || null;
    const earliest = p.earliest ? instant(plan.date, p.earliest, plan.timeZone) : -Infinity;
    const latest = p.latest ? instant(plan.date, p.latest, plan.timeZone) : Infinity;
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(dueDate || '') ? instant(nextDate(dueDate), '00:00', plan.timeZone) : Infinity;
    const slot = free.map(w => ({ start: Math.max(w.start, earliest), end: Math.min(w.end, latest, deadline) }))
      .find(w => {
        if (w.end - w.start < duration) return false;
        const occupiedStart = w.start - context.margin * MINUTE, occupiedEnd = w.start + duration + context.margin * MINUTE;
        const cost = free.reduce((sum, f) => sum + Math.max(0, Math.min(f.end, occupiedEnd) - Math.max(f.start, occupiedStart)) / MINUTE, 0);
        return cost <= budget;
      });
    if (!slot) { unplaced.push({ key: refKey(p.ref), title: source?.title || source?.name || p.title, duration: p.duration }); continue; }
    const end = slot.start + duration;
    blocks[refKey(p.ref)] = { startAt: new Date(slot.start).toISOString(), endAt: new Date(end).toISOString() };
    const before = free.reduce((sum, w) => sum + w.end - w.start, 0);
    free = subtractIntervals(free, [{ start: slot.start - context.margin * MINUTE, end: end + context.margin * MINUTE }]);
    budget -= (before - free.reduce((sum, w) => sum + w.end - w.start, 0)) / MINUTE;
  }
  const protectedKeys = options.protectedKeys || [];
  const retain = unplaced.filter(u => plan.priorities.some(p => refKey(p.ref) === u.key && p.block) && !protectedKeys.includes(u.key));
  if (retain.length) {
    // An unscheduled candidate keeps its old block. Recompute around it so a
    // successful candidate cannot occupy time still used by the old plan.
    const retry = proposeSchedule(data, plan, { ...options, protectedKeys: [...protectedKeys, ...retain.map(u => u.key)] });
    return { ...retry, unplaced: [...retain, ...retry.unplaced] };
  }
  return { blocks, unplaced, warnings: context.warnings, capacity: Math.round(capacity), reserve: context.reserve };
}
export function manualBlock(plan, startTime, duration) {
  const start = instant(plan.date, startTime, plan.timeZone), end = start + duration * MINUTE;
  if (end > instant(nextDate(plan.date), '00:00', plan.timeZone)) throw new Error('Il blocco supera la giornata: scegli un orario precedente o riprogramma la priorità.');
  return { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
}
export function calendarWarnings(data, date) {
  const events = [...(data.calendarItems || []), ...planCalendarItems(data)];
  const warnings = [];
  const zone = date ? dayHeads(data.dayPlans, date)[0]?.timeZone || localZone() : localZone();
  const from = date ? instant(date, '00:00', zone) : -Infinity;
  const to = date ? instant(date, '24:00', zone) : Infinity;
  const intervals = events.map(item => { try { return { item, ...calendarInterval(item, zone) }; } catch { return { item }; } })
    .filter(i => i.end > from && i.start < to);
  for (let i = 0; i < intervals.length; i++) for (let j = i + 1; j < intervals.length; j++) {
    const a = intervals[i], b = intervals[j];
    if ((a.item.priorityDate || b.item.priorityDate) && a.start < b.end && b.start < a.end) warnings.push({ date: a.item.priorityDate || b.item.priorityDate, text: `Sovrapposizione: ${a.item.title} / ${b.item.title}` });
  }
  return warnings;
}
