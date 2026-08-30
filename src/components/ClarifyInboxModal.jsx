import { useMemo, useState } from "react";
import Modal from "./Modal.jsx";

const ACTION_DESTINATIONS = [
  { value: "next-actions", label: "Prossime azioni" },
  { value: "projects", label: "Progetto" },
  { value: "agenda", label: "Calendario" },
  { value: "waiting-for", label: "In attesa" },
];
const NON_ACTION_DESTINATIONS = [
  { value: "trash", label: "Cestino" },
  { value: "someday", label: "Prima o poi / Forse" },
  { value: "archive", label: "Archivio" },
];
const STEP_TITLES = [
  "Che cos'è?",
  "È azionabile?",
  "Qual è il risultato desiderato?",
  "Qual è la prossima azione?",
  "Dove appartiene?",
];

export default function ClarifyInboxModal({ item, onClose, onSubmit, projects, today }) {
  const [step, setStep] = useState(0);
  const [clarifiedText, setClarifiedText] = useState(item.clarifiedText || item.originalText);
  const [actionable, setActionable] = useState(null);
  const [projectId, setProjectId] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [nextActionTitle, setNextActionTitle] = useState("");
  const [destination, setDestination] = useState("next-actions");
  const [nonActionableDestination, setNonActionableDestination] = useState("trash");
  const [description, setDescription] = useState("");
  const [waitingForPerson, setWaitingForPerson] = useState("");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const effectiveDestination = projectId || newProjectTitle.trim() ? "projects" : destination;
  const selectedProject = projects.find((project) => project.id === projectId);
  const steps = actionable === false ? [0, 1, 4] : [0, 1, 2, 3, 4];
  const visibleIndex = steps.indexOf(step);
  const isLastStep = visibleIndex === steps.length - 1;
  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(clarifiedText.trim());
    if (step === 1) return actionable !== null;
    if (step === 3) return Boolean(nextActionTitle.trim());
    if (step === 4 && actionable && effectiveDestination === "agenda") return Boolean(date);
    return true;
  }, [actionable, clarifiedText, date, effectiveDestination, step, nextActionTitle]);

  function goForward() {
    if (!canContinue) return;
    if (step === 1 && actionable === false) setStep(4);
    else setStep(steps[visibleIndex + 1]);
  }

  function goBack() {
    if (visibleIndex > 0) setStep(steps[visibleIndex - 1]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isLastStep || !canContinue) return;
    setIsSaving(true);
    setSaveError("");
    try {
      await onSubmit({ actionable, attachments, clarifiedText, date, description, destination: effectiveDestination, endTime, newProjectTitle, desiredOutcome, nextActionTitle, nonActionableDestination, projectId, startTime, waitingForPerson });
    } catch (error) {
      setSaveError(error?.message || "Impossibile salvare gli allegati.");
      setIsSaving(false);
    }
  }

  return (
    <Modal className="clarify-modal" labelId="clarify-modal-title" onClose={onClose}>
      <div className="modal-heading">
        <div>
          <p className="eyebrow">Chiarimento · {visibleIndex + 1}/{steps.length}</p>
          <h2 id="clarify-modal-title">{STEP_TITLES[step]}</h2>
        </div>
        <button aria-label="Chiudi chiarimento" className="ghost-button" onClick={onClose} type="button">Chiudi</button>
      </div>

      <div className="clarify-progress" aria-hidden="true">
        {steps.map((value, index) => <span className={index <= visibleIndex ? "is-active" : ""} key={value} />)}
      </div>

      <form className="task-form clarify-form" onSubmit={handleSubmit}>
        {step === 0 && (
          <label>
            Definisci con parole semplici ciò che hai catturato
            <textarea autoFocus onChange={(event) => setClarifiedText(event.target.value)} value={clarifiedText} />
          </label>
        )}

        {step === 1 && (
          <fieldset>
            <legend>Richiede un'azione concreta?</legend>
            <div className="choice-cards two-columns">
              <button className={actionable === true ? "is-selected" : ""} onClick={() => setActionable(true)} type="button"><strong>Sì</strong><span>Definisci il prossimo passo.</span></button>
              <button className={actionable === false ? "is-selected" : ""} onClick={() => setActionable(false)} type="button"><strong>No</strong><span>Archivia, rimanda o elimina.</span></button>
            </div>
          </fieldset>
        )}

        {step === 2 && (
          <fieldset>
            <legend>È parte di un progetto?</legend>
            <label>
              Progetto esistente
              <select value={projectId} onChange={(event) => { setProjectId(event.target.value); if (event.target.value) { setNewProjectTitle(""); setDestination("projects"); } }}>
                <option value="">Nessun progetto</option>
                {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
              </select>
            </label>
            {!projectId && (
              <label>
                Oppure crea un nuovo progetto
                <input onChange={(event) => { setNewProjectTitle(event.target.value); if (event.target.value.trim()) setDestination("projects"); }} placeholder="Titolo del progetto" type="text" value={newProjectTitle} />
              </label>
            )}
            {(projectId || newProjectTitle.trim()) && (
              <label>
                Risultato desiderato
                <textarea onChange={(event) => setDesiredOutcome(event.target.value)} placeholder="Come riconoscerai che il progetto è concluso?" value={desiredOutcome} />
              </label>
            )}
          </fieldset>
        )}

        {step === 3 && (
          <label>
            Scrivi un'azione fisica e visibile
            <input autoFocus onChange={(event) => setNextActionTitle(event.target.value)} placeholder="Esempio: chiama Marta per il preventivo" type="text" value={nextActionTitle} />
          </label>
        )}

        {step === 4 && (
          <>
            <fieldset>
              <legend>Destinazione</legend>
              <div className="choice-cards">
                {(actionable ? ACTION_DESTINATIONS : NON_ACTION_DESTINATIONS).map((option) => {
                  const selected = actionable ? effectiveDestination === option.value : nonActionableDestination === option.value;
                  return <button className={selected ? "is-selected" : ""} key={option.value} onClick={() => actionable ? setDestination(option.value) : setNonActionableDestination(option.value)} type="button">{option.label}</button>;
                })}
              </div>
            </fieldset>

            {actionable && effectiveDestination === "agenda" && (
              <div className="form-grid three-columns">
                <label>Data<input onChange={(event) => setDate(event.target.value)} type="date" value={date} /></label>
                <label>Inizio<input onChange={(event) => setStartTime(event.target.value)} type="time" value={startTime} /></label>
                <label>Fine<input onChange={(event) => setEndTime(event.target.value)} type="time" value={endTime} /></label>
              </div>
            )}
            {actionable && effectiveDestination === "waiting-for" && (
              <label>Persona o soggetto in attesa<input onChange={(event) => setWaitingForPerson(event.target.value)} value={waitingForPerson} /></label>
            )}
            {((actionable && effectiveDestination === "waiting-for") || (!actionable && nonActionableDestination !== "trash")) && (
              <label>Nota facoltativa<textarea onChange={(event) => setDescription(event.target.value)} value={description} /></label>
            )}
            {!actionable && nonActionableDestination === "archive" && (
              <label className="attachment-picker">Allegati facoltativi<input multiple onChange={(event) => setAttachments(Array.from(event.target.files || []))} type="file" /><span>Gli allegati richiedono la sincronizzazione cloud.</span>{attachments.length > 0 && <ul>{attachments.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}</ul>}</label>
            )}

            <section className="clarify-result" aria-label="Risultato del chiarimento">
              <p className="eyebrow">Risultato</p>
              <strong>{actionable ? ACTION_DESTINATIONS.find((entry) => entry.value === effectiveDestination)?.label : NON_ACTION_DESTINATIONS.find((entry) => entry.value === nonActionableDestination)?.label}</strong>
              {actionable && <p>Prossima azione: {nextActionTitle}</p>}
              {(selectedProject || newProjectTitle.trim()) && <p>Progetto: {selectedProject?.title || newProjectTitle}</p>}
              {effectiveDestination === "agenda" && <p>Data: {date}{startTime ? ` · ${startTime}` : ""}</p>}
              {effectiveDestination === "waiting-for" && waitingForPerson && <p>In attesa di: {waitingForPerson}</p>}
            </section>
          </>
        )}

        {saveError && <p className="form-error" role="alert">{saveError}</p>}
        <div className="modal-actions split-actions">
          <button className="secondary-button" disabled={visibleIndex === 0} onClick={goBack} type="button">Indietro</button>
          {isLastStep ? (
            <button className="submit-button" disabled={!canContinue || isSaving} type="submit">{isSaving ? "Caricamento…" : "Conferma destinazione"}</button>
          ) : (
            <button className="submit-button" disabled={!canContinue} onClick={goForward} type="button">Continua</button>
          )}
        </div>
      </form>
    </Modal>
  );
}
