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
const methods = await evaluate('[...document.querySelectorAll("#ctl-method option")].map(o=>o.value)');
ok('12 constructions offered (the general one first)', methods.length === 12 && methods[0] === 'eccentricity', methods.join(','));
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
ok('six "show me" chips', (await evaluate('document.querySelectorAll("#tour-chips [data-cut]").length')) === 6);
await evaluate(`document.querySelector('#tour-chips [data-cut="Parabola"]').click()`);
// The plane TRAVELS to the cut (a 700 ms tween). Under SwiftShader the rAF clock runs well
// behind wall time, so give the animation room to land before reading the readout.
await wait(2500);
ok('a chip travels the plane to its cut',
  (await evaluate('document.getElementById("section-readout").textContent')).includes('Parabola'));

await evaluate('document.querySelector(\'#step-rail .rail__item[data-step="6"] .rail__btn\').click()');
await wait(400);
ok('six answer chips, dead until a cut is dealt',
  (await evaluate('[...document.querySelectorAll("#predict-chips [data-answer]")].every((c) => c.disabled)')));
await evaluate('document.getElementById("btn-deal-cut").click()');
await wait(2500);
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

// --- 6b. The workbench split must not starve the viewport --------------------------
// The rail is a wrapping row sized `auto` against the viewport's `minmax(0,1fr)` row, so
// every group docked into it is taken straight out of the 3D pane's height. Docking the
// whole topic's controls once drove the rail to 1340 px and collapsed the viewport to 2 px.
// Reach the split deterministically: open the sheet if it is closed, then expand it.
await evaluate(`(() => { if (document.getElementById('compare-card').hidden) document.getElementById('compare-chip').click(); })()`);
await wait(700);
await evaluate(`(() => { if (!document.body.classList.contains('compare-split')) document.getElementById('compare-expand').click(); })()`);
await wait(900);
const split = await evaluate(`(() => {
  const r = (sel) => { const e = document.querySelector(sel); const b = e && !e.hidden ? e.getBoundingClientRect() : null; return b ? Math.round(b.height) : 0; };
  const canvas = [...document.querySelectorAll('#sim-viewport canvas')].filter((c) => c.id !== 'compare-canvas')[0];
  return {
    docked: [...document.querySelectorAll('#workbench-rail [data-ctrl]')].map((n) => n.dataset.ctrl),
    railH: r('#workbench-rail'),
    viewportH: r('#sim-viewport'),
    stageH: r('.compare-card__stage'),
    canvasH: canvas ? Math.round(canvas.getBoundingClientRect().height) : 0,
    pageOverflow: document.body.scrollHeight > document.documentElement.clientHeight
      || document.body.scrollWidth > document.documentElement.clientWidth,
  };
})()`);
ok('split docks only the value drivers', split.docked.length === 2, split.docked.join(','));
ok('split leaves the viewport its share',
  split.viewportH >= 300 && split.viewportH >= 0.4 * (split.viewportH + split.railH),
  `viewport ${split.viewportH}px vs rail ${split.railH}px `
  + `(${Math.round((100 * split.viewportH) / (split.viewportH + split.railH))}% of the column)`);
ok('split renderer fills the pane', Math.abs(split.canvasH - (split.viewportH - 2)) <= 2, `canvas ${split.canvasH}px`);
ok('split sheet stage is real', split.stageH > 300, `${split.stageH}px`);
ok('split does not overflow the page', split.pageOverflow === false);
await evaluate(`(() => { if (!document.getElementById('compare-card').hidden) document.getElementById('compare-chip').click(); })()`);
await wait(500);

// --- 7. Reset routes through the single path ---------------------------------------
await evaluate('window.simAPI.reset()');
await wait(400);
ok('reset returns to step 1', (await evaluate('document.getElementById("step-current").textContent')) === '1');
ok('reset rewinds the reveal', await evaluate('document.getElementById("fld-sec-offset").hidden === true'));
ok('reset closes the sheet', await evaluate('document.getElementById("compare-card").hidden === true'));

// --- 8. Problem library ---------------------------------------------------------------
await evaluate('document.getElementById("open-problem-library").click()');
await wait(250);
ok('library lists 15 problems', (await evaluate('document.querySelectorAll(".problem-card").length')) === 15);
ok('library groups by curve', (await evaluate('document.querySelectorAll(".problem-group").length')) === 3);
await evaluate('document.getElementById("problem-library-close").click()');

const lateErrors = errorEntries();
ok('no console errors after the full walkthrough', lateErrors.length === 0, lateErrors.join(' | ').slice(0, 400));

console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURE(S)`);
ws.close();
chrome.kill();
server.close();
process.exit(fails === 0 ? 0 : 1);
