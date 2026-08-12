const NAV_ITEMS = [
  {
    key: "gtd",
    label: "GTD",
  },
  {
    key: "home",
    label: "Home",
  },
  {
    key: "note",
    label: "Note",
  },
];

export default function BottomNav({ activeSection = "home", onNavigate }) {
  return (
    <nav className="bottom-nav" aria-label="Navigazione principale">
      <div className="bottom-nav-inner">
        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.key;

          return (
            <button
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
              className={`bottom-nav-link ${isActive ? "is-active" : ""}`}
              key={item.key}
              onClick={() => onNavigate?.(item.key)}
              type="button"
            >
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
