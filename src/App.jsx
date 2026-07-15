import { useEffect, useMemo, useState } from "react";
import Home from "./components/Home.jsx";
import NotesSection from "./components/NotesSection.jsx";
import {
  addDays,
  completionKey,
  dateKey,
  getTasksForDate,
  isBeforeDate,
} from "./utils/date.js";
import { readStorage, writeStorage } from "./utils/storage.js";
import {
  getPreviousJournalEntries,
  JOURNAL_ANALYSES_STORAGE_KEY,
  normalizeJournalAnalysis,
} from "./lib/journal.js";

const STORAGE_KEYS = {
  tasks: "kaizen:v1:tasks",
  completions: "kaizen:v1:taskCompletions",
  notes: "kaizen:v1:dailyNotes",
  journalAnalyses: JOURNAL_ANALYSES_STORAGE_KEY,
  streak: "kaizen:v1:currentStreak",
  bestStreak: "kaizen:v1:bestStreak",
  lastCheckedDate: "kaizen:v1:lastCheckedDate",
  creditedDates: "kaizen:v1:creditedDates",
  sectionNotes: "kaizen:v1:sectionNotes",
};

const SECTIONS = {
  knowledge: {
    key: "knowledge",
    title: "Knowledge",
    eyebrow: "Biblioteca",
    emptyMessage: "Nessuna nota salvata in Knowledge.",
  },
  skills: {
    key: "skills",
    title: "Skills",
    eyebrow: "Crescita",
    emptyMessage: "Nessuna nota salvata in Skills.",
  },
  home: {
    key: "home",
    title: "Home",
  },
  sharkmo: {
    key: "sharkmo",
    title: "Sharkmo",
    eyebrow: "Progetto",
    emptyMessage: "Nessuna nota salvata in Sharkmo.",
  },
  oneiros: {
    key: "oneiros",
    title: "Oneiros",
    eyebrow: "Sogni",
    emptyMessage: "Nessun sogno salvato in Oneiros.",
  },
};

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function reconcileStreak({
  tasks,
  completions,
  currentStreak,
  bestStreak,
  lastCheckedDate,
  creditedDates,
}) {
  const today = dateKey();
  let nextCurrent = Number(currentStreak) || 0;
  let nextBest = Number(bestStreak) || 0;
  let nextLastChecked = lastCheckedDate || today;
  const nextCreditedDates = { ...creditedDates };

  if (isBeforeDate(nextLastChecked, today)) {
    let cursor = nextLastChecked;

    while (isBeforeDate(cursor, today)) {
      const tasksForDay = getTasksForDate(tasks, cursor);

      if (tasksForDay.length > 0) {
        const allCompleted = tasksForDay.every(
          (task) => completions[completionKey(cursor, task.id)],
        );

        if (allCompleted) {
          if (!nextCreditedDates[cursor]) {
            nextCurrent += 1;
            nextBest = Math.max(nextBest, nextCurrent);
            nextCreditedDates[cursor] = true;
          }
        } else if (!nextCreditedDates[cursor]) {
          nextCurrent = 0;
        }
      }

      cursor = addDays(cursor, 1);
    }

    nextLastChecked = today;
  }

  const todayTasks = getTasksForDate(tasks, today);
  const todayIsComplete =
    todayTasks.length > 0 &&
    todayTasks.every((task) => completions[completionKey(today, task.id)]);

  if (todayIsComplete && !nextCreditedDates[today]) {
    nextCurrent += 1;
    nextBest = Math.max(nextBest, nextCurrent);
    nextCreditedDates[today] = true;
  }

  if (!todayIsComplete && nextCreditedDates[today]) {
    nextCurrent = Math.max(0, nextCurrent - 1);
    delete nextCreditedDates[today];
  }

  return {
    currentStreak: nextCurrent,
    bestStreak: nextBest,
    lastCheckedDate: nextLastChecked,
    creditedDates: nextCreditedDates,
  };
}

