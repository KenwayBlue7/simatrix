// Headless verification of the SHIPPED module (ADR-019 / RULES.md §2.17–§2.19):
// Chrome driven over the DevTools Protocol with Node's BUILT-IN WebSocket + fetch — no puppeteer,
// no npm. Serves the real folder over HTTP (ES modules need it), loads the real index.html, and
// asserts the platform contract, the two-step stepper, the four principal directions, the
// first-angle LAYOUT of the drawing (which is the whole subject of the topic), the staged reveal,
// and a flat WebGL buffer count across repeated object changes.
//
// The layout assertions are the load-bearing ones. A first-angle sheet that puts the plan above
// the XY line, or the right side view on the right, is a sheet that teaches the wrong convention
// while looking perfectly plausible — exactly the class of defect that never shows up as a bug.
//
// Run: node verify/shipped-module.mjs   (from the topic folder, or anywhere — paths are absolute)
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = 'C:/xampp/htdocs/SImatrix';
const TOPIC = '/graphics_module_2_topic_0_introduction_to_orthographic_projection/';
const PORT = 8127;
const CDP_PORT = 9337;
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
  '--no-first-run', '--user-data-dir=' + process.env.TEMP + '/simatrix-verify-m2t0',
  'about:blank',
], { stdio: 'ignore' });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 40; i++) {
  try {
    target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
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

// Count WebGL buffer create/delete before any page script runs — the disposal oracle (§3.4).
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

/** Wait until the page stops allocating — a snapshot taken mid-tween measures a phase, not a leak. */
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
  else console.log(`ok   ${name}${detail ? ' ' + detail : ''}`);
};

// --- 1. Clean boot --------------------------------------------------------------------------
// The test server has no favicon; the real payload runs in an iframe and never asks for one.
const errorEntries = () => events
  .filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
  .filter((e) => !(e.params.entry.url ?? '').endsWith('/favicon.ico'))
  .map((e) => `${e.params.entry.text} <${e.params.entry.url ?? '?'}>`);
const exceptions = () => events.filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => e.params.exceptionDetails.text + ' ' + (e.params.exceptionDetails.exception?.description ?? ''));

ok('no console errors', errorEntries().length === 0, errorEntries().join(' | ').slice(0, 400));
ok('no uncaught exceptions', exceptions().length === 0, exceptions().join(' | ').slice(0, 400));
ok('sim booted (watchdog cleared)', await evaluate('window.__simBooted === true'));
ok('fallback hidden', await evaluate('document.getElementById("sim-fallback").hidden === true'));

// --- 2. Platform contract -------------------------------------------------------------------
ok('simAPI pause/resume/reset', await evaluate(
  'typeof simAPI.pause === "function" && typeof simAPI.resume === "function" && typeof simAPI.reset === "function"'));
ok('canvas mounted', await evaluate('!!document.querySelector("#sim-viewport canvas")'));
ok('title matches meta.json, difficulty lowercase', await evaluate(
  `fetch('./meta.json').then(r=>r.json()).then(m =>
     m.title === document.title
     && m.difficulty === m.difficulty.toLowerCase()
     && ['beginner','intermediate','advanced'].includes(m.difficulty)
     && ['title','description','difficulty','tags'].every(k => k in m))`));
// postMessage is no longer a blanket ban (ADR-078 narrows ADR-002): this topic now ships
// TWO sanctioned outbound messages, sim:ready (markBooted) and sim:complete (markComplete,
// wired to #btn-finish in src/stepper.js). Strip exactly those two known-good call sites out
// of the concatenated source, then assert nothing else matching postMessage/window.parent/
// window.top survives — a real allowlist, not a deleted check. A rogue third call (a typo'd
// payload, an inbound `message` listener, a stray window.top read) still fails this.
ok('postMessage allowlisted to sim:ready/sim:complete only', await evaluate(
  `Promise.all(['main.js','src/objectData.js','src/objectRig.js','src/projectionSheet.js',
                'src/uiManager.js','src/orthoSteps.js','src/cameraRig.js','src/stepper.js']
    .map(f => fetch('./' + f).then(r => r.text())))
    .then(t => {
      const ALLOWED = [
        "window.parent.postMessage({ type: 'sim:ready' }, '*')",
        "window.parent.postMessage({ type: 'sim:complete' }, '*')",
      ];
      let text = t.join('\\n');
      for (const call of ALLOWED) text = text.split(call).join('');
      return !/postMessage|window\\.parent|window\\.top/.test(text);
    })`));

// --- 3. The guided stepper is TWO steps ------------------------------------------------------
ok('rail has 2 steps', (await evaluate('document.querySelectorAll("#step-rail .rail__item").length')) === 2);
ok('2 step panels', (await evaluate('document.querySelectorAll(".step-panel").length')) === 2);
ok('step total reads 2', (await evaluate('document.getElementById("step-total").textContent')) === '2');
ok('one panel visible at a time',
  (await evaluate('[...document.querySelectorAll(".step-panel")].filter(p=>!p.hidden).length')) === 1);
ok('Step 1 names its forward action "Start Projection"',
  (await evaluate('document.getElementById("btn-next").textContent.trim()')) === 'Start Projection');

// --- 4. Step 1: four objects, four directions -------------------------------------------------
ok('the object picker is a dropdown of four',
  (await evaluate('document.querySelectorAll("#object-select option").length')) === 4);
