import { useEffect, useState } from "react";
import {
  formatNumber,
  habitProgressForDate,
  canonicalHabitLogs,
} from "../lib/habits.js";
import { AreaBadge, ProgressBar } from "./ProgressUi.jsx";
import { selectHabitAttention } from "../lib/attention.js";
import AttentionBadge, { focusAttentionGroup } from "./AttentionBadge.jsx";

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
    <li className="today-habit-card" data-pending={progress.percentage < 100}>
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
          onClick={() =>
            onLog(habit.id, {
              date: today,
              completed: !todayLog?.completed,
              quantity: habit.type === "quantitative" ? (todayLog?.completed ? 0 : 1) : undefined,
            })
          }
          type="button"
        >
          {todayLog?.completed ? "Annulla sessione di oggi" : "Registra sessione"}
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
  const attention = selectHabitAttention(habits, logs, today);
  const displayLogs = canonicalHabitLogs(attention.logs);
  const groups = [
    { id: "daily-habits", title: "Quotidiane · oggi", habits: attention.daily, count: attention.dailyPending, label: "abitudini di oggi da completare", text: "oggi" },
    { id: "weekly-habits", title: "Settimanali · lun–dom", habits: attention.weekly, count: attention.weeklyPending, label: "obiettivi settimanali da completare", text: "settimana" },
  ];

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
        </div>
      </div>

      {attention.daily.length + attention.weekly.length === 0 ? (
        <p className="empty-state">Nessuna abitudine prevista oggi.</p>
      ) : (
        groups.filter((group) => group.habits.length > 0).map((group) => (
          <div className="habit-attention-group" key={group.id}>
            <div className="section-heading">
              <h3>{group.title}</h3>
              <AttentionBadge count={group.count} label={group.label} text={group.text} onClick={() => focusAttentionGroup(group.id)} />
            </div>
            <ul className="today-habit-list" id={group.id}>
              {group.habits.map((habit) => (
                <HabitQuickLog
                  area={areas.find((area) => area.id === habit.areaId)}
                  habit={habit}
                  key={`${habit.id}:${today}`}
                  logs={displayLogs}
                  onLog={onLog}
                  today={today}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
