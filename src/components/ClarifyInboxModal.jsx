import { useMemo, useState } from "react";

const ACTION_DESTINATIONS = [
  { value: "projects", label: "Progetti" },
  { value: "agenda", label: "Agenda" },
  { value: "waiting-for", label: "In attesa" },
  { value: "next-actions", label: "Lista prossime azioni" },
];

const NON_ACTION_DESTINATIONS = [
  { value: "trash", label: "Cestina" },
  { value: "someday", label: "Prima o poi / Forse" },
  { value: "archive", label: "Archivio" },
];

export default function ClarifyInboxModal({
  item,
  onClose,
  onSubmit,
  projects,
  today,
}) {
  const [clarifiedText, setClarifiedText] = useState(
    item.clarifiedText || item.originalText,
  );
  const [actionable, setActionable] = useState("yes");
  const [projectId, setProjectId] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [nextActionTitle, setNextActionTitle] = useState("");
  const [destination, setDestination] = useState("next-actions");
  const [nonActionableDestination, setNonActionableDestination] =
    useState("trash");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const needsProject = destination === "projects";
  const canSubmit = useMemo(() => {
    if (!clarifiedText.trim()) {
      return false;
    }

    if (actionable === "no") {
      return Boolean(nonActionableDestination);
    }

    if (needsProject && !projectId && !newProjectTitle.trim()) {
      return false;
    }

    if (destination === "agenda" && !date) {
      return false;
    }

    return true;
  }, [
    actionable,
    clarifiedText,
    date,
    destination,
    needsProject,
    newProjectTitle,
    nonActionableDestination,
    projectId,
  ]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsSaving(true);
    setSaveError("");
    try {
      await onSubmit({
      actionable: actionable === "yes",
      clarifiedText,
      date,
      description,
      destination,
      endTime,
      newProjectTitle,
      nextActionTitle,
      nonActionableDestination,
      projectId,
      startTime,
      attachments,
    });
    } catch (error) {
      setSaveError(error.message || "Impossibile salvare gli allegati.");
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="clarify-modal-title"
        aria-modal="true"
        className="modal clarify-modal"
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Chiarimento</p>
            <h2 id="clarify-modal-title">Cos'e'?</h2>
          </div>
          <button
            aria-label="Chiudi"
            className="ghost-button"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        <form className="task-form" onSubmit={handleSubmit}>
          <label>
            Cos'e'?
            <textarea
              autoFocus
              onChange={(event) => setClarifiedText(event.target.value)}
              value={clarifiedText}
            />
          </label>

          <fieldset>
            <legend>E' azionabile?</legend>
            <div className="segmented-control segmented-control--wide">
              <button
                className={actionable === "yes" ? "is-selected" : ""}
                onClick={() => setActionable("yes")}
                type="button"
              >
                Si
              </button>
              <button
                className={actionable === "no" ? "is-selected" : ""}
                onClick={() => setActionable("no")}
                type="button"
              >
                No
              </button>
            </div>
          </fieldset>

          {actionable === "yes" ? (
            <>
              <fieldset>
                <legend>Progetto / risultato</legend>
                <label>
                  Progetto esistente
                  <select
                    onChange={(event) => {
                      setProjectId(event.target.value);
                      if (event.target.value) {
                        setNewProjectTitle("");
                      }
                    }}
                    value={projectId}
                  >
                    <option value="">Nessun progetto</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nuovo progetto
                  <input
                    onChange={(event) => {
                      setNewProjectTitle(event.target.value);
                      if (event.target.value.trim()) {
                        setProjectId("");
                      }
                    }}
                    placeholder="Facoltativo"
                    type="text"
                    value={newProjectTitle}
                  />
                </label>
              </fieldset>

              <label>
                Qual e' la prossima azione?
                <input
                  onChange={(event) => setNextActionTitle(event.target.value)}
                  placeholder="Facoltativa: se vuota useremo il nome dell'elemento"
                  type="text"
                  value={nextActionTitle}
                />
              </label>

              <fieldset>
                <legend>Destinazione</legend>
                <div className="destination-grid">
                  {ACTION_DESTINATIONS.map((itemDestination) => (
                    <button
                      className={
                        destination === itemDestination.value
                          ? "is-selected"
                          : ""
                      }
                      key={itemDestination.value}
                      onClick={() => setDestination(itemDestination.value)}
                      type="button"
                    >
                      {itemDestination.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {destination === "agenda" && (
                <fieldset>
                  <legend>Calendario</legend>
                  <label>
                    Data
                    <input
                      onChange={(event) => setDate(event.target.value)}
                      required
                      type="date"
                      value={date}
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Ora inizio
                      <input
                        onChange={(event) => setStartTime(event.target.value)}
                        type="time"
                        value={startTime}
                      />
                    </label>
                    <label>
                      Ora fine
                      <input
                        onChange={(event) => setEndTime(event.target.value)}
                        type="time"
                        value={endTime}
                      />
                    </label>
                  </div>
                </fieldset>
              )}

              {destination === "waiting-for" && (
                <label>
                  Descrizione
                  <textarea
                    onChange={(event) => setDescription(event.target.value)}
                    value={description}
                  />
                </label>
              )}
            </>
          ) : (
            <>
              <fieldset>
                <legend>Destinazione</legend>
                <div className="destination-grid">
                  {NON_ACTION_DESTINATIONS.map((itemDestination) => (
                    <button
                      className={
                        nonActionableDestination === itemDestination.value
                          ? "is-selected"
                          : ""
                      }
                      key={itemDestination.value}
                      onClick={() =>
                        setNonActionableDestination(itemDestination.value)
                      }
                      type="button"
                    >
                      {itemDestination.label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {nonActionableDestination !== "trash" && (
                <label>
                  Descrizione
                  <textarea
                    onChange={(event) => setDescription(event.target.value)}
                    value={description}
                  />
                </label>
              )}
              {nonActionableDestination === "archive" && (
                <label className="attachment-picker">
                  Allegati
                  <input
                    multiple
                    onChange={(event) => setAttachments(Array.from(event.target.files || []))}
                    type="file"
                  />
                  <span>Puoi selezionare file di qualsiasi tipo.</span>
                  {attachments.length > 0 && (
                    <ul>
                      {attachments.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}
                    </ul>
                  )}
                </label>
              )}
            </>
          )}

          {saveError && <p className="form-error" role="alert">{saveError}</p>}

          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Annulla
            </button>
            <button className="submit-button" disabled={!canSubmit || isSaving} type="submit">
              {isSaving ? "Caricamento..." : "Salva"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