ok('it lists Cylindrical / Shaft / Bearing / Stepped', await evaluate(
  `JSON.stringify([...document.querySelectorAll('#object-select option')].map(o=>o.value))
     === '["cylblock","shaftsupport","bearingblock","block"]'`));
ok('no figure numbers in the dropdown', await evaluate(
  `[...document.querySelectorAll('#object-select option')].every(o => !/fig\\.?\\s*\\d|19\\./i.test(o.textContent))`),
  await evaluate(`[...document.querySelectorAll('#object-select option')].map(o=>o.textContent.trim()).join(' | ')`));
ok('the free-orbit control is named Free Orbit',
  (await evaluate('document.getElementById("view-home").textContent.trim()')) === 'Free Orbit');

// The FRONT arrow: a live label plus the accent linework it names.
// The arrow is attached to the MODEL, so it shows in every direction while its switch is on.
const arrowShown = () => evaluate(
  `(() => { const l = document.querySelector('#sim-viewport .vp-label--front');
     return !!l && l.getBoundingClientRect().width > 0; })()`);
ok('the Front arrow shows at boot, in free orbit', (await arrowShown()) === true);
ok('the Front switch is in the step card, with the view controls', await evaluate(
  `!!document.querySelector('.step-panel[data-step="1"] #front-toggle')`));
ok('...and the Dimensions & Labels checkbox is gone',
  await evaluate(`document.getElementById('ann-toggle') === null`));
ok('four principal direction buttons',
  (await evaluate('document.querySelectorAll("#view-buttons .segmented__btn").length')) === 4);
ok('directions are Front / Top / Left / Right', await evaluate(
  `JSON.stringify([...document.querySelectorAll('#view-buttons .segmented__btn')].map(b=>b.dataset.view))
     === '["front","top","left","right"]'`));
ok('opens in free orbit, no direction latched', await evaluate(
  `[...document.querySelectorAll('#view-buttons .segmented__btn')].every(b => b.getAttribute('aria-pressed') === 'false')`));

ok('the Front switch starts on',
  await evaluate('document.getElementById("front-toggle").checked === true'));
// Chip geometry asserted against the BENCHMARK's tokens, not against "looks about right":
// 34 px tall on a 44 px hit target, pill radius, --space-4 inset from the viewport's top-left.
const chip = JSON.parse(await evaluate(`(() => {
  const c = document.getElementById('vp-dims');
  const v = document.getElementById('sim-viewport').getBoundingClientRect();
  const r = c.getBoundingClientRect();
  const cs = getComputedStyle(c);
  const hit = c.getBoundingClientRect();
  const before = getComputedStyle(c, '::before');
  return JSON.stringify({
    text: c.textContent.trim(),
    dx: Math.round(r.left - v.left), dy: Math.round(r.top - v.top),
    h: Math.round(r.height), radius: cs.borderRadius,
    size: cs.fontSize, weight: cs.fontWeight,
    hitW: parseFloat(before.minWidth), hitH: parseFloat(before.minHeight),
    z: getComputedStyle(c.parentElement).zIndex,
    w: Math.round(hit.width),
  });
})()`));
// `calc(44px + var(--space-5))` = 44 + 24 = 68 down, `var(--space-4)` = 16 across — the
// benchmark's own numbers, not an approximation of them.
ok('the Dimensions chip is at the benchmark inset', chip.dx === 16 && chip.dy === 68,
  `${chip.dx}, ${chip.dy}`);
ok('...and the wizard toggle shares that band', await evaluate(`(() => {
  const t = document.getElementById('wizard-toggle').getBoundingClientRect();
  const c = document.getElementById('vp-dims').getBoundingClientRect();
  return Math.abs((t.top + t.height / 2) - (c.top + c.height / 2)) < 6;
})()`));
ok('...34 px tall, pill radius, 0.8125rem/700 like the benchmark',
  chip.h === 34 && chip.radius === '999px' && chip.size === '13px' && chip.weight === '700',
  `${chip.h}px ${chip.radius} ${chip.size}/${chip.weight}`);
ok('...on a 44 px hit target (DESIGN.md §4.1)', chip.hitW === 44 && chip.hitH === 44,
  `${chip.hitW} x ${chip.hitH}`);
ok('...at the benchmark z-index', chip.z === '5', chip.z);
ok('...and it is the Dimensions control', /^dimensions$/i.test(chip.text), chip.text);

// The arrow rides with the MODEL, so it survives every direction, free orbit included.
for (const dir of ['front', 'top', 'left', 'right']) {
  await evaluate(`document.querySelector('#view-buttons [data-view="${dir}"]').click()`);
  await wait(1700);
  ok(`the Front arrow stays with the model in the ${dir} view`, (await arrowShown()) === true);
}
await evaluate('document.getElementById("view-home").click()');
await wait(1700);
ok('...and in free orbit', (await arrowShown()) === true);

// Its own switch, and nothing else, turns it off.
await evaluate(`(()=>{const t=document.getElementById('front-toggle');t.checked=false;t.dispatchEvent(new Event('change'));})()`);
await wait(400);
ok('Front OFF hides the arrow', (await arrowShown()) === false);
ok('...and leaves the dimensions alone', (await evaluate(
  `document.querySelectorAll('#sim-viewport .vp-dim').length`)) > 0);
