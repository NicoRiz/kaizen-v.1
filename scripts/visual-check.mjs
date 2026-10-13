import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { checkSubActions } from "./sub-actions-check.mjs";
import { once } from "node:events";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const CHROME_PATH =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET_URL = process.env.TARGET_URL || "http://127.0.0.1:4176/";
const OUT_DIR = process.env.OUT_DIR || process.cwd();
const PORT = 9322;

const fakeSession = {
  access_token: "layout-only-token",
  refresh_token: "layout-only-refresh",
  expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "layout@example.com",
  },
};

const seedScript = `
// This browser uses a disposable test profile, never the user's profile.
localStorage.clear();
localStorage.setItem('kaizen:v1:supabase:auth', ${JSON.stringify(JSON.stringify(fakeSession))});
const visualCacheRecords = [
  {
    collection: 'inboxItems',
    id: 'inbox-a',
    data: { id: 'inbox-a', originalText: 'A da chiarire', clarifiedText: '', status: 'open', createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:00:00.000Z' },
    created_at: '2026-08-15T09:00:00.000Z',
    updated_at: '2026-08-15T09:00:00.000Z',
    deleted_at: null,
    version: 1
  },
  {
    collection: 'nextActions',
    id: 'next-a',
    data: { id: 'next-a', title: 'Azione desktop/mobile', completed: false, order: 0, createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:00:00.000Z', completedAt: null },
    created_at: '2026-08-15T09:00:00.000Z',
    updated_at: '2026-08-15T09:00:00.000Z',
    deleted_at: null,
    version: 1
  },
  {
    collection: 'nextActions',
    id: 'next-b',
    data: { id: 'next-b', title: 'Azione completata', completed: true, order: 1, createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T10:00:00.000Z', completedAt: '2026-08-15T10:00:00.000Z' },
    created_at: '2026-08-15T09:00:00.000Z',
    updated_at: '2026-08-15T10:00:00.000Z',
    deleted_at: null,
    version: 1
  },
  {
    collection: 'calendarItems',
    id: 'event-a',
    data: { id: 'event-a', title: 'Evento test', description: 'Verifica responsive', date: '2026-08-15', allDay: true, startTime: null, endTime: null, createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:00:00.000Z' },
    created_at: '2026-08-15T09:00:00.000Z',
    updated_at: '2026-08-15T09:00:00.000Z',
    deleted_at: null,
    version: 1
  },
  {
    collection: 'projects',
    id: 'project-a',
    data: { id: 'project-a', title: 'Progetto test', createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:00:00.000Z' },
    created_at: '2026-08-15T09:00:00.000Z',
    updated_at: '2026-08-15T09:00:00.000Z',
    deleted_at: null,
    version: 1
  }
];
localStorage.setItem('kaizen:v1:sync:cache', JSON.stringify({ savedAt: '2026-08-15T10:00:00.000Z', records: visualCacheRecords }));
localStorage.setItem('kaizen:v1:gtd:inboxItems', JSON.stringify([
  { id: 'inbox-a', originalText: 'A da chiarire', clarifiedText: '', status: 'open', createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:00:00.000Z' }
]));
localStorage.setItem('kaizen:v1:gtd:nextActions', JSON.stringify([
  { id: 'next-a', title: 'Azione desktop/mobile', completed: false, order: 0, createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:00:00.000Z', completedAt: null },
  { id: 'next-b', title: 'Azione completata', completed: true, order: 1, createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T10:00:00.000Z', completedAt: '2026-08-15T10:00:00.000Z' }
]));
localStorage.setItem('kaizen:v1:gtd:calendarItems', JSON.stringify([
  { id: 'event-a', title: 'Evento test', description: 'Verifica responsive', date: '2026-08-15', allDay: true, startTime: null, endTime: null, createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:00:00.000Z' }
]));
localStorage.setItem('kaizen:v1:gtd:projects', JSON.stringify([
  { id: 'project-a', title: 'Finire il libro', areaId: 'area-a', progressTracking: 'quantitative', progressUnit: 'pagine', currentValue: 126, targetValue: 352, status: 'active', createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:00:00.000Z' }
]));
localStorage.setItem('kaizen:v1:areas', JSON.stringify([
  { id: 'area-a', name: 'Psicologia', color: '#741b34', description: 'Conoscere meglio la mente', status: 'active', createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:00:00.000Z' }
]));
localStorage.setItem('kaizen:v1:habits', JSON.stringify([
  { id: 'habit-a', name: 'Studiare Cialdini', areaId: 'area-a', projectId: 'project-a', status: 'active', type: 'quantitative', frequency: 'daily', weekdays: [], timesPerWeek: null, unit: 'pagine', minimum: 2, target: 10, startDate: '2026-01-01', scheduledTime: null, updateProjectProgress: true, pausedRanges: [], createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:00:00.000Z' }
]));
localStorage.setItem('kaizen:v1:habitLogs', JSON.stringify([]));
const testHabits = JSON.parse(localStorage.getItem('kaizen:v1:habits'));
testHabits.push({ id: 'habit-week', name: 'Movimento settimanale', areaId: 'area-a', status: 'active', type: 'boolean', frequency: 'weekly', timesPerWeek: 1, startDate: '2026-01-01', pausedRanges: [] });
localStorage.setItem('kaizen:v1:habits', JSON.stringify(testHabits));
localStorage.setItem('kaizen:v1:gtd:projectActions', JSON.stringify([
  { id: 'project-open', projectId: 'project-a', title: 'Azione aperta del progetto', completed: false, order: 0 },
  { id: 'project-done', projectId: 'project-a', title: 'Azione chiusa del progetto', completed: true, order: 1 }
]));
`;

