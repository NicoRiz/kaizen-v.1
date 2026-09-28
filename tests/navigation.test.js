import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_ROUTES,
  parseAppRoute,
  primaryNavSection,
  routeForSection,
} from "../src/lib/navigation.js";

test("empty and Home routes resolve to Focus by default", () => {
  assert.deepEqual(parseAppRoute(""), {
    section: "home",
    noteSection: null,
    canonicalHash: APP_ROUTES.home,
  });
  assert.equal(routeForSection("home"), "#/home/focus");
  assert.equal(parseAppRoute("#/home").canonicalHash, "#/home/focus");
});

test("Home child routes remain addressable on refresh", () => {
  assert.equal(parseAppRoute("#/home/calendar").section, "calendar");
  assert.equal(parseAppRoute("#/home/progress").section, "progress");
  assert.equal(parseAppRoute("#/home/habits").section, "habits");
  assert.equal(parseAppRoute("#/home/areas").section, "areas");
});

test("legacy child hashes redirect to their canonical nested locations", () => {
  assert.equal(parseAppRoute("#/calendar").canonicalHash, "#/home/calendar");
  assert.equal(parseAppRoute("#/progress").canonicalHash, "#/home/progress");
  assert.equal(parseAppRoute("#/habits").canonicalHash, "#/home/habits");
  assert.equal(parseAppRoute("#/areas").canonicalHash, "#/home/areas");
});

test("notes preserve their selected subsection in the URL", () => {
  assert.equal(routeForSection("note", "journal"), "#/notes/journal");
  assert.deepEqual(parseAppRoute("#/notes/oneiros"), {
    section: "note",
    noteSection: "oneiros",
    canonicalHash: "#/notes/oneiros",
  });
});

test("secondary Home tools keep Home active in the primary navigation", () => {
  for (const section of ["home", "calendar", "progress", "habits", "areas"]) {
    assert.equal(primaryNavSection(section), "home");
  }
  assert.equal(primaryNavSection("gtd"), "gtd");
  assert.equal(primaryNavSection("note"), "note");
});
