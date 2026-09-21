import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_PATH =
  process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const TARGET_URL = process.env.TARGET_URL || "http://127.0.0.1:4176/";
const PORT = 9323;
const OFFLINE_ITEM = "Modifica offline persistente";

async function waitForJson(url, timeoutMs = 10000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(`Timeout in attesa di ${url}`);
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  const pending = new Map();
  let nextId = 1;

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    const request = pending.get(message.id);

    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result || {});
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        close: () => socket.close(),
        send(method, params = {}) {
          const id = nextId++;
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

async function connectPage(browser, url = "about:blank") {
  const target = await browser.send("Target.createTarget", { url });
  const targets = await waitForJson(`http://127.0.0.1:${PORT}/json/list`);
  const pageInfo = targets.find((item) => item.id === target.targetId);
  const page = await connect(pageInfo.webSocketDebuggerUrl);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");
  return { page, targetId: target.targetId };
}

async function evaluate(page, expression, awaitPromise = false) {
  const result = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  return result.result?.value;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const profileDir = join(tmpdir(), `kaizen-offline-${Date.now()}`);
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
  const online = await connectPage(browser);
  await online.page.send("Page.navigate", { url: TARGET_URL });
  await wait(1200);
  await evaluate(
    online.page,
    "navigator.serviceWorker.ready.then(() => true)",
    true,
  );

  const precache = await evaluate(
    online.page,
    `(async () => {
      const keys = await caches.keys();
      const cache = await caches.open(keys.find((key) => key.startsWith('kaizen-app-shell-')));
      return (await cache.keys()).map((request) => new URL(request.url).pathname);
    })()`,
    true,
  );
  assert.ok(precache.some((path) => path.endsWith("/index.html")));
  assert.ok(precache.some((path) => path.endsWith(".js")));
  assert.ok(precache.some((path) => path.endsWith(".css")));

  await browser.send("Target.closeTarget", { targetId: online.targetId });
  online.page.close();

  const offline = await connectPage(browser);
  await offline.page.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await offline.page.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await offline.page.send("Page.navigate", { url: TARGET_URL });
  await wait(1200);

  const openedOffline = await evaluate(
    offline.page,
    "document.body.innerText.includes('KAIZEN')",
  );
  assert.equal(openedOffline, true);

  const navigated = await evaluate(
    offline.page,
    `(() => {
      document.querySelector('button[aria-label="GTD"]')?.click();
      return true;
    })()`,
  );
  assert.equal(navigated, true);
  await wait(100);
  assert.equal(
    await evaluate(offline.page, "document.body.innerText.includes('GTD')"),
    true,
  );

  await evaluate(
    offline.page,
    `(() => {
      document.querySelector('button[aria-label="Home"]')?.click();
      return true;
    })()`,
  );
  await wait(100);
  await evaluate(
    offline.page,
    `(() => {
      const input = document.querySelector('input[aria-label="Aggiungi cose alla Inbox"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(OFFLINE_ITEM)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`,
  );
  await wait(100);
  await evaluate(
    offline.page,
    "document.querySelector('input[aria-label=\"Aggiungi cose alla Inbox\"]')?.closest('form').requestSubmit()",
  );
  await wait(300);

  const queueCountBeforeReload = await evaluate(
    offline.page,
    "JSON.parse(localStorage.getItem('kaizen:v1:sync:queue') || '[]').length",
  );
  assert.ok(queueCountBeforeReload > 0);
  assert.equal(
    await evaluate(offline.page, `document.body.innerText.includes(${JSON.stringify(OFFLINE_ITEM)})`),
    true,
  );

  await offline.page.send("Page.reload", { ignoreCache: true });
  await wait(2000);
  const reloadState = await evaluate(
    offline.page,
    `(() => ({
      body: document.body.innerText,
      hasController: Boolean(navigator.serviceWorker?.controller),
      inbox: localStorage.getItem('kaizen:v1:gtd:inboxItems'),
      queue: localStorage.getItem('kaizen:v1:sync:queue')
    }))()`,
  );
  assert.equal(
    reloadState.body.includes(OFFLINE_ITEM),
    true,
    JSON.stringify(reloadState),
  );
  assert.equal(
    await evaluate(
      offline.page,
      "JSON.parse(localStorage.getItem('kaizen:v1:sync:queue') || '[]').length",
    ),
    queueCountBeforeReload,
  );

  await evaluate(
    offline.page,
    `(() => {
      const timestamp = new Date().toISOString();
      localStorage.setItem('kaizen:v1:gtd:projects', JSON.stringify([{
        id: 'offline-project',
        title: 'Progetto offline',
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp
      }]));
      localStorage.setItem('kaizen:v1:gtd:projectActions', JSON.stringify([{
        id: 'offline-project-action',
        projectId: 'offline-project',
        title: 'Azione del progetto offline',
        completed: false,
        order: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: null
      }]));
      return true;
    })()`,
  );
  await offline.page.send("Page.reload", { ignoreCache: true });
  await wait(1500);
  await evaluate(
    offline.page,
    "document.querySelector('button[aria-label=\"GTD\"]')?.click()",
  );
  await wait(100);
  await evaluate(
    offline.page,
    `(() => {
      const project = [...document.querySelectorAll('.project-toggle')]
        .find((button) => button.innerText.includes('Progetto offline'));
      project?.click();
      return Boolean(project);
    })()`,
  );
  assert.equal(
    await evaluate(
      offline.page,
      "document.body.innerText.includes('Azione del progetto offline')",
    ),
    true,
  );
  await evaluate(
    offline.page,
    "document.querySelector('button[aria-label=\"Modifica Progetto offline\"]')?.click()",
  );
  await wait(100);
  assert.equal(
    await evaluate(
      offline.page,
      "document.body.innerText.includes('Sposta in Prima o poi / Forse')",
    ),
    true,
  );
  await evaluate(
    offline.page,
    `([...document.querySelectorAll('button')]
      .find((button) => button.innerText === 'Sposta in Prima o poi / Forse'))?.click()`,
  );
  await wait(200);
  assert.equal(
    await evaluate(
      offline.page,
      "JSON.parse(localStorage.getItem('kaizen:v1:gtd:projects'))[0].status",
    ),
    "someday",
  );
  assert.equal(
    await evaluate(
      offline.page,
      "JSON.parse(localStorage.getItem('kaizen:v1:gtd:projectActions'))[0].title",
    ),
    "Azione del progetto offline",
  );

  await evaluate(
    offline.page,
    `([...document.querySelectorAll('[role="tab"]')]
      .find((button) => button.innerText.includes('Prima o poi')))?.click()`,
  );
  await wait(100);
  await evaluate(
    offline.page,
    `([...document.querySelectorAll('.project-toggle')]
      .find((button) => button.innerText.includes('Progetto offline')))?.click()`,
  );
  assert.equal(
    await evaluate(
      offline.page,
      "document.body.innerText.includes('Azione del progetto offline')",
    ),
    true,
  );
  await evaluate(
    offline.page,
    "document.querySelector('button[aria-label=\"Modifica Progetto offline\"]')?.click()",
  );
  await wait(100);
  assert.equal(
    await evaluate(
      offline.page,
      "document.body.innerText.includes('Sposta in Progetti')",
    ),
    true,
  );

  assert.equal(
    await evaluate(
      offline.page,
      "document.querySelector('.vite-error-overlay') ? 'ERROR' : 'OK'",
    ),
    "OK",
  );

  offline.page.close();
  browser.close();
} finally {
  chrome.kill();
  await Promise.race([once(chrome, "exit"), wait(1200)]).catch(() => {});
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

console.log("Offline check passed: app shell, navigation, local changes and queue persistence.");