async function waitForJson(url, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.json();
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result || {});
      }
    }
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        close: () => socket.close(),
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((commandResolve, commandReject) => {
            pending.set(id, { resolve: commandResolve, reject: commandReject });
          });
        },
      });
    });
    socket.addEventListener("error", reject);
  });
}

async function capture(page, viewport, name) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await page.send("Page.navigate", { url: TARGET_URL });
  await new Promise((resolve) => setTimeout(resolve, 800));
  await page.send("Runtime.evaluate", { expression: seedScript });
  await page.send("Page.reload", { ignoreCache: true });
  await new Promise((resolve) => setTimeout(resolve, 1600));

  const metrics = await page.send("Runtime.evaluate", {
    returnByValue: true,
    expression: `(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      text: document.body.innerText,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      syncStatus: document.querySelector('.sync-status')?.innerText || '',
      navItems: [...document.querySelectorAll('.bottom-nav-link')].map((item) => item.getAttribute('aria-label')),
      visibleButtons: [...document.querySelectorAll('button')].slice(0, 20).map((item) => item.innerText)
    }))()`,
  });
  const screenshot = await page.send("Page.captureScreenshot", {
    captureBeyondViewport: true,
    format: "png",
  });

  await writeFile(join(OUT_DIR, `visual-${name}.png`), Buffer.from(screenshot.data, "base64"));
  await checkAttention(page, name);
  await checkSubActions(page, name, OUT_DIR);
  const sectionChecks = {};

  async function clickAndCheck(label, clickExpression, selector, expectedHash) {
    await page.send("Runtime.evaluate", {
      expression: clickExpression,
    });
    await new Promise((resolve) => setTimeout(resolve, 180));
    const sectionResult = await page.send("Runtime.evaluate", {
      returnByValue: true,
      expression: `(() => ({
        rendered: Boolean(document.querySelector(${JSON.stringify(selector)})),
        overflowX: document.documentElement.scrollWidth > window.innerWidth,
        errorOverlay: Boolean(document.querySelector('.vite-error-overlay')),
        hash: window.location.hash,
        expectedHash: ${JSON.stringify(expectedHash)}
      }))()`,
    });
    sectionChecks[label] = sectionResult.result.value;

    if ((name === "desktop" && label !== "Focus") || label === "Calendario") {
      const sectionScreenshot = await page.send("Page.captureScreenshot", {
        captureBeyondViewport: true,
        format: "png",
      });
      await writeFile(
        join(OUT_DIR, `visual-${name}-${label.toLowerCase()}.png`),
        Buffer.from(sectionScreenshot.data, "base64"),
      );
    }
  }

  const bottomNavClick = (label) =>
    `([...document.querySelectorAll('.bottom-nav-link')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(label)}))?.click()`;
  const homeNavClick = (label) =>
    `([...document.querySelectorAll('.home-section-nav button')].find((item) => item.getAttribute('aria-label') === ${JSON.stringify(label)}))?.click()`;

  await clickAndCheck("GTD", bottomNavClick("GTD"), ".gtd-tab-panel", "#/gtd");
  await clickAndCheck("Focus", bottomNavClick("Home"), ".today-panel", "#/home/focus");
  await clickAndCheck(
    "Calendario",
    homeNavClick("Calendario"),
    ".home-calendar-page .calendar-grid--month",
    "#/home/calendar",
  );
  await clickAndCheck(
    "Areas",
    `([...document.querySelectorAll('button')].find((item) => item.innerText === 'Vai alle Areas'))?.click()`,
    ".area-card",
    "#/home/areas",
  );

  await page.send("Runtime.evaluate", { expression: "history.back()" });
  await new Promise((resolve) => setTimeout(resolve, 180));
  await clickAndCheck(
    "CalendarioBack",
    "void 0",
    ".home-calendar-page .calendar-grid--month",
    "#/home/calendar",
  );
  await page.send("Runtime.evaluate", { expression: "history.forward()" });
  await new Promise((resolve) => setTimeout(resolve, 180));
  await clickAndCheck("AreasForward", "void 0", ".area-card", "#/home/areas");

  await clickAndCheck("FocusReturn", bottomNavClick("Home"), ".today-panel", "#/home/focus");
  await clickAndCheck(
    "Abitudini",
    `([...document.querySelectorAll('button')].find((item) => item.innerText === 'Vai alle abitudini'))?.click()`,
    ".habit-management-card",
    "#/home/habits",
  );
  await clickAndCheck("FocusAgain", bottomNavClick("Home"), ".today-panel", "#/home/focus");
  await clickAndCheck(
    "Progressi",
    homeNavClick("Progressi"),
    ".rhythm-chart",
    "#/home/progress",
  );
  await page.send("Page.reload", { ignoreCache: true });
  await new Promise((resolve) => setTimeout(resolve, 600));
  await clickAndCheck("ProgressiRefresh", "void 0", ".rhythm-chart", "#/home/progress");
  await clickAndCheck("Note", bottomNavClick("Note"), ".note-hub-grid", "#/notes");
  await clickAndCheck("HomeFinal", bottomNavClick("Home"), ".today-panel", "#/home/focus");

  return { ...metrics.result.value, sectionChecks, attentionChecks: "passed: complete/reopen, daily/weekly, date rollover, navigation, saved records",
    subActionChecks: "passed: create/rename/reorder/delete, complete/reopen, manual parent completion, shared record, offline reload, conflict resolution" };
}

