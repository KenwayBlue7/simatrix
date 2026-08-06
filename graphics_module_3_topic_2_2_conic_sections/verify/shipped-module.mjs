// Headless verification of the SHIPPED module (ADR-019 / RULES.md §2.17–§2.19):
// Chrome driven over the DevTools Protocol with Node's BUILT-IN WebSocket + fetch — no
// puppeteer, no npm. Serves the real folder over HTTP (ES modules need it), loads the real
// index.html, and asserts the platform contract, the six-step stepper, the section
// classification, the drawing sheet, and a flat WebGL buffer count across 50 rebuilds.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = 'C:/xampp/htdocs/SImatrix';
const TOPIC = '/graphics_module_3_topic_2_2_conic_sections/';
const PORT = 8123;
const CDP_PORT = 9333;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(join(ROOT, normalize(p)));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(PORT, r));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--disable-gpu-sandbox',
  '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1440,900',
  '--no-first-run', '--user-data-dir=' + process.env.TEMP + '/simatrix-verify',
  'about:blank',
], { stdio: 'ignore' });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    target = list;
    break;
  } catch { await wait(500); }
}
if (!target) { console.log('FAIL: could not reach Chrome'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));

let msgId = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (m) => {
  const data = JSON.parse(m.data);
  if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
  else if (data.method) events.push(data);
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++msgId;
  pending.set(id, resolve);
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
};

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true }); // RULES.md §2.18

// Count WebGL buffer create/delete before any page script runs — the disposal oracle.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__gl = { made: 0, freed: 0 };
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const make = proto.createBuffer, free = proto.deleteBuffer;
      proto.createBuffer = function () { window.__gl.made++; return make.apply(this, arguments); };
      proto.deleteBuffer = function () { window.__gl.freed++; return free.apply(this, arguments); };
    }`,
});

await send('Page.navigate', { url: `http://127.0.0.1:${PORT}${TOPIC}` });
await wait(6000);

// Wait until the page stops allocating: a snapshot taken while a tween is running measures
// the phase of an animation, not a leak. Hoisted — two sections need it.
const quiet = async () => {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const g = await evaluate('window.__gl.made + window.__gl.freed');
    if (g === last) return true;
    last = g;
    await wait(250);
  }
  return false;
};

let fails = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { fails++; console.log(`FAIL ${name} ${detail}`); }
  else console.log(`ok   ${name} ${detail}`);
};

// --- 1. Clean boot ------------------------------------------------------------------
// The test server has no favicon; the real payload runs in an iframe and never asks for
// one, so that 404 is an artefact of the harness, not of the sim.
const errorEntries = () => events
  .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
  .filter((e) => !(e.params.entry.url ?? '').endsWith('/favicon.ico'))
  .map((e) => `${e.params.entry.text} <${e.params.entry.url ?? '?'}>`);
const errors = errorEntries();
const exceptions = events.filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => e.params.exceptionDetails.text + ' ' + (e.params.exceptionDetails.exception?.description ?? ''));
ok('no console errors', errors.length === 0, errors.join(' | ').slice(0, 300));
ok('no uncaught exceptions', exceptions.length === 0, exceptions.join(' | ').slice(0, 300));
ok('sim booted (watchdog cleared)', await evaluate('window.__simBooted === true'));
ok('fallback hidden', await evaluate('document.getElementById("sim-fallback").hidden === true'));

// --- 2. Platform contract ------------------------------------------------------------
ok('simAPI pause/resume/reset', await evaluate(
  'typeof simAPI.pause === "function" && typeof simAPI.resume === "function" && typeof simAPI.reset === "function"'));
ok('canvas mounted', await evaluate('!!document.querySelector("#sim-viewport canvas")'));
ok('title matches meta.json',
  await evaluate(`fetch('./meta.json').then(r=>r.json()).then(m => m.title === document.title && m.difficulty === m.difficulty.toLowerCase())`));

