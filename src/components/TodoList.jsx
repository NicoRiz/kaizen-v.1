import { getTaskTypeLabel } from "../constants/tasks.js";
import { completionKey } from "../utils/date.js";

export default function TodoList({
  completions,
  date,
  onDeleteTask,
  onToggleTask,
  tasks,
}) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Oggi</p>
          <h2>To Do List</h2>
        </div>
        <span className="counter">{tasks.length}</span>
      </div>

      {tasks.length === 0 ? (
        <p className="empty-state">
          Nessuna task prevista per oggi. La streak resta ferma.
        </p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => {
            const isCompleted = Boolean(completions[completionKey(date, task.id)]);

            return (
              <li
                className={`task-item ${isCompleted ? "is-completed" : ""}`}
                key={task.id}
              >
                <label className="task-check">
                  <input
                    checked={isCompleted}
                    onChange={() => onToggleTask(task.id)}
                    type="checkbox"
                  />
                  <span />
                </label>

                <div className="task-content">
                  <strong>{task.title}</strong>
                  <small className={`task-type task-type--${task.type}`}>
                    {getTaskTypeLabel(task.type)}
                  </small>
                </div>

                <button
                  aria-label={`Elimina ${task.title}`}
                  className="delete-button"
                  onClick={() => onDeleteTask(task.id)}
                  type="button"
                >
                  x
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
