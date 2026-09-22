import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, dateKey, parseDateKey } from "../utils/date.js";
import ScheduleTaskModal from "./ScheduleTaskModal.jsx";
import {
  CALENDAR_ITEM_DRAG_TYPE,
  parseTaskDragPayload,
  TASK_DRAG_TYPE,
} from "../lib/calendarScheduling.js";

const TOUCH_DRAG_DELAY_MS = 320;
const TOUCH_MOVE_TOLERANCE_PX = 10;
const TOUCH_EDGE_SCROLL_ZONE_PX = 72;
const TOUCH_EDGE_SCROLL_SPEED_PX = 12;

function formatDayLabel(value) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
  }).format(parseDateKey(value));
}

function formatWeekTitle(days) {
  const firstDay = parseDateKey(days[0]);
  const lastDay = parseDateKey(days[days.length - 1]);
  const sameMonth = firstDay.getMonth() === lastDay.getMonth();
  const firstLabel = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: sameMonth ? undefined : "short",
  }).format(firstDay);
  const lastLabel = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
  }).format(lastDay);

  return `${firstLabel} - ${lastLabel}`;
}

function formatMonthTitle(value) {
  return new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
  }).format(parseDateKey(value));
}

function startOfWeek(value) {
  const date = parseDateKey(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return dateKey(date);
}

function getMonthDays(value) {
  const date = parseDateKey(value);
  const year = date.getFullYear();
  const month = date.getMonth();
  const days = [];
  const cursor = new Date(year, month, 1);

  while (cursor.getMonth() === month) {
    days.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function addMonths(value, amount) {
  const date = parseDateKey(value);
  return dateKey(new Date(date.getFullYear(), date.getMonth() + amount, 1));
}

function sortItems(items) {
  return [...items].sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }

    return (left.startTime || "99:99").localeCompare(right.startTime || "99:99");
  });
}