// --- 3. The guided stepper is SIX steps ---------------------------------------------
ok('rail has 6 steps', (await evaluate('document.querySelectorAll("#step-rail .rail__item").length')) === 6);
ok('6 step panels', (await evaluate('document.querySelectorAll(".step-panel").length')) === 6);
ok('step total reads 6', (await evaluate('document.getElementById("step-total").textContent')) === '6');
ok('one panel visible at a time',
  (await evaluate('[...document.querySelectorAll(".step-panel")].filter(p=>!p.hidden).length')) === 1);

// Walk all six steps through the real Next button.
for (let i = 2; i <= 6; i++) {
  await evaluate('document.getElementById("btn-next")?.click()');
  await wait(120);
  const cur = await evaluate('document.getElementById("step-current").textContent');
  ok(`step ${i} reached`, cur === String(i), `current=${cur}`);
}
ok('terminal CTA shown on step 6', await evaluate('!document.getElementById("btn-complete-next").hidden'));
ok('Next hidden on step 6', await evaluate('document.getElementById("btn-next").hidden === true'));
ok('drawing sheet opened by step 3+', await evaluate('document.getElementById("compare-card").hidden === false'));
ok('sheet canvas painted', await evaluate(`(() => {
  const c = document.getElementById('compare-canvas');
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let ink = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 240 || d[i+1] < 240 || d[i+2] < 240) ink++;
  return ink > 500;
})()`));

// --- 4. Every construction draws, through the real select --------------------------
// Since ADR-100 the list holds ONE curve's constructions at a time, the syllabus tier first.
// Walk both curves to see the whole catalogue: §6.5's four worked ellipse methods and its
// four-centre approximation, §6.7's four, plus the general one on each. §6.9's three are out of
// scope (ADR-115), so the picker offers two curves and the catalogue is ten, not thirteen.
const methods = [];
for (const curve of ['Ellipse', 'Parabola']) {
  await evaluate(`[...document.querySelectorAll('#curve-picker button')].find(b => b.dataset.curve === '${curve}').click()`);
  await wait(500);
  const opts = await evaluate('[...document.querySelectorAll("#ctl-method option")].map(o=>o.value)');
  for (const o of opts) if (!methods.includes(o)) methods.push(o);
}
ok('10 constructions offered across the two curves', methods.length === 10, methods.join(','));
ok('…and none of them constructs a hyperbola',
  !methods.some((m) => /^hyperbola-/.test(m)), methods.join(','));
// The syllabus tier leads its curve's list — a Diploma student should not have to hunt.
await evaluate(`[...document.querySelectorAll('#curve-picker button')].find(b => b.dataset.curve === 'Ellipse').click()`);
await wait(500);
ok('…the syllabus group is listed first',
  (await evaluate('document.querySelector("#ctl-method optgroup").label')).includes('Diploma'),
  await evaluate('document.querySelector("#ctl-method optgroup").label'));
for (const m of methods) {
  await evaluate(`(() => { const s = document.getElementById('ctl-method'); s.value = ${JSON.stringify(m)}; s.dispatchEvent(new Event('change')); })()`);
  await wait(90);
  const painted = await evaluate(`(() => {
    const c = document.getElementById('compare-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 240 || d[i+1] < 240 || d[i+2] < 240) ink++;
    return ink;
  })()`);
  ok(`sheet draws ${m}`, painted > 500, `${painted} inked px`);
}