async function checkAttention(page, name) {
  async function evaluate(expression) {
    const result = await page.send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }
  async function act(expression) {
    await evaluate(expression);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const dailyBadge = 'button.attention-badge[aria-label$="abitudini di oggi da completare"]';
  const weeklyBadge = 'button.attention-badge[aria-label$="obiettivi settimanali da completare"]';
  const nextBadge = 'button.attention-badge[aria-label$="prossime azioni da completare"]';
  const exists = (selector) => evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
  assert.equal(await exists(dailyBadge), true, `${name}: daily pending`);
  assert.equal(await exists(weeklyBadge), true, `${name}: weekly pending`);
  await act(`document.querySelector(${JSON.stringify(dailyBadge)}).click()`);
  assert.equal(await evaluate("Boolean(document.activeElement.closest('#daily-habits'))"), true);
  await act(`document.querySelector(${JSON.stringify(nextBadge)}).click()`);
  assert.equal(await evaluate("Boolean(document.activeElement.closest('#pending-next-actions'))"), true);
  await act("document.querySelector('#pending-next-actions input[type=checkbox]').click()");
  assert.equal(await exists(nextBadge), false, `${name}: completed action hides badge`);
  await act("document.querySelector('.completed-toggle').click()");
  await act("document.querySelector('.completed-action-list input[type=checkbox]').click()");
  assert.equal(await exists(nextBadge), true, `${name}: reopened action restores badge`);
  await act("document.querySelector('#weekly-habits button').click()");
  assert.equal(await exists(weeklyBadge), false, `${name}: weekly target reached`);
  await act("document.querySelector('#weekly-habits button').click()");
  assert.equal(await exists(weeklyBadge), true, `${name}: weekly session reopened`);
  await act("document.querySelector('#weekly-habits button').click()");
  await act(`(() => {
    const input = document.querySelector('#daily-habits input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '10');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await act("document.querySelector('#daily-habits input').dispatchEvent(new FocusEvent('focusout', { bubbles: true }))");
  assert.equal(await exists(dailyBadge), false, `${name}: quantitative target reached`);
  await act("document.querySelector('#daily-habits button[aria-label^=Riduci]').click()");
  assert.equal(await exists(dailyBadge), true, `${name}: quantity below target`);
  await act("document.querySelector('#daily-habits button[aria-label^=Aumenta]').click()");
  const savedLogs = await evaluate("localStorage.getItem('kaizen:v1:habitLogs')");
  // Simulate returning to the app on a new local date, including next Monday.
  await act(`(() => {
    window.kaizenRealDate = Date;
    window.kaizenTestNow = new Date();
    window.kaizenTestNow.setDate(window.kaizenTestNow.getDate() + 1);
    window.Date = class extends window.kaizenRealDate {
      constructor(...args) { super(...(args.length ? args : [window.kaizenTestNow.getTime()])); }
      static now() { return window.kaizenTestNow.getTime(); }
    };
    window.dispatchEvent(new Event('focus'));
  })()`);
  assert.equal(await exists(dailyBadge), true, `${name}: next day resets daily attention`);
  await act(`(() => {
    const now = window.kaizenTestNow;
    now.setDate(now.getDate() + (8 - now.getDay()) % 7 + 7);
    window.dispatchEvent(new Event('focus'));
  })()`);
  assert.equal(await exists(weeklyBadge), true, `${name}: new week resets weekly attention`);
  assert.equal(await evaluate("localStorage.getItem('kaizen:v1:habitLogs')"), savedLogs, "date changes do not rewrite history");
  await act("window.Date = window.kaizenRealDate; window.dispatchEvent(new Event('focus'))");
  await act("document.querySelector('.bottom-nav-link[aria-label=GTD] .attention-badge').click()");
  assert.equal(await evaluate("location.hash"), "#/gtd");
  assert.equal(await exists(".project-toggle .attention-badge"), true);
  await act("document.querySelector('.project-toggle .attention-badge').click()");
  assert.equal(await exists(".project-actions input[type=checkbox]"), true);
  await act("document.querySelector('.project-actions input[type=checkbox]').click()");
  assert.equal(await exists(".project-toggle .attention-badge"), false);
  await act("document.querySelector('.project-actions input[type=checkbox]').click()");
  assert.equal(await exists(".project-toggle .attention-badge"), true);
  await act("document.querySelector('.bottom-nav-link[aria-label=Home] .attention-badge').click()");
  assert.equal(await evaluate("location.hash"), "#/home/focus");
}

const profileDir = join(tmpdir(), `kaizen-visual-${Date.now()}`);
await mkdir(profileDir, { recursive: true });

const chrome = spawn(CHROME_PATH, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`,
  "about:blank",
]);

try {
  const version = await waitForJson(`http://127.0.0.1:${PORT}/json/version`);
  const browser = await connect(version.webSocketDebuggerUrl);
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  const tabs = await waitForJson(`http://127.0.0.1:${PORT}/json/list`);
  const pageInfo = tabs.find((item) => item.id === target.targetId);
  const page = await connect(pageInfo.webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");

  const desktop = await capture(page, { width: 1280, height: 900, mobile: false }, "desktop");
  const mobile = await capture(page, { width: 390, height: 844, mobile: true }, "mobile");
  assertVisualResult(desktop, "desktop");
  assertVisualResult(mobile, "mobile");

  await writeFile(
    join(OUT_DIR, "visual-check-results.json"),
    JSON.stringify({ desktop, mobile }, null, 2),
  );

  page.close();
  browser.close();
} finally {
  chrome.kill();
  await Promise.race([
    once(chrome, "exit"),
    new Promise((resolve) => setTimeout(resolve, 1200)),
  ]).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (dirname(resolve(profileDir)) === resolve(tmpdir()) && basename(profileDir).startsWith("kaizen-visual-")) {
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

function assertVisualResult(result, name) {
  if (!result.text.includes("Focus")) {
    throw new Error(`${name}: Focus shell not rendered`);
  }

  if (result.overflowX) {
    throw new Error(`${name}: horizontal overflow detected`);
  }

  for (const item of ["GTD", "Home", "Note"]) {
    if (!result.navItems.includes(item)) {
      throw new Error(`${name}: missing nav item ${item}`);
    }
  }

  if (!result.syncStatus) {
    throw new Error(`${name}: missing sync status`);
  }

  for (const [section, check] of Object.entries(result.sectionChecks)) {
    if (
      !check.rendered ||
      check.overflowX ||
      check.errorOverlay ||
      check.hash !== check.expectedHash
    ) {
      throw new Error(`${name}: ${section} failed ${JSON.stringify(check)}`);
    }
  }
}
