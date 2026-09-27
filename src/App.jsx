import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AuthScreen from "./components/AuthScreen.jsx";
import AreasPage from "./components/AreasPage.jsx";
import GtdPage from "./components/GtdPage.jsx";
import HabitsPage from "./components/HabitsPage.jsx";
import Home from "./components/Home.jsx";
import NotesHub from "./components/NotesHub.jsx";
import NotesSection from "./components/NotesSection.jsx";
import SyncStatus from "./components/SyncStatus.jsx";
import ProgressPage from "./components/ProgressPage.jsx";
import { useKaizenSync } from "./hooks/useKaizenSync.js";
import { STORAGE_KEYS } from "./lib/kaizenData.js";
import {
  createCachedKaizenData,
  createId,
  nowIso,
} from "./lib/syncCore.js";
import { addDays, dateKey } from "./utils/date.js";
import { readStorage, writeStorage } from "./utils/storage.js";
import {
  createScheduledCalendarItem,
  updateCalendarItemInCollection,
} from "./lib/calendarScheduling.js";
import {
  deleteHabitLog as deleteHabitLogFromData,
  reconcileHabitContributions,
  upsertHabitLog,
} from "./lib/habits.js";

const PRIMARY_SECTIONS = {
  areas: "areas",
  gtd: "gtd",
  habits: "habits",
  home: "home",
  note: "note",
  progress: "progress",
};

