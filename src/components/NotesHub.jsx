import BottomNav from "./BottomNav.jsx";

const SECTION_ORDER = ["oneiros", "journal"];

export default function NotesHub({
  activeSection,
  noteSections,
  notes,
  onNavigate,
  onOpenSection,
}) {
  return (
    <div className="app-shell">
      <main className="home">
        <header className="topbar section-topbar">
          <div>
            <p className="eyebrow">Hub</p>
            <h1>Note</h1>
          </div>
        </header>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Sezioni</p>
              <h2>Oneiros e Journal</h2>
            </div>
          </div>

          <div className="note-hub-grid">
            {SECTION_ORDER.map((sectionKey) => {
              const section = noteSections[sectionKey];
              const count = notes.filter((note) => note.section === sectionKey)
                .length;

              return (
                <button
                  className="note-hub-card"
                  key={section.key}
                  onClick={() => onOpenSection(section.key)}
                  type="button"
                >
                  <span>{section.eyebrow}</span>
                  <strong>{section.title}</strong>
                  <small>
                    {count} {count === 1 ? "nota" : "note"}
                  </small>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <BottomNav activeSection={activeSection} onNavigate={onNavigate} />
    </div>
  );
}
