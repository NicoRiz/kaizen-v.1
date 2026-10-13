import { useContext, useEffect, useState } from 'react';
import ProjectActionDetails, { ProjectActionsContext } from './ProjectActionDetails.jsx';
import { dayHeads, emptyDay, localZone, priorityCandidates, priorityCompleted, prioritySource, refKey } from '../lib/dayPlans.js';
import { calendarInterval, calendarWarnings, instant, manualBlock, parseWindows, planCalendarItems, planningContext, proposeSchedule, validateAvailability, zonedParts } from '../lib/timeBlocking.js';

const formatWindows = windows => (windows || []).map(w => `${w.start}-${w.end}`).join(', ');
const labelFor = (data, p) => { if (!p) return 'Priorità modificata'; const s = prioritySource(data, p); return s?.title || s?.name || p.title; };
const eventTime = (item, zone) => {
  if (item.allDay || !item.startTime) return 'Tutto il giorno';
  try { const i = calendarInterval(item, zone); return `${zonedParts(i.start, zone).time} – ${item.endTime ? zonedParts(i.end, zone).time : 'fine da definire'}`; }
  catch { return 'Orario da verificare'; }
};
const fingerprint = data => JSON.stringify([data.dayPlans, data.calendarItems, data.nextActions, data.projectActions, data.habits, data.habitLogs]);

function Availability({ plan, onCommand }) {
  const [windows, setWindows] = useState(formatWindows(plan.availability?.windows));
  const [breaks, setBreaks] = useState(formatWindows(plan.availability?.breaks));
  const [margin, setMargin] = useState(plan.availability?.margin ?? 5);
  const [reserve, setReserve] = useState(plan.availability?.reserve ?? 20);
  const [baseId] = useState(plan.id);
  const [error, setError] = useState('');
  return <details className="day-availability" open={!plan.availability}>
    <summary>Disponibilità, pause e margini</summary>
    <form className="task-form" onSubmit={event => {
      event.preventDefault();
      try {
        const availability = validateAvailability({ windows: parseWindows(windows), breaks: parseWindows(breaks), margin: Number(margin), reserve: Number(reserve) });
        onCommand({ type: 'availability', availability, baseId }); setError('');
      } catch (e) { setError(e.message); }
    }}>
      <p>Indica il tempo che vuoi rendere disponibile per questa giornata. Un calendario vuoto non implica disponibilità.</p>
      <label>Fasce disponibili<input aria-label="Fasce disponibili" placeholder="09:00-12:30, 14:00-18:00" value={windows} onChange={e => setWindows(e.target.value)} required /></label>
      <label>Pause<input aria-label="Pause" placeholder="10:30-10:45" value={breaks} onChange={e => setBreaks(e.target.value)} /></label>
      <div className="form-grid">
        <label>Margine tra impegni (min)<input type="number" min="0" max="120" value={margin} onChange={e => setMargin(e.target.value)} /></label>
        <label>Tempo da lasciare libero (%)<input type="number" min="0" max="90" value={reserve} onChange={e => setReserve(e.target.value)} /></label>
      </div>
      {error && <p role="alert">{error}</p>}
      <button className="secondary-button" type="submit">Salva disponibilità</button>
    </form>
  </details>;
}