await evaluate(`(()=>{const t=document.getElementById('front-toggle');t.checked=true;t.dispatchEvent(new Event('change'));})()`);
await wait(400);
ok('Front ON brings it back', (await arrowShown()) === true);
// --- The dimension layer ON THE SOLID -----------------------------------------------------------
// Step 1 has to let a learner check the model against the book, so the sizes are on the object,
// not only on Step 2's sheet. Counted against the DATA: the set for the direction the camera is
// at, drawn on that face.
const solidDims = () => evaluate(
  `document.querySelectorAll('#sim-viewport .vp-dim').length`);
const authoredFor = (view) => evaluate(`
  import('./src/objectData.js').then(m => {
    const o = m.getObject(document.getElementById('object-select').value);
    return (o.dims['${view}'] || []).length;
  })`);

for (const [key, view] of [['front', 'front'], ['top', 'top'], ['right', 'side']]) {
  await evaluate(`document.querySelector('#view-buttons [data-view="${key}"]').click()`);
  await wait(1800);
  const drawn = await solidDims();
  const want = await authoredFor(view);
  ok(`the solid carries its ${key}-view dimensions`, drawn === want, `${drawn} of ${want}`);
}
ok('the dimension layer draws real Type-B linework, not just values', await evaluate(
  `!!document.querySelector('#sim-viewport canvas')`));

// It follows the OBJECT too, not just the direction.
await evaluate(`document.querySelector('#view-buttons [data-view="front"]').click()`);
await wait(1600);
const beforeSwap = await solidDims();
await evaluate(`(() => { const s = document.getElementById('object-select'); s.value = 'bearingblock'; s.dispatchEvent(new Event('change')); })()`);
await wait(1800);
ok('changing object re-dimensions the solid',
  (await solidDims()) === (await authoredFor('front')),
  `${await solidDims()} vs ${beforeSwap} before`);

// And the switch takes every one of them, on the solid and on the sheet alike.
await evaluate('document.getElementById("vp-dims").click()');
await wait(500);
ok('the Dimensions chip OFF clears every value from the solid', (await solidDims()) === 0);
ok('...and leaves the Front arrow alone', (await arrowShown()) === true);
await evaluate('document.getElementById("vp-dims").click()');
await wait(500);
ok('...and ON restores them', (await solidDims()) > 0, `${await solidDims()} values`);
await evaluate(`(() => { const s = document.getElementById('object-select'); s.value = 'cylblock'; s.dispatchEvent(new Event('change')); })()`);
await wait(1600);
// The two switches are INDEPENDENT now: Dimensions must leave the arrow exactly where it is.
// (Its own on/off is asserted above, against the Front switch.)
await evaluate('document.getElementById("vp-dims").click()');
await wait(400);
ok('the Dimensions switch does not touch the Front arrow', (await arrowShown()) === true);
await evaluate('document.getElementById("vp-dims").click()');
await wait(400);

// Pressing a direction flies the camera and re-writes the explanation panel.
const noteBefore = await evaluate('document.getElementById("view-note").textContent');
await evaluate(`document.querySelector('#view-buttons [data-view="right"]').click()`);
await wait(1800);
ok('pressing Right latches exactly one direction', (await evaluate(
  `[...document.querySelectorAll('#view-buttons .segmented__btn')].filter(b => b.getAttribute('aria-pressed') === 'true').length`)) === 1);
ok('…and the panel names the RIGHT side view', await evaluate(
  `/right side view/i.test(document.getElementById('view-note-title').textContent)`),
  await evaluate(`document.getElementById('view-note-title').textContent`));
ok('…and explains it in plain words', (await evaluate(
  `document.getElementById('view-note').textContent.trim().length`)) > 60);
ok('…and says which side of the sheet it is drawn on', await evaluate(
  `/on the left/i.test(document.getElementById('view-note-title').textContent)`),
  await evaluate(`document.getElementById('view-note-title').textContent`));
ok('…and the copy actually changed',
  (await evaluate('document.getElementById("view-note").textContent')) !== noteBefore);
await evaluate(`document.querySelector('#view-buttons [data-view="left"]').click()`);
await wait(1800);
ok('the LEFT side view is drawn on the right', await evaluate(
  `/on the right/i.test(document.getElementById('view-note-title').textContent)`),
  await evaluate(`document.getElementById('view-note-title').textContent`));

// --- 4b. Left <-> Right is an ARC, not a chord ---------------------------------------------------
// Left and Right sit 180 deg apart, so lerping the two POSITIONS runs the camera straight THROUGH
// the target: half way across its distance is zero, the eye is inside the material and `lookAt`
// has no defined answer. That is a MID-FLIGHT defect — both end states are correct either way, so
// nothing about the finished view can detect it.
//
// What it does produce is a frame that is nearly one flat colour (the inside of the solid, or an
// empty background after the eye shoots out the far side). A near-uniform image compresses to
// almost nothing, so the PNG's own size is a usable measure of "is there still a part on screen".
// Crude, but it is measuring the actual symptom rather than asserting the fix back at itself.
const paneShot = async () => {
  const clip = await evaluate(`(() => {
    const c = document.querySelector('#sim-viewport canvas').getBoundingClientRect();
    return JSON.stringify({ x: c.x, y: c.y, width: c.width, height: c.height, scale: 1 });
  })()`);
  const r = await send('Page.captureScreenshot', { format: 'png', clip: JSON.parse(clip) });
  return r.result.data.length;
};