const NOTE_SECTIONS = {
  journal: {
    key: "journal",
    title: "Journal",
    eyebrow: "Riflessioni",
    emptyMessage: "Nessuna nota salvata nel Journal.",
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
  return createCachedKaizenData();
}

function normalizeProjectActions(projectId, actions, timestamp) {
  return actions.map((action, index) => ({
    ...action,
    id: action.id || createId(),
    projectId,
    title: action.title.trim(),
    completed: Boolean(action.completed),
    order: index,
    createdAt: action.createdAt || timestamp,
    updatedAt: timestamp,
    completedAt: action.completed ? action.completedAt || timestamp : null,
  }));
}

export default function App() {
  const [kaizenData, setKaizenData] = useState(initialKaizenData);
  const kaizenDataRef = useRef(kaizenData);
  const [migration, setMigration] = useState(() =>
    readStorage(STORAGE_KEYS.migration, {}),
  );
  const [activeSection, setActiveSection] = useState(PRIMARY_SECTIONS.home);
  const [activeNoteSection, setActiveNoteSection] = useState(null);
  const replaceKaizenData = useCallback((nextData) => {
    kaizenDataRef.current = nextData;
    setKaizenData(nextData);
  }, []);
  const sync = useKaizenSync({ onReplaceData: replaceKaizenData });

  const today = useMemo(() => dateKey(), []);
  const {
    areas,
    archiveItems,
    calendarItems,
    habitLogs,
    habits,
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
    writeStorage(STORAGE_KEYS.migration, migration);
  }, [migration]);

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

  useEffect(() => {
    const legacyDeferredProjects = somedayMaybe.filter(
      (item) =>
        item.sourceCollection === "projects" && Array.isArray(item.projectActions),
    );

    if (legacyDeferredProjects.length === 0) {
      return;
    }

    const timestamp = nowIso();
    updateCollections(
      ["projects", "projectActions", "somedayMaybe"],
      (currentData) => {
        const currentDeferredProjects = currentData.somedayMaybe.filter(
          (item) =>
            item.sourceCollection === "projects" &&
            Array.isArray(item.projectActions),
        );

        if (currentDeferredProjects.length === 0) {
          return currentData;
        }

        const migratedProjectIds = new Set(
          currentDeferredProjects.map((project) => project.id),
        );
        const projectsById = new Map(
          currentData.projects.map((project) => [project.id, project]),
        );
        const actionsById = new Map(
          currentData.projectActions.map((action) => [action.id, action]),
        );

        for (const deferredProject of currentDeferredProjects) {
          const { projectActions: nestedActions, ...projectData } = deferredProject;
          projectsById.set(deferredProject.id, {
            ...projectData,
            status: "someday",
            updatedAt: projectData.updatedAt || timestamp,
          });

          for (const action of normalizeProjectActions(
            deferredProject.id,
            nestedActions,
            timestamp,
          )) {
            actionsById.set(action.id, action);
          }
        }

        return {
          ...currentData,
          projects: [...projectsById.values()],
          projectActions: [...actionsById.values()],
          somedayMaybe: currentData.somedayMaybe.filter(
            (item) => !migratedProjectIds.has(item.id),
          ),
        };
      },
    );
  }, [somedayMaybe]);

  function updateCollection(collectionName, updater) {
    updateCollections([collectionName], (currentData) => {
      const currentValue = currentData[collectionName];
      const nextValue =
        typeof updater === "function" ? updater(currentValue, currentData) : updater;

      return Object.is(currentValue, nextValue)
        ? currentData
        : { ...currentData, [collectionName]: nextValue };
    });
  }

  function updateCollections(collectionNames, updater) {
    const currentData = kaizenDataRef.current;
    const nextData = updater(currentData);

    if (Object.is(currentData, nextData)) {
      return;
    }

    kaizenDataRef.current = nextData;
    setKaizenData(nextData);
    sync.trackDataChange(collectionNames, nextData);
  }

  function navigate(section) {
    setActiveSection(section);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
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

  function createProject(title, areaId = null) {
    const cleanTitle = title.trim();

    if (!cleanTitle) {
      return null;
    }

    const timestamp = nowIso();
    const project = {
      id: createId(),
      title: cleanTitle,
      areaId,
      progressTracking: "none",
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    updateCollection("projects", (currentProjects) => [...currentProjects, project]);
    return project;
  }

  async function clarifyInboxItem(itemId, result) {
    const timestamp = nowIso();
    const clarifiedText = result.clarifiedText.trim();
    const inboxItemTitle =
      inboxItems.find((item) => item.id === itemId)?.originalText?.trim() ||
      clarifiedText;

    if (result.actionable) {
      const nextActionTitle = result.nextActionTitle.trim() || inboxItemTitle;

      if (result.destination === "projects") {
        const projectId =
          result.projectId || createProject(result.newProjectTitle, result.areaId || null)?.id;

        if (!projectId) {
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
            areaId: result.areaId || null,
          },
        ]);
      }

      if (result.destination === "next-actions") {
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
            areaId: result.areaId || null,
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
        const archiveItemId = createId();
        const attachments = result.attachments?.length
          ? await sync.uploadArchiveAttachments(archiveItemId, result.attachments)
          : [];
        updateCollection("archiveItems", (currentItems) => [
          {
            id: archiveItemId,
            title: clarifiedText,
            content: result.description.trim() || clarifiedText,
            createdAt: timestamp,
            updatedAt: timestamp,
            archivedAt: timestamp,
            sourceInboxItemId: itemId,
            attachments,
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
        return updateCalendarItemInCollection(
          currentItems,
          { ...itemInput, title: cleanTitle },
          timestamp,
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

  function updateNextActionArea(actionId, areaId) {
    const timestamp = nowIso();
    updateCollection("nextActions", (currentActions) =>
      currentActions.map((action) =>
        action.id === actionId
          ? { ...action, areaId: areaId || null, updatedAt: timestamp }
          : action,
      ),
    );
  }

  function saveArea(areaInput) {
    const timestamp = nowIso();
    const name = areaInput.name.trim();
    if (!name) return;

    updateCollection("areas", (currentAreas) => {
      if (areaInput.id) {
        return currentAreas.map((area) =>
          area.id === areaInput.id
            ? {
                ...area,
                name,
                color: areaInput.color,
                description: (areaInput.description || "").trim(),
                updatedAt: timestamp,
              }
            : area,
        );
      }

      return [
        ...currentAreas,
        {
          id: createId(),
          name,
          color: areaInput.color,
          description: (areaInput.description || "").trim(),
          status: "active",
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ];
    });
  }

  function setAreaStatus(areaId, status) {
    const timestamp = nowIso();
    updateCollection("areas", (currentAreas) =>
      currentAreas.map((area) =>
        area.id === areaId ? { ...area, status, updatedAt: timestamp } : area,
      ),
    );
  }

  function normalizeHabitInput(input, existing, timestamp) {
    const type = input.type === "quantitative" ? "quantitative" : "boolean";
    const frequency = ["daily", "weekdays", "weekly"].includes(input.frequency)
      ? input.frequency
      : "daily";
    return {
      ...existing,
      id: existing?.id || createId(),
      name: input.name.trim(),
      areaId: input.areaId,
      projectId: input.projectId || null,
      status: existing?.status || "active",
      type,
      frequency,
      weekdays:
        frequency === "weekdays"
          ? [...new Set((input.weekdays || []).map(Number))]
          : [],
      timesPerWeek: frequency === "weekly" ? Math.max(1, Number(input.timesPerWeek) || 1) : null,
      unit: type === "quantitative" ? (input.unit || "").trim() : null,
      minimum:
        type === "quantitative" && input.minimum !== ""
          ? Math.max(0, Number(input.minimum) || 0)
          : null,
      target:
        type === "quantitative" && frequency !== "weekly"
          ? Math.max(0.01, Number(input.target) || 1)
          : 1,
      startDate: input.startDate,
      scheduledTime: input.scheduledTime || null,
      updateProjectProgress: Boolean(input.updateProjectProgress && input.projectId),
      pausedRanges: existing?.pausedRanges || [],
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
    };
  }

  function saveHabit(habitInput) {
    const timestamp = nowIso();
    updateCollections(["habits", "habitLogs", "projects"], (currentData) => {
      const existing = currentData.habits.find((habit) => habit.id === habitInput.id);
      const habit = normalizeHabitInput(habitInput, existing, timestamp);
      const reconciled = reconcileHabitContributions({
        habitBefore: existing,
        habitAfter: habit,
        habitLogs: currentData.habitLogs,
        projects: currentData.projects,
        timestamp,
      });

      return {
        ...currentData,
        habits: existing
          ? currentData.habits.map((item) => (item.id === habit.id ? habit : item))
          : [...currentData.habits, habit],
        habitLogs: reconciled.habitLogs,
        projects: reconciled.projects,
      };
    });
  }

  function setHabitStatus(habitId, status) {
    const timestamp = nowIso();
    updateCollection("habits", (currentHabits) =>
      currentHabits.map((habit) => {
        if (habit.id !== habitId) return habit;

        const pausedRanges = [...(habit.pausedRanges || [])];
        if (status === "paused" && habit.status !== "paused") {
          pausedRanges.push({ startedOn: today, endedOn: null });
        }
        if (status === "active") {
          const openIndex = pausedRanges.findLastIndex((range) => !range.endedOn);
          if (openIndex >= 0) {
            pausedRanges[openIndex] = {
              ...pausedRanges[openIndex],
              endedOn: addDays(today, -1),
            };
          }
        }

        return {
          ...habit,
          status,
          pausedRanges,
          archivedAt: status === "archived" ? timestamp : null,
          updatedAt: timestamp,
        };
      }),
    );
  }

  function saveHabitLog(habitId, input) {
    const timestamp = nowIso();
    updateCollections(["habitLogs", "projects"], (currentData) => {
      const habit = currentData.habits.find((item) => item.id === habitId);
      if (!habit) return currentData;

      let sourceLogs = currentData.habitLogs;
      let sourceProjects = currentData.projects;
      const previous = input.previousLogId
        ? sourceLogs.find((log) => log.id === input.previousLogId)
        : null;

      if (previous && previous.date !== input.date) {
        const removed = deleteHabitLogFromData({
          habitLogs: sourceLogs,
          logId: previous.id,
          projects: sourceProjects,
          timestamp,
        });
        sourceLogs = removed.habitLogs;
        sourceProjects = removed.projects;
      }

      const result = upsertHabitLog({
        habit,
        habitLogs: sourceLogs,
        input,
        projects: sourceProjects,
        id: previous?.date === input.date ? previous.id : createId(),
        timestamp,
      });
      return { ...currentData, habitLogs: result.habitLogs, projects: result.projects };
    });
  }

  function deleteHabitLog(logId) {
    const timestamp = nowIso();
    updateCollections(["habitLogs", "projects"], (currentData) => {
      const result = deleteHabitLogFromData({
        habitLogs: currentData.habitLogs,
        logId,
        projects: currentData.projects,
        timestamp,
      });
      return { ...currentData, ...result };
    });
  }

  function scheduleTaskInCalendar(sourceTask, schedule) {
    const timestamp = nowIso();
    const calendarItem = createScheduledCalendarItem({
      id: createId(),
      sourceTask,
      schedule,
      timestamp,
    });

    if (!calendarItem) {
      return;
    }

    updateCollection("calendarItems", (currentItems) => [
      ...currentItems,
      calendarItem,
    ]);
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
              ...projectInput,
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

  function createDetailedProject(projectInput, actions = []) {
    const timestamp = nowIso();
    const title = projectInput.title.trim();
    if (!title) return;
    const projectId = createId();
    const project = {
      id: projectId,
      title,
      areaId: projectInput.areaId || null,
      progressTracking: projectInput.progressTracking || "none",
      progressUnit:
        projectInput.progressTracking === "quantitative"
          ? (projectInput.progressUnit || "").trim()
          : null,
      currentValue:
        projectInput.progressTracking === "quantitative"
          ? Math.max(0, Number(projectInput.currentValue) || 0)
          : null,
      targetValue:
        projectInput.progressTracking === "quantitative"
          ? Math.max(0.01, Number(projectInput.targetValue) || 1)
          : null,
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    updateCollections(["projects", "projectActions"], (currentData) => ({
      ...currentData,
      projects: [...currentData.projects, project],
      projectActions: [
        ...currentData.projectActions,
        ...normalizeProjectActions(
          projectId,
          actions.filter((action) => action.title.trim()),
          timestamp,
        ),
      ],
    }));
  }

  function moveProjectToSomedayMaybe(projectInput, actionsInput) {
    moveProjectToStatus(projectInput, actionsInput, "someday");
  }

  function moveProjectToProjects(projectInput, actionsInput) {
    moveProjectToStatus(projectInput, actionsInput, "active");
  }

  function moveProjectToStatus(projectInput, actionsInput, status) {
    const timestamp = nowIso();

    updateCollections(
      ["projects", "projectActions"],
      (currentData) => {
        const project = currentData.projects.find(
          (currentProject) => currentProject.id === projectInput.id,
        );

        if (!project) {
          return currentData;
        }

        const normalizedActions = normalizeProjectActions(
          project.id,
          actionsInput,
          timestamp,
        );

        return {
          ...currentData,
          projects: currentData.projects.map((currentProject) =>
            currentProject.id === project.id
              ? {
                  ...currentProject,
                  ...projectInput,
                  title: projectInput.title.trim(),
                  status,
                  movedAt: timestamp,
                  updatedAt: timestamp,
                }
              : currentProject,
          ),
          projectActions: [
            ...currentData.projectActions.filter(
              (action) => action.projectId !== project.id,
            ),
            ...normalizedActions,
          ],
        };
      },
    );
  }

  function saveProjectActions(projectId, actions) {
    const timestamp = nowIso();

    updateCollection("projectActions", (currentActions) => [
      ...currentActions.filter((action) => action.projectId !== projectId),
      ...normalizeProjectActions(projectId, actions, timestamp),
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

  async function deleteArchiveItem(itemId) {
    const item = archiveItems.find((archiveItem) => archiveItem.id === itemId);
    await sync.deleteArchiveAttachments(item?.attachments);
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

  if (activeSection === PRIMARY_SECTIONS.habits) {
    return (
      <>
        <SyncStatus sync={sync} />
        <HabitsPage
          activeSection={activeSection}
          areas={areas}
          habits={habits}
          logs={habitLogs}
          onDeleteLog={deleteHabitLog}
          onNavigate={navigate}
          onSaveHabit={saveHabit}
          onSaveLog={saveHabitLog}
          onSetHabitStatus={setHabitStatus}
          projects={projects}
          today={today}
        />
      </>
    );
  }

  if (activeSection === PRIMARY_SECTIONS.areas) {
    return (
      <>
        <SyncStatus sync={sync} />
        <AreasPage
          activeSection={activeSection}
          areas={areas}
          habits={habits}
          logs={habitLogs}
          nextActions={nextActions}
          onNavigate={navigate}
          onSaveArea={saveArea}
          onSetAreaStatus={setAreaStatus}
          projectActions={projectActions}
          projects={projects}
          today={today}
        />
      </>
    );
  }

  if (activeSection === PRIMARY_SECTIONS.progress) {
    return (
      <>
        <SyncStatus sync={sync} />
        <ProgressPage
          activeSection={activeSection}
          areas={areas.filter((area) => area.status !== "archived")}
          habits={habits}
          logs={habitLogs}
          onNavigate={navigate}
          projects={projects}
          today={today}
        />
      </>
    );
  }

  if (activeSection === PRIMARY_SECTIONS.gtd) {
    return (
      <>
        <SyncStatus sync={sync} />
        <GtdPage
          activeSection={activeSection}
          areas={areas}
          archiveItems={archiveItems}
          onCreateProject={createDetailedProject}
          onDeleteArchiveItem={deleteArchiveItem}
          onDownloadArchiveAttachment={sync.downloadArchiveAttachment}
          onDeleteProject={deleteProject}
          onMoveProjectToSomedayMaybe={moveProjectToSomedayMaybe}
          onMoveProjectToProjects={moveProjectToProjects}
          onDeleteSomedayMaybe={deleteSomedayMaybe}
          onDeleteWaitingFor={deleteWaitingFor}
          onNavigate={navigate}
          onSaveArchiveItem={saveArchiveItem}
          onSaveProjectActions={saveProjectActions}
          onScheduleTask={scheduleTaskInCalendar}
          onSaveSomedayMaybe={saveSomedayMaybe}
          onSaveWaitingFor={saveWaitingFor}
          onUpdateProject={updateProject}
          projectActions={projectActions}
          projects={projects}
          somedayMaybe={somedayMaybe}
          waitingFor={waitingFor}
          today={today}
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
        areas={areas}
        calendarItems={calendarItems}
        date={today}
        habitLogs={habitLogs}
        habits={habits}
        inboxItems={inboxItems}
        nextActions={nextActions}
        onAddInboxItem={addInboxItem}
        onClarifyInboxItem={clarifyInboxItem}
        onLogHabit={saveHabitLog}
        onNavigate={navigate}
        onSaveCalendarItem={saveCalendarItem}
        onScheduleTask={scheduleTaskInCalendar}
        onDeleteCalendarItem={deleteCalendarItem}
        onToggleNextAction={toggleNextAction}
        onUpdateNextActionArea={updateNextActionArea}
        projects={projects.filter((project) => project.status !== "someday")}
      />
    </>
  );
}