function PriorityEditor({ plan, priority, onCommand, onManual, onReschedule }) {
  const [duration, setDuration] = useState(priority.duration);
  const [time, setTime] = useState(priority.block ? zonedParts(priority.block.startAt, plan.timeZone).time : '');
  const [earliest, setEarliest] = useState(priority.earliest || '');
  const [latest, setLatest] = useState(priority.latest || '');
  const [deadlineDate, setDeadlineDate] = useState(priority.deadlineDate || '');
  const [targetDate, setTargetDate] = useState('');
  const [fixed, setFixed] = useState(Boolean(priority.fixed));
  const key = refKey(priority.ref);
  return <details className="priority-editor"><summary>Orario, durata e riprogrammazione</summary>
    <form className="task-form" onSubmit={e => {
      e.preventDefault();
      const patch = { duration: Number(duration), earliest, latest, deadlineDate, fixed };
      if (time) onManual(priority, time, patch, plan.id);
      else onCommand({ type: 'patch', key, patch: { ...patch, block: null }, baseId: plan.id });
    }}>
      <div className="form-grid">
        <label>Orario<input aria-label={`Orario di ${priority.title}`} type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
        <label>Durata (min)<input aria-label={`Durata di ${priority.title}`} type="number" min="5" max="1440" step="5" required value={duration} onChange={e => setDuration(e.target.value)} /></label>
        <label>Non prima delle<input type="time" value={earliest} onChange={e => setEarliest(e.target.value)} /></label>
        <label>Entro le<input type="time" value={latest} onChange={e => setLatest(e.target.value)} /></label>
      </div>
      <label>Scadenza<input type="date" value={deadlineDate} onChange={e => setDeadlineDate(e.target.value)} /></label>
      <label className="priority-fixed"><input type="checkbox" checked={fixed} onChange={e => setFixed(e.target.checked)} /> Mantieni fisso questo blocco nella riorganizzazione</label>
      <div className="day-actions"><button className="secondary-button" type="submit">{time ? 'Verifica orario' : 'Salva durata e vincoli'}</button>
        {priority.block && <button className="secondary-button" type="button" onClick={() => onCommand({ type: 'patch', key, patch: { block: null } })}>Rimuovi solo il blocco</button>}
      </div>
    </form>
    <form className="day-reschedule" onSubmit={e => { e.preventDefault(); onReschedule(priority, targetDate); }}>
      <label>Sposta a un altro giorno<input aria-label={`Riprogramma ${priority.title}`} type="date" required value={targetDate} onChange={e => setTargetDate(e.target.value)} /></label>
      <button className="secondary-button" disabled={!targetDate || targetDate === plan.date} type="submit">Riprogramma</button>
    </form>
  </details>;
}