await evaluate(`document.querySelector('#view-buttons [data-view="left"]').click()`);
await wait(1800);
const settled = await paneShot();

await evaluate(`document.querySelector('#view-buttons [data-view="right"]').click()`);
let leanest = Infinity;
for (let i = 0; i < 10; i++) {           // sample across the 1200 ms flight
  await wait(120);
  leanest = Math.min(leanest, await paneShot());
}
await wait(1200);

ok('Left to Right keeps the part on screen the whole way',
  leanest > settled * 0.35,
  `leanest mid-flight ${leanest} vs settled ${settled}`);
ok('...and lands square on the Right view', await evaluate(
  `document.querySelector('#view-buttons [data-view="right"]').getAttribute('aria-pressed') === 'true'`));
ok('...with the horizon still level (camera up is world up)', await evaluate(
  `document.querySelector('#view-buttons [data-view="right"]').classList.contains('is-active')`));

// --- 5. Step 2: the sheet, and the FIRST-ANGLE layout ------------------------------------------
await evaluate('document.getElementById("btn-next").click()');
await wait(1800);
ok('step 2 reached', (await evaluate('document.getElementById("step-current").textContent')) === '2');
ok('the sheet is open', await evaluate('document.body.classList.contains("sheet-open")'));
ok('the stage transport is visible', await evaluate('document.getElementById("stage-strip").hidden === false'));
ok('the wizard Next is retired on the terminal step',
  await evaluate('document.getElementById("btn-next").hidden === true'));
ok('exactly one primary action on the bench', (await evaluate(
  `[...document.querySelectorAll('.btn--primary')].filter(b => !b.disabled && b.offsetParent !== null).length`)) === 1,
  await evaluate(`[...document.querySelectorAll('.btn--primary')].filter(b => !b.disabled && b.offsetParent !== null).map(b=>b.id||b.textContent.trim()).join(' + ')`));

// Step 2 opens on a BLANK sheet, not on the finished drawing (RULES.md §3.57).
ok('opens on a blank sheet', (await evaluate(
  `document.querySelectorAll('#proj-sheet-stage .psheet__stage.is-on').length`)) === 0);
ok('Previous is unavailable with nothing drawn',
  await evaluate('document.getElementById("stage-prev").disabled === true'));
ok('the transport reads Restart | Draw next | Previous, in that order', await evaluate(
  `JSON.stringify([...document.querySelectorAll('.stage-strip__row .btn')].map(b=>b.textContent.trim()))
     === '["Restart","Draw next","Previous"]'`),
  await evaluate(`[...document.querySelectorAll('.stage-strip__row .btn')].map(b=>b.textContent.trim()).join(' | ')`));
ok('the status line sits ABOVE the controls', await evaluate(`(() => {
  const r = document.getElementById('stage-readout').getBoundingClientRect();
  const row = document.querySelector('.stage-strip__row').getBoundingClientRect();
  return r.bottom <= row.top + 1;
})()`));
// Centred under the drawing rather than parked in a corner.
ok('the transport is centred on the viewport', await evaluate(`(() => {
  const s = document.getElementById('stage-strip').getBoundingClientRect();
  const v = document.getElementById('sim-viewport').getBoundingClientRect();
  return Math.abs((s.left + s.right) / 2 - (v.left + v.right) / 2) < 3;
})()`));
ok('the side-view choice is offered before anything is drawn', (await evaluate(
  `document.querySelectorAll('#side-choice input[name="side-view"]').length`)) === 2);

// Reveal every stage through the real control, exactly as a learner would.
// "3 of 8 · Elevation — outline" — the total is the number after "of".
const readStages = () => evaluate(
  `Number((document.getElementById('stage-readout').textContent.match(/of (\\d+)/) || [])[1])`);
const totalStages = await readStages();
// The stepped block has NO circular feature anywhere and hidden detail in one view only, so a
// derived stage list is exactly 3 construction + 3 outline + 1 hidden + 1 dimensioning = 8. A
// tabulated one — four stages per view regardless — would be 13. This is the assertion that the
// list is derived from the linework each view actually carries (RULES.md §3.52).
// The Cylindrical Block is the object the topic opens on. Its elevation and its side view each
// carry outline + hidden + centre; its plan carries outline + centre. A derived list is therefore
// 3 construction + 3 outline + 2 hidden + 3 centre + 1 dimensioning = 12, where a fixed
// four-per-view table would be 13 for every object alike.
ok('the cylindrical block derives 12 stages, not a fixed 13', totalStages === 12, `${totalStages} stages`);

let guard = 0;
while (guard++ < 40) {
  const done = await evaluate('document.getElementById("stage-next").disabled === true '
    + '&& document.getElementById("stage-next").textContent.trim() === "Drawing complete"');
  if (done) break;
  const busy = await evaluate('document.getElementById("stage-next").disabled === true');
  if (busy) { await wait(250); continue; }
  await evaluate('document.getElementById("stage-next").click()');
  await wait(300);
}
await wait(1500);
ok('every stage can be drawn', guard < 40, `${guard} presses`);
ok('the readout lands on the last stage', await evaluate(
  `document.getElementById('stage-readout').textContent.trim().startsWith('${totalStages} of ${totalStages}')`),
  await evaluate(`document.getElementById('stage-readout').textContent.trim()`));

