import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
localStorage.setItem('kaizen:v1:supabase:auth', ${JSON.stringify(JSON.stringify(fakeSession))});
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
  { id: 'project-a', title: 'Progetto test', createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:00:00.000Z' }
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
      navItems: [...document.querySelectorAll('.bottom-nav-link')].map((item) => item.innerText),
      visibleButtons: [...document.querySelectorAll('button')].slice(0, 20).map((item) => item.innerText)
    }))()`,
  });
  const screenshot = await page.send("Page.captureScreenshot", {
    captureBeyondViewport: true,
    format: "png",
  });

  await writeFile(join(OUT_DIR, `visual-${name}.png`), Buffer.from(screenshot.data, "base64"));
  return metrics.result.value;
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
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

function assertVisualResult(result, name) {
  if (!result.text.includes("KAIZEN")) {
    throw new Error(`${name}: KAIZEN shell not rendered`);
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
}
