import { useState } from "react";
import AddTaskModal from "./AddTaskModal.jsx";
import BottomNav from "./BottomNav.jsx";
import DailyNotes from "./DailyNotes.jsx";
import StreakHeader from "./StreakHeader.jsx";
import TodoList from "./TodoList.jsx";
import { formatDisplayDate } from "../utils/date.js";

export default function Home({
  activeSection,
  bestStreak,
  completions,
  currentStreak,
  date,
  note,
  onAddTask,
  onDeleteTask,
  onNavigate,
  onNoteChange,
  onToggleTask,
  tasks,
}) {
  const [isAddingTask, setIsAddingTask] = useState(false);

  return (
    <div className="app-shell">
      <main className="home">
        <header className="topbar">
          <div>
            <p className="eyebrow">{formatDisplayDate(date)}</p>
            <h1>KAIZEN</h1>
          </div>
          <button
            aria-label="Aggiungi task"
            className="add-button"
            onClick={() => setIsAddingTask(true)}
            type="button"
          >
            <span aria-hidden="true">+</span>
            Nuova task
          </button>
        </header>

        <StreakHeader bestStreak={bestStreak} currentStreak={currentStreak} />

        <TodoList
          completions={completions}
          date={date}
          onDeleteTask={onDeleteTask}
          onToggleTask={onToggleTask}
          tasks={tasks}
        />

        <DailyNotes note={note} onChange={onNoteChange} />
      </main>

      <BottomNav activeSection={activeSection} onNavigate={onNavigate} />

      {isAddingTask && (
        <AddTaskModal
          date={date}
          onClose={() => setIsAddingTask(false)}
          onSubmit={(task) => {
            onAddTask(task);
            setIsAddingTask(false);
          }}
        />
      )}
    </div>
  );
}