// --- 5. The section classification, driven through the real controls ---------------
// The plane is switched on by Step 2 itself; Step 3 is where the readout names the cut.
await evaluate('document.querySelector(\'#step-rail .rail__item[data-step="3"] .rail__btn\').click()');
await wait(400);
ok('the step switches the plane on', await evaluate('document.getElementById("section-readout").textContent.length > 0'));
const readAt = async (angle, offset) => {
  await evaluate(`(() => {
    const a = document.getElementById('rng-sec-angle'); a.value = '${angle}'; a.dispatchEvent(new Event('input'));
    const o = document.getElementById('rng-sec-offset'); o.value = '${offset}'; o.dispatchEvent(new Event('input'));
  })()`);
  await wait(120);
  return evaluate('document.getElementById("section-readout").textContent');
};
ok('AA circle', (await readAt(0, -15)).includes('Circle'));
ok('BB ellipse', (await readAt(30, -12)).includes('Ellipse'));
ok('DD hyperbola', (await readAt(80, -12)).includes('Hyperbola'));
ok('EE rectangular hyperbola', (await readAt(90, -8)).includes('Rectangular hyperbola'));
ok('FF isosceles triangle', (await readAt(45, 0)).includes('Isosceles triangle'));
const gen = await evaluate('parseFloat(document.getElementById("cone-readout").textContent.match(/[\\d.]+/)[0])');
ok('CC parabola at the live generator angle',
  (await readAt(Math.round(gen), -12)).includes('Parabola'), `generator ${gen}°`);

// --- 6. Disposal contract: 50 rapid rebuilds must not leak GPU buffers --------------
const settle = async (deg) => {
  await evaluate(`(() => { const a = document.getElementById('rng-sec-angle'); a.value = '${deg}'; a.dispatchEvent(new Event('input')); })()`);
  await wait(300);
};
await settle(30);
const before = await evaluate('({ ...window.__gl })');
await evaluate(`(async () => {
  const a = document.getElementById('rng-sec-angle');
  for (let i = 0; i < 50; i++) {
    a.value = String(20 + (i % 60));
    a.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 8));
  }
})()`);
await wait(1200);
await settle(30); // same scene as the opening snapshot, so only a real leak can show
const after = await evaluate('({ ...window.__gl })');
const net = (after.made - after.freed) - (before.made - before.freed);
ok('GPU buffers flat across 50 rebuilds', net === 0,
  `net +${net} live buffers (made ${after.made - before.made}, freed ${after.freed - before.freed})`);

// --- 5b. Step 3 tours the six cuts; Step 6 marks a prediction ----------------------
// The plane TRAVELS to a cut over a 700 ms tween, and under SwiftShader the rAF clock runs
// well behind wall time — so wait on the RESULT, never on a fixed sleep. A fixed sleep here
// failed about one run in two while the product was behaving correctly.
const until = async (expression, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await evaluate(expression)) return true;
    if (Date.now() > deadline) return false;
    await wait(150);
  }
};

ok('six "show me" chips', (await evaluate('document.querySelectorAll("#tour-chips [data-cut]").length')) === 6);
await evaluate(`document.querySelector('#tour-chips [data-cut="Parabola"]').click()`);
ok('a chip travels the plane to its cut',
  await until('document.getElementById("section-readout").textContent.includes("Parabola")'));
ok('Step 3 names the cut it travelled to',
  (await evaluate('document.getElementById("tour-readout").textContent')).startsWith('Parabola (section plane'));

await evaluate('document.querySelector(\'#step-rail .rail__item[data-step="6"] .rail__btn\').click()');
await wait(400);
ok('six answer chips, dead until a cut is dealt',
  (await evaluate('[...document.querySelectorAll("#predict-chips [data-answer]")].every((c) => c.disabled)')));
await evaluate('document.getElementById("btn-deal-cut").click()');
await until('[...document.querySelectorAll("#predict-chips [data-answer]")].some((c) => !c.disabled)');
ok('dealing a cut arms the answers',
  (await evaluate('[...document.querySelectorAll("#predict-chips [data-answer]")].some((c) => !c.disabled)')));
ok('the cut is not named before the answer',
  !(await evaluate('document.getElementById("section-readout").textContent')).match(/Ellipse|Parabola|Hyperbola|Circle|triangle/));
const truth = await evaluate(`(() => {
  const chips = [...document.querySelectorAll('#predict-chips [data-answer]')];
  chips[0].click();
  return document.getElementById('predict-status').textContent;
})()`);
await wait(300);
ok('answering marks it and states the rule', /Correct|Not this time/.test(truth), truth.slice(0, 80));

