import { useMemo, useState } from "react";
import BottomNav from "./BottomNav.jsx";
import CalendarPanel from "./CalendarPanel.jsx";
import ClarifyInboxModal from "./ClarifyInboxModal.jsx";
import { formatDisplayDate } from "../utils/date.js";

function inboxCounterLabel(count) {
  if (count === 1) {
    return "1 cosa da chiarire";
  }

  return `${count} cose da chiarire`;
}

export default function Home({
  activeSection,
  calendarItems,
  date,
  inboxItems,
  nextActions,
  onAddInboxItem,
  onClarifyInboxItem,
  onNavigate,
  onSaveCalendarItem,
  onToggleNextAction,
  projects,
}) {
  const [captureText, setCaptureText] = useState("");
  const [clarifyingItem, setClarifyingItem] = useState(null);
  const openInboxItems = useMemo(
    () => inboxItems.filter((item) => item.status === "open"),
    [inboxItems],
  );
  const activeNextActions = useMemo(
    () =>
      nextActions
        .filter((action) => !action.completed)
        .sort((left, right) => (left.order || 0) - (right.order || 0)),
    [nextActions],
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
            <h1>KAIZEN</h1>
          </div>
        </header>

        <CalendarPanel
          items={calendarItems}
          onSaveItem={onSaveCalendarItem}
          today={date}
        />

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
              placeholder="Scrivi e premi Invio"
              type="text"
              value={captureText}
            />
            <button
              aria-label="Aggiungi alla Inbox"
              className="add-button icon-add-button"
              disabled={!captureText.trim()}
              type="submit"
            >
              <span aria-hidden="true">+</span>
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Inbox</p>
              <h2>{inboxCounterLabel(openInboxItems.length)}</h2>
            </div>
            <span className="counter">{openInboxItems.length}</span>
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
            <span className="counter">{activeNextActions.length}</span>
          </div>

          {activeNextActions.length === 0 ? (
            <p className="empty-state">Nessuna prossima azione attiva.</p>
          ) : (
            <ul className="task-list">
              {activeNextActions.map((action) => (
                <li className="task-item next-action-item" key={action.id}>
                  <label className="task-check">
                    <input
                      checked={action.completed}
                      onChange={() => onToggleNextAction(action.id)}
                      type="checkbox"
                    />
                    <span />
                  </label>
                  <div className="task-content">
                    <strong>{action.title}</strong>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <BottomNav activeSection={activeSection} onNavigate={onNavigate} />

      {clarifyingItem && (
        <ClarifyInboxModal
          item={clarifyingItem}
          onClose={() => setClarifyingItem(null)}
          onSubmit={(result) => {
            onClarifyInboxItem(clarifyingItem.id, result);
            setClarifyingItem(null);
          }}
          projects={projects}
          today={date}
        />
      )}
    </div>
  );
}
