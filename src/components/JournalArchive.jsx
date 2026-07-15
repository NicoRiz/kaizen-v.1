import { useEffect, useMemo, useState } from "react";
import {
  formatJournalDate,
  getJournalEntries,
} from "../lib/journal.js";
import JournalAnalysis from "./JournalAnalysis.jsx";

function getPreview(text) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 120)}...` : compact;
}

export default function JournalArchive({
  analyses,
  notes,
  onClose,
  onSaveJournal,
}) {
  const entries = useMemo(() => getJournalEntries(notes), [notes]);
  const [selectedDate, setSelectedDate] = useState(entries[0]?.date || "");
  const selectedEntry = entries.find((entry) => entry.date === selectedDate);
  const [draft, setDraft] = useState(selectedEntry?.text || "");

  useEffect(() => {
    if (!selectedDate && entries[0]?.date) {
      setSelectedDate(entries[0].date);
    }
  }, [entries, selectedDate]);

  useEffect(() => {
    setDraft(selectedEntry?.text || "");
  }, [selectedEntry]);

  function handleSave(event) {
    event.preventDefault();

    if (!selectedDate || !draft.trim()) {
      return;
    }

    onSaveJournal(selectedDate, draft);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="journal-archive-title"
        aria-modal="true"
        className="modal journal-archive-modal"
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">Journal</p>
            <h2 id="journal-archive-title">Archivio</h2>
          </div>
          <button
            aria-label="Chiudi archivio"
            className="ghost-button"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </div>

        {entries.length === 0 ? (
          <p className="empty-state">Nessun journal salvato.</p>
        ) : (
          <div className="journal-archive-layout">
            <div className="journal-archive-list" aria-label="Journal salvati">
              {entries.map((entry) => (
                <button
                  aria-current={entry.date === selectedDate ? "true" : undefined}
                  className={`journal-archive-item ${
                    entry.date === selectedDate ? "is-active" : ""
                  }`}
                  key={entry.date}
                  onClick={() => setSelectedDate(entry.date)}
                  type="button"
                >
                  <strong>{formatJournalDate(entry.date)}</strong>
                  <span>{getPreview(entry.text)}</span>
                </button>
              ))}
            </div>

            {selectedEntry && (
              <form className="journal-archive-detail" onSubmit={handleSave}>
                <label>
                  <span>{formatJournalDate(selectedEntry.date)}</span>
                  <textarea
                    aria-label={`Journal del ${formatJournalDate(
                      selectedEntry.date,
                    )}`}
                    onChange={(event) => setDraft(event.target.value)}
                    value={draft}
                  />
                </label>

                <button
                  className="submit-button"
                  disabled={!draft.trim()}
                  type="submit"
                >
                  Salva modifica
                </button>

                <JournalAnalysis analysis={analyses[selectedEntry.date]} />
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
