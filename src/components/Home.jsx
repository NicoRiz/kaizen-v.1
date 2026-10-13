import { useContext, useMemo, useState } from "react";
import TodayPlan from './TodayPlan.jsx';
import { dayHeads, refKey } from '../lib/dayPlans.js';
import { ProjectActionsContext } from './ProjectActionDetails.jsx';
import AttentionBadge, { focusAttentionGroup, useAttention } from "./AttentionBadge.jsx";
import BottomNav from "./BottomNav.jsx";
import ClarifyInboxModal from "./ClarifyInboxModal.jsx";
import HomeSectionNav from "./HomeSectionNav.jsx";
import ScheduleTaskModal from "./ScheduleTaskModal.jsx";
import TodayHabits from "./TodayHabits.jsx";
import { AreaBadge } from "./ProgressUi.jsx";
import {
  createTaskDragPayload,
  TASK_DRAG_TYPE,
} from "../lib/calendarScheduling.js";
import { formatDisplayDate } from "../utils/date.js";
import { nextActionViews } from "../lib/subActions.js";
import { countPendingActions } from '../lib/attention.js';
import ProjectActionDetails from "./ProjectActionDetails.jsx";

function inboxCounterLabel(count) {
  if (count === 1) {
    return "1 cosa da chiarire";
  }

  return `${count} cose da chiarire`;
}

