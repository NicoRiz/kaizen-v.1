import { useEffect, useMemo, useState } from "react";
import AuthScreen from "./components/AuthScreen.jsx";
import GtdPage from "./components/GtdPage.jsx";
import Home from "./components/Home.jsx";
import NotesHub from "./components/NotesHub.jsx";
import NotesSection from "./components/NotesSection.jsx";
import SyncStatus from "./components/SyncStatus.jsx";
import { useKaizenSync } from "./hooks/useKaizenSync.js";
import { COLLECTIONS, STORAGE_KEYS } from "./lib/kaizenData.js";
import {
  createId,
  getBestLocalRecoveryData,
  nowIso,
} from "./lib/syncCore.js";
import { dateKey } from "./utils/date.js";
import { readStorage, writeStorage } from "./utils/storage.js";

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

function normalizeLegacyTask(task, index) {
  const timestamp = nowIso();

  return {
    id: createId(),
    title: task.title,
    completed: false,
    order: index,
    createdAt: task.createdAt || timestamp,
    updatedAt: timestamp,
    completedAt: null,
    source: "legacy-task",
    legacyTaskId: task.id,
  };
}

function initialKaizenData() {
  return getBestLocalRecoveryData().data;
}

export default function App() {
  const [kaizenData, setKaizenData] = useState(initialKaizenData);
  const [migration, setMigration] = useState(() =>
    readStorage(STORAGE_KEYS.migration, {}),
  );
  const [activeSection, setActiveSection] = useState(PRIMARY_SECTIONS.home);
  const [activeNoteSection, setActiveNoteSection] = useState(null);
  const sync = useKaizenSync({
    data: kaizenData,
    onReplaceData: setKaizenData,
  });

  const today = useMemo(() => dateKey(), []);
  const {
    archiveItems,
    calendarItems,
    inboxItems,
    legacyTasks,
    nextActions,
    projectActions,
    projects,
    sectionNotes,
    somedayMaybe,
    waitingFor,
  } = kaizenData;

  useEffect(() => {
    for (const collection of COLLECTIONS) {
      sync.trackCollectionChange(collection.name, kaizenData[collection.name]);
    }
  }, [kaizenData, sync.trackCollectionChange]);

  useEffect(() => writeStorage(STORAGE_KEYS.migration, migration), [migration]);

  useEffect(() => {
    if (migration.legacyTasksToNextActions || legacyTasks.length === 0) {
      return;
    }

    updateCollection("nextActions", (currentActions) => {
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

  function updateCollection(collectionName, updater) {
    setKaizenData((currentData) => {
      const currentValue = currentData[collectionName];
      const nextValue =
        typeof updater === "function" ? updater(currentValue, currentData) : updater;

      if (Object.is(currentValue, nextValue)) {
        return currentData;
      }

      return {
        ...currentData,
        [collectionName]: nextValue,
      };
    });
  }

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

    updateCollection("sectionNotes", (currentNotes) => {
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
    updateCollection("sectionNotes", (currentNotes) =>
      currentNotes.filter((note) => note.id !== noteId),
    );
  }

  function addInboxItem(originalText) {
    const cleanText = originalText.trim();

    if (!cleanText) {
      return;
    }

    const timestamp = nowIso();

    updateCollection("inboxItems", (currentItems) => [
      {
        id: createId(),
        originalText: cleanText,
        clarifiedText: "",
        createdAt: timestamp,
        updatedAt: timestamp,
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

    const timestamp = nowIso();
    const project = {
      id: createId(),
      title: cleanTitle,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    updateCollection("projects", (currentProjects) => [...currentProjects, project]);
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

        updateCollection("projectActions", (currentActions) => [
          ...currentActions,
          {
            id: createId(),
            projectId,
            title: nextActionTitle,
            completed: false,
            order: currentActions.filter((action) => action.projectId === projectId)
              .length,
            createdAt: timestamp,
            updatedAt: timestamp,
            completedAt: null,
            sourceInboxItemId: itemId,
          },
        ]);
      }

      if (result.destination === "next-actions" && nextActionTitle) {
        updateCollection("nextActions", (currentActions) => [
          ...currentActions,
          {
            id: createId(),
            title: nextActionTitle,
            completed: false,
            order: currentActions.length,
            createdAt: timestamp,
            updatedAt: timestamp,
            completedAt: null,
            sourceInboxItemId: itemId,
            clarifiedText,
          },
        ]);
      }

      if (result.destination === "agenda") {
        updateCollection("calendarItems", (currentItems) => [
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
            updatedAt: timestamp,
            sourceInboxItemId: itemId,
          },
        ]);
      }

      if (result.destination === "waiting-for") {
        updateCollection("waitingFor", (currentItems) => [
          {
            id: createId(),
            title: nextActionTitle || clarifiedText,
            description: result.description.trim() || clarifiedText,
            createdAt: timestamp,
            updatedAt: timestamp,
            sourceInboxItemId: itemId,
          },
          ...currentItems,
        ]);
      }
    } else {
      if (result.nonActionableDestination === "someday") {
        updateCollection("somedayMaybe", (currentItems) => [
          {
            id: createId(),
            title: clarifiedText,
            description: result.description.trim(),
            createdAt: timestamp,
            updatedAt: timestamp,
            sourceInboxItemId: itemId,
          },
          ...currentItems,
        ]);
      }

      if (result.nonActionableDestination === "archive") {
        updateCollection("archiveItems", (currentItems) => [
          {
            id: createId(),
            title: clarifiedText,
            content: result.description.trim() || clarifiedText,
            createdAt: timestamp,
            updatedAt: timestamp,
            archivedAt: timestamp,
            sourceInboxItemId: itemId,
          },
          ...currentItems,
        ]);
      }
    }

    updateCollection("inboxItems", (currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }

  function toggleNextAction(actionId) {
    const timestamp = nowIso();

    updateCollection("nextActions", (currentActions) =>
      currentActions.map((action) => {
        if (action.id !== actionId) {
          return action;
        }

        const completed = !action.completed;

        return {
          ...action,
          completed,
          completedAt: completed ? timestamp : null,
          updatedAt: timestamp,
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

    updateCollection("calendarItems", (currentItems) => {
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
                updatedAt: timestamp,
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
          updatedAt: timestamp,
        },
      ];
    });
  }

  function deleteCalendarItem(itemId) {
    updateCollection("calendarItems", (currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }

  function updateProject(projectInput) {
    const timestamp = nowIso();

    updateCollection("projects", (currentProjects) =>
      currentProjects.map((project) =>
        project.id === projectInput.id
          ? {
              ...project,
              title: projectInput.title.trim(),
              updatedAt: timestamp,
            }
          : project,
      ),
    );
  }

  function deleteProject(projectId) {
    updateCollection("projects", (currentProjects) =>
      currentProjects.filter((project) => project.id !== projectId),
    );
    updateCollection("projectActions", (currentActions) =>
      currentActions.filter((action) => action.projectId !== projectId),
    );
  }

  function saveProjectActions(projectId, actions) {
    const timestamp = nowIso();

    updateCollection("projectActions", (currentActions) => [
      ...currentActions.filter((action) => action.projectId !== projectId),
      ...actions.map((action, index) => ({
        ...action,
        id: action.id || createId(),
        projectId,
        title: action.title.trim(),
        completed: Boolean(action.completed),
        order: index,
        createdAt: action.createdAt || timestamp,
        updatedAt: timestamp,
        completedAt: action.completed ? action.completedAt || timestamp : null,
      })),
    ]);
  }

  function saveWaitingFor(itemInput) {
    const timestamp = nowIso();
    const cleanTitle = itemInput.title.trim();

    if (!cleanTitle) {
      return;
    }

    updateCollection("waitingFor", (currentItems) => {
      if (itemInput.id) {
        return currentItems.map((item) =>
          item.id === itemInput.id
            ? {
                ...item,
                title: cleanTitle,
                description: itemInput.description.trim(),
                updatedAt: timestamp,
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
          updatedAt: timestamp,
        },
        ...currentItems,
      ];
    });
  }

  function deleteWaitingFor(itemId) {
    updateCollection("waitingFor", (currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }

  function saveSomedayMaybe(itemInput) {
    const timestamp = nowIso();
    const cleanTitle = itemInput.title.trim();

    if (!cleanTitle) {
      return;
    }

    updateCollection("somedayMaybe", (currentItems) => {
      if (itemInput.id) {
        return currentItems.map((item) =>
          item.id === itemInput.id
            ? {
                ...item,
                title: cleanTitle,
                description: itemInput.description.trim(),
                updatedAt: timestamp,
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
          updatedAt: timestamp,
        },
        ...currentItems,
      ];
    });
  }

  function deleteSomedayMaybe(itemId) {
    updateCollection("somedayMaybe", (currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }

  function saveArchiveItem(itemInput) {
    const timestamp = nowIso();
    const cleanTitle = itemInput.title.trim();

    if (!cleanTitle) {
      return;
    }

    updateCollection("archiveItems", (currentItems) => {
      if (itemInput.id) {
        return currentItems.map((item) =>
          item.id === itemInput.id
            ? {
                ...item,
                title: cleanTitle,
                content: itemInput.content.trim(),
                updatedAt: timestamp,
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
          updatedAt: timestamp,
          archivedAt: timestamp,
        },
        ...currentItems,
      ];
    });
  }

  function deleteArchiveItem(itemId) {
    updateCollection("archiveItems", (currentItems) =>
      currentItems.filter((item) => item.id !== itemId),
    );
  }

  if (!sync.authReady) {
    return (
      <div className="auth-shell">
        <main className="auth-panel">
          <p className="eyebrow">Kaizen Sync</p>
          <h1>KAIZEN</h1>
          <p className="empty-state">Recupero sessione...</p>
        </main>
      </div>
    );
  }

  if (!sync.isAuthenticated && sync.config.isConfigured) {
    return (
      <AuthScreen
        error={sync.authError}
        isConfigured={sync.config.isConfigured}
        onSubmit={sync.signIn}
      />
    );
  }

  if (activeSection === PRIMARY_SECTIONS.gtd) {
    return (
      <>
        <SyncStatus sync={sync} />
        <GtdPage
          activeSection={activeSection}
          archiveItems={archiveItems}
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
      </>
    );
  }

  if (activeSection === PRIMARY_SECTIONS.note && activeNoteSection) {
    const activeSectionConfig = NOTE_SECTIONS[activeNoteSection];
    const activeSectionNotes = sectionNotes.filter(
      (note) => note.section === activeNoteSection,
    );

    return (
      <>
        <SyncStatus sync={sync} />
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
      </>
    );
  }

  if (activeSection === PRIMARY_SECTIONS.note) {
    return (
      <>
        <SyncStatus sync={sync} />
        <NotesHub
          activeSection={activeSection}
          noteSections={NOTE_SECTIONS}
          notes={sectionNotes}
          onNavigate={navigate}
          onOpenSection={setActiveNoteSection}
        />
      </>
    );
  }

  return (
    <>
      <SyncStatus sync={sync} />
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
        onDeleteCalendarItem={deleteCalendarItem}
        onToggleNextAction={toggleNextAction}
        projects={projects}
      />
    </>
  );
}
