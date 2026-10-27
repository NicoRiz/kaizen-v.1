import BottomNav from "./BottomNav.jsx";
import CalendarPanel from "./CalendarPanel.jsx";
import HomeSectionNav from "./HomeSectionNav.jsx";
import { formatDisplayDate } from "../utils/date.js";

export default function HomeCalendarPage({
  activeSection,
  calendarItems,
  date,
  onDeleteCalendarItem,
  onNavigate,
  onSaveCalendarItem,
  onScheduleTask,
}) {
  return (
    <div className="app-shell">
      <main className="home home-calendar-page">
        <header className="topbar section-topbar">
          <div>
            <p className="eyebrow">{formatDisplayDate(date)}</p>
            <h1>Home</h1>
          </div>
        </header>

        <HomeSectionNav activeSection="calendar" onNavigate={onNavigate} />

        <CalendarPanel
          initialView="month"
          items={calendarItems}
          onDeleteItem={onDeleteCalendarItem}
          onSaveItem={onSaveCalendarItem}
          onScheduleTask={onScheduleTask}
          today={date}
        />

        <div className="secondary-page-link">
          <button
            className="secondary-button"
            onClick={() => onNavigate("areas")}
            type="button"
          >
            Vai alle Areas
          </button>
        </div>
      </main>

      <BottomNav activeSection={activeSection} onNavigate={onNavigate} />
    </div>
  );
}
