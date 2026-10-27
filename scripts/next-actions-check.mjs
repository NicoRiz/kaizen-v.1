import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Called only by visual-check in its disposable browser profile.
export async function checkNextActions(page, name, outDir) {
  async function evaluate(expression) {
    const result = await page.send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }
  async function act(expression) { await evaluate(expression); await new Promise(resolve => setTimeout(resolve, 100)); }
  const read = collection => evaluate(`JSON.parse(localStorage.getItem('kaizen:v1:gtd:${collection}') || '[]')`);
  const row = title => `([...document.querySelectorAll('#pending-next-actions > li, .completed-action-list > li')].find(row => row.querySelector('.task-content strong').textContent === ${JSON.stringify(title)}))`;
  const dialogButton = text => `([...document.querySelectorAll('[role=dialog] button')].find(button => button.textContent.trim() === ${JSON.stringify(text)}))`;
  async function open(title, option) {
    await act(`${row(title)}.querySelector('.next-action-menu-trigger').scrollIntoView({block:'center'})`);
    await act(`${row(title)}.querySelector('.next-action-menu-trigger').click()`);
    if (option) await act(`([...document.querySelectorAll('[role=menuitem]')].find(button => button.textContent.trim() === ${JSON.stringify(option)})).click()`);
  }
  async function input(selector, value) {
    await act(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); })()`);
  }
  async function reload() {
    await page.send('Page.reload', { ignoreCache: true });
    for (let attempt = 0; attempt < 80; attempt++) {
      if (await evaluate('Boolean(document.querySelector("[data-next-actions-panel]"))')) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Next actions missing after reload');
  }
  const saved = await evaluate('JSON.stringify({...localStorage})');
  const timestamp = '2026-10-20T10:00:00.000Z';
  const task = (id, title) => ({ id, title, description: `Descrizione ${title}`, completed: false, createdAt: timestamp, updatedAt: timestamp });
  const data = {
    projects: [{ id: 'p1', title: 'Progetto uno', status: 'active', createdAt: timestamp, updatedAt: timestamp }, { id: 'p2', title: 'Progetto due', status: 'someday', createdAt: timestamp, updatedAt: timestamp }],
    nextActions: [task('n', 'Azione libera'), task('move', 'Da pianificare'), task('someday', 'Da rimandare'), task('delete', 'Da eliminare')],
    projectActions: [{ ...task('pa', 'Azione collegata'), projectId: 'p1', showInNextActions: true }],
    calendarItems: [], somedayMaybe: [],
  };
  await act(`(() => {
    const auth = localStorage.getItem('kaizen:v1:supabase:auth'); localStorage.clear();
    if(auth) localStorage.setItem('kaizen:v1:supabase:auth',auth);
    const data = ${JSON.stringify(data)};
    for(const [name, rows] of Object.entries(data)) localStorage.setItem('kaizen:v1:gtd:'+name,JSON.stringify(rows));
    const records = Object.entries(data).flatMap(([collection, rows]) => rows.map(data => ({collection,id:data.id,data,created_at:data.createdAt,updated_at:data.updatedAt,deleted_at:null,version:1})));
    localStorage.setItem('kaizen:v1:sync:cache', JSON.stringify({records,savedAt:${JSON.stringify(timestamp)}}));
    location.hash='#/home/focus';
  })()`);
  await reload();
  try {
    await open('Azione libera');
    assert.deepEqual(await evaluate('[...document.querySelectorAll("[role=menuitem]")].map(b=>b.textContent.trim())'), ['Sposta nel calendario', 'Duplica in un progetto', 'Sposta in Prima o poi/Forse', 'Modifica azione', 'Elimina azione']);
    assert.equal(await evaluate('(() => { const r=document.querySelector("[role=menu]").getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth && r.top>=0 && r.bottom<=innerHeight; })()'), true, `${name}: menu stays inside viewport`);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'End' });
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Elimina azione');
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowUp' });
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Modifica azione');
    const screenshot = await page.send('Page.captureScreenshot', { captureBeyondViewport: false, format: 'png' });
    await writeFile(join(outDir, `visual-${name}-next-actions-menu.png`), Buffer.from(screenshot.data, 'base64'));
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
    assert.equal(await evaluate('Boolean(document.querySelector("[role=menu]"))'), false);
    assert.equal(await evaluate('document.activeElement.classList.contains("next-action-menu-trigger")'), true);
    await act(`${row('Azione libera')}.querySelector('input').click()`);
    assert.equal((await read('nextActions')).find(a => a.id === 'n').completed, true);
    await act('document.querySelector(".completed-toggle").click()');
    await act(`${row('Azione libera')}.querySelector('input').click()`);
    assert.equal((await read('nextActions')).find(a => a.id === 'n').completed, false);
    const original = (await read('nextActions')).find(a => a.id === 'n');
    await open('Azione libera', 'Duplica in un progetto');
    await input('[role=dialog] select', 'p2');
    await act('document.querySelector("[role=dialog] form").requestSubmit(); document.querySelector("[role=dialog] form")?.requestSubmit()');
    let actions = await read('projectActions');
    assert.equal(actions.length, 2, 'double submission makes one independent copy');
    assert.equal(actions.at(-1).projectId, 'p2');
    assert.equal(actions.at(-1).completed, false);
    assert.deepEqual((await read('nextActions')).find(a => a.id === 'n'), original);
    await act(`${row('Azione collegata')}.querySelector('input').click()`);
    assert.equal((await read('projectActions')).find(a=>a.id==='pa').completed, true);
    await act(`${row('Azione collegata')}.querySelector('input').click()`);
    assert.equal((await read('projectActions')).find(a=>a.id==='pa').completed, false);
    const linked = (await read('projectActions')).find(a=>a.id==='pa');
    for (const projectId of ['p1', 'p2']) {
      await open('Azione collegata', 'Duplica in un progetto');
      assert.equal(await evaluate('document.querySelector("[role=dialog] select").value'), 'p1');
      await input('[role=dialog] select', projectId);
      await act('document.querySelector("[role=dialog] form").requestSubmit()');
      actions = await read('projectActions');
      assert.equal(actions.at(-1).projectId, projectId);
      assert.notEqual(actions.at(-1).id, linked.id);
      assert.equal(actions.at(-1).completedAt, null);
    }
    assert.deepEqual((await read('projectActions')).find(a => a.id === 'pa'), linked);
    await open('Azione libera', 'Modifica azione');
    await input('[role=dialog] input[type=text]', 'Azione modificata');
    await input('[role=dialog] textarea', 'Nuova descrizione');
    await act('document.querySelector("[role=dialog] form").requestSubmit()');
    assert.equal((await read('nextActions')).find(a => a.id === 'n').description, 'Nuova descrizione');
    await open('Da pianificare', 'Sposta nel calendario');
    await input('[role=dialog] input[type=date]', '2026-11-05');
    await input('[role=dialog] input[type=time]', '09:00');
    await act('document.querySelector("[role=dialog] form").requestSubmit(); document.querySelector("[role=dialog] form")?.requestSubmit()');
    assert.equal((await read('calendarItems')).length, 1);
    assert.equal((await read('calendarItems'))[0].sourceTaskId, 'move');
    assert.equal((await read('calendarItems'))[0].startTime, '09:00');
    assert.equal(await evaluate(`Boolean(${row('Da pianificare')})`), false);
    await open('Da rimandare', 'Sposta in Prima o poi/Forse');
    await open('Azione collegata', 'Sposta in Prima o poi/Forse');
    assert.equal((await read('somedayMaybe')).length, 2);
    assert.equal(await evaluate(`Boolean(${row('Da rimandare')})`), false);
    assert.equal((await read('projectActions')).find(a => a.id === 'pa').showInNextActions, false);
    await open('Da eliminare', 'Elimina azione');
    await act(`${dialogButton('Annulla')}.click()`);
    assert.equal(await evaluate('document.activeElement.classList.contains("next-action-menu-trigger")'), true, 'cancel restores focus to the invoking action');
    assert.equal((await read('nextActions')).some(a => a.id === 'delete'), true);
    await open('Da eliminare', 'Elimina azione');
    await act(`${dialogButton('Elimina azione')}.click()`);
    assert.equal((await read('nextActions')).some(a => a.id === 'delete'), false);
    await reload();
    assert.equal(await evaluate('document.querySelectorAll("#pending-next-actions > li").length'), 1);
    assert.equal(await evaluate('document.querySelector("#pending-next-actions strong").textContent'), 'Azione modificata');
    assert.equal((await read('somedayMaybe')).length, 2);
    assert.equal((await read('projectActions')).length, 4);
    await act('document.querySelector(".bottom-nav-link[aria-label=GTD]").click()');
    await act('([...document.querySelectorAll("[role=tab]")].find(b=>b.textContent.includes("Prima o poi"))).click()');
    assert.equal(await evaluate('document.querySelectorAll(".note-card").length'), 2);
    await act('([...document.querySelectorAll(".note-card-main")].find(b=>b.textContent.includes("Azione collegata"))).click()');
    await input('[role=dialog] input[type=text]', 'Collegata aggiornata');
    await act('document.querySelector("[role=dialog] form").requestSubmit()');
    assert.equal((await read('projectActions')).find(a => a.id === 'pa').title, 'Collegata aggiornata');
    await act('([...document.querySelectorAll("[role=tab]")].find(b=>b.textContent.trim().startsWith("Progetti"))).click()');
    await act('document.querySelector(".project-toggle").click()');
    const projectRow = '([...document.querySelectorAll(".project-actions .task-item")].find(row=>row.querySelector("strong").textContent === "Collegata aggiornata"))';
    assert.equal(await evaluate(`${projectRow}.querySelector('.task-content strong').textContent`), 'Collegata aggiornata');
    // Restore the disposable fixture's existing reference, without adding a project control.
    await act(`(() => { const rows=JSON.parse(localStorage.getItem('kaizen:v1:gtd:projectActions')); rows.find(a=>a.id==='pa').showInNextActions=true; localStorage.setItem('kaizen:v1:gtd:projectActions',JSON.stringify(rows)); const cache=JSON.parse(localStorage.getItem('kaizen:v1:sync:cache')); cache.records.find(r=>r.collection==='projectActions' && r.id==='pa').data.showInNextActions=true; localStorage.setItem('kaizen:v1:sync:cache',JSON.stringify(cache)); location.hash='#/home/focus'; })()`);
    await reload();
    await open('Collegata aggiornata');
    assert.equal(await evaluate('document.querySelectorAll("[role=menuitem]")[4].textContent.trim()'), 'Rimuovi da Prossime azioni');
    await act('document.querySelectorAll("[role=menuitem]")[4].click()');
    await act(`${dialogButton('Annulla')}.click()`);
    assert.equal((await read('projectActions')).find(a=>a.id==='pa').showInNextActions, true);
    await open('Collegata aggiornata', 'Rimuovi da Prossime azioni');
    await act(`${dialogButton('Rimuovi da Prossime azioni')}.click()`);
    assert.equal((await read('projectActions')).some(a=>a.id==='pa'), true);
    assert.equal((await read('projectActions')).find(a=>a.id==='pa').showInNextActions, false);
    await open('Azione modificata', 'Duplica in un progetto');
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', modifiers: 8 });
    assert.equal(await evaluate('Boolean(document.activeElement.closest("[role=dialog]"))'), true, 'modal retains keyboard focus');
    const copyCount = (await read('projectActions')).length;
    await act(`window.kaizenSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if(key === 'kaizen:v1:gtd:projectActions') throw new DOMException('Quota exceeded','QuotaExceededError'); return window.kaizenSetItem.call(this,key,value); }`);
    await act('document.querySelector("[role=dialog] form").requestSubmit()');
    assert.equal(await evaluate('document.querySelector("[role=dialog] [role=alert]").textContent.includes("non è stata salvata")'), true);
    assert.equal((await read('projectActions')).length, copyCount, 'failed persistence must not create a copy');
    await act('Storage.prototype.setItem = window.kaizenSetItem');
    await act('document.querySelector("[role=dialog] form").requestSubmit()');
    assert.equal((await read('projectActions')).length, copyCount + 1, 'retry after failure creates exactly one copy');
    await act(`(() => { localStorage.setItem('kaizen:v1:gtd:projects','[]'); const cache=JSON.parse(localStorage.getItem('kaizen:v1:sync:cache')); cache.records=cache.records.filter(r=>r.collection!=='projects'); localStorage.setItem('kaizen:v1:sync:cache',JSON.stringify(cache)); })()`);
    await reload();
    await open('Azione modificata', 'Duplica in un progetto');
    assert.equal(await evaluate('document.querySelector("[role=dialog]").textContent.includes("Non ci sono progetti")'), true);
    assert.equal((await read('projects')).length, 0);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await evaluate('Boolean(document.querySelector("[role=dialog]"))'), false);
    console.log(`${name}: next actions menu, completion, moves, independent copies, edit/delete, replay and refresh passed`);
  } finally {
    await act(`localStorage.clear(); for (const [key,value] of Object.entries(JSON.parse(${JSON.stringify(saved)}))) localStorage.setItem(key,value); location.hash='#/home/focus'`);
    await reload();
  }
}
