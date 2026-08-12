import { useEffect, useMemo, useState } from "react";
import GtdPage from "./components/GtdPage.jsx";
import Home from "./components/Home.jsx";
import NotesHub from "./components/NotesHub.jsx";
import NotesSection from "./components/NotesSection.jsx";
import { dateKey } from "./utils/date.js";
import { readStorage, writeStorage } from "./utils/storage.js";
import { JOURNAL_ANALYSES_STORAGE_KEY } from "./lib/journal.js";

const STORAGE_KEYS = {
  legacyTasks: "kaizen:v1:tasks",
  legacyCompletions: "kaizen:v1:taskCompletions",
  notes: "kaizen:v1:dailyNotes",
  journalAnalyses: JOURNAL_ANALYSES_STORAGE_KEY,
  streak: "kaizen:v1:currentStreak",
  bestStreak: "kaizen:v1:bestStreak",
  lastCheckedDate: "kaizen:v1:lastCheckedDate",
  creditedDates: "kaizen:v1:creditedDates",
  sectionNotes: "kaizen:v1:sectionNotes",
  inboxItems: "kaizen:v1:gtd:inboxItems",
  projects: "kaizen:v1:gtd:projects",
  projectActions: "kaizen:v1:gtd:projectActions",
  nextActions: "kaizen:v1:gtd:nextActions",
  calendarItems: "kaizen:v1:gtd:calendarItems",
  waitingFor: "kaizen:v1:gtd:waitingFor",
  somedayMaybe: "kaizen:v1:gtd:somedayMaybe",
  archiveItems: "kaizen:v1:gtd:archiveItems",
  migration: "kaizen:v1:gtd:migration",
};

const PRIMARY_SECTIONS = {
  gtd: "gtd",
  home: "home",
  note: "note",
};

