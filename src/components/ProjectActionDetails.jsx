import { createContext, useContext, useState } from "react";
import { checklistProgress, orphanSubActions, subActionsFor } from "../lib/subActions.js";
import { ProgressBar } from "./ProgressUi.jsx";

export const ProjectActionsContext = createContext(null);

function SubActionRow({ item, index, total, hasConflicts, onCommand }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [editingRevision, setEditingRevision] = useState(item.id);
  function rename(event) {
    event.preventDefault();
    if (!title.trim()) return;
    onCommand({ type: "rename", id: editingRevision, title });
    setEditing(false);
  }
  return (
    <li className="sub-action-row" data-sub-action-id={item.id}>
      <label className="sub-action-check">
        <input type="checkbox" checked={Boolean(item.completed)} aria-label={`Completa sotto-azione ${item.title}`}
          onChange={() => onCommand({ type: "toggle", id: item.id })} />
        {!editing && <span className={item.completed ? "sub-action-done" : ""}>{item.title}</span>}
      </label>
      {editing && <form className="sub-action-rename" onSubmit={rename}>
        <input aria-label="Rinomina sotto-azione" autoFocus value={title} maxLength={500} onChange={(event) => setTitle(event.target.value)} />
        <button className="text-link-button" type="submit" disabled={!title.trim()}>Salva</button>
        <button className="text-link-button" type="button" onClick={() => setEditing(false)}>Annulla</button>
      </form>}
      <div className="sub-action-controls">
        <button type="button" className="text-link-button" aria-label={`Rinomina ${item.title}`} onClick={() => { setTitle(item.title); setEditingRevision(item.id); setEditing(true); }}>Rinomina</button>
        <button type="button" className="text-link-button" aria-label={`Sposta su ${item.title}`} disabled={hasConflicts || index === 0} onClick={() => onCommand({ type: "move", id: item.id, direction: -1 })}>↑</button>
        <button type="button" className="text-link-button" aria-label={`Sposta giù ${item.title}`} disabled={hasConflicts || index === total - 1} onClick={() => onCommand({ type: "move", id: item.id, direction: 1 })}>↓</button>
        <button type="button" className="text-link-button" aria-label={`Elimina ${item.title}`} onClick={() => onCommand({ type: "delete", id: item.id })}>Elimina</button>
      </div>
      {item.conflictOf && <div className="sub-action-conflict" role="status">
        <p>{item.deletionConflict ? "Eliminazione e modifica in conflitto." : "Modifiche contemporanee conservate."} Confronta le versioni prima di scegliere. Il riordino resta sospeso finché risolvi il conflitto.</p>
        <button type="button" className="secondary-button" onClick={() => onCommand({ type: "useConflict", id: item.id })}>Usa questa versione</button>
        <button type="button" className="text-link-button" onClick={() => onCommand({ type: "discardConflict", id: item.id })}>Scarta questa versione</button>
      </div>}
    </li>
  );
}

export default function ProjectActionDetails({ action }) {
  const context = useContext(ProjectActionsContext);
  const [title, setTitle] = useState("");
  if (!context) return null;
  const { data, onCommand, onPatchAction } = context;
  const items = subActionsFor(data.subActions, action.id);
  const progress = checklistProgress(items);
  function add(event) {
    event.preventDefault();
    if (!title.trim()) return;
    onCommand({ type: "create", parentActionId: action.id, title });
    setTitle("");
  }
  return (
    <div className="project-action-details" onDragStart={(event) => event.stopPropagation()}>
      <button type="button" className="text-link-button" aria-pressed={Boolean(action.showInNextActions)}
        onClick={() => onPatchAction(action.id, { showInNextActions: !action.showInNextActions })}>
        {action.showInNextActions ? "Rimuovi da Prossime Azioni" : "Mostra in Prossime Azioni"}
      </button>
      <details className="sub-actions">
        <summary>Sotto-azioni {progress.total ? `· ${progress.completed}/${progress.total}` : "· aggiungi"}{progress.hasConflicts ? " · da rivedere" : ""}</summary>
        {progress.total > 0 && <ProgressBar value={progress.percentage} label={`Sotto-azioni completate di ${action.title}`} />}
        <ul className="sub-action-list">
          {items.map((item, index) => <SubActionRow key={items.findIndex((other) => other.entityId === item.entityId) === index ? item.entityId : item.id} item={item} index={index} total={items.length} hasConflicts={progress.hasConflicts} onCommand={onCommand} />)}
        </ul>
        <form className="sub-action-add" onSubmit={add}>
          <input aria-label={`Nuova sotto-azione di ${action.title}`} placeholder="Aggiungi una sotto-azione…" value={title} maxLength={500} onChange={(event) => setTitle(event.target.value)} />
          <button type="submit" className="secondary-button" disabled={!title.trim()}>Aggiungi</button>
        </form>
      </details>
      {progress.ready && !action.completed && <div className="sub-action-proposal" role="status">
        <span>Tutte le sotto-azioni sono completate.</span>
        <button className="secondary-button" type="button" onClick={() => onPatchAction(action.id, { completed: true })}>Completa anche l’azione</button>
      </div>}
      {action.completed && progress.completed < progress.total && <p className="form-hint">L’azione è completata, ma alcune sotto-azioni sono aperte. Puoi riaprire l’azione con la sua casella.</p>}
    </div>
  );
}

export function OrphanSubActions() {
  const context = useContext(ProjectActionsContext);
  if (!context) return null;
  const items = orphanSubActions(context.data);
  const projects = new Set(context.data.projects.map((project) => project.id));
  const parents = context.data.projectActions.filter((action) => projects.has(action.projectId));
  if (!items.length) return null;
  return <section className="panel orphan-sub-actions">
    <h2>Sotto-azioni da ricollegare</h2>
    <p>L’azione o il progetto non è più presente. Queste informazioni sono conservate: puoi ricollegarle o eliminarle.</p>
    <ul className="sub-action-list">{items.map((item) => <li className="sub-action-row" key={item.id}>
      <span>{item.title}</span>
      <select aria-label={`Ricollega ${item.title}`} value="" onChange={(event) => context.onCommand({ type: "attach", id: item.id, parentActionId: event.target.value })}>
        <option value="" disabled>Scegli un’azione</option>
        {parents.map((action) => <option key={action.id} value={action.id}>{context.data.projects.find((project) => project.id === action.projectId)?.title} → {action.title}</option>)}
      </select>
      <button type="button" className="text-link-button" onClick={() => context.onCommand({ type: "delete", id: item.id })}>Elimina</button>
    </li>)}</ul>
  </section>;
}
