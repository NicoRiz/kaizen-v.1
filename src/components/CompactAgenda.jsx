import { useMemo, useState } from "react";
import CalendarPanel from "./CalendarPanel.jsx";

function eventLabel(item) {
  if (item.type === "work-block") return "Blocco di lavoro";
  if (item.allDay || !item.startTime) return "Tutto il giorno";
  return item.endTime ? `${item.startTime}–${item.endTime}` : item.startTime;
}

function dayLabel(date, today) {
  if (date === today) return "Oggi";
  return new Intl.DateTimeFormat("it-IT", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(`${date}T12:00:00`),
  );
}

export default function CompactAgenda({ items, onDeleteItem, onSaveItem, today }) {
  const [expanded, setExpanded] = useState(false);
  const relevant = useMemo(
    () => [...items]
      .filter((item) => item.date >= today)
      .sort((left, right) => `${left.date}:${left.startTime || "99:99"}`.localeCompare(`${right.date}:${right.startTime || "99:99"}`))
      .slice(0, 5),
    [items, today],
  );

  return (
    <section className="panel agenda-compact" aria-labelledby="agenda-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Agenda</p>
          <h2 id="agenda-title">Oggi e prossimi impegni</h2>
        </div>
        <button aria-expanded={expanded} className="secondary-button compact-button" onClick={() => setExpanded((value) => !value)} type="button">
          {expanded ? "Riduci" : "Calendario completo"}
        </button>
      </div>

      {!expanded && (relevant.length ? (
        <ol className="agenda-list">
          {relevant.map((item) => (
            <li className={`agenda-item agenda-item--${item.type || (item.allDay ? "all-day" : "timed")}`} key={item.id}>
              <time dateTime={item.date}>{dayLabel(item.date, today)}</time>
              <div><strong>{item.title}</strong><span>{eventLabel(item)}</span></div>
            </li>
          ))}
        </ol>
      ) : <p className="empty-state compact-empty">Nessun impegno vicino. Puoi lasciare spazio o aggiungere un evento dal Sistema.</p>)}

      {expanded && <CalendarPanel items={items} onDeleteItem={onDeleteItem} onSaveItem={onSaveItem} today={today} />}
    </section>
  );
}