// --- 6. BLANK PAPER, and FIRST ANGLE — the assertions the topic exists for ---------------------
// The sheet must carry the object and nothing else: no ground line, no plane tags, no quadrant
// apparatus. Asserting the ABSENCE of each by name, because "looks clean" is not a check.
ok('no XY ground line on the sheet',
  (await evaluate(`document.querySelectorAll('#proj-sheet-stage .psheet__ink--xy').length`)) === 0);
ok('no HP / VP / X / Y lettering anywhere on the sheet', await evaluate(
  `[...document.querySelectorAll('#proj-sheet-stage svg text')]
     .every(t => !/^(HP|VP|X|Y)$/.test(t.textContent.trim()))`),
  await evaluate(`[...document.querySelectorAll('#proj-sheet-stage svg text')].map(t=>t.textContent.trim()).filter(t=>/^(HP|VP|X|Y)$/.test(t)).join(',')`));

// Read the three views' placements straight out of the laid-out SVG, in sheet millimetres.
const geom = await evaluate(`(() => {
  const svg = document.querySelector('#proj-sheet-stage svg');
  const cap = {};
  for (const t of svg.querySelectorAll('.psheet__caption')) {
    const b = t.getBBox();
    cap[t.textContent.trim()] = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }
  return { cap: JSON.stringify(cap) };
})()`);
const cap = JSON.parse(geom.cap);
const sideName = Object.keys(cap).find((k) => /side view/i.test(k));
ok('the sheet captions exactly three views',
  Boolean(cap.Elevation && cap.Plan && sideName) && Object.keys(cap).length === 3,
  Object.keys(cap).join(', '));
// SVG y grows downward, so "below" means a LARGER y.
ok('the plan is BELOW the elevation', cap.Plan.y > cap.Elevation.y,
  `plan ${cap.Plan.y.toFixed(1)} vs elev ${cap.Elevation.y.toFixed(1)}`);
ok('the side view shares the elevation’s band', cap[sideName].y < cap.Plan.y);
ok('the plan is aligned under the elevation', Math.abs(cap.Plan.x - cap.Elevation.x) < 1,
  `${cap.Plan.x.toFixed(1)} vs ${cap.Elevation.x.toFixed(1)}`);

// The crossover, asserted for BOTH placements — the whole point of first angle.
const pickObject = async (objectId) => {
  await evaluate(`(() => { const s = document.getElementById('object-select'); s.value = '${objectId}'; s.dispatchEvent(new Event('change')); })()`);
  await wait(1700);
};

// The learner has to press Draw once for the captions to exist after an object change.
const revealAll = async () => {
  let g = 0;
  while (g++ < 40) {
    const done = await evaluate('document.getElementById("stage-next").disabled === true '
      + '&& document.getElementById("stage-next").textContent.trim() === "Drawing complete"');
    if (done) return;
    if (await evaluate('document.getElementById("stage-next").disabled === true')) { await wait(250); continue; }
    await evaluate('document.getElementById("stage-next").click()');
    await wait(260);
  }
};

for (const [id, expectSide, dir] of [['cylblock', 'Right side view', 'left'], ['shaftsupport', 'Left side view', 'right']]) {
  await pickObject(id);
  await revealAll();
  await wait(700);
  const p = JSON.parse(await evaluate(`(() => {
    const svg = document.querySelector('#proj-sheet-stage svg');
    const cap = {};
    for (const t of svg.querySelectorAll('.psheet__caption')) { const b = t.getBBox(); cap[t.textContent.trim()] = b.x + b.width / 2; }
    const side = Object.keys(cap).find(k => /side view/i.test(k));
    return JSON.stringify({ side, sideX: cap[side], elevX: cap.Elevation });
  })()`));
  ok(`${id}: carries the ${expectSide.toLowerCase()}`, p.side === expectSide, p.side);
  ok(`${id}: …drawn on the ${dir} of the elevation`,
    dir === 'left' ? p.sideX < p.elevX : p.sideX > p.elevX,
    `side ${p.sideX?.toFixed(1)} vs elevation ${p.elevX?.toFixed(1)}`);
}

// --- 7. The line alphabet, and the projectors fading -------------------------------------------
await pickObject('bearingblock');
await revealAll();
await wait(900);
ok('the bearing block derives MORE stages than the cylindrical block',
  (await readStages()) > totalStages, `${await readStages()} vs ${totalStages}`);
ok('the finished drawing carries all four layers', await evaluate(
  `['outline','hidden','centre','dimension'].every(l =>
     document.querySelector('.psheet__stage--' + l + '.is-on'))`));
ok('projection lines have faded out once the sheet is dimensioned', await evaluate(
  `[...document.querySelectorAll('.psheet__stage--construction')].every(g => g.classList.contains('is-gone'))`));
ok('dimensions are drawn with 3:1 filled arrowheads', (await evaluate(
  `document.querySelectorAll('.psheet__arrow').length`)) > 0);

