import { useMemo, useState } from "react";
import { filterUnifiedActions, parseActionRef } from "../lib/kaizenLoop.js";
import Modal from "./Modal.jsx";

const STATUS_LABELS = { ready: "Pronta", "in-progress": "In corso", blocked: "Bloccata", completed: "Completata" };
const ENERGY_LABELS = { low: "Bassa", medium: "Media", high: "Alta" };

function ActionModal({ action, onClose, onDelete, onSave, projects }) {
  const [draft, setDraft] = useState({ ...action });
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const source = draft.projectId ? "projectActions" : "nextActions";

  function update(key, value) { setDraft((current) => ({ ...current, [key]: value })); }

  return (
    <Modal className="action-modal" labelId="action-modal-title" onClose={onClose}>
      <div className="modal-heading"><div><p className="eyebrow">Inventario GTD</p><h2 id="action-modal-title">Modifica azione</h2></div><button className="ghost-button" onClick={onClose} type="button">Chiudi</button></div>
      <form className="task-form" onSubmit={(event) => { event.preventDefault(); if (draft.title.trim()) onSave({ ...draft, source }); }}>
        <label>Titolo<input onChange={(event) => update("title", event.target.value)} value={draft.title} /></label>
        <div className="form-grid two-columns">
          <label>Progetto<select onChange={(event) => update("projectId", event.target.value || null)} value={draft.projectId || ""}><option value="">Azione indipendente</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
          <label>Stato<select onChange={(event) => update("status", event.target.value)} value={draft.status}>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Contesto<input onChange={(event) => update("context", event.target.value)} placeholder="es. casa, computer, fuori" value={draft.context || ""} /></label>
          <label>Energia<select onChange={(event) => update("energy", event.target.value)} value={draft.energy || ""}><option value="">Non indicata</option>{Object.entries(ENERGY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Durata stimata<input min="1" onChange={(event) => update("estimatedMinutes", event.target.value)} placeholder="minuti" type="number" value={draft.estimatedMinutes || ""} /></label>
          <label>Scadenza reale<input onChange={(event) => update("dueDate", event.target.value)} type="date" value={draft.dueDate || ""} /></label>
        </div>
        {draft.status === "blocked" && <label>Motivo del blocco o rinvio<textarea onChange={(event) => update("blockedReason", event.target.value)} value={draft.blockedReason || ""} /></label>}
        <div className="modal-actions split-actions"><button className={`secondary-button danger-button ${deleteConfirm ? "is-confirming" : ""}`} onClick={() => deleteConfirm ? onDelete(action.ref) : setDeleteConfirm(true)} type="button">{deleteConfirm ? "Conferma eliminazione" : "Elimina"}</button><button className="submit-button" disabled={!draft.title.trim()} type="submit">Salva azione</button></div>
      </form>
    </Modal>
  );
}

export default function UnifiedActions({ actions, onDelete, onMoveOrder, onSave, onToggle, projects }) {
  const [filters, setFilters] = useState({ context: "", energy: "", availableMinutes: "", projectId: "", status: "" });
  const [editing, setEditing] = useState(null);
  const contexts = useMemo(() => [...new Set(actions.map((action) => action.context).filter(Boolean))].sort(), [actions]);
  const visible = useMemo(() => filterUnifiedActions(actions, filters), [actions, filters]);
  function filter(key, value) { setFilters((current) => ({ ...current, [key]: value })); }

  return (
    <section className="panel actions-panel" aria-labelledby="available-actions-title">
      <div className="section-heading"><div><p className="eyebrow">Azioni disponibili</p><h2 id="available-actions-title">Inventario operativo</h2></div><span className="counter">{visible.length}</span></div>
      <div className="action-filters" aria-label="Filtra azioni">
        <select aria-label="Filtra per contesto" onChange={(event) => filter("context", event.target.value)} value={filters.context}><option value="">Tutti i contesti</option>{contexts.map((context) => <option key={context}>{context}</option>)}</select>
        <select aria-label="Filtra per energia" onChange={(event) => filter("energy", event.target.value)} value={filters.energy}><option value="">Ogni energia</option>{Object.entries(ENERGY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select aria-label="Filtra per tempo disponibile" onChange={(event) => filter("availableMinutes", event.target.value)} value={filters.availableMinutes}><option value="">Ogni durata</option><option value="15">Entro 15 min</option><option value="30">Entro 30 min</option><option value="60">Entro 60 min</option></select>
        <select aria-label="Filtra per progetto" onChange={(event) => filter("projectId", event.target.value)} value={filters.projectId}><option value="">Tutti i progetti</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select>
        <select aria-label="Filtra per stato" onChange={(event) => filter("status", event.target.value)} value={filters.status}><option value="">Ogni stato</option>{Object.entries(STATUS_LABELS).filter(([value]) => value !== "completed").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      </div>

      {visible.length ? <ul className="operational-list">{visible.map((action, index) => (
        <li className={`operational-action status-${action.status}`} key={action.ref}>
          <label className="task-check"><input checked={action.completed} onChange={() => onToggle(action.ref)} type="checkbox" /><span /></label>
          <button className="operational-action-main" onClick={() => setEditing(action)} type="button"><strong>{action.title}</strong><span>{action.projectTitle || "Azione indipendente"}</span><small>{[action.context && `@${action.context}`, action.energy && `energia ${ENERGY_LABELS[action.energy].toLowerCase()}`, action.estimatedMinutes && `${action.estimatedMinutes} min`, STATUS_LABELS[action.status]].filter(Boolean).join(" · ")}</small></button>
          <div className="row-actions compact-row-actions"><button aria-label={`Sposta prima ${action.title}`} disabled={index === 0} onClick={() => onMoveOrder(action.ref, -1)} type="button">Su</button><button aria-label={`Sposta dopo ${action.title}`} disabled={index === visible.length - 1} onClick={() => onMoveOrder(action.ref, 1)} type="button">Giù</button></div>
        </li>
      ))}</ul> : <p className="empty-state">Nessuna azione corrisponde ai filtri. Allarga il contesto oppure crea una prossima azione nel Sistema.</p>}

      {editing && <ActionModal action={editing} onClose={() => setEditing(null)} onDelete={(ref) => { onDelete(ref); setEditing(null); }} onSave={(input) => { const original = parseActionRef(editing.ref); onSave({ ...input, originalSource: original.source }); setEditing(null); }} projects={projects} />}
    </section>
  );
}
