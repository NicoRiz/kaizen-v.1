import { useState } from "react";
import { addDays, dateKey } from "../utils/date.js";
import {
  calculateAreaRhythm,
  daysAgoLabel,
  formatNumber,
} from "../lib/habits.js";
import BottomNav from "./BottomNav.jsx";
import { AreaBadge, ProjectProgress } from "./ProgressUi.jsx";

const DEFAULT_COLORS = ["#741b34", "#35705b", "#315f86", "#8a642a", "#6c4f8c"];

function AreaModal({ area, onClose, onSubmit }) {
  const [name, setName] = useState(area?.name || "");
  const [description, setDescription] = useState(area?.description || "");
  const [color, setColor] = useState(area?.color || DEFAULT_COLORS[0]);

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="area-modal-title" aria-modal="true" className="modal" role="dialog">
        <div className="modal-heading">
          <div><p className="eyebrow">Area</p><h2 id="area-modal-title">{area ? "Modifica Area" : "Nuova Area"}</h2></div>
          <button aria-label="Chiudi" className="ghost-button" onClick={onClose} type="button">x</button>
        </div>
        <form className="task-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) onSubmit({ ...area, name, description, color }); }}>
          <label>Nome<input autoFocus onChange={(event) => setName(event.target.value)} required value={name} /></label>
          <label>Descrizione opzionale<textarea onChange={(event) => setDescription(event.target.value)} value={description} /></label>
          <fieldset>
            <legend>Colore</legend>
            <div className="color-picker">
              {DEFAULT_COLORS.map((value) => (
                <button aria-label={`Colore ${value}`} className={color === value ? "is-selected" : ""} key={value} onClick={() => setColor(value)} style={{ "--swatch": value }} type="button" />
              ))}
              <input aria-label="Colore personalizzato" onChange={(event) => setColor(event.target.value)} type="color" value={color} />
            </div>
          </fieldset>
          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">Annulla</button>
            <button className="submit-button" disabled={!name.trim()} type="submit">Salva</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function AreaDashboard({ area, habits, logs, nextActions, onBack, onEdit, projectActions, projects, today }) {
  const areaHabits = habits.filter((habit) => habit.areaId === area.id && habit.status !== "archived");
  const areaProjects = projects.filter((project) => project.areaId === area.id && project.status !== "someday");
  const projectIds = new Set(areaProjects.map((project) => project.id));
  const areaActions = [
    ...nextActions.filter((action) => action.areaId === area.id && !action.completed),
    ...projectActions.filter((action) => projectIds.has(action.projectId) && !action.completed),
  ];
  const periodStart = addDays(today, -29);
  const currentRhythm = calculateAreaRhythm(area.id, habits, logs, periodStart, today);
  const previousRhythm = calculateAreaRhythm(area.id, habits, logs, addDays(periodStart, -30), addDays(periodStart, -1));
  const rhythmDelta = currentRhythm !== null && previousRhythm !== null ? currentRhythm - previousRhythm : null;
  const recentLogs = logs
    .filter((log) => areaHabits.some((habit) => habit.id === log.habitId))
    .sort((a, b) => `${b.date}${b.updatedAt}`.localeCompare(`${a.date}${a.updatedAt}`))
    .slice(0, 8);

  return (
    <>
      <header className="topbar section-topbar area-detail-header" style={{ "--area-color": area.color }}>
        <div>
          <button className="back-button" onClick={onBack} type="button">← Tutte le Areas</button>
          <p className="eyebrow">Area</p>
          <h1>{area.name}</h1>
          {area.description && <p>{area.description}</p>}
        </div>
        <button className="secondary-button" onClick={onEdit} type="button">Modifica</button>
      </header>

      <section className="panel rhythm-overview" style={{ "--area-color": area.color }}>
        <div><p className="eyebrow">Ritmo · 30 giorni</p><strong>{currentRhythm === null ? "—" : `${Math.round(currentRhythm)}%`}</strong></div>
        <p>{rhythmDelta === null ? "Nessun periodo precedente confrontabile" : `${rhythmDelta >= 0 ? "+" : ""}${Math.round(rhythmDelta)}% rispetto al periodo precedente`}</p>
      </section>

      <div className="area-dashboard-grid">
        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow">Risultati</p><h2>Projects</h2></div><span className="counter">{areaProjects.length}</span></div>
          {areaProjects.length === 0 ? <p className="empty-state">Nessun Project collegato.</p> : (
            <ul className="dashboard-list">{areaProjects.map((project) => <li key={project.id}><strong>{project.title}</strong><ProjectProgress area={area} compact project={project} /></li>)}</ul>
          )}
        </section>

        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow">Processo</p><h2>Abitudini</h2></div><span className="counter">{areaHabits.length}</span></div>
          {areaHabits.length === 0 ? <p className="empty-state">Nessuna abitudine collegata.</p> : (
            <ul className="dashboard-list">{areaHabits.map((habit) => <li key={habit.id}><strong>{habit.name}</strong><span>{habit.frequency === "weekly" ? `${habit.timesPerWeek} volte/settimana` : habit.frequency === "daily" ? "Ogni giorno" : "Giorni specifici"}</span></li>)}</ul>
          )}
        </section>

        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow">Operativa</p><h2>Prossime Azioni</h2></div><span className="counter">{areaActions.length}</span></div>
          {areaActions.length === 0 ? <p className="empty-state">Nessuna azione collegata.</p> : <ul className="dashboard-list">{areaActions.map((action) => <li key={action.id}><strong>{action.title}</strong></li>)}</ul>}
        </section>

        <section className="panel">
          <div className="section-heading"><div><p className="eyebrow">Storico</p><h2>Attività recente</h2></div></div>
          {recentLogs.length === 0 ? <p className="empty-state">Nessuna attività registrata.</p> : (
            <ul className="activity-list">{recentLogs.map((log) => {
              const habit = habits.find((item) => item.id === log.habitId);
              return <li key={log.id}><span>{daysAgoLabel(log.date, today)}</span><strong>{habit?.type === "boolean" ? habit.name : `+${formatNumber(log.quantity)} ${habit?.unit || "unità"}`}</strong><small>{habit?.name}</small></li>;
            })}</ul>
          )}
        </section>
      </div>
    </>
  );
}

export default function AreasPage({ activeSection, areas, habits, logs, nextActions, onNavigate, onSaveArea, onSetAreaStatus, projectActions, projects, today = dateKey() }) {
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [editingArea, setEditingArea] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const selectedArea = areas.find((area) => area.id === selectedAreaId);
  const visibleAreas = areas.filter((area) =>
    statusFilter === "archived"
      ? area.status === "archived"
      : area.status !== "archived",
  );

  return (
    <div className="app-shell">
      <main className="home">
        {selectedArea ? (
          <AreaDashboard area={selectedArea} habits={habits} logs={logs} nextActions={nextActions} onBack={() => setSelectedAreaId(null)} onEdit={() => setEditingArea(selectedArea)} projectActions={projectActions} projects={projects} today={today} />
        ) : (
          <>
            <header className="topbar section-topbar"><div><p className="eyebrow">Ambiti da mantenere</p><h1>Areas</h1></div><button className="add-button" onClick={() => setEditingArea({})} type="button">Nuova</button></header>
            <section className="panel">
              <div className="tab-list" role="tablist" aria-label="Stato Areas">
                <button className={statusFilter === "active" ? "is-selected" : ""} onClick={() => setStatusFilter("active")} role="tab" type="button">Attive</button>
                <button className={statusFilter === "archived" ? "is-selected" : ""} onClick={() => setStatusFilter("archived")} role="tab" type="button">Archiviate</button>
              </div>
              {visibleAreas.length === 0 ? <p className="empty-state">{statusFilter === "active" ? "Crea la prima Area per collegare Projects, Habits e Next Actions." : "Nessuna Area archiviata."}</p> : (
                <ul className="area-list">{visibleAreas.map((area) => {
                  const rhythm = calculateAreaRhythm(area.id, habits, logs, addDays(today, -29), today);
                  return (
                    <li className="area-card" key={area.id} style={{ "--area-color": area.color }}>
                      <button className="area-card-main" onClick={() => setSelectedAreaId(area.id)} type="button"><AreaBadge area={area} /><strong>{area.name}</strong><p>{area.description || "Nessuna descrizione."}</p><span>Ritmo 30 giorni: {rhythm === null ? "nessun impegno" : `${Math.round(rhythm)}%`}</span></button>
                      <div className="area-card-actions"><button className="ghost-button" onClick={() => setEditingArea(area)} type="button">Modifica</button><button className="ghost-button" onClick={() => onSetAreaStatus(area.id, area.status === "archived" ? "active" : "archived")} type="button">{area.status === "archived" ? "Ripristina" : "Archivia"}</button></div>
                    </li>
                  );
                })}</ul>
              )}
            </section>
          </>
        )}
      </main>
      <BottomNav activeSection={activeSection} onNavigate={onNavigate} />
      {editingArea && <AreaModal area={editingArea.id ? editingArea : null} onClose={() => setEditingArea(null)} onSubmit={(input) => { onSaveArea(input); setEditingArea(null); }} />}
    </div>
  );
}
