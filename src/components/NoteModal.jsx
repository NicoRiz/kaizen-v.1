import { useState } from "react";

export default function NoteModal({ note, onClose, onSubmit, sectionTitle }) {
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");

  const isEmpty = !title.trim() && !content.trim();

  function handleSubmit(event) {
    event.preventDefault();

    if (isEmpty) {
      return;
    }

    onSubmit({
      id: note?.id,
      title,
      content,
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="note-modal-title"
        aria-modal="true"
        className="modal"
        role="dialog"
      >
        <div className="modal-heading">
          <h2 id="note-modal-title">
            {note ? "Modifica nota" : `Nuova nota ${sectionTitle}`}
          </h2>
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
            Titolo
            <input
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Titolo della nota"
              type="text"
              value={title}
            />
          </label>

          <label>
            Testo
            <textarea
              onChange={(event) => setContent(event.target.value)}
              placeholder="Scrivi la nota..."
              value={content}
            />
          </label>

          <div className="modal-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              Annulla
            </button>
            <button className="submit-button" disabled={isEmpty} type="submit">
              Salva
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