// --- 6a. The focal-sphere apparatus must not leak either (ADR-089) -----------------
// Step 4's first act adds a sphere, a wireframe, a fat ring, a plane and a fat line to the
// scene graph on EVERY rebuild, and the cut's tilt rebuilds. A sphere that is not disposed is
// the fastest way there is to exhaust the context, so hammer it with the apparatus fully out.
await evaluate('document.querySelector(\'#step-rail .rail__item[data-step="4"] .rail__btn\').click()');
await wait(900);
// Step 6 dealt a RANDOM cut, and three of §6.1's six sections have a shorter reveal than a
// conic does (ADR-090) — the circle's ends on the cone and the apex cut has two stages. Pin an
// ordinary ellipse first, or this assertion is a coin toss.
await quiet();   // Step 6's deal is a tween; setting the cut while it runs is a race
await evaluate(`(() => {
  const o = document.getElementById('rng-sec-offset'); o.value = -12; o.dispatchEvent(new Event('input'));
  const t = document.getElementById('rng-cut-tilt'); t.value = 35; t.dispatchEvent(new Event('input'));
})()`);
await wait(800);
ok('the cut is where the test put it',
  (await evaluate('document.getElementById("rng-cut-tilt").value')) === '35',
  `tilt = ${await evaluate('document.getElementById("rng-cut-tilt").value')}`);
// Seven stages since ADR-097 split the two tangencies apart, so six presses.
for (let i = 0; i < 6; i++) {
  await evaluate('document.getElementById("btn-proof-next").click()');
  await until('document.getElementById("btn-proof-next").disabled === false'
    + ' || document.getElementById("proof-stage").textContent.includes("Stage 7")', 8000);
  await wait(200);
}
const proofSaid = await evaluate('document.getElementById("proof-stage").textContent');
ok('the proof walks to its last stage under the learner\'s own presses',
  proofSaid.startsWith('Stage 7 of 7'), proofSaid);
// Settle: the proof's own stage animations allocate and free while they run, so both
// snapshots have to be taken with the scene at rest and in the SAME stage — otherwise the
// count measures the phase of a fade rather than a leak.
// Back to stage 5, where every part of the apparatus is VISIBLE. Three.js uploads a buffer
// the first time an object is rendered, so a stage that deliberately hides objects (the
// bridge) legitimately holds fewer live buffers than one that shows them — measuring across
// the two reports a phantom −15 that is lazy upload, not a leak.
await evaluate('document.getElementById("btn-proof-prev").click()');
await wait(600);
const tilt = async (deg) => {
  await evaluate(`(() => { const a = document.getElementById('rng-cut-tilt'); a.value = '${deg}'; a.dispatchEvent(new Event('input')); })()`);
  await wait(1200);
};
await tilt(35);
await quiet();
const beforeFocal = await evaluate('({ ...window.__gl })');
await evaluate(`(async () => {
  const a = document.getElementById('rng-cut-tilt');
  for (let i = 0; i < 40; i++) {
    a.value = String(20 + (i % 50));
    a.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 8));
  }
})()`);
await wait(1200);
await tilt(35);
await quiet();
const afterFocal = await evaluate('({ ...window.__gl })');
const netFocal = (afterFocal.made - afterFocal.freed) - (beforeFocal.made - beforeFocal.freed);
ok('GPU buffers flat across 40 rebuilds with the focal sphere out', netFocal === 0,
  `net +${netFocal} (made ${afterFocal.made - beforeFocal.made}, freed ${afterFocal.freed - beforeFocal.freed})`);