export default function App() {
  const [tasks, setTasks] = useState(() => readStorage(STORAGE_KEYS.tasks, []));
  const [completions, setCompletions] = useState(() =>
    readStorage(STORAGE_KEYS.completions, {}),
  );
  const [notes, setNotes] = useState(() => readStorage(STORAGE_KEYS.notes, {}));
  const [journalAnalyses, setJournalAnalyses] = useState(() =>
    readStorage(STORAGE_KEYS.journalAnalyses, {}),
  );
  const [currentStreak, setCurrentStreak] = useState(() =>
    readStorage(STORAGE_KEYS.streak, 0),
  );
  const [bestStreak, setBestStreak] = useState(() =>
    readStorage(STORAGE_KEYS.bestStreak, 0),
  );
  const [lastCheckedDate, setLastCheckedDate] = useState(() =>
    readStorage(STORAGE_KEYS.lastCheckedDate, dateKey()),
  );
  const [creditedDates, setCreditedDates] = useState(() =>
    readStorage(STORAGE_KEYS.creditedDates, {}),
  );
  const [activeSection, setActiveSection] = useState(SECTIONS.home.key);
  const [sectionNotes, setSectionNotes] = useState(() =>
    readStorage(STORAGE_KEYS.sectionNotes, []),
  );
  const [isAnalyzingJournal, setIsAnalyzingJournal] = useState(false);
  const [journalAnalysisError, setJournalAnalysisError] = useState("");

  const today = useMemo(() => dateKey(), []);
  const todaysTasks = useMemo(
    () => getTasksForDate(tasks, today),
    [tasks, today],
  );

  useEffect(() => writeStorage(STORAGE_KEYS.tasks, tasks), [tasks]);
  useEffect(
    () => writeStorage(STORAGE_KEYS.completions, completions),
    [completions],
  );
  useEffect(() => writeStorage(STORAGE_KEYS.notes, notes), [notes]);
  useEffect(
    () => writeStorage(STORAGE_KEYS.journalAnalyses, journalAnalyses),
    [journalAnalyses],
  );
  useEffect(
    () => writeStorage(STORAGE_KEYS.streak, currentStreak),
    [currentStreak],
  );
  useEffect(
    () => writeStorage(STORAGE_KEYS.bestStreak, bestStreak),
    [bestStreak],
  );
  useEffect(
    () => writeStorage(STORAGE_KEYS.lastCheckedDate, lastCheckedDate),
    [lastCheckedDate],
  );
  useEffect(
    () => writeStorage(STORAGE_KEYS.creditedDates, creditedDates),
    [creditedDates],
  );
  useEffect(
    () => writeStorage(STORAGE_KEYS.sectionNotes, sectionNotes),
    [sectionNotes],
  );

  useEffect(() => {
    const next = reconcileStreak({
      tasks,
      completions,
      currentStreak,
      bestStreak,
      lastCheckedDate,
      creditedDates,
    });

    if (next.currentStreak !== currentStreak) {
      setCurrentStreak(next.currentStreak);
    }

    if (next.bestStreak !== bestStreak) {
      setBestStreak(next.bestStreak);
    }

    if (next.lastCheckedDate !== lastCheckedDate) {
      setLastCheckedDate(next.lastCheckedDate);
    }

    if (JSON.stringify(next.creditedDates) !== JSON.stringify(creditedDates)) {
      setCreditedDates(next.creditedDates);
    }
  }, [
    tasks,
    completions,
    currentStreak,
    bestStreak,
    lastCheckedDate,
    creditedDates,
  ]);

  function addTask(task) {
    setTasks((currentTasks) => [
      ...currentTasks,
      {
        ...task,
        id: crypto.randomUUID(),
        postponeCount: 0,
        createdAt: new Date().toISOString(),
      },
    ]);
  }

  function toggleTask(taskId) {
    const key = completionKey(today, taskId);

    setCompletions((currentCompletions) => ({
      ...currentCompletions,
      [key]: !currentCompletions[key],
    }));
  }

  function deleteTask(taskId) {
    setTasks((currentTasks) =>
      currentTasks.filter((task) => task.id !== taskId),
    );
    setCompletions((currentCompletions) =>
      Object.fromEntries(
        Object.entries(currentCompletions).filter(
          ([key]) => !key.endsWith(`:${taskId}`),
        ),
      ),
    );
  }

  function postponeTask(taskId) {
    const tomorrow = addDays(today, 1);

    setTasks((currentTasks) =>
      currentTasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const repeatDays = task.repeatDays || [];
        const postponeCount = (Number(task.postponeCount) || 0) + 1;

        if (repeatDays.length === 0) {
          return {
            ...task,
            date: tomorrow,
            postponeCount,
          };
        }

        const carryoverDates = Array.isArray(task.carryoverDates)
          ? task.carryoverDates
          : [];
        const nextCarryoverDates = carryoverDates.filter(
          (carryoverDate) => carryoverDate !== today,
        );

        if (!nextCarryoverDates.includes(tomorrow)) {
          nextCarryoverDates.push(tomorrow);
        }

        return {
          ...task,
          postponeCount,
          postponedDates: {
            ...(task.postponedDates || {}),
            [today]: true,
          },
          carryoverDates: nextCarryoverDates,
        };
      }),
    );

    setCompletions((currentCompletions) => {
      const nextCompletions = { ...currentCompletions };
      delete nextCompletions[completionKey(today, taskId)];
      return nextCompletions;
    });
  }

  function updateTodayNote(value) {
    updateJournalNote(today, value);
  }

  function updateJournalNote(targetDate, value) {
    setNotes((currentNotes) => ({
      ...currentNotes,
      [targetDate]: value,
    }));
  }

  function buildJournalAnalysisPayload() {
    const skillsNotes = sectionNotes
      .filter((note) => note.section === SECTIONS.skills.key)
      .map((note) => ({
        title: note.title,
        content: note.content,
        updatedAt: note.updatedAt,
      }));
    const taskSnapshots = todaysTasks.map((task) => {
      const completed = Boolean(completions[completionKey(today, task.id)]);

      return {
        title: task.title,
        type: task.type,
        postponeCount: Number(task.postponeCount) || 0,
        completed,
      };
    });

    return {
      date: today,
      journal: notes[today] || "",
      tasks: {
        planned: taskSnapshots,
        completed: taskSnapshots.filter((task) => task.completed),
        uncompleted: taskSnapshots.filter((task) => !task.completed),
        postponementCount: taskSnapshots.reduce(
          (total, task) => total + task.postponeCount,
          0,
        ),
      },
      previousJournals: getPreviousJournalEntries(notes, today, 7),
      skillsNotes,
    };
  }

  async function analyzeTodayJournal() {
    if (isAnalyzingJournal || !(notes[today] || "").trim()) {
      return;
    }

    setIsAnalyzingJournal(true);
    setJournalAnalysisError("");

    try {
      const response = await fetch("/api/analyze-journal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildJournalAnalysisPayload()),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          body.error || "Non sono riuscito ad analizzare il journal.",
        );
      }

      const normalized = normalizeJournalAnalysis(body.analysis);

      if (!normalized) {
        throw new Error("La risposta di Kaizen Analyst non è valida.");
      }

      const now = new Date().toISOString();

      setJournalAnalyses((currentAnalyses) => ({
        ...currentAnalyses,
        [today]: {
          ...normalized,
          createdAt: currentAnalyses[today]?.createdAt || now,
          updatedAt: now,
        },
      }));
    } catch (error) {
      setJournalAnalysisError(
        error instanceof Error
          ? error.message
          : "Non sono riuscito ad analizzare il journal.",
      );
    } finally {
      setIsAnalyzingJournal(false);
    }
  }

  function saveSectionNote(section, noteInput) {
    const now = new Date().toISOString();
    const cleanTitle = noteInput.title.trim();
    const cleanContent = noteInput.content.trim();

    if (!cleanTitle && !cleanContent) {
      return;
    }

    setSectionNotes((currentNotes) => {
      if (noteInput.id) {
        return currentNotes.map((note) =>
          note.id === noteInput.id
            ? {
                ...note,
                title: cleanTitle,
                content: cleanContent,
                updatedAt: now,
              }
            : note,
        );
      }

      return [
        {
          id: createId(),
          section,
          title: cleanTitle,
          content: cleanContent,
          createdAt: now,
          updatedAt: now,
        },
        ...currentNotes,
      ];
    });
  }

  function deleteSectionNote(noteId) {
    setSectionNotes((currentNotes) =>
      currentNotes.filter((note) => note.id !== noteId),
    );
  }

  const activeSectionConfig = SECTIONS[activeSection];
  const activeSectionNotes = sectionNotes.filter(
    (note) => note.section === activeSection,
  );

  if (activeSection === SECTIONS.home.key) {
    return (
      <Home
        activeSection={activeSection}
        bestStreak={bestStreak}
        completions={completions}
        currentStreak={currentStreak}
        date={today}
        journalAnalyses={journalAnalyses}
        journalAnalysis={journalAnalyses[today]}
        journalAnalysisError={journalAnalysisError}
        note={notes[today] || ""}
        onAddTask={addTask}
        onAnalyzeJournal={analyzeTodayJournal}
        onDeleteTask={deleteTask}
        onNavigate={setActiveSection}
        onNoteChange={updateTodayNote}
        onPostponeTask={postponeTask}
        onSaveJournal={updateJournalNote}
        onToggleTask={toggleTask}
        isAnalyzingJournal={isAnalyzingJournal}
        notes={notes}
        tasks={todaysTasks}
      />
    );
  }

  return (
    <NotesSection
      activeSection={activeSection}
      emptyMessage={activeSectionConfig.emptyMessage}
      eyebrow={activeSectionConfig.eyebrow}
      notes={activeSectionNotes}
      onDeleteNote={deleteSectionNote}
      onNavigate={setActiveSection}
      onSaveNote={(note) => saveSectionNote(activeSection, note)}
      section={activeSection}
      title={activeSectionConfig.title}
    />
  );
}
