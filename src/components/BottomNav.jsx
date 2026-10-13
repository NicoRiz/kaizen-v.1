import { primaryNavSection } from "../lib/navigation.js";
import AttentionBadge, { useAttention } from "./AttentionBadge.jsx";

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
  const primarySection = primaryNavSection(activeSection);
  const attention = useAttention();

  return (
    <nav className="bottom-nav" aria-label="Navigazione principale">
      <div className="bottom-nav-inner">
        {NAV_ITEMS.map((item) => {
          const isActive = primarySection === item.key;
          const count = isActive ? 0 : item.key === "home" ? attention.focus : item.key === "gtd" ? attention.projects : 0;

          return (
            <button
              aria-current={isActive ? "page" : undefined}
              aria-label={item.label}
              aria-description={count ? `${count} elementi da completare` : undefined}
              className={`bottom-nav-link ${isActive ? "is-active" : ""}`}
              key={item.key}
              onClick={() => onNavigate?.(item.key)}
              type="button"
            >
              <span className="nav-label">{item.label}</span>
              <AttentionBadge count={count} label="elementi da completare" />
            </button>
          );
        })}
      </div>
    </nav>
  );
}
