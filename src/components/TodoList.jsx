import { getTaskTypeLabel } from "../constants/tasks.js";
import { completionKey } from "../utils/date.js";

export default function TodoList({
  completions,
  date,
  onDeleteTask,
  onPostponeTask,
  onToggleTask,
  tasks,
}) {
  const completedTasks = tasks.filter((task) =>
    Boolean(completions[completionKey(date, task.id)]),
  ).length;

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Oggi</p>
          <h2>To Do List</h2>
        </div>
        <span className="counter task-counter">
          <strong>{completedTasks}</strong>
          <span>/</span>
          <span>{tasks.length}</span>
        </span>
      </div>

      {tasks.length === 0 ? (
        <p className="empty-state">
          Nessuna task prevista per oggi. La streak resta ferma.
        </p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => {
            const isCompleted = Boolean(completions[completionKey(date, task.id)]);
            const postponeCount = Number(task.postponeCount) || 0;

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
                  <div className="task-meta">
                    <small className={`task-type task-type--${task.type}`}>
                      {getTaskTypeLabel(task.type)}
                    </small>
                    {postponeCount > 0 && (
                      <small className="postpone-badge">
                        ↻ Rimandata {postponeCount}{" "}
                        {postponeCount === 1 ? "volta" : "volte"}
                      </small>
                    )}
                  </div>
                </div>

                <div className="task-actions">
                  {!isCompleted && (
                    <button
                      className="postpone-button"
                      onClick={() => onPostponeTask(task.id)}
                      type="button"
                    >
                      Oggi no
                    </button>
                  )}
                  <button
                    aria-label={`Elimina ${task.title}`}
                    className="delete-button"
                    onClick={() => onDeleteTask(task.id)}
                    type="button"
                  >
                    x
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
