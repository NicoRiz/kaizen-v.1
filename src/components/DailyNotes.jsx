import { useState } from "react";
import JournalAnalysis from "./JournalAnalysis.jsx";
import JournalArchive from "./JournalArchive.jsx";

export default function DailyNotes({
  analyses,
  analysis,
  error,
  isAnalyzing,
  note,
  notes,
  onAddSuggestedStep,
  onAnalyze,
  onChange,
  onSaveJournal,
}) {
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const isJournalEmpty = !note.trim();

  return (
    <section className="panel notes-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Diario</p>
          <h2>Journal della giornata</h2>
        </div>
        <button
          className="secondary-button compact-button"
          onClick={() => setIsArchiveOpen(true)}
          type="button"
        >
          Archivio
        </button>
      </div>

      <textarea
        aria-label="Journal della giornata"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Scrivi qui cosa e' successo oggi, progressi, ostacoli o attivita' troppo grandi da spezzare..."
        value={note}
      />

      <div className="journal-actions">
        <button
          className="submit-button"
          disabled={isJournalEmpty || isAnalyzing}
          onClick={onAnalyze}
          type="button"
        >
          {isAnalyzing ? "Analisi in corso..." : "Analizza giornata"}
        </button>
        {error && <p className="form-error">{error}</p>}
      </div>

      <JournalAnalysis
        analysis={analysis}
        onAddSuggestedStep={onAddSuggestedStep}
      />

      {isArchiveOpen && (
        <JournalArchive
          analyses={analyses}
          notes={notes}
          onClose={() => setIsArchiveOpen(false)}
          onSaveJournal={onSaveJournal}
        />
      )}
    </section>
  );
}
