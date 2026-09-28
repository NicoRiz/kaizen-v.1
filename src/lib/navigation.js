export const APP_ROUTES = {
  gtd: "#/gtd",
  home: "#/home/focus",
  calendar: "#/home/calendar",
  progress: "#/home/progress",
  habits: "#/home/habits",
  areas: "#/home/areas",
  note: "#/notes",
};

const ROUTE_ALIASES = {
  "": APP_ROUTES.home,
  "#": APP_ROUTES.home,
  "#/": APP_ROUTES.home,
  "#/home": APP_ROUTES.home,
  "#/focus": APP_ROUTES.home,
  "#/calendar": APP_ROUTES.calendar,
  "#/progress": APP_ROUTES.progress,
  "#/habits": APP_ROUTES.habits,
  "#/areas": APP_ROUTES.areas,
  "#/note": APP_ROUTES.note,
};

export function noteRoute(section) {
  return section ? `#/notes/${encodeURIComponent(section)}` : APP_ROUTES.note;
}

export function routeForSection(section, noteSection = null) {
  if (section === "note") {
    return noteRoute(noteSection);
  }

  return APP_ROUTES[section] || APP_ROUTES.home;
}

export function parseAppRoute(input = "") {
  const rawHash = typeof input === "string" ? input.trim() : "";
  const hash = ROUTE_ALIASES[rawHash] || rawHash || APP_ROUTES.home;
  const normalized = hash.startsWith("#") ? hash : `#${hash.startsWith("/") ? hash : `/${hash}`}`;

  if (normalized === APP_ROUTES.gtd) {
    return { section: "gtd", noteSection: null, canonicalHash: APP_ROUTES.gtd };
  }

  if (normalized === APP_ROUTES.calendar) {
    return { section: "calendar", noteSection: null, canonicalHash: APP_ROUTES.calendar };
  }

  if (normalized === APP_ROUTES.progress) {
    return { section: "progress", noteSection: null, canonicalHash: APP_ROUTES.progress };
  }

  if (normalized === APP_ROUTES.habits) {
    return { section: "habits", noteSection: null, canonicalHash: APP_ROUTES.habits };
  }

  if (normalized === APP_ROUTES.areas) {
    return { section: "areas", noteSection: null, canonicalHash: APP_ROUTES.areas };
  }

  if (normalized === APP_ROUTES.note || normalized.startsWith("#/notes/")) {
    const noteSection = normalized.startsWith("#/notes/")
      ? decodeURIComponent(normalized.slice("#/notes/".length))
      : null;
    return {
      section: "note",
      noteSection,
      canonicalHash: noteRoute(noteSection),
    };
  }

  return { section: "home", noteSection: null, canonicalHash: APP_ROUTES.home };
}

export function primaryNavSection(section) {
  if (["home", "calendar", "progress", "habits", "areas"].includes(section)) {
    return "home";
  }
  return section === "note" ? "note" : "gtd";
}