export default function Home({
  onDayCommand, onCreatePriority, onTogglePriority, onReschedulePriority, focusPlanDate,
  activeSection,
  areas,
  date,
  inboxItems,
  habitLogs,
  habits,
  nextActions,
  projectActions,
  onAddInboxItem,
  onClarifyInboxItem,
  onNavigate,
  onLogHabit,
  onScheduleTask,
  onToggleNextAction,
  onUpdateNextActionArea,
  projects,
}) {
  const [captureText, setCaptureText] = useState("");
  const attention = useAttention();
  const { data } = useContext(ProjectActionsContext);
  const priorityKeys = new Set(dayHeads(data.dayPlans, date).flatMap(plan => plan.priorities.map(p => refKey(p.ref))));
  const [clarifyingItem, setClarifyingItem] = useState(null);
  const [showCompletedActions, setShowCompletedActions] = useState(false);
  const [schedulingTask, setSchedulingTask] = useState(null);
  const openInboxItems = useMemo(
    () => inboxItems.filter((item) => item.status === "open"),
    [inboxItems],
  );
  const activeNextActions = useMemo(
    () =>
      nextActionViews({ nextActions, projectActions, projects })
        .filter(action => !priorityKeys.has(`${action.sourceCollection}:${action.id}`))
        .filter((action) => !action.completed)
        .sort((left, right) => (left.order || 0) - (right.order || 0)),
    [nextActions, projectActions, projects, data.dayPlans, date],
  );
  const completedNextActions = useMemo(
    () =>
      nextActionViews({ nextActions, projectActions, projects })
        .filter(action => !priorityKeys.has(`${action.sourceCollection}:${action.id}`))
        .filter((action) => action.completed)
        .sort(
          (left, right) =>
            new Date(right.completedAt || right.createdAt) -
            new Date(left.completedAt || left.createdAt),
        ),
    [nextActions, projectActions, projects, data.dayPlans, date],
  );

  function handleCapture(event) {
    event.preventDefault();
    onAddInboxItem(captureText);
    setCaptureText("");
  }

  return (
    <div className="app-shell">
      <main className="home">
        <header className="topbar">
          <div>
            <p className="eyebrow">{formatDisplayDate(date)}</p>
            <h1>Focus</h1>
          </div>
        </header>

        <HomeSectionNav activeSection="home" onNavigate={onNavigate} />

        <TodayPlan today={date} initialDate={focusPlanDate} onCommand={onDayCommand} onCreate={onCreatePriority} onToggle={onTogglePriority} onReschedule={onReschedulePriority} />

        <TodayHabits
          areas={areas}
          habits={habits}
          logs={habitLogs}
          onLog={onLogHabit}
          onOpenHabits={() => onNavigate("habits")}
          today={date}
        />

        <h2 className="other-activities-title">Altre attività</h2>

        <section className="panel capture-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Capture</p>
              <h2>Aggiungi cose alla Inbox</h2>
            </div>
          </div>

          <form className="quick-capture" onSubmit={handleCapture}>
            <input
              aria-label="Aggiungi cose alla Inbox"
              onChange={(event) => setCaptureText(event.target.value)}
              placeholder="Aggiungi qualcosa alla Inbox..."
              enterKeyHint="send"
              type="text"
              value={captureText}
            />
            <button
              aria-label="Aggiungi alla Inbox"
              className="add-button icon-add-button"
              disabled={!captureText.trim()}
              type="submit"
            >
              <span aria-hidden="true">&gt;</span>
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Inbox</p>
              <h2>{inboxCounterLabel(attention.inbox)}</h2>
            </div>
            <AttentionBadge count={attention.inbox} label="elementi da chiarire" onClick={() => setClarifyingItem(openInboxItems[0])} />
          </div>

          {openInboxItems.length === 0 ? (
            <p className="empty-state">0 cose da chiarire</p>
          ) : (
            <ul className="simple-list">
              {openInboxItems.map((item) => (
                <li className="simple-list-item" key={item.id}>
                  <button
                    className="simple-list-main"
                    onClick={() => setClarifyingItem(item)}
                    type="button"
                  >
                    <strong>{item.originalText}</strong>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Operativa</p>
              <h2>Prossime Azioni</h2>
            </div>
            <AttentionBadge count={countPendingActions(activeNextActions)} label="prossime azioni da completare" onClick={() => focusAttentionGroup("pending-next-actions")} />
          </div>

          {activeNextActions.length === 0 ? (
            <p className="empty-state">Nessuna prossima azione attiva.</p>
          ) : (
            <ul className="task-list" id="pending-next-actions">
              {activeNextActions.map((action) => (
                <li
                  className="task-item next-action-item schedulable-task"
                  draggable
                  key={`${action.sourceCollection}:${action.id}`}
                  data-project-action-id={action.sourceCollection === "projectActions" ? action.id : undefined}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData(
                      TASK_DRAG_TYPE,
                      createTaskDragPayload(action, action.sourceCollection),
                    );
                  }}
                >
                  <label className="task-check">
                    <input
                      checked={action.completed}
                      onChange={() => onToggleNextAction(action.id, action.sourceCollection)}
                      type="checkbox"
                    />
                    <span />
                  </label>
                  <div className="task-content">
                    <strong>{action.title}</strong>
                    {action.sourceCollection === "projectActions" && <small>Progetto: {projects.find((project) => project.id === action.projectId)?.title}</small>}
                    <AreaBadge
                      area={areas.find((area) => area.id === action.areaId)}
                      subtle
                    />
                  </div>
                  {action.sourceCollection === "nextActions" && <select
                    aria-label={`Area di ${action.title}`}
                    className="inline-area-select"
                    onChange={(event) =>
                      onUpdateNextActionArea(action.id, event.target.value || null)
                    }
                    value={action.areaId || ""}
                  >
                    <option value="">Senza Area</option>
                    {areas.filter((area) => area.status !== "archived").map((area) => (
                      <option key={area.id} value={area.id}>{area.name}</option>
                    ))}
                  </select>}
                  <button
                    aria-label={`Pianifica ${action.title} nel calendario`}
                    className="secondary-button schedule-button"
                    onClick={() =>
                      setSchedulingTask({
                        sourceCollection: action.sourceCollection,
                        sourceProjectId: action.projectId || null,
                        sourceTaskId: action.id,
                        title: action.title,
                        description: action.description || action.clarifiedText || "",
                      })
                    }
                    type="button"
                  >
                    Calendario
                  </button>
                  {action.sourceCollection === "projectActions" && <ProjectActionDetails action={action} />}
                </li>
              ))}
            </ul>
          )}

          <div className="completed-actions">
            <button
              aria-expanded={showCompletedActions}
              className="completed-toggle"
              onClick={() => setShowCompletedActions((isOpen) => !isOpen)}
              type="button"
            >
              <span>Completate ({completedNextActions.length})</span>
              <span aria-hidden="true">{showCompletedActions ? "^" : "v"}</span>
            </button>

            {showCompletedActions && (
              completedNextActions.length === 0 ? (
                <p className="empty-state compact-empty">
                  Nessuna azione completata.
                </p>
              ) : (
                <ul className="task-list completed-action-list">
                  {completedNextActions.map((action) => (
                    <li className="task-item is-completed" data-project-action-id={action.sourceCollection === "projectActions" ? action.id : undefined} key={`${action.sourceCollection}:${action.id}`}>
                      <label className="task-check">
                        <input
                          checked={action.completed}
                          onChange={() => onToggleNextAction(action.id, action.sourceCollection)}
                          type="checkbox"
                        />
                        <span />
                      </label>
                      <div className="task-content">
                        <strong>{action.title}</strong>
                        {action.sourceCollection === "projectActions" && <small>Progetto: {projects.find((project) => project.id === action.projectId)?.title}</small>}
                        {action.completedAt && (
                          <small className="completed-date">
                            Completata il{" "}
                            {new Intl.DateTimeFormat("it-IT", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }).format(new Date(action.completedAt))}
                          </small>
                        )}
                      </div>
                      {action.sourceCollection === "projectActions" && <ProjectActionDetails action={action} />}
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </section>
      </main>

      <BottomNav activeSection={activeSection} onNavigate={onNavigate} />

      {clarifyingItem && (
        <ClarifyInboxModal
          areas={areas}
          item={clarifyingItem}
          onClose={() => setClarifyingItem(null)}
          onSubmit={async (result) => {
            await onClarifyInboxItem(clarifyingItem.id, result);
            setClarifyingItem(null);
          }}
          projects={projects}
          today={date}
        />
      )}

      {schedulingTask && (
        <ScheduleTaskModal
          initialDate={date}
          onClose={() => setSchedulingTask(null)}
          onSubmit={(schedule) => {
            onScheduleTask(schedulingTask, schedule);
            setSchedulingTask(null);
          }}
          sourceTask={schedulingTask}
        />
      )}
    </div>
  );
}
