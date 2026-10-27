const HOME_SECTIONS = [
  { key: "calendar", label: "Calendario" },
  { key: "home", label: "Focus" },
  { key: "progress", label: "Progressi" },
];

export default function HomeSectionNav({ activeSection, onNavigate }) {
  return (
    <nav aria-label="Sezioni Home" className="home-section-nav">
      {HOME_SECTIONS.map((section) => {
        const isActive = activeSection === section.key;
        return (
          <button
            aria-current={isActive ? "page" : undefined}
            className={isActive ? "is-active" : ""}
            key={section.key}
            onClick={() => onNavigate(section.key)}
            type="button"
          >
            {section.label}
          </button>
        );
      })}
    </nav>
  );
}
