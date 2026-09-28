import { useEffect, useState } from "react";
import {
  formatNumber,
  habitProgressForDate,
  isHabitDueOnDate,
} from "../lib/habits.js";
import { AreaBadge, ProgressBar } from "./ProgressUi.jsx";

function HabitQuickLog({ area, habit, logs, onLog, today }) {
  const progress = habitProgressForDate(habit, logs, today);
  const todayLog = logs.find((log) => log.habitId === habit.id && log.date === today);
  const [draft, setDraft] = useState(String(todayLog?.quantity ?? progress.amount ?? 0));

  useEffect(() => {
    setDraft(String(todayLog?.quantity ?? progress.amount ?? 0));
  }, [progress.amount, todayLog?.quantity]);

  function saveQuantity(value) {
    const quantity = Math.max(0, Number(value) || 0);
    setDraft(String(quantity));
    onLog(habit.id, { date: today, quantity });
  }

  const isWeekly = habit.frequency === "weekly";
  const unit = isWeekly ? "sessioni" : habit.unit || "unità";

  return (
    <li className="today-habit-card">
      <div className="today-habit-heading">
        <div>
          <strong>{habit.name}</strong>
          <div className="habit-meta-line">
            <AreaBadge area={area} subtle />
            {habit.scheduledTime && <span>{habit.scheduledTime}</span>}
          </div>
        </div>
        <span className="habit-progress-label">
          {formatNumber(progress.amount)} / {formatNumber(progress.target)} {unit}
          {isWeekly ? " questa settimana" : ""}
        </span>
      </div>

      <ProgressBar
        color={area?.color}
        label={`Ritmo di ${habit.name}: ${Math.round(progress.percentage)}%`}
        value={progress.percentage}
      />

      {isWeekly ? (
        <button
          className="secondary-button habit-complete-button"
          disabled={Boolean(todayLog?.completed)}
          onClick={() =>
            onLog(habit.id, {
              date: today,
              completed: true,
              quantity: habit.type === "quantitative" ? 1 : undefined,
            })
          }
          type="button"
        >
          {todayLog?.completed ? "Sessione registrata" : "Registra sessione"}
        </button>
      ) : habit.type === "boolean" ? (
        <button
          className={`secondary-button habit-complete-button ${
            todayLog?.completed ? "is-complete" : ""
          }`}
          onClick={() =>
            onLog(habit.id, { date: today, completed: !todayLog?.completed })
          }
          type="button"
        >
          {todayLog?.completed ? "Completata" : "Completa"}
        </button>
      ) : (
        <div className="quantity-stepper">
          <button
            aria-label={`Riduci ${habit.name}`}
            onClick={() => saveQuantity((Number(draft) || 0) - 1)}
            type="button"
          >
            −
          </button>
          <label>
            <span className="visually-hidden">Quantità per {habit.name}</span>
            <input
              inputMode="decimal"
              min="0"
              onBlur={() => saveQuantity(draft)}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              step="any"
              type="number"
              value={draft}
            />
            <span>{habit.unit || "unità"}</span>
          </label>
          <button
            aria-label={`Aumenta ${habit.name}`}
            onClick={() => saveQuantity((Number(draft) || 0) + 1)}
            type="button"
          >
            +
          </button>
        </div>
      )}
    </li>
  );
}

export default function TodayHabits({
  areas,
  habits,
  logs,
  onLog,
  onOpenHabits,
  today,
}) {
  const dueHabits = habits.filter(
    (habit) => habit.status === "active" && isHabitDueOnDate(habit, today),
  );

  return (
    <section className="panel today-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Oggi</p>
          <h2>Abitudini rilevanti</h2>
        </div>
        <div className="section-heading-actions">
          <button
            className="text-link-button"
            onClick={onOpenHabits}
            type="button"
          >
            Vai alle abitudini
          </button>
          <span className="counter">{dueHabits.length}</span>
        </div>
      </div>

      {dueHabits.length === 0 ? (
        <p className="empty-state">Nessuna abitudine prevista oggi.</p>
      ) : (
        <ul className="today-habit-list">
          {dueHabits.map((habit) => (
            <HabitQuickLog
              area={areas.find((area) => area.id === habit.areaId)}
              habit={habit}
              key={habit.id}
              logs={logs}
              onLog={onLog}
              today={today}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
