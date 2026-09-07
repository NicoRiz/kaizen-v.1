import { useMemo, useState } from "react";
import BottomNav from "./BottomNav.jsx";
import ScheduleTaskModal from "./ScheduleTaskModal.jsx";

const TABS = [
  { key: "projects", label: "Progetti" },
  { key: "waiting", label: "In attesa" },
  { key: "someday", label: "Prima o poi / Forse" },
  { key: "archive", label: "Archivio" },
];

function formatItemDate(value) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function BasicItemModal({
  item,
  mode,
  onClose,
  onSubmit,
  titleLabel = "Titolo",
  bodyLabel = "Descrizione",
  onDownloadAttachment,
}) {
  const [title, setTitle] = useState(item?.title || "");
  const [body, setBody] = useState(item?.description || item?.content || "");

  function handleSubmit(event) {
    event.preventDefault();

    if (!title.trim()) {
      return;
    }

    onSubmit({
      id: item?.id,
      title,
      description: body,
      content: body,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="basic-item-modal-title"
        aria-modal="true"
        className="modal"
        role="dialog"
      >
        <div className="modal-heading">
          <h2 id="basic-item-modal-title">{mode}</h2>
          <button
            aria-label="Chiudi"
            className="ghost-button"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        <form className="note-form" onSubmit={handleSubmit}>
          <label>
            {titleLabel}
            <input
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              type="text"
              value={title}
            />
          </label>
          {item?.attachments?.length > 0 && (
            <div className="attachment-list">
              <strong>Allegati</strong>
              {item.attachments.map((attachment) => (
                <button key={attachment.id} onClick={() => onDownloadAttachment(attachment)} type="button">
                  <span>{attachment.name}</span>
                  <small>{Math.max(1, Math.round(attachment.size / 1024))} KB · Scarica</small>
                </button>
              ))}
            </div>
          )}
          <label>
            {bodyLabel}
            <textarea
              onChange={(event) => setBody(event.target.value)}
              value={body}
            />
          </label>
          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Annulla
            </button>
            <button className="submit-button" disabled={!title.trim()} type="submit">
              Salva
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ProjectModal({
  actions,
  onClose,
  onDeleteProject,
  onSaveActions,
  onUpdateProject,
  project,
}) {
  const [title, setTitle] = useState(project.title);
  const [draftActions, setDraftActions] = useState(
    actions.map((action) => ({ ...action })),
  );
  const [draggedActionIndex, setDraggedActionIndex] = useState(null);

  function addAction() {
    setDraftActions((currentActions) => [
      ...currentActions,
      {
        id: "",
        projectId: project.id,
        title: "",
        completed: false,
        order: currentActions.length,
        createdAt: "",
        completedAt: null,
      },
    ]);
  }

  function updateAction(index, patch) {
    setDraftActions((currentActions) =>
      currentActions.map((action, actionIndex) =>
        actionIndex === index ? { ...action, ...patch } : action,
      ),
    );
  }

  function removeAction(index) {
    setDraftActions((currentActions) =>
      currentActions.filter((_, actionIndex) => actionIndex !== index),
    );
  }

  function moveAction(index, direction) {
    setDraftActions((currentActions) => {
      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= currentActions.length) {
        return currentActions;
      }

      const nextActions = [...currentActions];
      const [movedAction] = nextActions.splice(index, 1);
      nextActions.splice(nextIndex, 0, movedAction);
      return nextActions;
    });
  }

  function moveActionToIndex(fromIndex, toIndex) {
    setDraftActions((currentActions) => {
      if (
        fromIndex === null ||
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= currentActions.length ||
        toIndex >= currentActions.length
      ) {
        return currentActions;
      }

      const nextActions = [...currentActions];
      const [movedAction] = nextActions.splice(fromIndex, 1);
      nextActions.splice(toIndex, 0, movedAction);
      return nextActions;
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!title.trim()) {
      return;
    }

    onUpdateProject({ ...project, title });
    onSaveActions(
      project.id,
      draftActions.filter((action) => action.title.trim()),
    );
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="project-modal-title"
        aria-modal="true"
        className="modal project-modal"
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Progetto</p>
            <h2 id="project-modal-title">Modifica progetto</h2>
          </div>
          <button
            aria-label="Chiudi"
            className="ghost-button"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        <form className="task-form" onSubmit={handleSubmit}>
          <label>
            Titolo progetto
            <input
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              type="text"
              value={title}
            />
          </label>

          <fieldset>
            <legend>Azioni del progetto</legend>
            <div className="project-action-editor">
              {draftActions.map((action, index) => (
                <div
                  className="project-action-row"
                  draggable
                  key={action.id || index}
                  onDragEnd={() => setDraggedActionIndex(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={() => setDraggedActionIndex(index)}
                  onDrop={(event) => {
                    event.preventDefault();
                    moveActionToIndex(draggedActionIndex, index);
                    setDraggedActionIndex(null);
                  }}
                >
                  <label className="task-check">
                    <input
                      checked={action.completed}
                      onChange={(event) =>
                        updateAction(index, {
                          completed: event.target.checked,
                          completedAt: event.target.checked
                            ? new Date().toISOString()
                            : null,
                        })
                      }
                      type="checkbox"
                    />
                    <span />
                  </label>
                  <input
                    aria-label="Titolo azione"
                    onChange={(event) =>
                      updateAction(index, { title: event.target.value })
                    }
                    type="text"
                    value={action.title}
                  />
                  <div className="row-actions">
                    <button
                      aria-label="Sposta su"
                      className="ghost-button"
                      onClick={() => moveAction(index, -1)}
                      type="button"
                    >
                      Up
                    </button>
                    <button
                      aria-label="Sposta giu"
                      className="ghost-button"
                      onClick={() => moveAction(index, 1)}
                      type="button"
                    >
                      Down
                    </button>
                    <button
                      aria-label="Elimina azione"
                      className="delete-button"
                      onClick={() => removeAction(index)}
                      type="button"
                    >
                      x
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="secondary-button compact-button"
              onClick={addAction}
              type="button"
            >
              Aggiungi azione
            </button>
          </fieldset>

          <div className="modal-actions">
            <button
              className="secondary-button danger-button"
              onClick={() => {
                onDeleteProject(project.id);
                onClose();
              }}
              type="button"
            >
              Elimina
            </button>
            <button className="submit-button" disabled={!title.trim()} type="submit">
              Salva
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ProjectsTab({
  onDeleteProject,
  onSaveProjectActions,
  onUpdateProject,
  onScheduleTask,
  projectActions,
  projects,
  today,
}) {
  const [expandedProjectIds, setExpandedProjectIds] = useState([]);
  const [editingProject, setEditingProject] = useState(null);
  const [schedulingTask, setSchedulingTask] = useState(null);

  function toggleProject(projectId) {
    setExpandedProjectIds((currentIds) =>
      currentIds.includes(projectId)
        ? currentIds.filter((id) => id !== projectId)
        : [...currentIds, projectId],
    );
  }

  return (
    <section className="gtd-tab-panel">
      {projects.length === 0 ? (
        <p className="empty-state">Nessun progetto.</p>
      ) : (
        <ul className="project-list">
          {projects.map((project) => {
            const actions = projectActions
              .filter((action) => action.projectId === project.id)
              .sort((left, right) => (left.order || 0) - (right.order || 0));
            const isExpanded = expandedProjectIds.includes(project.id);

            return (
              <li className="project-card" key={project.id}>
                <div className="project-heading">
                  <button
                    aria-expanded={isExpanded}
                    className="project-toggle"
                    onClick={() => toggleProject(project.id)}
                    type="button"
                  >
                    <span aria-hidden="true">{isExpanded ? "^" : "v"}</span>
                    <strong>{project.title}</strong>
                  </button>
                  <button
                    aria-label={`Modifica ${project.title}`}
                    className="ghost-button"
                    onClick={() => setEditingProject(project)}
                    type="button"
                  >
                    ...
                  </button>
                </div>

                {isExpanded && (
                  <div className="project-actions">
                    {actions.length === 0 ? (
                      <p className="empty-state compact-empty">Nessuna azione.</p>
                    ) : (
                      <ul className="task-list">
                        {actions.map((action) => (
                          <li
                            className={`task-item ${
                              action.completed ? "is-completed" : ""
                            }`}
                            key={action.id}
                          >
                            <label className="task-check">
                              <input
                                checked={action.completed}
                                onChange={() =>
                                  onSaveProjectActions(
                                    project.id,
                                    actions.map((currentAction) =>
                                      currentAction.id === action.id
                                        ? {
                                            ...currentAction,
                                            completed: !currentAction.completed,
                                          }
                                        : currentAction,
                                    ),
                                  )
                                }
                                type="checkbox"
                              />
                              <span />
                            </label>
                            <div className="task-content">
                              <strong>{action.title}</strong>
                            </div>
                            <button
                              aria-label={`Pianifica ${action.title} nel calendario`}
                              className="secondary-button schedule-button"
                              onClick={() =>
                                setSchedulingTask({
                                  sourceCollection: "projectActions",
                                  sourceProjectId: project.id,
                                  sourceProjectTitle: project.title,
                                  sourceTaskId: action.id,
                                  title: action.title,
                                  description: action.description || "",
                                })
                              }
                              type="button"
                            >
                              Calendario
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editingProject && (
        <ProjectModal
          actions={projectActions
            .filter((action) => action.projectId === editingProject.id)
            .sort((left, right) => (left.order || 0) - (right.order || 0))}
          onClose={() => setEditingProject(null)}
          onDeleteProject={onDeleteProject}
          onSaveActions={onSaveProjectActions}
          onUpdateProject={onUpdateProject}
          project={editingProject}
        />
      )}

      {schedulingTask && (
        <ScheduleTaskModal
          initialDate={today}
          onClose={() => setSchedulingTask(null)}
          onSubmit={(schedule) => {
            onScheduleTask(schedulingTask, schedule);
            setSchedulingTask(null);
          }}
          sourceTask={schedulingTask}
        />
      )}
    </section>
  );
}

function EditableList({
  bodyKey = "description",
  bodyLabel = "Descrizione",
  emptyMessage,
  items,
  modalTitle,
  onDelete,
  onSave,
  searchable = false,
  onDownloadAttachment,
}) {
  const [editingItem, setEditingItem] = useState(null);
  const [search, setSearch] = useState("");
  const visibleItems = useMemo(() => {
    const cleanSearch = search.trim().toLowerCase();

    if (!cleanSearch) {
      return items;
    }

    return items.filter((item) =>
      `${item.title} ${item[bodyKey] || ""}`.toLowerCase().includes(cleanSearch),
    );
  }, [bodyKey, items, search]);

  return (
    <section className="gtd-tab-panel">
      <div className="list-toolbar">
        {searchable && (
          <input
            aria-label="Cerca archivio"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca"
            type="search"
            value={search}
          />
        )}
      </div>

      {visibleItems.length === 0 ? (
        <p className="empty-state">{emptyMessage}</p>
      ) : (
        <ul className="note-list">
          {visibleItems.map((item) => (
            <li className="note-card" key={item.id}>
              <button
                className="note-card-main"
                onClick={() => setEditingItem(item)}
                type="button"
              >
                <span>{formatItemDate(item.createdAt)}</span>
                <strong>{item.title}</strong>
                <p>{item[bodyKey] || "Nessuna descrizione."}</p>
              </button>
              <button
                aria-label={`Elimina ${item.title}`}
                className="delete-button"
                onClick={() => onDelete(item.id)}
                type="button"
              >
                x
              </button>
            </li>
          ))}
        </ul>
      )}

      {editingItem && (
        <BasicItemModal
          bodyLabel={bodyLabel}
          item={editingItem}
          mode={modalTitle}
          onClose={() => {
            setEditingItem(null);
          }}
          onSubmit={(itemInput) => {
            onSave(itemInput);
            setEditingItem(null);
          }}
          onDownloadAttachment={onDownloadAttachment}
        />
      )}
    </section>
  );
}

export default function GtdPage({
  activeSection,
  archiveItems,
  onDeleteArchiveItem,
  onDownloadArchiveAttachment,
  onDeleteProject,
  onDeleteSomedayMaybe,
  onDeleteWaitingFor,
  onNavigate,
  onSaveArchiveItem,
  onSaveProjectActions,
  onSaveSomedayMaybe,
  onSaveWaitingFor,
  onScheduleTask,
  onUpdateProject,
  projectActions,
  projects,
  somedayMaybe,
  waitingFor,
  today,
}) {
  const [activeTab, setActiveTab] = useState("projects");

  return (
    <div className="app-shell">
      <main className="home">
        <header className="topbar section-topbar">
          <div>
            <p className="eyebrow">Sistema</p>
            <h1>GTD</h1>
          </div>
        </header>

        <section className="panel">
          <div className="tab-list" role="tablist" aria-label="Sezioni GTD">
            {TABS.map((tab) => (
              <button
                aria-selected={activeTab === tab.key}
                className={activeTab === tab.key ? "is-selected" : ""}
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "projects" && (
            <ProjectsTab
              onDeleteProject={onDeleteProject}
              onSaveProjectActions={onSaveProjectActions}
              onUpdateProject={onUpdateProject}
              onScheduleTask={onScheduleTask}
              projectActions={projectActions}
              projects={projects}
              today={today}
            />
          )}

          {activeTab === "waiting" && (
            <EditableList
              emptyMessage="Nessun elemento in attesa."
              items={waitingFor}
              modalTitle="In attesa"
              onDelete={onDeleteWaitingFor}
              onSave={onSaveWaitingFor}
            />
          )}

          {activeTab === "someday" && (
            <EditableList
              emptyMessage="Nessuna idea in Prima o poi / Forse."
              items={somedayMaybe}
              modalTitle="Prima o poi / Forse"
              onDelete={onDeleteSomedayMaybe}
              onSave={onSaveSomedayMaybe}
            />
          )}

          {activeTab === "archive" && (
            <EditableList
              bodyKey="content"
              bodyLabel="Contenuto"
              emptyMessage="Archivio vuoto."
              items={archiveItems}
              onDownloadAttachment={onDownloadArchiveAttachment}
              modalTitle="Archivio"
              onDelete={onDeleteArchiveItem}
              onSave={onSaveArchiveItem}
              searchable
            />
          )}
        </section>
      </main>

      <BottomNav activeSection={activeSection} onNavigate={onNavigate} />
    </div>
  );
}
