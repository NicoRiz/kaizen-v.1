import { useMemo, useState } from "react";
import { addDays, dateKey, parseDateKey } from "../utils/date.js";

function formatDayLabel(value) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(parseDateKey(value));
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

function EventModal({ item, onClose, onSubmit, today }) {
  const [title, setTitle] = useState(item?.title || "");
  const [description, setDescription] = useState(item?.description || "");
  const [date, setDate] = useState(item?.date || today);
  const [startTime, setStartTime] = useState(item?.startTime || "");
  const [endTime, setEndTime] = useState(item?.endTime || "");

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

export default function CalendarPanel({ items, onSaveItem, today }) {
  const [view, setView] = useState("week");
  const [cursorDate, setCursorDate] = useState(today);
  const [editingItem, setEditingItem] = useState(null);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const days = useMemo(() => {
    if (view === "month") {
      return getMonthDays(cursorDate);
    }

    const weekStart = startOfWeek(cursorDate);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  }, [cursorDate, view]);
  const sortedItems = useMemo(() => sortItems(items), [items]);

  function moveCursor(direction) {
    setCursorDate((currentDate) =>
      view === "week" ? addDays(currentDate, direction * 7) : addMonths(currentDate, direction),
    );
  }

  return (
    <section className="panel calendar-panel">
      <div className="section-heading calendar-heading">
        <div>
          <p className="eyebrow">Calendario Kaizen</p>
          <h2>{view === "week" ? "Settimana" : formatMonthTitle(cursorDate)}</h2>
        </div>
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

          return (
            <article className="calendar-day" key={day}>
              <div className="calendar-day-heading">
                <strong>{formatDayLabel(day)}</strong>
              </div>

              {dayItems.length === 0 ? (
                <span className="calendar-empty">Libero</span>
              ) : (
                <div className="calendar-events">
                  {dayItems.map((item) => (
                    <button
                      className="calendar-event"
                      key={item.id}
                      onClick={() => setEditingItem(item)}
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

      {(editingItem || isCreatingItem) && (
        <EventModal
          item={editingItem}
          onClose={() => {
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
    </section>
  );
}
