import { useMemo, useState } from "react";
import { WEEK_DAYS, dateKey } from "../utils/date.js";
import { formatNumber } from "../lib/habits.js";
import BottomNav from "./BottomNav.jsx";
import { AreaBadge } from "./ProgressUi.jsx";

function emptyHabit(today) {
  return {
    id: "",
    name: "",
    areaId: "",
    projectId: "",
    status: "active",
    type: "boolean",
    frequency: "daily",
    weekdays: [],
    timesPerWeek: 3,
    unit: "",
    minimum: "",
    target: 1,
    startDate: today,
    scheduledTime: "",
    updateProjectProgress: false,
  };
}

function frequencyLabel(habit) {
  if (habit.frequency === "daily") return "Ogni giorno";
  if (habit.frequency === "weekly") {
    return `${formatNumber(habit.timesPerWeek)} volte a settimana`;
  }
  return (habit.weekdays || [])
    .map((day) => WEEK_DAYS.find((item) => item.value === day)?.label)
    .filter(Boolean)
    .join(", ");
}

function HabitModal({ areas, habit, onClose, onSubmit, projects, today }) {
  const [draft, setDraft] = useState(() => ({ ...emptyHabit(today), ...habit }));
  const quantitativeProjects = projects.filter(
    (project) => project.progressTracking === "quantitative" && project.status !== "someday",
  );
  const selectedProject = projects.find((project) => project.id === draft.projectId);
  const canSync = selectedProject?.progressTracking === "quantitative";
  const isValid =
    draft.name.trim() &&
    draft.areaId &&
    draft.startDate &&
    (draft.frequency !== "weekdays" || draft.weekdays.length > 0) &&
    (draft.type !== "quantitative" || Number(draft.target) > 0);

  function patch(value) {
    setDraft((current) => ({ ...current, ...value }));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="habit-modal-title" aria-modal="true" className="modal habit-modal" role="dialog">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Abitudine</p>
            <h2 id="habit-modal-title">{habit?.id ? "Modifica" : "Nuova abitudine"}</h2>
          </div>
          <button aria-label="Chiudi" className="ghost-button" onClick={onClose} type="button">x</button>
        </div>

        <form
          className="task-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (isValid) onSubmit(draft);
          }}
        >
          <label>
            Nome
            <input autoFocus onChange={(event) => patch({ name: event.target.value })} required value={draft.name} />
          </label>

          <div className="form-grid">
            <label>
              Area
              <select onChange={(event) => patch({ areaId: event.target.value })} required value={draft.areaId}>
                <option value="">Scegli un’Area</option>
                {areas.filter((area) => area.status !== "archived").map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
            </label>
            <label>
              Tipo
              <select onChange={(event) => patch({ type: event.target.value })} value={draft.type}>
                <option value="boolean">Sì / no</option>
                <option value="quantitative">Quantitativa</option>
              </select>
            </label>
          </div>

          <label>
            Frequenza
            <select onChange={(event) => patch({ frequency: event.target.value })} value={draft.frequency}>
              <option value="daily">Ogni giorno</option>
              <option value="weekdays">Giorni specifici</option>
              <option value="weekly">X volte a settimana</option>
            </select>
          </label>

          {draft.frequency === "weekdays" && (
            <fieldset>
              <legend>Giorni</legend>
              <div className="weekday-grid">
                {WEEK_DAYS.map((day) => (
                  <button
                    className={draft.weekdays.includes(day.value) ? "is-selected" : ""}
                    key={day.value}
                    onClick={() => patch({
                      weekdays: draft.weekdays.includes(day.value)
                        ? draft.weekdays.filter((value) => value !== day.value)
                        : [...draft.weekdays, day.value],
                    })}
                    type="button"
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {draft.frequency === "weekly" && (
            <label>
              Volte a settimana
              <input min="1" onChange={(event) => patch({ timesPerWeek: event.target.value })} required type="number" value={draft.timesPerWeek} />
            </label>
          )}

          {draft.type === "quantitative" && draft.frequency !== "weekly" && (
            <div className="form-grid form-grid--three">
              <label>
                Unità
                <input onChange={(event) => patch({ unit: event.target.value })} placeholder="pagine, km, minuti…" value={draft.unit} />
              </label>
              <label>
                Minimum
                <input min="0" onChange={(event) => patch({ minimum: event.target.value })} step="any" type="number" value={draft.minimum} />
              </label>
              <label>
                Target
                <input min="0.01" onChange={(event) => patch({ target: event.target.value })} required step="any" type="number" value={draft.target} />
              </label>
            </div>
          )}

          <div className="form-grid">
            <label>
              Data di inizio
              <input onChange={(event) => patch({ startDate: event.target.value })} required type="date" value={draft.startDate} />
            </label>
            <label>
              Orario opzionale
              <input onChange={(event) => patch({ scheduledTime: event.target.value })} type="time" value={draft.scheduledTime} />
            </label>
          </div>

          <label>
            Project opzionale
            <select
              onChange={(event) => patch({ projectId: event.target.value, updateProjectProgress: false })}
              value={draft.projectId}
            >
              <option value="">Nessun Project</option>
              {projects.filter((project) => project.status !== "someday").map((project) => (
                <option key={project.id} value={project.id}>{project.title}</option>
              ))}
            </select>
          </label>

          <label className="checkbox-row">
            <input
              checked={Boolean(draft.updateProjectProgress)}
              disabled={!canSync}
              onChange={(event) => patch({ updateProjectProgress: event.target.checked })}
              type="checkbox"
            />
            <span>
              Aggiorna avanzamento Project
              {!canSync && draft.projectId && <small>Richiede un Project quantitativo.</small>}
            </span>
          </label>

          {quantitativeProjects.length === 0 && (
            <p className="form-hint">Puoi abilitare la sincronizzazione dopo aver configurato un Project quantitativo.</p>
          )}

          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">Annulla</button>
            <button className="submit-button" disabled={!isValid} type="submit">Salva</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function LogModal({ habit, log, onClose, onDelete, onSubmit }) {
  const [date, setDate] = useState(log.date);
  const [quantity, setQuantity] = useState(log.quantity ?? 0);
  const [completed, setCompleted] = useState(Boolean(log.completed));
  const [note, setNote] = useState(log.note || "");

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="log-modal-title" aria-modal="true" className="modal" role="dialog">
        <div className="modal-heading">
          <h2 id="log-modal-title">Correggi registrazione</h2>
          <button aria-label="Chiudi" className="ghost-button" onClick={onClose} type="button">x</button>
        </div>
        <form className="task-form" onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ date, quantity, completed, note, previousLogId: log.id });
        }}>
          <label>Data<input onChange={(event) => setDate(event.target.value)} required type="date" value={date} /></label>
          {habit.type === "quantitative" ? (
            <label>Quantità<input min="0" onChange={(event) => setQuantity(event.target.value)} step="any" type="number" value={quantity} /></label>
          ) : (
            <label className="checkbox-row"><input checked={completed} onChange={(event) => setCompleted(event.target.checked)} type="checkbox" /><span>Completata</span></label>
          )}
          <label>Nota opzionale<textarea onChange={(event) => setNote(event.target.value)} value={note} /></label>
          <div className="modal-actions">
            <button className="secondary-button danger-button" onClick={() => {
              if (window.confirm("Eliminare questa registrazione? L’avanzamento del Project verrà corretto.")) {
                onDelete(log.id);
              }
            }} type="button">Elimina log</button>
            <button className="submit-button" type="submit">Salva</button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function HabitsPage({
  activeSection,
  areas,
  habits,
  logs,
  onDeleteLog,
  onNavigate,
  onSaveHabit,
  onSaveLog,
  onSetHabitStatus,
  projects,
  today = dateKey(),
}) {
  const [editingHabit, setEditingHabit] = useState(null);
  const [editingLog, setEditingLog] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const visibleHabits = useMemo(
    () => habits.filter((habit) => habit.status === statusFilter),
    [habits, statusFilter],
  );

  return (
    <div className="app-shell">
      <main className="home">
        <header className="topbar section-topbar">
          <div><p className="eyebrow">Processo</p><h1>Abitudini</h1></div>
          <button className="add-button" disabled={areas.length === 0} onClick={() => setEditingHabit(emptyHabit(today))} type="button">Nuova</button>
        </header>

        {areas.length === 0 && (
          <section className="panel callout-panel">
            <strong>Crea prima un’Area</strong>
            <p>Ogni abitudine appartiene a un ambito della tua vita.</p>
            <button className="secondary-button" onClick={() => onNavigate("areas")} type="button">Vai alle Areas</button>
          </section>
        )}

        <section className="panel">
          <div className="tab-list" role="tablist" aria-label="Stato abitudini">
            {[{ key: "active", label: "Attive" }, { key: "paused", label: "In pausa" }, { key: "archived", label: "Archiviate" }].map((tab) => (
              <button className={statusFilter === tab.key ? "is-selected" : ""} key={tab.key} onClick={() => setStatusFilter(tab.key)} role="tab" type="button">{tab.label}</button>
            ))}
          </div>

          {visibleHabits.length === 0 ? (
            <p className="empty-state">Nessuna abitudine in questa sezione.</p>
          ) : (
            <ul className="habit-list">
              {visibleHabits.map((habit) => {
                const area = areas.find((item) => item.id === habit.areaId);
                const project = projects.find((item) => item.id === habit.projectId);
                const habitLogs = logs.filter((log) => log.habitId === habit.id).sort((a, b) => b.date.localeCompare(a.date));
                return (
                  <li className="habit-management-card" key={habit.id}>
                    <div className="habit-card-heading">
                      <div>
                        <AreaBadge area={area} />
                        <h3>{habit.name}</h3>
                        <p>{frequencyLabel(habit)}{habit.type === "quantitative" && habit.frequency !== "weekly" ? ` · target ${formatNumber(habit.target)} ${habit.unit || "unità"}` : ""}</p>
                        {project && <small>Project: {project.title}{habit.updateProjectProgress ? " · sincronizzato" : ""}</small>}
                      </div>
                      <button className="ghost-button" onClick={() => setEditingHabit(habit)} type="button">Modifica</button>
                    </div>

                    <div className="habit-actions">
                      {habit.status === "active" && <button className="secondary-button" onClick={() => onSetHabitStatus(habit.id, "paused")} type="button">Pausa</button>}
                      {habit.status === "paused" && <button className="secondary-button" onClick={() => onSetHabitStatus(habit.id, "active")} type="button">Riattiva</button>}
                      {habit.status !== "archived" && <button className="secondary-button" onClick={() => onSetHabitStatus(habit.id, "archived")} type="button">Archivia</button>}
                      {habit.status === "archived" && <button className="secondary-button" onClick={() => onSetHabitStatus(habit.id, "active")} type="button">Ripristina</button>}
                    </div>

                    <details className="habit-history">
                      <summary>Storico ({habitLogs.length})</summary>
                      {habitLogs.length === 0 ? <p className="empty-state compact-empty">Nessuna registrazione.</p> : (
                        <ul>
                          {habitLogs.slice(0, 30).map((log) => (
                            <li key={log.id}>
                              <button onClick={() => setEditingLog({ habit, log })} type="button">
                                <span>{new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${log.date}T12:00:00`))}</span>
                                <strong>{habit.type === "boolean" ? (log.completed ? "Completata" : "Non completata") : `${formatNumber(log.quantity)} ${habit.unit || "unità"}`}</strong>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <BottomNav activeSection={activeSection} onNavigate={onNavigate} />

      {editingHabit && <HabitModal areas={areas} habit={editingHabit} onClose={() => setEditingHabit(null)} onSubmit={(input) => { onSaveHabit(input); setEditingHabit(null); }} projects={projects} today={today} />}
      {editingLog && <LogModal habit={editingLog.habit} log={editingLog.log} onClose={() => setEditingLog(null)} onDelete={(logId) => { onDeleteLog(logId); setEditingLog(null); }} onSubmit={(input) => { onSaveLog(editingLog.habit.id, input); setEditingLog(null); }} />}
    </div>
  );
}
