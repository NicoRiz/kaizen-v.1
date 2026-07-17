import { useState } from "react";
import { TASK_TYPES } from "../constants/tasks.js";
import { WEEK_DAYS } from "../utils/date.js";

export default function AddTaskModal({
  date,
  initialTask,
  onClose,
  onSubmit,
  requireDateChoice = false,
}) {
  const [title, setTitle] = useState(initialTask?.title || "");
  const [description, setDescription] = useState(
    initialTask?.description || "",
  );
  const [taskDate, setTaskDate] = useState(
    requireDateChoice ? "" : initialTask?.date || date,
  );
  const [type, setType] = useState(initialTask?.type || TASK_TYPES[0].value);
  const [repeatDays, setRepeatDays] = useState([]);

  function toggleRepeatDay(day) {
    setRepeatDays((currentDays) =>
      currentDays.includes(day)
        ? currentDays.filter((currentDay) => currentDay !== day)
        : [...currentDays, day],
    );
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!title.trim() || !taskDate) {
      return;
    }

    onSubmit({
      date: taskDate,
      description: description.trim(),
      repeatDays,
      title: title.trim(),
      type,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="add-task-title"
        className="modal"
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-heading">
          <h2 id="add-task-title">Nuova task</h2>
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
            Titolo
            <input
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Es. Allenamento"
              type="text"
              value={title}
            />
          </label>

          <label>
            Data
            <input
              onChange={(event) => setTaskDate(event.target.value)}
              required
              type="date"
              value={taskDate}
            />
          </label>

          <label>
            Tipo
            <select
              onChange={(event) => setType(event.target.value)}
              value={type}
            >
              {TASK_TYPES.map((taskType) => (
                <option key={taskType.value} value={taskType.value}>
                  {taskType.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Descrizione
            <textarea
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Aggiungi dettagli, contesto o note operative"
              value={description}
            />
          </label>

          <fieldset>
            <legend>Ripetizione settimanale</legend>
            <div className="weekday-grid">
              {WEEK_DAYS.map((day) => (
                <button
                  className={repeatDays.includes(day.value) ? "is-selected" : ""}
                  key={day.value}
                  onClick={() => toggleRepeatDay(day.value)}
                  type="button"
                >
                  {day.label}
                </button>
              ))}
            </div>
            <p>
              Nessun giorno selezionato significa nessuna ripetizione.
            </p>
          </fieldset>

          <button className="submit-button" type="submit">
            Aggiungi task
          </button>
        </form>
      </section>
    </div>
  );
}
