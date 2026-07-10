const NAV_ITEMS = [
  {
    key: "knowledge",
    label: "Knowledge",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5z" />
        <path d="M5 5.5v16A2.5 2.5 0 0 1 7.5 19H20" />
      </svg>
    ),
  },
  {
    key: "skills",
    label: "Skills",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="m16.5 7.5 2-2" />
      </svg>
    ),
  },
  {
    key: "home",
    label: "Home",
    isPrimary: true,
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 11.5 12 5l8 6.5" />
        <path d="M6.5 10.5V20h11v-9.5" />
        <path d="M10 20v-5h4v5" />
      </svg>
    ),
  },
  {
    key: "sharkmo",
    label: "Sharkmo",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 16c3.2-5.4 8-7.7 14.5-7" />
        <path d="M13 9.4 11 4l5.5 4.8" />
        <path d="M5 16c4 .5 7.5-.2 11-2.2" />
        <path d="M18.5 9c1 .7 1.5 1.7 1.5 3" />
      </svg>
    ),
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
              className={`bottom-nav-link ${
                item.isPrimary ? "bottom-nav-link--home" : ""
              } ${isActive ? "is-active" : ""}`}
              key={item.key}
              onClick={() => onNavigate?.(item.key)}
              type="button"
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