// --- 6b. Promoting a view must not starve the other, or the page ------------------
// The invariant this has always guarded: no control may collapse a pane to nothing or push the
// document into a scrollbar. It used to be checked on the 50/50 workbench split, whose entry
// point (the thumbnail's Fullscreen button) was removed in ADR-106 — so it is checked here on
// the layout that actually ships: one full-bleed main view with the other floating over it.
await evaluate(`document.querySelector('#step-rail .rail__item[data-step="5"] .rail__btn').click()`);
await wait(1200);
const panes = () => evaluate(`(() => {
  const r = (id) => { const e = document.getElementById(id);
    const b = e && !e.hidden ? e.getBoundingClientRect() : null;
    return b ? { w: Math.round(b.width), h: Math.round(b.height) } : { w: 0, h: 0 }; };
  const canvas = [...document.querySelectorAll('#view-box canvas')][0];
  return {
    main: r('compare-card'), thumb: r('view-box'), wizard: r('wizard'),
    canvasH: canvas ? Math.round(canvas.getBoundingClientRect().height) : 0,
    overflow: document.body.scrollHeight > document.documentElement.clientHeight
      || document.body.scrollWidth > document.documentElement.clientWidth,
  };
})()`);

const step5 = await panes();
ok('Step 5 gives the drawing the main panel',
  step5.main.w > step5.thumb.w * 1.5 && step5.main.h > 300,
  `main ${step5.main.w}x${step5.main.h}, thumb ${step5.thumb.w}x${step5.thumb.h}`);
ok('…the 3D thumbnail keeps a real size', step5.thumb.w >= 200 && step5.thumb.h >= 150,
  `${step5.thumb.w}x${step5.thumb.h}`);
ok('…its renderer fills the thumbnail', Math.abs(step5.canvasH - step5.thumb.h) <= 4,
  `canvas ${step5.canvasH}px in ${step5.thumb.h}px`);
ok('…the step panel is untouched', step5.wizard.w >= 300, `${step5.wizard.w}px`);
ok('…and nothing overflows the page', step5.overflow === false);

// Switching swaps which one is starved of nothing — the same invariant, mirrored.
await evaluate('document.getElementById("switch-view").click()');
await wait(1100);
const swapped = await panes();
ok('switching gives the 3D the main panel and the drawing the thumbnail',
  swapped.thumb.w > swapped.main.w * 1.5,
  `main ${swapped.main.w}, thumb ${swapped.thumb.w}`);
ok('…the step panel survives the swap', swapped.wizard.w === step5.wizard.w,
  `${swapped.wizard.w} vs ${step5.wizard.w}`);
ok('…and still nothing overflows', swapped.overflow === false);
await evaluate('document.getElementById("switch-view").click()');
await wait(900);

// --- 7. Reset routes through the single path ---------------------------------------
await evaluate('window.simAPI.reset()');
await wait(400);
ok('reset returns to step 1', (await evaluate('document.getElementById("step-current").textContent')) === '1');
ok('reset rewinds the reveal', await evaluate('document.getElementById("fld-sec-offset").hidden === true'));
ok('reset closes the sheet', await evaluate('document.getElementById("compare-card").hidden === true'));

// --- 8. Problem library ---------------------------------------------------------------
await evaluate('document.getElementById("open-problem-library").click()');
await wait(250);
// Eleven of the chapter's fifteen: the hyperbola tier is off (ADR-115) because three of its four
// exercises are answered with §6.9's constructions, which this module no longer offers. All
// fifteen are still in src/problems.js verbatim — ENABLED_TIERS decides which are dealt.
ok('library lists the 11 problems this module can answer',
  (await evaluate('document.querySelectorAll(".problem-card").length')) === 11,
  await evaluate('String(document.querySelectorAll(".problem-card").length)'));
ok('library groups by curve', (await evaluate('document.querySelectorAll(".problem-group").length')) === 2);
ok('…and sets no problem it cannot answer',
  (await evaluate(`[...document.querySelectorAll('.problem-group')].every(g => !/hyperbola/i.test(g.textContent))`)) === true);
await evaluate('document.getElementById("problem-library-close").click()');

const lateErrors = errorEntries();
ok('no console errors after the full walkthrough', lateErrors.length === 0, lateErrors.join(' | ').slice(0, 400));

console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURE(S)`);
ws.close();
chrome.kill();
server.close();
process.exit(fails === 0 ? 0 : 1);