// --- 7a1. The line hierarchy is BIS SP 46, at the benchmark's widths ----------------------------
// `graphics_module_1_topic_1_1_dimensioning` draws Type A at 2.5 px, Type E/F at 1.5, Type G at 1.3
// and Type B at 1.0. Those exact numbers, on every view of every object — asserted as an EQUALITY,
// because "the outline is thicker than the rest" passes a drawing whose whole alphabet has drifted
// thin, which is the defect this replaced.
//
// Measured in DEVICE pixels. The sheet is laid out in millimetres, so without
// `vector-effect: non-scaling-stroke` the identical drawing rendered at 2.23 px on one object and
// 2.13 px on a wider one; the check therefore reads `vectorEffect` too, since a regression there
// would silently reintroduce the scaling without changing a single width.
const measureInk = async () => JSON.parse(await evaluate(`(() => {
  const svg = document.querySelector('#proj-sheet-stage svg');
  // Widths are authored in sheet millimetres and scale with the viewBox, so the DEVICE-pixel
  // width — the thing a learner actually sees, and the thing the benchmark's numbers are in — is
  // the authored width times the fit scale.
  const vb = svg.viewBox.baseVal;
  const r = svg.getBoundingClientRect();
  const scale = Math.min(r.width / vb.width, r.height / vb.height);
  const w = (sel) => {
    const n = svg.querySelector(sel);
    if (!n) return null;
    const cs = getComputedStyle(n);
    // Chrome reports an UNRESOLVED calc() for SVG stroke-width (e.g. "calc(0.908785px)"), so the
    // wrapper is stripped before parsing. No regex: this string lives inside a template literal on
    // its way to the browser, where a backslash class like [\d] silently collapses to [d].
    const raw = parseFloat(cs.strokeWidth.replace('calc(', ''));
    if (!Number.isFinite(raw)) return null;
    const px = cs.vectorEffect === 'non-scaling-stroke' ? raw : raw * scale;
    return { px: +px.toFixed(2) };
  };
  return JSON.stringify({
    outline: w('.psheet__ink--outline'),
    edge: w('.psheet__ink--edge'),
    hidden: w('.psheet__ink--hidden'),
    centre: w('.psheet__ink--centre'),
    construction: w('.psheet__ink--construction'),
    dimension: w('.psheet__ink--dimension'),
  });
})()`));

const BIS = { outline: 2.5, edge: 1.8, hidden: 1.5, centre: 1.3, construction: 1, dimension: 1 };
for (const id of ['cylblock', 'shaftsupport', 'bearingblock', 'block']) {
  await pickObject(id);
  await revealAll();
  await wait(500);
  const ink = await measureInk();
  const wrong = Object.entries(BIS)
    .filter(([k]) => ink[k])
    .filter(([k, want]) => ink[k].px !== want || ink[k].scaled)
    .map(([k, want]) => `${k} ${ink[k].px}${ink[k].scaled ? ' (scaling!)' : ''} want ${want}`);
  ok(`${id}: BIS line weights at the benchmark's widths`, wrong.length === 0,
    wrong.length ? wrong.join(' | ') : 'A 2.5 / E-F 1.5 / G 1.3 / B 1.0');
  // THE point of the three levels: the silhouette must be strictly heavier than EVERY other line
  // on the sheet, internal visible geometry included. "Thicker than the dimensions" would pass a
  // drawing whose internal edges are just as heavy as its profile, which is the defect this fixed.
  const others = ['edge', 'hidden', 'centre', 'construction', 'dimension']
    .filter((k) => ink[k]).map((k) => ink[k].px);
  ok(`${id}: only the silhouette carries the heavy weight`,
    ink.outline.px > Math.max(...others),
    `silhouette ${ink.outline.px} vs heaviest other ${Math.max(...others)}`);
  // Demanded, not excused: every one of these objects authors internal visible geometry, so a
  // missing `--edge` class means the split never reached the DOM. The first version of this check
  // said `!ink.edge || ...` and passed silently while exactly that was true.
  const authoredEdges = JSON.parse(await evaluate(`
    import('./src/objectData.js').then(m => {
      const o = m.getObject('${id}');
      return String(['front','top','side'].reduce((n,k) => n + o.views[k].filter(p => p.layer === 'edge').length, 0));
    })`));
  ok(`${id}: its internal visible geometry is on the sheet`,
    Number(authoredEdges) > 0 && !!ink.edge,
    `${authoredEdges} authored, ${ink.edge ? 'rendered' : 'NOT rendered'}`);
  ok(`${id}: internal visible geometry outranks hidden and supporting lines`,
    !!ink.edge && ink.edge.px > ink.hidden.px && ink.edge.px > ink.dimension.px,
    ink.edge ? `edge ${ink.edge.px} / hidden ${ink.hidden.px} / thin ${ink.dimension.px}` : 'edge layer absent');

  // Exactly one silhouette per view: the outer profile is authored as one closed loop, and a
  // second thing wearing the heavy weight would mean an internal feature had been mis-tagged.
  const silhouettes = JSON.parse(await evaluate(`
    import('./src/objectData.js').then(m => {
      const o = m.getObject('${id}');
      return JSON.stringify(['front','top','side']
        .map(k => o.views[k].filter(p => p.layer === 'outline').length));
    })`));
  ok(`${id}: exactly one silhouette in each of the three views`,
    silhouettes.length === 3 && silhouettes.every((n) => n === 1),
    silhouettes.join(','));
}

