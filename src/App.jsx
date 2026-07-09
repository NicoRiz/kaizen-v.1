import { useEffect, useMemo, useState } from "react";
import Home from "./components/Home.jsx";
import {
  addDays,
  completionKey,
  dateKey,
  getTasksForDate,
  isBeforeDate,
} from "./utils/date.js";
import { readStorage, writeStorage } from "./utils/storage.js";

const STORAGE_KEYS = {
  tasks: "kaizen:v1:tasks",
  completions: "kaizen:v1:taskCompletions",
  notes: "kaizen:v1:dailyNotes",
  streak: "kaizen:v1:currentStreak",
  bestStreak: "kaizen:v1:bestStreak",
  lastCheckedDate: "kaizen:v1:lastCheckedDate",
  creditedDates: "kaizen:v1:creditedDates",
};

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

  function updateTodayNote(value) {
    setNotes((currentNotes) => ({
      ...currentNotes,
      [today]: value,
    }));
  }

  return (
    <Home
      bestStreak={bestStreak}
      completions={completions}
      currentStreak={currentStreak}
      date={today}
      note={notes[today] || ""}
      onAddTask={addTask}
      onDeleteTask={deleteTask}
      onNoteChange={updateTodayNote}
      onToggleTask={toggleTask}
      tasks={todaysTasks}
    />
  );
}
