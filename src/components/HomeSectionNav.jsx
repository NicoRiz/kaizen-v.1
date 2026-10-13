import AttentionBadge, { useAttention } from "./AttentionBadge.jsx";

const HOME_SECTIONS = [
  { key: "calendar", label: "Calendario" },
  { key: "home", label: "Focus" },
  { key: "progress", label: "Progressi" },
];

export default function HomeSectionNav({ activeSection, onNavigate }) {
  const attention = useAttention();
  return (
    <nav aria-label="Sezioni Home" className="home-section-nav">
      {HOME_SECTIONS.map((section) => {
        const isActive = activeSection === section.key;
        const count = !isActive && section.key === "home" ? attention.focus : 0;
        return (
          <button
            aria-current={isActive ? "page" : undefined}
            aria-label={section.label}
            aria-description={count ? `${count} elementi in Focus da completare` : undefined}
            className={isActive ? "is-active" : ""}
            key={section.key}
            onClick={() => onNavigate(section.key)}
            type="button"
          >
            {section.label}
            <AttentionBadge count={count} label="elementi in Focus da completare" />
          </button>
        );
      })}
    </nav>
  );
}