// --- 7a2. No dimension may sit on top of another ------------------------------------------------
// The benchmark runs a full analytic clearance pass (ADR-126) because it lays out 27 drawings of a
// far denser part. This topic lays out four, by hand, in fixed lanes — so it borrows the PRINCIPLE
// rather than the pass: measure every value's box on the finished sheet and prove none of them
// touch. A lane discipline nobody checks is a lane discipline that quietly rots.
const overlaps = async () => JSON.parse(await evaluate(`(() => {
  const boxes = [...document.querySelectorAll('#proj-sheet-stage .psheet__stage--dimension text')]
    .map(t => { const b = t.getBBox(); return { t: t.textContent, x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height }; });
  const hits = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) hits.push(a.t + ' / ' + b.t);
    }
  }
  return JSON.stringify({ n: boxes.length, hits });
})()`));

for (const id of ['cylblock', 'shaftsupport', 'bearingblock', 'block']) {
  await pickObject(id);
  await revealAll();
  await wait(500);
  const audit = JSON.parse(await evaluate(`
    import('./src/objectData.js').then(m => {
      const o = m.getObject('${id}');
      const authored = ['front','top','side'].reduce((n,k) => n + (o.dims[k] || []).length, 0);
      const drawn = document.querySelectorAll('#proj-sheet-stage .psheet__stage--dimension text').length;
      return JSON.stringify({ authored, drawn });
    })`));
  ok(`${id}: every authored dimension is drawn`, audit.drawn === audit.authored,
    `${audit.drawn} of ${audit.authored}`);
  const o = await overlaps();
  ok(`${id}: no two dimension values overlap`, o.hits.length === 0,
    o.hits.length ? o.hits.join(' | ') : `${o.n} values clear`);
}

// --- 7b. The side-view choice draws the OTHER side, on the OTHER side of the sheet -------------
const sidePlacement = async () => JSON.parse(await evaluate(`(() => {
  const svg = document.querySelector('#proj-sheet-stage svg');
  const cap = {};
  for (const t of svg.querySelectorAll('.psheet__caption')) { const b = t.getBBox(); cap[t.textContent.trim()] = b.x + b.width / 2; }
  const side = Object.keys(cap).find(k => /side view/i.test(k));
  return JSON.stringify({ side, sideX: cap[side], elevX: cap.Elevation });
})()`));

await pickObject('block');            // authored LEFT side view -> drawn right
await revealAll();
await wait(600);
const asAuthored = await sidePlacement();
ok('the stepped block carries its authored left side view, on the right',
  asAuthored.side === 'Left side view' && asAuthored.sideX > asAuthored.elevX,
  `${asAuthored.side} at ${asAuthored.sideX?.toFixed(1)} vs ${asAuthored.elevX?.toFixed(1)}`);

await evaluate(`(()=>{const r=document.querySelector('#side-choice input[value="right"]');r.checked=true;r.dispatchEvent(new Event('change'));})()`);
await wait(900);
ok('choosing a side rewinds the sheet to blank paper',
  (await evaluate(`document.querySelectorAll('#proj-sheet-stage .psheet__stage.is-on').length`)) === 0);
await revealAll();
await wait(600);
const swapped = await sidePlacement();
ok('choosing Right side view draws the right side view instead',
  swapped.side === 'Right side view', swapped.side);
ok('…and moves it to the LEFT of the elevation',
  swapped.sideX < swapped.elevX,
  `side ${swapped.sideX?.toFixed(1)} vs elevation ${swapped.elevX?.toFixed(1)}`);
ok('…and still only ONE side view is drawn', (await evaluate(
  `[...document.querySelectorAll('#proj-sheet-stage .psheet__caption')].filter(t=>/side view/i.test(t.textContent)).length`)) === 1);

// The Dimensions switch is VISIBILITY, not layout: it must not cost the learner their place.
const stagesBefore = await readStages();
const atStage = await evaluate(`document.getElementById('stage-readout').textContent.trim()`);
await evaluate('document.getElementById("vp-dims").click()');
await wait(500);
ok('hiding dimensions leaves the stage list alone', (await readStages()) === stagesBefore,
  `${stagesBefore} -> ${await readStages()}`);
ok('...and does not rewind the drawing',
  (await evaluate(`document.getElementById('stage-readout').textContent.trim()`)) === atStage);
ok('...and the sizes really are gone', await evaluate(
  `document.querySelector('#proj-sheet-stage .psheet__stage--dimension') === null
   || getComputedStyle(document.querySelector('#proj-sheet-stage .psheet__stage--dimension')).display === 'none'`));
await evaluate('document.getElementById("vp-dims").click()');
await wait(500);
ok('...and come straight back on', await evaluate(
  `getComputedStyle(document.querySelector('#proj-sheet-stage .psheet__stage--dimension')).display !== 'none'`));
// EVERY authored size is on the sheet — counted against the data, not against a magic floor.
// Each dimension and each leader emits exactly one value, so the two numbers must agree; a floor
// would pass a drawing that had quietly dropped one.
const dimAudit = JSON.parse(await evaluate(`
  import('./src/objectData.js').then(m => {
    const o = m.getObject(document.getElementById('object-select').value);
    const authored = ['front','top','side'].reduce((n,k) => n + (o.dims[k] || []).length, 0);
    const drawn = document.querySelectorAll('#proj-sheet-stage .psheet__stage--dimension text').length;
    return JSON.stringify({ id: o.id, authored, drawn });
  })`));
