import { useState } from "react";

export default function ScheduleTaskModal({
  initialDate,
  onClose,
  onSubmit,
  sourceTask,
}) {
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  function handleSubmit(event) {
    event.preventDefault();

    if (!date) {
      return;
    }

    onSubmit({ date, startTime, endTime });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="schedule-task-modal-title"
        aria-modal="true"
        className="modal"
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Pianificazione</p>
            <h2 id="schedule-task-modal-title">Pianifica nel calendario</h2>
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

        <div className="schedule-source-summary">
          <strong>{sourceTask.title}</strong>
          {sourceTask.sourceProjectTitle && (
            <span>Progetto: {sourceTask.sourceProjectTitle}</span>
          )}
          <small>La task originale resterà nella sua lista.</small>
        </div>

        <form className="task-form" onSubmit={handleSubmit}>
          <label>
            Data
            <input
              autoFocus
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
                disabled={!startTime}
                onChange={(event) => setEndTime(event.target.value)}
                type="time"
                value={endTime}
              />
            </label>
          </div>

          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Annulla
            </button>
            <button className="submit-button" disabled={!date} type="submit">
              Aggiungi al calendario
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
