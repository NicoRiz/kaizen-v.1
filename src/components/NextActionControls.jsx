import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BasicItemModal } from './GtdPage.jsx';
import ProjectActionDetails from './ProjectActionDetails.jsx';
import ScheduleTaskModal from './ScheduleTaskModal.jsx';
import { createId } from '../lib/syncCore.js';

const options = [
  ['schedule', 'Sposta nel calendario', 'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2'],
  ['duplicate', 'Duplica in un progetto', 'M9 9h12v12H9zM5 15H3V3h12v2'],
  ['someday', 'Sposta in Prima o poi/Forse', 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
  ['edit', 'Modifica azione', 'm16 3 5 5-12 12-6 1 1-6ZM14 5l5 5'],
  ['delete', 'Elimina azione', 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7'],
];

// Keep focus inside a modal and restore it to a surviving control after a move.
function FocusLayer({ children, onClose }) {
  const root = useRef(null);
  const previousFocus = useRef(document.activeElement);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = previousFocus.current;
    const focusable = () => [...root.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')]
      .filter(element => element.getClientRects().length);
    if (!root.current.contains(document.activeElement)) focusable()[0]?.focus();
    function keydown(event) {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || !root.current.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.current.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (previous?.isConnected) previous.focus();
      else document.querySelector('#pending-next-actions button, [data-next-actions-panel]')?.focus();
    };
  }, []);
  return createPortal(<div ref={root}>{children}</div>, document.body);
}

export default function NextActionControls({ action, areas, projects, today, onCommand, onFeedback }) {
  const trigger = useRef(null);
  const menu = useRef(null);
  const menuId = useId();
  const submitting = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const [dialog, setDialog] = useState(null);
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState('');

  useLayoutEffect(() => {
    if (!open) return;
    const rect = trigger.current.getBoundingClientRect();
    const popup = menu.current.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft || 0, topEdge = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
    const top = rect.bottom + popup.height + 8 <= topEdge + height ? rect.bottom + 6 : rect.top - popup.height - 6;
    setPosition({ left: Math.max(leftEdge + 8, Math.min(rect.right - popup.width, leftEdge + width - popup.width - 8)),
      top: Math.max(topEdge + 8, Math.min(top, topEdge + height - popup.height - 8)) });
    menu.current.querySelector('button')?.focus();
    function outside(event) {
      if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
    }
    const dismiss = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    viewport?.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
      viewport?.removeEventListener('resize', dismiss);
    };
  }, [open]);

  function closeDialog() { setDialog(null); setError(''); }
  function execute(type, values = {}, operationId = dialog?.operationId) {
    if (submitting.current) return;
    submitting.current = true;
    try {
      const saved = onCommand({ ...values, type, actionId: action.id, sourceCollection: action.sourceCollection, operationId });
      if (saved === false) throw new Error('La modifica non è stata salvata. Riprova.');
      closeDialog();
      onFeedback({ text: ({ schedule: 'Azione spostata nel calendario.', duplicate: 'Copia aggiunta al progetto.', someday: 'Azione spostata in Prima o poi/Forse.', edit: 'Azione aggiornata.', delete: action.sourceCollection === 'projectActions' ? 'Azione rimossa da Prossime azioni. L’originale è nel progetto.' : 'Azione eliminata.' })[type] });
    } catch (failure) {
      submitting.current = false;
      if (type === 'someday') onFeedback({ error: true, text: failure.message });
      else setError(failure.message);
    }
  }
  function choose(type) {
    setOpen(false);
    trigger.current?.focus();
    setError('');
    submitting.current = false;
    const operationId = createId();
    if (type === 'someday') { execute(type, {}, operationId); return; }
    setProjectId(projects.some(project => project.id === action.projectId) ? action.projectId : projects[0]?.id || '');
    setDialog({ type, operationId });
  }
  function menuKeys(event) {
    const items = [...menu.current.querySelectorAll('[role="menuitem"]')];
    const index = items.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
    if (event.key === 'Escape' || event.key === 'Tab') {
      setOpen(false); trigger.current?.focus();
      if (event.key === 'Escape') event.preventDefault();
    }
  }
  return <>
    <button ref={trigger} className="ghost-button next-action-menu-trigger" type="button" aria-label={`Opzioni per ${action.title}`}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}
      onClick={() => setOpen(value => !value)}><span aria-hidden="true">···</span></button>
    {open && createPortal(<div id={menuId} ref={menu} role="menu" aria-label={`Gestisci ${action.title}`} className="next-action-menu" style={position} onKeyDown={menuKeys}>
      {options.map(([type, label, path]) => <button key={type} type="button" role="menuitem" tabIndex={-1}
        className={type === 'delete' ? 'next-action-menu-danger' : ''} onClick={() => choose(type)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>{label}
      </button>)}
    </div>, document.body)}
    {dialog && <FocusLayer onClose={closeDialog}>
      {dialog.type === 'schedule' ? <ScheduleTaskModal moving initialDate={today} error={error} onClose={closeDialog}
        sourceTask={{ title: action.title, sourceProjectTitle: projects.find(project => project.id === action.projectId)?.title }}
        onSubmit={schedule => execute('schedule', { schedule })} />
        : dialog.type === 'edit' ? <BasicItemModal item={{ ...action, description: action.description ?? action.clarifiedText ?? '' }} mode="Modifica azione"
          areas={action.sourceCollection === 'nextActions' ? areas : undefined} error={error} onClose={closeDialog} onSubmit={values => execute('edit', values)}>
          {action.sourceCollection === 'projectActions' && <ProjectActionDetails action={action} />}
        </BasicItemModal>
        : <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-labelledby={`${menuId}-dialog-title`}>
          <div className="modal-heading"><h2 id={`${menuId}-dialog-title`}>{dialog.type === 'duplicate' ? 'Duplica in un progetto' : 'Elimina azione'}</h2>
            <button type="button" className="ghost-button" aria-label="Chiudi" onClick={closeDialog}>x</button></div>
          <p className="next-action-dialog-title">{action.title}</p>
          {dialog.type === 'duplicate' ? projects.length ? <form className="task-form" onSubmit={event => { event.preventDefault(); execute('duplicate', { projectId }); }}>
            <label>Progetto di destinazione<select autoFocus value={projectId} onChange={event => setProjectId(event.target.value)} required>
              {projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select></label><p className="form-hint">La copia sarà indipendente. L’azione originale resterà in Prossime azioni.</p>
            {error && <p role="alert">{error}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeDialog}>Annulla</button><button type="submit" className="submit-button">Duplica azione</button></div>
          </form> : <><p className="empty-state">Non ci sono progetti. Crea un progetto nella sezione GTD per duplicare questa azione.</p><button type="button" className="secondary-button" onClick={closeDialog}>Chiudi</button></>
          : <><p>{action.sourceCollection === 'projectActions' ? 'Vuoi rimuovere questa azione da Prossime azioni? L’originale e le sotto-azioni resteranno nel progetto.' : 'Vuoi eliminare questa azione? Gli eventuali eventi già pianificati resteranno nel calendario, senza collegamento all’azione.'}</p>
            {error && <p role="alert">{error}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeDialog}>Annulla</button><button type="button" className="secondary-button danger-button" onClick={() => execute('delete')}>{action.sourceCollection === 'projectActions' ? 'Rimuovi da Prossime azioni' : 'Elimina azione'}</button></div></>}
        </section></div>}
    </FocusLayer>}
  </>;
}