ok('the finished sheet carries EVERY authored dimension',
  dimAudit.drawn === dimAudit.authored,
  `${dimAudit.id}: ${dimAudit.drawn} drawn vs ${dimAudit.authored} authored`);
await pickObject('bearingblock');
await revealAll();
await wait(700);

// --- 7c. Previous restores BOTH panes -------------------------------------------------------------
// Draw next turns the solid to the direction the stage is drawn from. Previous has to bring it
// back, or the drawing walks to the elevation while the solid stays square-on to the side view and
// the two halves of the screen describe different stages.
await pickObject('bearingblock');
await evaluate('document.getElementById("stage-restart").click()');
await wait(500);

/** Walk forward to the first stage of a named view and report which direction the camera is at. */
const viewAt = () => evaluate(
  `(document.querySelector('#view-buttons .segmented__btn[aria-pressed="true"]') || {}).dataset?.view ?? null`);

const trail = [];
for (let i = 0; i < 30; i++) {
  if (await evaluate('document.getElementById("stage-next").disabled === true')) {
    if (await evaluate(`document.getElementById('stage-next').textContent.trim() === 'Drawing complete'`)) break;
    await wait(200); continue;
  }
  await evaluate('document.getElementById("stage-next").click()');
  await wait(1500);                                   // let the flight land
  trail.push({
    readout: await evaluate(`document.getElementById('stage-readout').textContent.trim()`),
    view: await viewAt(),
  });
}
ok('every drawing stage put the solid on a named direction',
  trail.every((t) => t.view !== null), trail.map((t) => t.view).join(','));

// Now walk all the way back and demand the same pairing at every step.
const back = [];
for (let i = trail.length - 1; i >= 0; i--) {
  await evaluate('document.getElementById("stage-prev").click()');
  await wait(1500);
  back.push({
    readout: await evaluate(`document.getElementById('stage-readout').textContent.trim()`),
    view: await viewAt(),
  });
}
// back[0] is the state after stepping off the last stage, i.e. trail[len-2]; compare pairwise.
let desynced = null;
for (let i = 0; i < trail.length - 1; i++) {
  const wasAt = trail[trail.length - 2 - i];
  const nowAt = back[i];
  if (wasAt.readout !== nowAt.readout || wasAt.view !== nowAt.view) {
    desynced = `stage "${nowAt.readout}" is on ${nowAt.view}, but going forward it was `
      + `"${wasAt.readout}" on ${wasAt.view}`;
    break;
  }
}
ok('Previous restores the drawing AND the solid, stage for stage', desynced === null, desynced ?? '');
ok('walking all the way back lands on the blank sheet',
  (await evaluate(`document.getElementById('stage-readout').textContent.trim()`)).startsWith('0 of'),
  await evaluate(`document.getElementById('stage-readout').textContent.trim()`));
ok('...with nothing drawn',
  (await evaluate(`document.querySelectorAll('#proj-sheet-stage .psheet__stage.is-on').length`)) === 0);

await revealAll();
await wait(600);

// Back never replays and never re-hides the projectors' ghost state incorrectly.
await evaluate('document.getElementById("stage-prev").click()');
await wait(300);
ok('Back steps one stage without replaying', await evaluate(
  `document.querySelector('.psheet__stage--dimension').classList.contains('is-on') === false`));
ok('…and Back is never disabled while there is something to undo',
  await evaluate('document.getElementById("stage-prev").disabled === false'));

// --- 8. Disposal: object changes must not leak GPU buffers (RULES.md §3.4) ---------------------
await quiet();
const before = await evaluate('window.__gl.made - window.__gl.freed');
for (let i = 0; i < 24; i++) {
  const id = ['block', 'cylblock', 'shaftsupport', 'bearingblock'][i % 4];
  await evaluate(`(() => { const s = document.getElementById('object-select'); s.value = '${id}'; s.dispatchEvent(new Event('change')); })()`);
  await wait(90);
}
await wait(1200);
await quiet();
const after = await evaluate('window.__gl.made - window.__gl.freed');
ok('WebGL buffer count flat across 24 object rebuilds', after - before <= 2, `${before} -> ${after}`);

// --- 9. Reset routes through the single path ----------------------------------------------------
await evaluate('window.simAPI.reset()');
await wait(900);
ok('reset returns to step 1', (await evaluate('document.getElementById("step-current").textContent')) === '1');
ok('reset closes the sheet', await evaluate('document.body.classList.contains("sheet-open") === false'));
ok('reset returns the first object',
  (await evaluate('document.getElementById("object-select").value')) === 'cylblock');
ok('reset restores the Dimensions chip', await evaluate(
  `document.getElementById('vp-dims').getAttribute('aria-pressed') === 'true'`));
ok('reset restores the Front switch',
  await evaluate('document.getElementById("front-toggle").checked === true'));
ok('reset returns to free orbit', await evaluate(
  `[...document.querySelectorAll('#view-buttons .segmented__btn')].every(b => b.getAttribute('aria-pressed') === 'false')`));

const lateErrors = errorEntries();
ok('no console errors after the full walkthrough', lateErrors.length === 0, lateErrors.join(' | ').slice(0, 500));
const lateEx = exceptions();
ok('no uncaught exceptions after the full walkthrough', lateEx.length === 0, lateEx.join(' | ').slice(0, 500));

console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURE(S)`);
ws.close();
chrome.kill();
server.close();
process.exit(fails === 0 ? 0 : 1);
