function formatNoteDate(value) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function getPreview(content) {
  const compact = content.replace(/\s+/g, " ").trim();

  if (!compact) {
    return "Nessun testo inserito.";
  }

  return compact.length > 120 ? `${compact.slice(0, 120)}...` : compact;
}

export default function NoteCard({ note, onDelete, onOpen }) {
  return (
    <li className="note-card">
      <button
        className="note-card-main"
        onClick={() => onOpen(note)}
        type="button"
      >
        <span>{formatNoteDate(note.createdAt)}</span>
        <strong>{note.title || "Nota senza titolo"}</strong>
        <p>{getPreview(note.content)}</p>
      </button>

      <button
        aria-label={`Elimina ${note.title || "nota"}`}
        className="delete-button"
        onClick={() => onDelete(note.id)}
        type="button"
      >
        x
      </button>
    </li>
  );
}
