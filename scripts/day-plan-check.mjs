import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function checkDayPlan(page, name, outDir) {
  async function evaluate(expression, awaitPromise = false) {
    const result = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }
  async function act(expression) { await evaluate(expression); await new Promise(r => setTimeout(r, 120)); }
  async function input(selector, value) {
    await act(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw new Error('Missing input: ' + ${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true})); })()`);
  }
  async function click(text, root = '.today-plan') { await act(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(`${root} button`)})].find(b => b.textContent.trim() === ${JSON.stringify(text)}); if (!b || b.disabled) throw new Error('Missing/enabled button ' + ${JSON.stringify(text)}); b.click(); })()`); }
  const read = key => evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
  const plans = () => read('kaizen:v1:dayPlans');
  const heads = rows => { const used = new Set(rows.flatMap(p => p.supersedes)); return rows.filter(p => !used.has(p.id)); };
  const card = key => `.priority-card[data-priority-key="${key}"]`;
  async function add(key) {
    await act("document.querySelector('.priority-picker').open = true");
    await input('#priority-select', key); await click('Aggiungi priorità');
  }
  async function screenshot(suffix) {
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${name}: day plan overflow`);
    await act("document.querySelector('.today-plan').scrollIntoView({block:'start'})");
    const shot = await page.send('Page.captureScreenshot', { captureBeyondViewport: true, format: 'png' });
    await writeFile(join(outDir, `visual-${name}-day-${suffix}.png`), Buffer.from(shot.data, 'base64'));
  }
  async function waitForPlan() {
    for (let i = 0; i < 60; i++) {
      if (await evaluate("!!document.querySelector('.today-plan')")) return;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Plan missing after reload');
  }
  const baseline = await read('kaizen:v1:gtd:nextActions');
  const originalChecklist = await read('kaizen:v1:gtd:subActions');
  const today = await evaluate("document.querySelector('[aria-label=\"Giorno del piano\"]').value");
  const future = await evaluate("(() => { const d = new Date(); d.setDate(d.getDate()+1); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); })()");
  await add('projectActions:project-open');
  await act(`document.querySelector(${JSON.stringify(`${card('projectActions:project-open')} .priority-heading input`)}).click()`);
  assert.equal((await read('kaizen:v1:gtd:projectActions')).find(p => p.id === 'project-open').completed, true);
  await act(`document.querySelector(${JSON.stringify(`${card('projectActions:project-open')} .priority-heading input`)}).click()`);
  assert.equal((await read('kaizen:v1:gtd:projectActions')).find(p => p.id === 'project-open').completed, false);
  assert.deepEqual(await read('kaizen:v1:gtd:subActions'), originalChecklist);
  await add('habits:habit-a');
  await act(`document.querySelector(${JSON.stringify(`${card('habits:habit-a')} .priority-heading input`)}).click()`);
  assert.equal(await evaluate("!!document.querySelector('button.attention-badge[aria-label$=\"abitudini di oggi da completare\"]')"), true);
  await add('nextActions:next-a');
  assert.equal(await evaluate("document.querySelectorAll('#pending-next-actions .next-action-item').length"), 0, 'priority not duplicated in other actions');
  await input('[aria-label="Nuova azione prioritaria"]', 'Preparare incontro');
  await click('Crea e aggiungi');
  assert.equal((await read('kaizen:v1:gtd:nextActions')).length, baseline.length + 1);
  await act("document.querySelector('button[aria-label=\"Sposta su priorità Preparare incontro\"]').click()");
  assert.equal(heads(await plans()).find(p => p.date === today).priorities[2].title, 'Preparare incontro');
  await screenshot('priorities');

  await input('[aria-label="Giorno del piano"]', future);
  await add('projectActions:project-open'); await add('nextActions:next-a');
  await click('Proponi orari');
  assert.equal(await evaluate("document.querySelector('.today-plan').innerText.includes('Indica prima le tue fasce disponibili')"), true);
  await click('Imposta disponibilità');
  await input('[aria-label="Fasce disponibili"]', '09:00-12:00, 14:00-18:00');
  await input('[aria-label="Pause"]', '10:00-10:15');
  await click('Salva disponibilità');
  const beforeProposal = await plans();
  await click('Proponi orari'); assert.deepEqual(await plans(), beforeProposal, 'preview never saves');
  await screenshot('proposal');
  await click('Annulla proposta'); assert.deepEqual(await plans(), beforeProposal);
  await click('Proponi orari'); await click('Conferma il piano');
  let plan = heads(await plans()).find(p => p.date === future);
  assert.ok(plan.priorities.every(p => p.block));
  assert.equal((await read('kaizen:v1:gtd:calendarItems')).length, 1, 'no persisted calendar copies');
  await act("document.querySelector('.home-section-nav button[aria-label=Calendario]').click()");
  assert.equal(await evaluate("[...document.querySelectorAll('.calendar-event')].filter(b => b.textContent.includes('Priorità')).length"), 2);
  await act("[...document.querySelectorAll('.calendar-event')].find(b=>b.textContent.includes('Priorità')).click()");
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Giorno del piano\"]').value"), future);
  await act("document.querySelector('.bottom-nav-link[aria-label=GTD]').click()");
  await act("document.querySelector('.bottom-nav-link[aria-label=Home]').click()");
  assert.equal(await evaluate("document.querySelector('[aria-label=\"Giorno del piano\"]').value"), today, 'normal Focus navigation opens today');
  await input('[aria-label="Giorno del piano"]', future);
  const projectCard = card('projectActions:project-open');
  await act(`document.querySelector(${JSON.stringify(`${projectCard} .priority-editor`)}).open = true`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(`${projectCard} .priority-fixed input`)}).getBoundingClientRect().width <= 24`), true);
  assert.equal(await evaluate(`([...document.querySelectorAll(${JSON.stringify(`${projectCard} button`)})].find(b=>b.textContent==='Rimuovi solo il blocco')).getBoundingClientRect().width > 100`), true);
  await screenshot('editor');
  await input(`${projectCard} input[type=time]`, '14:00');
  await input(`${projectCard} input[type=number]`, '45');
  await click('Verifica orario', projectCard); await click('Conferma il piano');
  plan = heads(await plans()).find(p => p.date === future);
  assert.equal(plan.priorities[0].duration, 45);
  await act(`document.querySelector(${JSON.stringify(`${projectCard} .priority-editor`)}).open = true`);
  await click('Rimuovi solo il blocco', projectCard);
  assert.equal(heads(await plans()).find(p=>p.date === future).priorities[0].block, null);
  await click('Riorganizza il resto della giornata'); await click('Conferma il piano');
  assert.ok(heads(await plans()).find(p=>p.date === future).priorities[0].block);

  await page.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  const persisted = await plans();
  await page.send('Page.reload', { ignoreCache: true }); await waitForPlan();
  await input('[aria-label="Giorno del piano"]', future);
  assert.deepEqual(await plans(), persisted, 'offline reload must not append revisions');
  assert.equal(await evaluate("document.querySelectorAll('.priority-card').length"), 2);
  await screenshot('offline');
  // Synthetic incoming edits from two devices, confined to this temporary profile.
  await act(`(() => { const rows=JSON.parse(localStorage.getItem('kaizen:v1:dayPlans')); const superseded=new Set(rows.flatMap(p=>p.supersedes)); const base=rows.find(p=>p.date===${JSON.stringify(future)}&&!superseded.has(p.id)); for(const [id,duration] of [['device-a',50],['device-b',60]]) rows.push({...base,id,supersedes:[base.id],priorities:base.priorities.map((p,i)=>i? p:{...p,duration,block:null})}); localStorage.setItem('kaizen:v1:dayPlans',JSON.stringify(rows)); })()`);
  await page.send('Page.reload', { ignoreCache: true }); await waitForPlan(); await input('[aria-label="Giorno del piano"]', future);
  assert.equal(await evaluate("!!document.querySelector('.day-conflict')"), true);
  await screenshot('conflict'); await click('Usa questa versione', '.day-conflict');
  assert.equal(heads(await plans()).filter(p=>p.date===future).length, 1);

  const savedBeforeQuota = await plans();
  await act("window.kaizenSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key,value) { if(key==='kaizen:v1:dayPlans') throw new DOMException('Full','QuotaExceededError'); return window.kaizenSetItem.call(this,key,value); }");
  await click('Rimuovi dalle priorità', projectCard);
  assert.deepEqual(await plans(), savedBeforeQuota);
  assert.equal(await evaluate("!!document.querySelector('.storage-warning')"), true);
  assert.equal(await evaluate("document.querySelectorAll('.priority-card').length"), 2);
  await act('Storage.prototype.setItem = window.kaizenSetItem');
  // Explicit day-to-day rescheduling writes both day references in one local edit.
  const later = await evaluate(`(() => { const d=new Date(${JSON.stringify(future)}+'T12:00:00'); d.setDate(d.getDate()+1); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); })()`);
  await act(`document.querySelector(${JSON.stringify(`${projectCard} .priority-editor`)}).open = true`);
  await input(`${projectCard} .day-reschedule input`, later); await click('Riprogramma', projectCard);
  assert.equal(heads(await plans()).find(p=>p.date===future).priorities.length, 1);
  assert.equal(heads(await plans()).find(p=>p.date===later).priorities[0].ref.id, 'project-open');
  assert.deepEqual(await read('kaizen:v1:gtd:subActions'), originalChecklist);
  await input('[aria-label="Giorno del piano"]', later);
  await click('Rimuovi dalle priorità'); await click('Giornata di riposo');
  assert.equal(heads(await plans()).find(p=>p.date===later).mode, 'rest');
  await screenshot('rest');
  await input('[aria-label="Giorno del piano"]', today);
  await page.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}
