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
  isAnalyzingJournal,
  journalAnalyses,
  journalAnalysis,
  journalAnalysisError,
  note,
  notes,
  onAddTask,
  onAnalyzeJournal,
  onDeleteTask,
  onNavigate,
  onNoteChange,
  onPostponeTask,
  onSaveJournal,
  onToggleTask,
  tasks,
}) {
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [suggestedTask, setSuggestedTask] = useState(null);

  function closeTaskModal() {
    setIsAddingTask(false);
    setSuggestedTask(null);
  }

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
          onPostponeTask={onPostponeTask}
          onToggleTask={onToggleTask}
          tasks={tasks}
        />

        <DailyNotes
          analyses={journalAnalyses}
          analysis={journalAnalysis}
          error={journalAnalysisError}
          isAnalyzing={isAnalyzingJournal}
          note={note}
          notes={notes}
          onAddSuggestedStep={(step) =>
            setSuggestedTask({
              description: step.description || "",
              title: step.title || step.description,
              type: "growth",
            })
          }
          onAnalyze={onAnalyzeJournal}
          onChange={onNoteChange}
          onSaveJournal={onSaveJournal}
        />
      </main>

      <BottomNav activeSection={activeSection} onNavigate={onNavigate} />

      {(isAddingTask || suggestedTask) && (
        <AddTaskModal
          date={date}
          initialTask={suggestedTask}
          onClose={closeTaskModal}
          onSubmit={(task) => {
            onAddTask(task);
            closeTaskModal();
          }}
          requireDateChoice={Boolean(suggestedTask)}
        />
      )}
    </div>
  );
}
