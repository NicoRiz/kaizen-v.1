import { useMemo, useState } from "react";
import BottomNav from "./BottomNav.jsx";
import NoteCard from "./NoteCard.jsx";
import NoteModal from "./NoteModal.jsx";

export default function NotesSection({
  activeSection,
  emptyMessage,
  eyebrow,
  notes,
  onDeleteNote,
  onNavigate,
  onSaveNote,
  section,
  title,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);

  const sortedNotes = useMemo(
    () =>
      [...notes].sort(
        (left, right) => new Date(right.updatedAt) - new Date(left.updatedAt),
      ),
    [notes],
  );

  function openNewNote() {
    setEditingNote(null);
    setIsModalOpen(true);
  }

  function openExistingNote(note) {
    setEditingNote(note);
    setIsModalOpen(true);
  }

  function closeModal() {
    setEditingNote(null);
    setIsModalOpen(false);
  }

  return (
    <div className="app-shell">
      <main className="home">
        <header className="topbar section-topbar">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <button
            aria-label={`Aggiungi nota ${title}`}
            className="add-button"
            onClick={openNewNote}
            type="button"
          >
            <span aria-hidden="true">+</span>
            Nuova nota
          </button>
        </header>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Note salvate</p>
              <h2>{title}</h2>
            </div>
            <span className="counter">{sortedNotes.length}</span>
          </div>

          {sortedNotes.length === 0 ? (
            <p className="empty-state">{emptyMessage}</p>
          ) : (
            <ul className="note-list">
              {sortedNotes.map((note) => (
                <NoteCard
                  key={note.id}
                  note={note}
                  onDelete={onDeleteNote}
                  onOpen={openExistingNote}
                />
              ))}
            </ul>
          )}
        </section>
      </main>

      <BottomNav activeSection={activeSection} onNavigate={onNavigate} />

      {isModalOpen && (
        <NoteModal
          note={editingNote}
          onClose={closeModal}
          onSubmit={(note) => {
            onSaveNote({ ...note, section });
            closeModal();
          }}
          sectionTitle={title}
        />
      )}
    </div>
  );
}