function EventModal({ item, onClose, onDelete, onSubmit, today }) {
  const [title, setTitle] = useState(item?.title || "");
  const [description, setDescription] = useState(item?.description || "");
  const [date, setDate] = useState(item?.date || today);
  const [startTime, setStartTime] = useState(item?.startTime || "");
  const [endTime, setEndTime] = useState(item?.endTime || "");
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();

    if (!title.trim() || !date) {
      return;
    }

    onSubmit({
      id: item?.id,
      title,
      description,
      date,
      startTime,
      endTime,
    });
  }

  function handleDelete() {
    if (!item) {
      return;
    }

    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true);
      return;
    }

    onDelete(item.id);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="calendar-modal-title"
        aria-modal="true"
        className="modal"
        role="dialog"
      >
        <div className="modal-heading">
          <h2 id="calendar-modal-title">
            {item ? "Modifica evento" : "Nuovo evento"}
          </h2>
          <button
            aria-label="Chiudi"
            className="ghost-button"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        {item && (
          <button
            className={`secondary-button danger-button event-delete-button ${
              isConfirmingDelete ? "is-confirming" : ""
            }`}
            onClick={handleDelete}
            type="button"
          >
            {isConfirmingDelete ? "Conferma elimina" : "Elimina evento"}
          </button>
        )}

        <form className="task-form" onSubmit={handleSubmit}>
          <label>
            Titolo
            <input
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              type="text"
              value={title}
            />
          </label>

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

          <label>
            Descrizione
            <textarea
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>

          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Annulla
            </button>
            <button className="submit-button" disabled={!title.trim()} type="submit">
              Salva
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export default function CalendarPanel({
  items,
  onDeleteItem,
  onSaveItem,
  onScheduleTask,
  today,
}) {
  const [view, setView] = useState("week");
  const [cursorDate, setCursorDate] = useState(today);
  const [editingItem, setEditingItem] = useState(null);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [dropTargetDate, setDropTargetDate] = useState(null);
  const [pendingTaskSchedule, setPendingTaskSchedule] = useState(null);
  const [touchDrag, setTouchDrag] = useState(null);
  const touchDragRef = useRef(null);
  const suppressClickUntilRef = useRef(0);
  const days = useMemo(() => {
    if (view === "month") {
      return getMonthDays(cursorDate);
    }

    const weekStart = startOfWeek(cursorDate);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [cursorDate, view]);
  const sortedItems = useMemo(() => sortItems(items), [items]);
  const periodTitle =
    view === "week" ? formatWeekTitle(days) : formatMonthTitle(cursorDate);

  function clearTouchDrag() {
    const currentDrag = touchDragRef.current;

    if (currentDrag?.activationTimer) {
      window.clearTimeout(currentDrag.activationTimer);
    }
    if (currentDrag?.scrollFrame) {
      window.cancelAnimationFrame(currentDrag.scrollFrame);
    }

    touchDragRef.current = null;
    setTouchDrag(null);
    setDropTargetDate(null);
  }

  function findDropTargetDate(clientX, clientY) {
    return document
      .elementFromPoint(clientX, clientY)
      ?.closest(".calendar-day[data-date]")
      ?.getAttribute("data-date") || null;
  }

  useEffect(() => {
    function handleTouchMove(event) {
      const currentDrag = touchDragRef.current;

      if (!currentDrag) {
        return;
      }

      if (event.touches.length !== 1) {
        clearTouchDrag();
        return;
      }

      const touch = event.touches[0];
      const movedDistance = Math.hypot(
        touch.clientX - currentDrag.startX,
        touch.clientY - currentDrag.startY,
      );

      if (!currentDrag.active) {
        if (movedDistance > TOUCH_MOVE_TOLERANCE_PX) {
          clearTouchDrag();
        }
        return;
      }

      event.preventDefault();
      currentDrag.clientX = touch.clientX;
      currentDrag.clientY = touch.clientY;
      const targetDate = findDropTargetDate(touch.clientX, touch.clientY);
      setDropTargetDate(targetDate);
      setTouchDrag((current) =>
        current
          ? { ...current, clientX: touch.clientX, clientY: touch.clientY }
          : current,
      );

      const scrollDirection =
        touch.clientY < TOUCH_EDGE_SCROLL_ZONE_PX
          ? -1
          : touch.clientY > window.innerHeight - TOUCH_EDGE_SCROLL_ZONE_PX
            ? 1
            : 0;

      if (scrollDirection !== currentDrag.scrollDirection) {
        if (currentDrag.scrollFrame) {
          window.cancelAnimationFrame(currentDrag.scrollFrame);
          currentDrag.scrollFrame = null;
        }

        currentDrag.scrollDirection = scrollDirection;

        if (scrollDirection) {
          const scrollAtEdge = () => {
            const activeDrag = touchDragRef.current;

            if (!activeDrag?.active || !activeDrag.scrollDirection) {
              return;
            }

            window.scrollBy(0, activeDrag.scrollDirection * TOUCH_EDGE_SCROLL_SPEED_PX);
            setDropTargetDate(
              findDropTargetDate(activeDrag.clientX, activeDrag.clientY),
            );
            activeDrag.scrollFrame = window.requestAnimationFrame(scrollAtEdge);
          };

          currentDrag.scrollFrame = window.requestAnimationFrame(scrollAtEdge);
        }
      }
    }

    function handleTouchEnd(event) {
      const currentDrag = touchDragRef.current;

      if (!currentDrag) {
        return;
      }

      if (!currentDrag.active) {
        clearTouchDrag();
        return;
      }

      event.preventDefault();
      const touch = event.changedTouches[0];
      const targetDate = touch
        ? findDropTargetDate(touch.clientX, touch.clientY)
        : null;

      suppressClickUntilRef.current = performance.now() + 500;
      clearTouchDrag();

      if (targetDate && targetDate !== currentDrag.item.date) {
        onSaveItem({ ...currentDrag.item, date: targetDate });
      }
    }

    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: false });
    document.addEventListener("touchcancel", clearTouchDrag);

    return () => {
      const currentDrag = touchDragRef.current;
      if (currentDrag?.activationTimer) {
        window.clearTimeout(currentDrag.activationTimer);
      }
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", clearTouchDrag);
    };
  }, [onSaveItem]);

  function handleEventTouchStart(event, item) {
    if (event.touches.length !== 1) {
      clearTouchDrag();
      return;
    }

    const touch = event.touches[0];
    const eventRect = event.currentTarget.getBoundingClientRect();
    const pendingDrag = {
      active: false,
      activationTimer: null,
      clientX: touch.clientX,
      clientY: touch.clientY,
      grabOffsetX: touch.clientX - eventRect.left,
      grabOffsetY: touch.clientY - eventRect.top,
      item,
      scrollDirection: 0,
      scrollFrame: null,
      startX: touch.clientX,
      startY: touch.clientY,
      width: eventRect.width,
    };

    pendingDrag.activationTimer = window.setTimeout(() => {
      const currentDrag = touchDragRef.current;

      if (currentDrag !== pendingDrag) {
        return;
      }

      currentDrag.active = true;
      currentDrag.activationTimer = null;
      setDropTargetDate(item.date);
      setTouchDrag({ ...currentDrag });
    }, TOUCH_DRAG_DELAY_MS);

    touchDragRef.current = pendingDrag;
  }

  function moveCursor(direction) {
    setCursorDate((currentDate) =>
      view === "week" ? addDays(currentDate, direction * 7) : addMonths(currentDate, direction),
    );
  }

  function handleDayDragOver(event, day) {
    const acceptedTypes = [TASK_DRAG_TYPE, CALENDAR_ITEM_DRAG_TYPE];
    const dragTypes = Array.from(event.dataTransfer.types || []);

    if (!acceptedTypes.some((type) => dragTypes.includes(type))) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = dragTypes.includes(TASK_DRAG_TYPE)
      ? "copy"
      : "move";
    setDropTargetDate(day);
  }

  function handleDayDrop(event, day) {
    event.preventDefault();
    setDropTargetDate(null);

    const taskPayload = parseTaskDragPayload(
      event.dataTransfer.getData(TASK_DRAG_TYPE),
    );

    if (taskPayload) {
      setPendingTaskSchedule({ sourceTask: taskPayload, date: day });
      return;
    }

    const calendarItemId = event.dataTransfer.getData(CALENDAR_ITEM_DRAG_TYPE);
    const calendarItem = items.find((item) => item.id === calendarItemId);

    if (calendarItem && calendarItem.date !== day) {
      onSaveItem({ ...calendarItem, date: day });
    }
  }

  return (
    <section className="panel calendar-panel">
      <div className="calendar-heading">
        <div>
          <p className="eyebrow">Calendario Kaizen</p>
          <h2>{view === "week" ? "Settimana" : "Mese"}</h2>
        </div>
        <div className="segmented-control calendar-view-toggle" aria-label="Vista calendario">
          <button
            className={view === "week" ? "is-selected" : ""}
            onClick={() => setView("week")}
            type="button"
          >
            Settimana
          </button>
          <button
            className={view === "month" ? "is-selected" : ""}
            onClick={() => setView("month")}
            type="button"
          >
            Mese
          </button>
        </div>
      </div>

      <div className="calendar-control-row">
        <button
          aria-label="Periodo precedente"
          className="ghost-button calendar-nav-button"
          onClick={() => moveCursor(-1)}
          type="button"
        >
          {"<"}
        </button>
        <strong>{periodTitle}</strong>
        <button
          aria-label="Periodo successivo"
          className="ghost-button calendar-nav-button"
          onClick={() => moveCursor(1)}
          type="button"
        >
          {">"}
        </button>
        <button
          aria-label="Nuovo evento"
          className="add-button icon-add-button calendar-add-button"
          onClick={() => setIsCreatingItem(true)}
          type="button"
        >
          <span aria-hidden="true">+</span>
        </button>
      </div>

      <div className="calendar-desktop-actions">
        <div className="calendar-actions">
          <div className="segmented-control" aria-label="Vista calendario">
            <button
              className={view === "week" ? "is-selected" : ""}
              onClick={() => setView("week")}
              type="button"
            >
              Settimana
            </button>
            <button
              className={view === "month" ? "is-selected" : ""}
              onClick={() => setView("month")}
              type="button"
            >
              Mese
            </button>
          </div>
          <button
            aria-label="Evento precedente"
            className="ghost-button calendar-nav-button"
            onClick={() => moveCursor(-1)}
            type="button"
          >
            {"<"}
          </button>
          <button
            aria-label="Evento successivo"
            className="ghost-button calendar-nav-button"
            onClick={() => moveCursor(1)}
            type="button"
          >
            {">"}
          </button>
          <button
            aria-label="Nuovo evento"
            className="add-button icon-add-button"
            onClick={() => setIsCreatingItem(true)}
            type="button"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
      </div>

      <div className={`calendar-grid calendar-grid--${view}`}>
        {days.map((day) => {
          const dayItems = sortedItems.filter((item) => item.date === day);
          const isToday = day === today;

          return (
            <article
              className={`calendar-day ${isToday ? "is-today" : ""} ${
                dropTargetDate === day ? "is-drop-target" : ""
              }`}
              data-date={day}
              key={day}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setDropTargetDate(null);
                }
              }}
              onDragOver={(event) => handleDayDragOver(event, day)}
              onDrop={(event) => handleDayDrop(event, day)}
            >
              <div className="calendar-day-heading">
                <strong>{formatDayLabel(day)}</strong>
                {isToday && <span>Oggi</span>}
              </div>

              {dayItems.length === 0 ? (
                <span className="calendar-empty">Libero</span>
              ) : (
                <div className="calendar-events">
                  {dayItems.map((item) => (
                    <button
                      className={`calendar-event ${
                        touchDrag?.item.id === item.id ? "is-touch-dragging" : ""
                      }`}
                      draggable
                      key={item.id}
                      onClick={(event) => {
                        if (performance.now() < suppressClickUntilRef.current) {
                          event.preventDefault();
                          return;
                        }

                        setEditingItem(item);
                      }}
                      onContextMenu={(event) => {
                        if (touchDragRef.current?.item.id === item.id) {
                          event.preventDefault();
                        }
                      }}
                      onDragEnd={() => setDropTargetDate(null)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          CALENDAR_ITEM_DRAG_TYPE,
                          item.id,
                        );
                      }}
                      onTouchStart={(event) => handleEventTouchStart(event, item)}
                      type="button"
                    >
                      <span>{item.startTime || "Tutto il giorno"}</span>
                      <strong>{item.title}</strong>
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>

      {touchDrag && (
        <div
          aria-hidden="true"
          className="calendar-event calendar-event-drag-overlay"
          style={{
            left: touchDrag.clientX - touchDrag.grabOffsetX,
            top: touchDrag.clientY - touchDrag.grabOffsetY,
            width: touchDrag.width,
          }}
        >
          <span>{touchDrag.item.startTime || "Tutto il giorno"}</span>
          <strong>{touchDrag.item.title}</strong>
        </div>
      )}

      {(editingItem || isCreatingItem) && (
        <EventModal
          item={editingItem}
          onClose={() => {
            setEditingItem(null);
            setIsCreatingItem(false);
          }}
          onDelete={(itemId) => {
            onDeleteItem(itemId);
            setEditingItem(null);
            setIsCreatingItem(false);
          }}
          onSubmit={(itemInput) => {
            onSaveItem(itemInput);
            setEditingItem(null);
            setIsCreatingItem(false);
          }}
          today={today}
        />
      )}

      {pendingTaskSchedule && (
        <ScheduleTaskModal
          initialDate={pendingTaskSchedule.date}
          onClose={() => setPendingTaskSchedule(null)}
          onSubmit={(schedule) => {
            onScheduleTask(pendingTaskSchedule.sourceTask, schedule);
            setPendingTaskSchedule(null);
          }}
          sourceTask={pendingTaskSchedule.sourceTask}
        />
      )}
    </section>
  );
}
