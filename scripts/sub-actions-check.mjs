import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function checkSubActions(page, name, outDir) {
  async function evaluate(expression, awaitPromise = false) {
    const result = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }
  async function act(expression) {
    await evaluate(expression);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  async function waitForProject() {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evaluate("Boolean(document.querySelector('.project-toggle'))")) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Project missing after reload: ${await evaluate("location.href + '\\n' + document.body.innerText")}`);
  }
  const root = '.task-item[data-project-action-id="project-open"]';
  const q = (suffix) => `document.querySelector(${JSON.stringify(`${root} ${suffix}`)})`;
  async function setInput(selector, value) {
    await act(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  }
  const titles = () => evaluate(`[...document.querySelectorAll(${JSON.stringify(`${root} .sub-action-check span`)})].map(el => el.textContent)`);
  const parentComplete = () => evaluate(`${q('.task-check input')}.checked`);
  async function screenshot(suffix) {
    assert.equal(await evaluate("document.documentElement.scrollWidth > innerWidth"), false, `${name}: checklist overflow`);
    const image = await page.send("Page.captureScreenshot", { captureBeyondViewport: true, format: "png" });
    await writeFile(join(outDir, `visual-${name}-subactions-${suffix}.png`), Buffer.from(image.data, "base64"));
  }
  await page.send("Network.enable");
  await evaluate("navigator.serviceWorker.ready.then(() => true)", true);
  await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await act("document.querySelector('.bottom-nav-link[aria-label=GTD]').click()");
  await act("document.querySelector('.project-toggle').click()");
  await act(`${q('summary')}.click()`);
  const before = await evaluate("localStorage.getItem('kaizen:v1:gtd:projectActions')");
  for (const title of ["Preparare proposta", "Inviare proposta"]) {
    await setInput(`${root} .sub-action-add input`, title);
    await act(`${q('.sub-action-add')}.requestSubmit()`);
  }
  assert.deepEqual(await titles(), ["Preparare proposta", "Inviare proposta"]);
  assert.equal(await evaluate("localStorage.getItem('kaizen:v1:gtd:projectActions')"), before, "children never rewrite parent");
  await act(`${q('button[aria-label="Sposta su Inviare proposta"]')}.click()`);
  assert.deepEqual(await titles(), ["Inviare proposta", "Preparare proposta"]);
  await act(`${q('button[aria-label="Rinomina Preparare proposta"]')}.click()`);
  await setInput(`${root} .sub-action-rename input`, "Rivedere proposta");
  await act(`${q('.sub-action-rename')}.requestSubmit()`);
  assert.deepEqual(await titles(), ["Inviare proposta", "Rivedere proposta"]);
  await screenshot("project");
  await act(`${q('.sub-action-check input')}.click()`);
  await act(`document.querySelectorAll(${JSON.stringify(`${root} .sub-action-check input`)})[1].click()`);
  assert.equal(await parentComplete(), false, "all children completed must not close parent");
  assert.equal(await evaluate(`Boolean(${q('.sub-action-proposal button')})`), true);
  await act(`${q('.sub-action-check input')}.click()`);
  assert.equal(await evaluate(`Boolean(${q('.sub-action-proposal')})`), false, "reopening hides proposal");
  await act(`${q('.sub-action-check input')}.click()`);
  await act(`${q('.project-action-details > button')}.click()`);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('kaizen:v1:gtd:nextActions')).length"), 2, "no duplicated parent in nextActions");
  await act("document.querySelector('.bottom-nav-link[aria-label=Home]').click()");
  await act(`${q('summary')}.click()`);
  assert.deepEqual(await titles(), ["Inviare proposta", "Rivedere proposta"]);
  await screenshot("focus");
  await act(`${q('.sub-action-proposal button')}.click()`);
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('kaizen:v1:gtd:projectActions')).find(item => item.id === 'project-open').completed"), true);
  await act("document.querySelector('.bottom-nav-link[aria-label=GTD]').click()");
  await act("document.querySelector('.project-toggle').click()");
  assert.equal(await parentComplete(), true, "same parent closed in project");
  await act(`${q('.task-check input')}.click()`);
  await act(`${q('summary')}.click()`);
  await act(`${q('button[aria-label="Elimina Inviare proposta"]')}.click()`);
  assert.deepEqual(await titles(), ["Rivedere proposta"]);
  const stored = await evaluate("localStorage.getItem('kaizen:v1:gtd:subActions')");
  await page.send("Page.reload", { ignoreCache: true });
  await waitForProject();
  await act("document.querySelector('.project-toggle').click()");
  await act(`${q('summary')}.click()`);
  assert.deepEqual(await titles(), ["Rivedere proposta"], "offline restart persists edits, delete and order");
  assert.equal(await evaluate("localStorage.getItem('kaizen:v1:gtd:subActions')"), stored);
  assert.equal(await parentComplete(), false);

  // Inject two independent synced revisions into this disposable fixture.
  await act(`(() => {
    const rows = JSON.parse(localStorage.getItem('kaizen:v1:gtd:subActions'));
    const superseded = new Set(rows.flatMap(item => item.supersedes));
    const base = rows.find(item => !superseded.has(item.id) && !item.deleted);
    rows.push({ ...base, id: 'conflict-pc', supersedes: [base.id], title: 'Versione desktop' });
    rows.push({ ...base, id: 'conflict-phone', supersedes: [base.id], title: 'Versione mobile' });
    localStorage.setItem('kaizen:v1:gtd:subActions', JSON.stringify(rows));
  })()`);
  await page.send("Page.reload", { ignoreCache: true });
  await waitForProject();
  await act("document.querySelector('.project-toggle').click()");
  await act(`${q('summary')}.click()`);
  assert.equal((await titles()).length, 2);
  assert.equal(await evaluate(`Boolean(${q('.sub-action-proposal')})`), false, "conflict prevents completion suggestion");
  await screenshot("conflict");
  await act(`([...document.querySelectorAll(${JSON.stringify(`${root} .sub-action-row`)})].find(row => row.textContent.includes('Versione mobile'))).querySelector('.sub-action-conflict .secondary-button').click()`);
  assert.deepEqual(await titles(), ["Versione mobile"]);
  assert.equal(await evaluate(`Boolean(${q('.sub-action-conflict')})`), false);
  await act(`${q('.project-action-details > button')}.click()`);
  await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await act("document.querySelector('.bottom-nav-link[aria-label=Home]').click()");
}