const NOTE_SECTIONS = {
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

function nowIso() {
  return new Date().toISOString();
}

function normalizeLegacyTask(task, index) {
  return {
    id: createId(),
    title: task.title,
    completed: false,
    order: index,
    createdAt: task.createdAt || nowIso(),
    completedAt: null,
    source: "legacy-task",
    legacyTaskId: task.id,
  };
}

export default function App() {
  const [legacyTasks] = useState(() =>
    readStorage(STORAGE_KEYS.legacyTasks, []),
  );
  const [activeSection, setActiveSection] = useState(PRIMARY_SECTIONS.home);
  const [activeNoteSection, setActiveNoteSection] = useState(null);
  const [sectionNotes, setSectionNotes] = useState(() =>
    readStorage(STORAGE_KEYS.sectionNotes, []),
  );
  const [inboxItems, setInboxItems] = useState(() =>
    readStorage(STORAGE_KEYS.inboxItems, []),
  );
  const [projects, setProjects] = useState(() =>
    readStorage(STORAGE_KEYS.projects, []),
  );
  const [projectActions, setProjectActions] = useState(() =>
    readStorage(STORAGE_KEYS.projectActions, []),
  );
  const [nextActions, setNextActions] = useState(() =>
    readStorage(STORAGE_KEYS.nextActions, []),
  );
  const [calendarItems, setCalendarItems] = useState(() =>
    readStorage(STORAGE_KEYS.calendarItems, []),
  );
  const [waitingFor, setWaitingFor] = useState(() =>
    readStorage(STORAGE_KEYS.waitingFor, []),
  );
  const [somedayMaybe, setSomedayMaybe] = useState(() =>
    readStorage(STORAGE_KEYS.somedayMaybe, []),
  );
  const [archiveItems, setArchiveItems] = useState(() =>
    readStorage(STORAGE_KEYS.archiveItems, []),
  );
  const [migration, setMigration] = useState(() =>
    readStorage(STORAGE_KEYS.migration, {}),
  );

  const today = useMemo(() => dateKey(), []);

  useEffect(() => writeStorage(STORAGE_KEYS.sectionNotes, sectionNotes), [sectionNotes]);
  useEffect(() => writeStorage(STORAGE_KEYS.inboxItems, inboxItems), [inboxItems]);
  useEffect(() => writeStorage(STORAGE_KEYS.projects, projects), [projects]);
  useEffect(
    () => writeStorage(STORAGE_KEYS.projectActions, projectActions),
    [projectActions],
  );
  useEffect(() => writeStorage(STORAGE_KEYS.nextActions, nextActions), [nextActions]);
  useEffect(
    () => writeStorage(STORAGE_KEYS.calendarItems, calendarItems),
    [calendarItems],
  );
  useEffect(() => writeStorage(STORAGE_KEYS.waitingFor, waitingFor), [waitingFor]);
  useEffect(
    () => writeStorage(STORAGE_KEYS.somedayMaybe, somedayMaybe),
    [somedayMaybe],
  );
  useEffect(() => writeStorage(STORAGE_KEYS.archiveItems, archiveItems), [archiveItems]);
  useEffect(() => writeStorage(STORAGE_KEYS.migration, migration), [migration]);

  useEffect(() => {
    if (migration.legacyTasksToNextActions || legacyTasks.length === 0) {
      return;
    }

    setNextActions((currentActions) => {
      const migratedLegacyIds = new Set(
        currentActions
          .filter((action) => action.source === "legacy-task")
          .map((action) => action.legacyTaskId),
      );
      const activeLegacyTasks = legacyTasks.filter(
        (task) => task.title && !migratedLegacyIds.has(task.id),
      );

      if (activeLegacyTasks.length === 0) {
        return currentActions;
      }

      const highestOrder = currentActions.reduce(
        (maxOrder, action) => Math.max(maxOrder, Number(action.order) || 0),
        -1,
      );

      return [
        ...currentActions,
        ...activeLegacyTasks.map((task, index) =>
          normalizeLegacyTask(task, highestOrder + index + 1),
        ),
      ];
    });

    setMigration((currentMigration) => ({
      ...currentMigration,
      legacyTasksToNextActions: nowIso(),
      legacyTaskCount: legacyTasks.length,
    }));
  }, [legacyTasks, migration.legacyTasksToNextActions]);

  function navigate(section) {
    setActiveSection(section);
    if (section !== PRIMARY_SECTIONS.note) {
      setActiveNoteSection(null);
    }
  }

  function saveSectionNote(section, noteInput) {
    const timestamp = nowIso();
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
                updatedAt: timestamp,
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
          createdAt: timestamp,
          updatedAt: timestamp,
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

  function addInboxItem(originalText) {
    const cleanText = originalText.trim();

    if (!cleanText) {
      return;
    }

    setInboxItems((currentItems) => [
      {
        id: createId(),
        originalText: cleanText,
        clarifiedText: "",
        createdAt: nowIso(),
        status: "open",
      },
      ...currentItems,
    ]);
  }

  function createProject(title) {
    const cleanTitle = title.trim();

    if (!cleanTitle) {
      return null;
    }

    const project = {
      id: createId(),
      title: cleanTitle,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    setProjects((currentProjects) => [...currentProjects, project]);
    return project;
  }

  function clarifyInboxItem(itemId, result) {
    const timestamp = nowIso();
    const clarifiedText = result.clarifiedText.trim();

    if (result.actionable) {
      const nextActionTitle = result.nextActionTitle.trim();

      if (result.destination === "projects") {
        const projectId = result.projectId || createProject(result.newProjectTitle)?.id;

        if (!projectId || !nextActionTitle) {
          return;
        }

        setProjectActions((currentActions) => [
          ...currentActions,
          {
            id: createId(),
            projectId,
            title: nextActionTitle,
            completed: false,
            order: currentActions.filter((action) => action.projectId === projectId)
              .length,
            createdAt: timestamp,
            completedAt: null,
            sourceInboxItemId: itemId,
          },
        ]);
      }

      if (result.destination === "next-actions" && nextActionTitle) {
        setNextActions((currentActions) => [
          ...currentActions,
          {
            id: createId(),
            title: nextActionTitle,
            completed: false,
            order: currentActions.length,
            createdAt: timestamp,
            completedAt: null,
            sourceInboxItemId: itemId,
            clarifiedText,
          },
        ]);
      }

      if (result.destination === "agenda") {
        setCalendarItems((currentItems) => [
          ...currentItems,
          {
            id: createId(),
            title: nextActionTitle || clarifiedText,
            description: clarifiedText,
            date: result.date,
            allDay: !result.startTime,
            startTime: result.startTime || null,
            endTime: result.endTime || null,
            createdAt: timestamp,
            sourceInboxItemId: itemId,
          },
        ]);
      }

      if (result.destination === "waiting-for") {
        setWaitingFor((currentItems) => [
          {
            id: createId(),
            title: nextActionTitle || clarifiedText,
            description: result.description.trim() || clarifiedText,
            createdAt: timestamp,
            sourceInboxItemId: itemId,
          },
          ...currentItems,
        ]);
      }
    } else {
      if (result.nonActionableDestination === "someday") {
        setSomedayMaybe((currentItems) => [
          {
            id: createId(),
            title: clarifiedText,
            description: result.description.trim(),
            createdAt: timestamp,
            sourceInboxItemId: itemId,
          },
          ...currentItems,
        ]);
      }

      if (result.nonActionableDestination === "archive") {
        setArchiveItems((currentItems) => [
          {
            id: createId(),
            title: clarifiedText,
            content: result.description.trim() || clarifiedText,
            createdAt: timestamp,
            archivedAt: timestamp,
            sourceInboxItemId: itemId,
          },
          ...currentItems,
        ]);
      }
    }

    setInboxItems((currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }

  function toggleNextAction(actionId) {
    setNextActions((currentActions) =>
      currentActions.map((action) => {
        if (action.id !== actionId) {
          return action;
        }

        const completed = !action.completed;

        return {
          ...action,
          completed,
          completedAt: completed ? nowIso() : null,
        };
      }),
    );
  }

  function saveCalendarItem(itemInput) {
    const timestamp = nowIso();
    const cleanTitle = itemInput.title.trim();

    if (!cleanTitle || !itemInput.date) {
      return;
    }

    setCalendarItems((currentItems) => {
      if (itemInput.id) {
        return currentItems.map((item) =>
          item.id === itemInput.id
            ? {
                ...item,
                title: cleanTitle,
                description: itemInput.description.trim(),
                date: itemInput.date,
                allDay: !itemInput.startTime,
                startTime: itemInput.startTime || null,
                endTime: itemInput.endTime || null,
              }
            : item,
        );
      }

      return [
        ...currentItems,
        {
          id: createId(),
          title: cleanTitle,
          description: itemInput.description.trim(),
          date: itemInput.date,
          allDay: !itemInput.startTime,
          startTime: itemInput.startTime || null,
          endTime: itemInput.endTime || null,
          createdAt: timestamp,
        },
      ];
    });
  }

  function updateProject(projectInput) {
    setProjects((currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectInput.id
          ? {
              ...project,
              title: projectInput.title.trim(),
              updatedAt: nowIso(),
            }
          : project,
      ),
    );
  }

  function deleteProject(projectId) {
    setProjects((currentProjects) =>
      currentProjects.filter((project) => project.id !== projectId),
    );
    setProjectActions((currentActions) =>
      currentActions.filter((action) => action.projectId !== projectId),
    );
  }

  function saveProjectActions(projectId, actions) {
    setProjectActions((currentActions) => [
      ...currentActions.filter((action) => action.projectId !== projectId),
      ...actions.map((action, index) => ({
        ...action,
        id: action.id || createId(),
        projectId,
        title: action.title.trim(),
        completed: Boolean(action.completed),
        order: index,
        createdAt: action.createdAt || nowIso(),
        completedAt: action.completed ? action.completedAt || nowIso() : null,
      })),
    ]);
  }

  function saveWaitingFor(itemInput) {
    const timestamp = nowIso();
    const cleanTitle = itemInput.title.trim();

    if (!cleanTitle) {
      return;
    }

    setWaitingFor((currentItems) => {
      if (itemInput.id) {
        return currentItems.map((item) =>
          item.id === itemInput.id
            ? {
                ...item,
                title: cleanTitle,
                description: itemInput.description.trim(),
              }
            : item,
        );
      }

      return [
        {
          id: createId(),
          title: cleanTitle,
          description: itemInput.description.trim(),
          createdAt: timestamp,
        },
        ...currentItems,
      ];
    });
  }

  function deleteWaitingFor(itemId) {
    setWaitingFor((currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }

  function saveSomedayMaybe(itemInput) {
    const timestamp = nowIso();
    const cleanTitle = itemInput.title.trim();

    if (!cleanTitle) {
      return;
    }

    setSomedayMaybe((currentItems) => {
      if (itemInput.id) {
        return currentItems.map((item) =>
          item.id === itemInput.id
            ? {
                ...item,
                title: cleanTitle,
                description: itemInput.description.trim(),
              }
            : item,
        );
      }

      return [
        {
          id: createId(),
          title: cleanTitle,
          description: itemInput.description.trim(),
          createdAt: timestamp,
        },
        ...currentItems,
      ];
    });
  }

  function deleteSomedayMaybe(itemId) {
    setSomedayMaybe((currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }

  function saveArchiveItem(itemInput) {
    const timestamp = nowIso();
    const cleanTitle = itemInput.title.trim();

    if (!cleanTitle) {
      return;
    }

    setArchiveItems((currentItems) => {
      if (itemInput.id) {
        return currentItems.map((item) =>
          item.id === itemInput.id
            ? {
                ...item,
                title: cleanTitle,
                content: itemInput.content.trim(),
              }
            : item,
        );
      }

      return [
        {
          id: createId(),
          title: cleanTitle,
          content: itemInput.content.trim(),
          createdAt: timestamp,
          archivedAt: timestamp,
        },
        ...currentItems,
      ];
    });
  }

  function deleteArchiveItem(itemId) {
    setArchiveItems((currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }

  if (activeSection === PRIMARY_SECTIONS.gtd) {
    return (
      <GtdPage
        activeSection={activeSection}
        archiveItems={archiveItems}
        onCreateProject={createProject}
        onDeleteArchiveItem={deleteArchiveItem}
        onDeleteProject={deleteProject}
        onDeleteSomedayMaybe={deleteSomedayMaybe}
        onDeleteWaitingFor={deleteWaitingFor}
        onNavigate={navigate}
        onSaveArchiveItem={saveArchiveItem}
        onSaveProjectActions={saveProjectActions}
        onSaveSomedayMaybe={saveSomedayMaybe}
        onSaveWaitingFor={saveWaitingFor}
        onUpdateProject={updateProject}
        projectActions={projectActions}
        projects={projects}
        somedayMaybe={somedayMaybe}
        waitingFor={waitingFor}
      />
    );
  }

  if (activeSection === PRIMARY_SECTIONS.note && activeNoteSection) {
    const activeSectionConfig = NOTE_SECTIONS[activeNoteSection];
    const activeSectionNotes = sectionNotes.filter(
      (note) => note.section === activeNoteSection,
    );

    return (
      <NotesSection
        activeSection={activeSection}
        emptyMessage={activeSectionConfig.emptyMessage}
        eyebrow={activeSectionConfig.eyebrow}
        notes={activeSectionNotes}
        onBack={() => setActiveNoteSection(null)}
        onDeleteNote={deleteSectionNote}
        onNavigate={navigate}
        onSaveNote={(note) => saveSectionNote(activeNoteSection, note)}
        section={activeNoteSection}
        title={activeSectionConfig.title}
      />
    );
  }

  if (activeSection === PRIMARY_SECTIONS.note) {
    return (
      <NotesHub
        activeSection={activeSection}
        noteSections={NOTE_SECTIONS}
        notes={sectionNotes}
        onNavigate={navigate}
        onOpenSection={setActiveNoteSection}
      />
    );
  }

  return (
    <Home
      activeSection={activeSection}
      calendarItems={calendarItems}
      date={today}
      inboxItems={inboxItems}
      nextActions={nextActions}
      onAddInboxItem={addInboxItem}
      onClarifyInboxItem={clarifyInboxItem}
      onNavigate={navigate}
      onSaveCalendarItem={saveCalendarItem}
      onToggleNextAction={toggleNextAction}
      projects={projects}
    />
  );
}
