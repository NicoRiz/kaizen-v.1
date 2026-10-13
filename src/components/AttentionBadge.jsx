import { createContext, useContext } from "react";

export const AttentionContext = createContext({ focus: 0, projects: 0 });
export const useAttention = () => useContext(AttentionContext);

// When embedded in a navigation button, the parent owns the click target.
export default function AttentionBadge({ count, label, onClick, text }) {
  if (!count) return null;
  const props = { className: "counter attention-badge", title: `${count} ${label}` };
  const content = <>{count}{text ? ` ${text}` : ""}</>;
  return onClick ? (
    <button {...props} aria-label={`${count} ${label}`} onClick={onClick} type="button">{content}</button>
  ) : (
    <span {...props}><span aria-hidden="true">{content}</span><span className="visually-hidden">{count} {label}</span></span>
  );
}

export function focusAttentionGroup(id) {
  const group = document.getElementById(id);
  if (!group) return;
  group.scrollIntoView({ block: "center" });
  const target = group.querySelector('[data-pending="true"] button, [data-pending="true"] input') || group.querySelector("button, input");
  target?.focus({ preventScroll: true });
}