export default function TodayPlan({ today, onCommand, onCreate, onToggle, onReschedule, initialDate }) {
  const { data } = useContext(ProjectActionsContext);
  const [date, setDate] = useState(initialDate || today);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [title, setTitle] = useState('');
  const [proposal, setProposal] = useState(null);
  const [showAvailability, setShowAvailability] = useState(false);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(timer); }, []);
  useEffect(() => { setDate(initialDate || today); setProposal(null); }, [today, initialDate]);
  const heads = dayHeads(data.dayPlans, date);
  const plan = heads[0] || emptyDay(date);
  const conflict = heads.length > 1;
  const candidates = priorityCandidates(data, date).filter(c => !plan.priorities.some(p => refKey(p.ref) === refKey(c.ref)));
  const completed = plan.priorities.filter(p => date < today ? p.outcome === 'completed' : priorityCompleted(data, p, date)).length;
  const overlaps = calendarWarnings(data, date);
  const events = [...(data.calendarItems || []), ...planCalendarItems(data)].filter(item => {
    try { const range = calendarInterval(item, plan.timeZone); return range && range.start < instant(date, '24:00', plan.timeZone) && range.end > instant(date, '00:00', plan.timeZone); } catch { return item.date === date; }
  }).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  function command(input) {
    try {
      const result = onCommand({ date, baseId: plan.id, ...input });
      if (result !== false) { setError(''); setProposal(null); }
      return result;
    } catch (e) { setError(e.message); return false; }
  }
  function propose(reorganize) {
    try { setProposal({ ...proposeSchedule(data, plan, { reorganize, now: clock }), fingerprint: fingerprint(data), baseId: plan.id, reorganize }); setError(''); }
    catch (e) { setError(e.message); }
  }
  function manual(priority, time, patch, baseId) {
    try {
      if (patch.earliest && patch.latest && patch.earliest >= patch.latest) throw new Error('Il limite finale deve essere successivo a quello iniziale.');
      const block = manualBlock(plan, time, patch.duration);
      const warnings = [];
      const previewPlan = { ...plan, priorities: plan.priorities.map(p => refKey(p.ref) === refKey(priority.ref) ? { ...p, block: null } : p) };
      const previewData = { ...data, dayPlans: (data.dayPlans || []).map(p => p.id === plan.id ? previewPlan : p) };
      const start = Date.parse(block.startAt), end = Date.parse(block.endAt);
      if (start <= clock) warnings.push('L’orario scelto è già trascorso o in corso.');
      try {
        const ctx = planningContext(previewData, previewPlan, { now: -Infinity });
        warnings.push(...ctx.warnings);
        if (!ctx.free.some(w => start >= w.start && end <= w.end)) warnings.push('Il blocco non rispetta disponibilità, pause, margini o impegni presenti.');
        const freeMinutes = ctx.free.reduce((sum, w) => sum + (w.end - w.start) / 60000, 0);
        if (patch.duration > freeMinutes * (1 - ctx.reserve / 100)) warnings.push('Il blocco supera la preferenza di tempo da lasciare libero.');
      } catch (e) { warnings.push(e.message); }
      if (patch.earliest && start < instant(date, patch.earliest, plan.timeZone) || patch.latest && end > instant(date, patch.latest, plan.timeZone) || patch.deadlineDate && date > patch.deadlineDate) warnings.push('Il blocco non rispetta i vincoli indicati.');
      setProposal({ blocks: { [refKey(priority.ref)]: block }, patch, key: refKey(priority.ref), manual: true, unplaced: [], warnings, fingerprint: fingerprint(data), baseId });
      setError('');
    } catch (e) { setError(e.message); }
  }
  const stale = proposal && proposal.fingerprint !== fingerprint(data);
  return <section className="panel today-plan" aria-labelledby="today-plan-title">
    <div className="section-heading"><div><p className="eyebrow">Oggi</p><h2 id="today-plan-title">Le mie priorità</h2></div>
      <label className="day-date"><span className="visually-hidden">Giorno del piano</span><input aria-label="Giorno del piano" type="date" value={date} onChange={e => { if (e.target.value) { setDate(e.target.value); setProposal(null); setShowAvailability(false); } }} /></label>
    </div>
    <p className="day-intro">Quali attività renderebbero soddisfacente questa giornata?</p>
    <p className="day-progress" aria-live="polite">{completed} completate · {plan.priorities.length - completed} rimanenti · {plan.priorities.length}/5 priorità</p>
    <small>Tre sono un buon punto di partenza. Anche una sola può bastare. Orari: {plan.timeZone}{plan.timeZone !== localZone() ? ` · dispositivo: ${localZone()}` : ''}.</small>
    {date < today && <p>Storico: gli esiti salvati appartengono a questa giornata. Le modifiche successive alle azioni non li riscrivono.</p>}
    {error && <p className="day-warning" role="alert">{error}</p>}
    {overlaps.length > 0 && <div className="day-warning" role="alert">{overlaps.map((w, i) => <p key={i}>{w.text}</p>)}<p>Nessun elemento è stato eliminato. Verifica gli orari o riorganizza il piano.</p></div>}
    {conflict ? <div className="day-conflict" role="alert"><h3>Versioni concorrenti della giornata</h3><p>Le modifiche di entrambi i dispositivi sono conservate. Confrontale prima di continuare; la versione non scelta rimane nello storico.</p>
      {heads.map(version => <div key={version.id}><p>{version.updatedAt} · {version.mode === 'rest' ? 'Riposo' : 'Pianificata'} · {formatWindows(version.availability?.windows)}</p><ul>{version.priorities.map(p => <li key={refKey(p.ref)}>{labelFor(data, p)} · {p.duration} min · {p.block ? zonedParts(p.block.startAt, version.timeZone).time : 'senza orario'}</li>)}</ul><button className="secondary-button" onClick={() => command({ type: 'resolve', chosenId: version.id })}>Usa questa versione</button></div>)}
    </div> : <>
      <div className="day-actions"><button className="text-link-button" onClick={() => command({ type: 'mode', mode: plan.mode === 'rest' ? 'planned' : 'rest' })}>{plan.mode === 'rest' ? 'Pianifica attività' : 'Giornata di riposo'}</button>
        {date !== today && <button className="text-link-button" onClick={() => setDate(today)}>Torna a oggi</button>}
      </div>
      {plan.mode === 'rest' ? <p className="empty-state">Giornata dedicata al riposo. Nessuna priorità richiesta.</p> : <>
        <ol className="priority-list">{plan.priorities.map((p, index) => {
          const source = prioritySource(data, p), done = date < today ? p.outcome === 'completed' : priorityCompleted(data, p, date);
          return <li className={`priority-card ${done ? 'is-completed' : ''}`} key={refKey(p.ref)} data-priority-key={refKey(p.ref)}>
            <div className="priority-heading"><label className="task-check"><input aria-label={`Completa priorità ${labelFor(data, p)}`} type="checkbox" checked={Boolean(done)} disabled={!source || date !== today} onChange={() => { try { onToggle(p, date); } catch (e) { setError(e.message); } }} /><span /></label>
              <div><strong>{index + 1}. {labelFor(data, p)}</strong><small>{p.ref.collection === 'habits' ? 'Abitudine · impegno di questo giorno' : p.ref.collection === 'projectActions' ? 'Azione di progetto' : 'Prossima azione'} · {p.duration} min</small>
                <span className="priority-time">{p.block ? `${zonedParts(p.block.startAt, plan.timeZone).time}–${zonedParts(p.block.endAt, plan.timeZone).time}` : 'Orario da scegliere'}{p.fixed ? ' · fisso' : ''}</span></div>
            </div>
            {!source && <p className="day-warning">Attività originale non disponibile. Il riferimento e lo storico sono conservati.</p>}
            <div className="day-actions"><button className="ghost-button" aria-label={`Sposta su priorità ${p.title}`} disabled={!index} onClick={() => command({ type: 'move', key: refKey(p.ref), direction: -1 })}>↑</button><button className="ghost-button" aria-label={`Sposta giù priorità ${p.title}`} disabled={index === plan.priorities.length - 1} onClick={() => command({ type: 'move', key: refKey(p.ref), direction: 1 })}>↓</button><button className="text-link-button" onClick={() => command({ type: 'remove', key: refKey(p.ref), reason: 'priority-changed' })}>Rimuovi dalle priorità</button></div>
            <PriorityEditor key={`${refKey(p.ref)}:${plan.id}`} plan={plan} priority={p} onCommand={command} onManual={manual} onReschedule={(priority, target) => { try { onReschedule(priority, plan, target); setError(''); } catch (e) { setError(e.message); } }} />
            {source && p.ref.collection === 'projectActions' && <ProjectActionDetails action={source} />}
          </li>;
        })}</ol>
        {!plan.priorities.length && <p className="empty-state">{heads.length ? 'Nessuna priorità scelta.' : 'Giornata ancora da pianificare: non equivale a una giornata incompleta.'}</p>}
        {plan.priorities.length < 5 && <details className="priority-picker" open={!plan.priorities.length}><summary>Aggiungi una priorità{plan.priorities.length >= 3 ? ' · fino a 5' : ''}</summary>
          <form className="day-add" onSubmit={e => { e.preventDefault(); const candidate = candidates.find(c => refKey(c.ref) === selected); if (candidate && command({ type: 'add', ref: candidate.ref }) !== false) setSelected(''); }}>
            <label className="visually-hidden" htmlFor="priority-select">Attività esistente</label><select id="priority-select" aria-label="Attività esistente" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Scegli da GTD, progetti o abitudini</option>{candidates.map(c => <option key={refKey(c.ref)} value={refKey(c.ref)}>{c.ref.collection === 'habits' ? 'Abitudine' : c.ref.collection === 'projectActions' ? 'Progetto' : 'GTD'} · {c.title}</option>)}</select><button className="secondary-button" disabled={!selected}>Aggiungi priorità</button>
          </form>
          <form className="day-add" onSubmit={e => { e.preventDefault(); try { if (onCreate(title, date, plan.id) !== false) setTitle(''); } catch (err) { setError(err.message); } }}><input aria-label="Nuova azione prioritaria" placeholder="Oppure crea una nuova azione" value={title} maxLength="500" onChange={e => setTitle(e.target.value)} /><button className="secondary-button" disabled={!title.trim()}>Crea e aggiungi</button></form>
        </details>}
        <div className="day-actions"><button className="secondary-button" onClick={() => setShowAvailability(!showAvailability)}>{plan.availability ? 'Modifica disponibilità' : 'Imposta disponibilità'}</button>
          <button className="submit-button" disabled={!plan.priorities.length} onClick={() => propose(false)}>Proponi orari</button>
          <button className="secondary-button" disabled={!plan.priorities.length} onClick={() => propose(true)}>Riorganizza il resto della giornata</button>
        </div>
        {showAvailability && <Availability key={`${date}:${plan.id}`} plan={plan} onCommand={command} />}
      </>}
    </>}
    {proposal && <div className="day-proposal" role="region" aria-label="Piano proposto"><h3>{proposal.manual ? 'Verifica del blocco' : 'Orari proposti'}</h3>
      {!proposal.manual && <p>{proposal.capacity} minuti liberi rilevati · riserva desiderata {proposal.reserve}%. Le durate restano quelle scelte.</p>}
      <ul>{Object.entries(proposal.blocks).map(([key, block]) => <li key={key}>{labelFor(data, plan.priorities.find(p => refKey(p.ref) === key))} · {zonedParts(block.startAt, plan.timeZone).time}–{zonedParts(block.endAt, plan.timeZone).time}</li>)}</ul>
      {proposal.warnings.map((warning, i) => <p className="day-warning" key={i}>{warning}</p>)}
      {!!proposal.unplaced.length && <div className="day-warning"><p>Tempo insufficiente per: {proposal.unplaced.map(p => `${p.title} (${p.duration} min)`).join(', ')}.</p><p>Puoi riprogrammare un’attività, ampliare la disponibilità o modificare esplicitamente durata e riserva. I blocchi già presenti delle attività non ricollocate rimangono invariati.</p></div>}
      {stale && <p role="alert">Il piano o gli impegni sono cambiati. Chiudi questa proposta e ricalcolala prima di salvarla.</p>}
      <div className="day-actions"><button className="submit-button" disabled={stale || !Object.keys(proposal.blocks).length} onClick={() => {
        if (!proposal.manual && Object.values(proposal.blocks).some(b => Date.parse(b.startAt) < Date.now())) { setError('La proposta contiene un orario già trascorso: ricalcola gli orari.'); return; }
        command(proposal.manual ? { type: 'patch', key: proposal.key, patch: { ...proposal.patch, block: proposal.blocks[proposal.key] }, baseId: proposal.baseId } : { type: 'schedule', blocks: proposal.blocks, baseId: proposal.baseId, reason: proposal.reorganize ? 'rescheduled' : 'scheduled' });
      }}>{proposal.warnings.length ? 'Conferma comunque il piano' : 'Conferma il piano'}</button><button className="secondary-button" onClick={() => setProposal(null)}>Annulla proposta</button></div>
    </div>}
    <details className="day-timeline"><summary>Calendario della giornata · {events.length} impegni</summary><ul>{events.map(item => <li key={item.id}><strong>{eventTime(item, plan.timeZone)}</strong><span>{item.title}</span></li>)}</ul>{!events.length && <p>Nessun impegno nel calendario interno.</p>}</details>
    <details className="day-history"><summary>Storico del piano · {(data.dayPlans || []).filter(p => p.date === date).length} revisioni</summary><ul>{(data.dayPlans || []).filter(p => p.date === date).slice().reverse().map(p => <li key={p.id}><small>{new Date(p.updatedAt).toLocaleString('it-IT')} · {p.reason === 'rescheduled' ? 'Riprogrammazione' : p.mode === 'rest' ? 'Riposo' : 'Revisione del piano'}</small><p>{p.priorities.map(v => `${v.title}: ${v.outcome === 'completed' ? 'completata' : v.outcome === 'missing' ? 'informazioni mancanti' : 'non completata'}${v.block ? `, ${zonedParts(v.block.startAt, p.timeZone).time}` : ''}`).join(' · ') || 'Nessuna priorità'}</p></li>)}</ul></details>
  </section>;
}
