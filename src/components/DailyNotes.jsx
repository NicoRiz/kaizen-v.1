export default function DailyNotes({ note, onChange }) {
  return (
    <section className="panel notes-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Diario</p>
          <h2>Note giornaliere</h2>
        </div>
      </div>

      <textarea
        aria-label="Note giornaliere"
        onChange={(event) => onChange(event.target.value)}
        placeholder="Scrivi qui pensieri, focus o piccoli progressi di oggi..."
        value={note}
      />
    </section>
  );
}
