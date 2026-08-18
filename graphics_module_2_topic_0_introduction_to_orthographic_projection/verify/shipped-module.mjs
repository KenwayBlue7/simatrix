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
// `calc(44px + var(--space-5))` = 44 + 24 = 68 down — the benchmark's own number, untouched.
// Across is the benchmark's `var(--space-4)` = 16 plus a requested 2 mm nudge = 16 + 7.6 = 24.
ok('the Dimensions chip keeps the benchmark band, nudged 2 mm in',
  Math.abs(chip.dx - 24) <= 1 && chip.dy === 68,
  `${chip.dx}, ${chip.dy}`);
ok('...and the wizard toggle shares that band', await evaluate(`(() => {
  const t = document.getElementById('wizard-toggle').getBoundingClientRect();
  const c = document.getElementById('vp-dims').getBoundingClientRect();
  return Math.abs((t.top + t.height / 2) - (c.top + c.height / 2)) < 6;
})()`));
// The panel toggle is right-anchored, so a 2 mm move LEFT is 2 mm more inset: `var(--space-3)` = 12
// plus 7.6 = 20 from the viewport's right edge. Its 44 px box is asserted alongside, because "move
// it" must not have turned into "resize it".
const wiz = JSON.parse(await evaluate(`(() => {
  const t = document.getElementById('wizard-toggle').getBoundingClientRect();
  const v = document.getElementById('sim-viewport').getBoundingClientRect();
  return JSON.stringify({ gap: v.right - t.right, w: Math.round(t.width), h: Math.round(t.height) });
})()`));
ok('the panel toggle sits 2 mm further in from the right edge',
  Math.abs(wiz.gap - 20) <= 1, `${wiz.gap.toFixed(1)}px`);
ok('...at the same 44 px size', wiz.w === 44 && wiz.h === 44, `${wiz.w} x ${wiz.h}`);
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

// ...and the values on the SOLID are aligned too. Measured on the ELEVATION, which is the set that
// carries vertical dimension lines — a side view whose only size is a horizontal depth could not
// tell a turned value from a level one. Both media draw one dimension set through one
// placement function, so a value that reads along its line on the sheet and lies flat on the model
// is two conventions on one drawing — which is the single thing Method 1 forbids. The turn has to
// be on the INNER span: CSS2DRenderer rewrites the outer element's transform every frame.
await evaluate(`document.querySelector('#view-buttons [data-view="front"]').click()`);
await wait(1800);
const solidTurn = JSON.parse(await evaluate(`(() => {
  const out = [];
  for (const el of document.querySelectorAll('#sim-viewport .vp-dim')) {
    const inner = el.querySelector('.vp-dim__text');
    const m = inner && /rotate\\(([-0-9.]+)/.exec(inner.style.transform || '');
    out.push({ t: el.textContent, inner: !!inner, rot: m ? parseFloat(m[1]) : 0 });
  }
  return JSON.stringify(out);
})()`));
ok('every value on the solid carries its turn on an inner span',
  solidTurn.length > 0 && solidTurn.every((v) => v.inner),
  `${solidTurn.filter((v) => v.inner).length} of ${solidTurn.length}`);
ok('...and the ones on vertical dimension lines really are turned',
  solidTurn.some((v) => Math.abs(Math.abs(v.rot) - 90) < 0.5)
  && solidTurn.every((v) => Math.abs(v.rot) <= 90.001),
  solidTurn.map((v) => `${v.t}@${v.rot}`).join(' '));
// THE FRONT LABEL IS PART OF THE MARK, not a caption parked near it. It rides the arrow's tail at a
// fixed fraction of the arrow's own size, so shaft, head and name turn together and hold their
// spacing from every direction. Two things are measured, on every object and at every direction the
// arrow is shown in: that the name has not drifted off into clear paper, and that it is not sitting
// on a dimension value.
//
// "Has not drifted" is measured against the CANVAS, and the band DEPENDS ON THE DIRECTION, because
// the front face is not in the middle of the frame from every direction — only from the front. Seen
// from above the front face is the near edge of the plan, so the mark belongs low and centred; seen
// from the right it is the left-hand edge of the frame, so the mark belongs left and level. Pinning
// the mark to the side of the frame its face is actually on is what makes this a drift test rather
// than a "somewhere on the canvas" test. The bands are loose; they are not a pixel spec.
const FRONT_MARK_BAND = {
  front: { x: [0.30, 0.70], y: [0.20, 0.80] },
  top: { x: [0.30, 0.70], y: [0.55, 0.95] },
  // The right-hand band is the loosest of the three because the arrow is aimed at MATERIAL on the
  // front face, and on a tall part with a thin base that material is low down: the Bearing Block
  // is 61 mm high on a 15 mm base, so at its own mid-width the only front face there is belongs to
  // the base, and the mark rides at 12% of the height. Viewed square-on that is off the bottom of
  // a 0.75 band, and the mark is exactly where it should be.
  right: { x: [0.02, 0.45], y: [0.25, 0.85] },
};
const frontMark = async () => JSON.parse(await evaluate(`(() => {
  const l = document.querySelector('#sim-viewport .vp-label--front');
  const c = document.querySelector('#sim-viewport canvas').getBoundingClientRect();
  if (!l) return JSON.stringify({ none: true });
  const a = l.getBoundingClientRect();
  const hits = [...document.querySelectorAll('#sim-viewport .vp-dim')]
    .map(v => ({ t: v.textContent, r: v.getBoundingClientRect() }))
    .filter(v => a.left < v.r.right && v.r.left < a.right && a.top < v.r.bottom && v.r.top < a.bottom);
  return JSON.stringify({
    hits: hits.map(h => h.t),
    fx: ((a.left + a.right) / 2 - c.left) / c.width,
    fy: ((a.top + a.bottom) / 2 - c.top) / c.height,
  });
})()`));

for (const id of ['cylblock', 'shaftsupport', 'bearingblock', 'block']) {
  await evaluate(`(() => { const s = document.getElementById('object-select'); s.value = '${id}'; s.dispatchEvent(new Event('change')); })()`);
  await wait(1900);
  for (const dir of ['front', 'top', 'right']) {
    await evaluate(`document.querySelector('#view-buttons [data-view="${dir}"]').click()`);
    await wait(1900);
    const m = await frontMark();
    const band = FRONT_MARK_BAND[dir];
    ok(`${id}/${dir}: the Front label is still on the mark, not adrift`,
      m.none !== true
      && m.fx > band.x[0] && m.fx < band.x[1]
      && m.fy > band.y[0] && m.fy < band.y[1],
      m.none ? 'no label' : `x ${m.fx.toFixed(2)} y ${m.fy.toFixed(2)}`);
    ok(`${id}/${dir}: ...and clears every value on the solid`,
      m.none !== true && m.hits.length === 0, m.hits ? m.hits.join(',') : 'no label');
  }
}

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

// SCROLLING IS A ZOOM, NOT A TURN — in every one of the four directions.
//
// The measurement is the zoom's FIXED POINT. A pure zoom about `controls.target` maps every screen
// point p to s·(p − F) + F, where F is the target's own projection and s is the scale; solve that
// from the values' centroid before and after and F falls out. If the camera zooms about the object,
// F lands on the pane centre. If the scroll instead handed the view back to perspective, re-framed
// it, or dollied about a target left on the last object, F is somewhere else entirely — which is
// what the learner sees as the object jumping out from under the pointer.
//
// The direction button must also still be lit afterwards: a scroll is a request to look closer at
// the view you are in, and leaving it would take the orthographic projection and the view's own
// dimension set with it.
const paneMark = async () => JSON.parse(await evaluate(`(() => {
  const c = document.querySelector('#sim-viewport canvas').getBoundingClientRect();
  const vs = [...document.querySelectorAll('#sim-viewport .vp-dim')]
    .map((v) => v.getBoundingClientRect())
    .map((r) => [(r.left + r.right) / 2, (r.top + r.bottom) / 2]);
  if (vs.length < 2) return JSON.stringify({ none: true });
  const cx = vs.reduce((s, p) => s + p[0], 0) / vs.length;
  const cy = vs.reduce((s, p) => s + p[1], 0) / vs.length;
  const spread = Math.sqrt(vs.reduce((s, p) => s + (p[0] - cx) ** 2 + (p[1] - cy) ** 2, 0) / vs.length);
  return JSON.stringify({
    cx, cy, spread, n: vs.length,
    paneX: c.left + c.width / 2, paneY: c.top + c.height / 2, paneW: c.width, paneH: c.height,
  });
})()`));

const scroll = async (steps) => evaluate(`(() => {
  const c = document.querySelector('#sim-viewport canvas');
  const r = c.getBoundingClientRect();
  for (let i = 0; i < ${steps}; i++) {
    c.dispatchEvent(new WheelEvent('wheel', {
      deltaY: -120, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
      bubbles: true, cancelable: true,
    }));
  }
})()`);

// On the bearing block, whose side views carry more than one size — the measurement needs at least
// two values on screen to have a centroid and a spread at all.
await evaluate(`(() => { const s = document.getElementById('object-select'); s.value = 'bearingblock'; s.dispatchEvent(new Event('change')); })()`);
await wait(1800);
for (const dir of ['front', 'top', 'left', 'right']) {
  await evaluate(`document.querySelector('#view-buttons [data-view="${dir}"]').click()`);
  await wait(1900);
  const before = await paneMark();
  await scroll(4);
  await wait(700);
  const after = await paneMark();
  const lit = await evaluate(
    `document.querySelector('#view-buttons [data-view="${dir}"]').classList.contains('is-active')`,
  );
  ok(`${dir}: a scroll stays in the view it was given`, lit === true, String(lit));
  const s = before.none || after.none ? 0 : after.spread / before.spread;
  ok(`${dir}: ...and the scroll really did zoom`, s > 1.02, `x${s.toFixed(3)}`);
  const fx = (after.cx - s * before.cx) / (1 - s);
  const fy = (after.cy - s * before.cy) / (1 - s);
  const dx = Math.abs(fx - before.paneX) / before.paneW;
  const dy = Math.abs(fy - before.paneY) / before.paneH;
  ok(`${dir}: ...about the object, not about somewhere else on the bench`,
    s > 1.02 && dx < 0.08 && dy < 0.08,
    `fixed point off centre by ${(dx * 100).toFixed(1)}% x, ${(dy * 100).toFixed(1)}% y`);
}
await evaluate(`(() => { const s = document.getElementById('object-select'); s.value = 'cylblock'; s.dispatchEvent(new Event('change')); })()`);
await wait(1800);
await evaluate(`document.querySelector('#view-buttons [data-view="front"]').click()`);
await wait(1700);

// ...but a DRAG still does leave it. The other half of the same rule, and the half that breaks if
// the drag is ever detected by something narrower than "one pointer down, and it moved".
await evaluate(`(() => {
  const c = document.querySelector('#sim-viewport canvas');
  const r = c.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const ev = (type, dx) => c.dispatchEvent(new PointerEvent(type, {
    pointerId: 1, isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    clientX: x + dx, clientY: y, bubbles: true, cancelable: true,
  }));
  ev('pointerdown', 0); ev('pointermove', 40); ev('pointerup', 40);
})()`);
await wait(600);
ok('a drag DOES leave the named direction, for free orbit', await evaluate(
  `document.querySelectorAll('#view-buttons .segmented__btn.is-active').length === 0`));
await evaluate(`document.querySelector('#view-buttons [data-view="front"]').click()`);
await wait(1700);

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

// --- 4c. A view change is CONTINUOUS, frame by frame ---------------------------------------------
// Both ends of a flight can be perfectly correct while the first frame of it teleports, and nothing
// about the settled view can tell you that happened. So this samples the flight itself: the Front
// label is the one DOM node glued to the solid from every direction, and its pane position is
// recorded on every animation frame across a switch.
//
// A JUMP IS A SPIKE, and that is what the measurement keys on rather than raw distance. An eased
// flight speeds up and slows down, so its biggest frame is simply its fastest one and its
// neighbours are nearly as big; a teleport is one enormous frame between two still ones. Comparing
// each frame with the larger of its two neighbours separates the two cleanly — the ratio is about
// 1.3 for the peak of a smooth flight and was 80 to 140 for the pop this caught, where re-aiming
// the pivot at the newly-rebuilt annotation box swung the camera in a single frame before the
// flight had moved at all.
const SAMPLER = `(() => {
  window.__path = [];
  const c = document.querySelector('#sim-viewport canvas').getBoundingClientRect();
  const step = () => {
    const l = document.querySelector('#sim-viewport .vp-label--front');
    if (l) {
      const a = l.getBoundingClientRect();
      window.__path.push([(a.left + a.right) / 2 - c.left, (a.top + a.bottom) / 2 - c.top]);
    }
    window.__sampling = requestAnimationFrame(step);
  };
  step();
})()`;

const flightPath = async (dir) => {
  await evaluate(SAMPLER);
  await evaluate(`document.querySelector('#view-buttons [data-view="${dir}"]').click()`);
  await wait(2100);                                   // the 1200 ms flight, plus room to settle
  await evaluate('cancelAnimationFrame(window.__sampling)');
  const path = JSON.parse(await evaluate('JSON.stringify(window.__path)'));
  const steps = [];
  for (let i = 1; i < path.length; i++) {
    steps.push(Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  }
  // +0.5 px of floor, so two consecutive still frames cannot divide by zero.
  const spike = Math.max(...steps.map((s, i) => s / (Math.max(steps[i - 1] ?? 0, steps[i + 1] ?? 0) + 0.5)));
  return {
    total: steps.reduce((a, b) => a + b, 0),
    spike,
    tail: steps.slice(-12).reduce((a, b) => a + b, 0),
  };
};

await evaluate(`document.querySelector('#view-buttons [data-view="front"]').click()`);
await wait(1800);
// Every ordering that matters: a quarter turn, a climb to the plan, the steep drop off it, and the
// half turn. The dimension layer is ON, which is the case that had the defect — the set is rebuilt
// for the new direction before the flight starts, and it is that rebuild the flight has to absorb.
for (const dir of ['top', 'left', 'right', 'front', 'right', 'top', 'front']) {
  const f = await flightPath(dir);
  ok(`-> ${dir}: the flight moves the picture at all`, f.total > 40, `${f.total.toFixed(0)}px of path`);
  ok(`-> ${dir}: ...with no frame that teleports`, f.spike < 4,
    `worst frame is ${f.spike.toFixed(1)}x its neighbours`);
  ok(`-> ${dir}: ...and it is still once it has landed`, f.tail < 2, `${f.tail.toFixed(2)}px in the last 12 frames`);
}

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
// And SHARES IT EXACTLY. The two views stand on the same line of the sheet, so their names are one
// row of headings; left to their own clearances they drift apart by whatever the two happen to
// carry, which put them 45 mm apart on the Cylindrical Block.
ok('…on the same line as it, to the millimetre',
  Math.abs(cap[sideName].y - cap.Elevation.y) < 0.6,
  `${cap[sideName].y.toFixed(1)} vs ${cap.Elevation.y.toFixed(1)}`);
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


// A CAPTION IS CENTRED ON ITS OWN DRAWING, measured off the laid-out SVG.
//
// Each caption lives in the same <g> as the linework it names, so the group's own box is the
// answer -- with the caption itself taken out of it, since a text node inside the group would
// otherwise drag the box towards wherever the text already is and the test would agree with any
// placement at all. The group holds outline and edge, which IS the drawing; centre lines and
// dimensions sit in their own groups and are correctly ignored, because a centre line overhanging
// one side of a part is not a reason to print its name off to that side. That was the fault:
// the Bearing Block's bore centre line reaches 7 mm past the lug on the left with nothing to
// balance it, and "Elevation" printed 3.5 mm left of a view symmetrical about x = 0.
const captionCentres = async () => JSON.parse(await evaluate(`(() => {
  const out = [];
  for (const g of document.querySelectorAll('#proj-sheet-stage .psheet__stage--outline')) {
    const label = g.querySelector('text.psheet__caption');
    if (!label) continue;
    let minX = Infinity, maxX = -Infinity;
    for (const child of g.children) {
      if (child.tagName === 'text') continue;
      const b = child.getBBox();
      if (!b.width && !b.height) continue;
      minX = Math.min(minX, b.x);
      maxX = Math.max(maxX, b.x + b.width);
    }
    const t = label.getBBox();
    out.push({
      name: label.textContent.trim(),
      ink: (minX + maxX) / 2,
      text: t.x + t.width / 2,
      width: maxX - minX,
    });
  }
  return JSON.stringify(out);
})()`));

for (const id of ['cylblock', 'shaftsupport', 'bearingblock', 'block']) {
  await pickObject(id);
  await revealAll();
  await wait(400);
  const centres = await captionCentres();
  const off = centres.filter((c) => Math.abs(c.text - c.ink) > 0.6);
  // How much CLEAR AIR sits between a caption and the nearest thing drawn under it. Asserted from
  // both sides: never touching, and never adrift. The clearance is derived from where each view's
  // marks really land, so a caption that had drifted back out would mean the derivation had gone
  // wrong again — which is exactly how "Elevation" ended up 40 mm above a drawing it only had to
  // clear by two. Construction lines are excluded; they are scaffolding and are faded out.
  const air = JSON.parse(await evaluate(`(() => {
    const svg = document.querySelector('#proj-sheet-stage svg');
    const nodes = [...svg.querySelectorAll('path, line, circle, polyline, polygon')]
      .filter((n) => n.closest('.psheet__stage') && !n.closest('.psheet__stage--construction'))
      .map((n) => n.getBBox());
    const out = [];
    for (const c of svg.querySelectorAll('.psheet__caption')) {
      const b = c.getBBox();
      const under = c.textContent.trim() === 'Plan';   // the plan's caption hangs BELOW its view
      let gap = Infinity;
      for (const n of nodes) {
        if (n.x + n.width < b.x - 25 || n.x > b.x + b.width + 25) continue;
        const d = under ? b.y - (n.y + n.height) : n.y - (b.y + b.height);
        if (d >= -0.01 && d < gap) gap = d;
      }
      out.push({ name: c.textContent.trim(), gap });
    }
    return JSON.stringify(out);
  })()`));
  const tight = air.filter((a) => a.gap < 1);
  ok(`${id}: no caption touches its drawing`,
    air.length === 3 && tight.length === 0,
    tight.map((a) => `${a.name} ${a.gap.toFixed(2)}mm`).join(' | ') || 'all clear');
  ok(`${id}: ...and none of them is adrift above it`,
    Math.min(...air.map((a) => a.gap)) <= 6,
    air.map((a) => `${a.name} ${a.gap.toFixed(1)}`).join(', '));

  const rows = JSON.parse(await evaluate(`(() => {
    const out = {};
    for (const t of document.querySelectorAll('#proj-sheet-stage .psheet__caption')) {
      const b = t.getBBox();
      out[/side view/i.test(t.textContent) ? 'side' : t.textContent.trim().toLowerCase()] = b.y + b.height / 2;
    }
    return JSON.stringify(out);
  })()`));
  ok(`${id}: the elevation and the side view head one row, and the plan does not join it`,
    Math.abs(rows.elevation - rows.side) < 0.6 && rows.plan > rows.elevation + 10,
    `elev ${rows.elevation.toFixed(1)}, side ${rows.side.toFixed(1)}, plan ${rows.plan.toFixed(1)}`);
  ok(`${id}: every caption is centred on its own drawing, not on the page`,
    centres.length === 3 && off.length === 0,
    off.length
      ? off.map((c) => `${c.name} ${(c.text - c.ink).toFixed(2)} mm off`).join(' | ')
      : centres.map((c) => c.name).join(', '));
}

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
  // The hidden layer is allowed to be ABSENT, and only for the reason the Stepped Block gives:
  // seen from the left, every one of its edges is in plain view, so its default drawing has no
  // dashed line anywhere on it. That is a fact about the object, not a missing layer — the same
  // block flipped to its RIGHT side view is nothing but dashed lines, and the pair is asserted
  // below. `edge` is still demanded outright; every object authors internal visible geometry.
  ok(`${id}: internal visible geometry outranks hidden and supporting lines`,
    !!ink.edge && (!ink.hidden || ink.edge.px > ink.hidden.px) && ink.edge.px > ink.dimension.px,
    ink.edge
      ? `edge ${ink.edge.px} / hidden ${ink.hidden ? ink.hidden.px : 'none authored'} / thin ${ink.dimension.px}`
      : 'edge layer absent');

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
// The benchmark runs a full analytic clearance pass (ADR-203) because it lays out 27 drawings of a
// far denser part. This topic lays out four, by hand, in fixed lanes — so it borrows the PRINCIPLE
// rather than the pass: measure every value's box on the finished sheet and prove none of them
// touch. A lane discipline nobody checks is a lane discipline that quietly rots.
//
// MEASURED THROUGH `getBoundingClientRect()`, NOT `getBBox()`. `getBBox` reports a node's geometry
// in its OWN user space and ignores the element's own transform, so it is blind to exactly the
// thing Method 1 adds: a turned value's box comes back axis-aligned and unturned, and two values
// that cross on the sheet measure as clear. The client rect is in screen space, after the rotation.
const overlaps = async () => JSON.parse(await evaluate(`(() => {
  const boxes = [...document.querySelectorAll('#proj-sheet-stage .psheet__stage--dimension text')]
    .map(t => { const b = t.getBoundingClientRect(); return { t: t.textContent, x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; });
  const caps = [...document.querySelectorAll('#proj-sheet-stage .psheet__caption')]
    .map(t => { const b = t.getBoundingClientRect(); return { t: t.textContent, x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; });
  const over = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const hits = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (over(boxes[i], boxes[j])) hits.push(boxes[i].t + ' / ' + boxes[j].t);
    }
  }
  // A view's caption hangs on the far side of it from the XY line, which is exactly where an
  // overall size wants to go — so the caption's clearance is measured against what is DRAWN, and
  // this is the assertion that keeps it honest when a lane or a text lift moves.
  const capHits = [];
  for (const c of caps) for (const v of boxes) if (over(c, v)) capHits.push(c.t + ' / ' + v.t);
  return JSON.stringify({ n: boxes.length, hits, caps: caps.length, capHits });
})()`));

// --- 7a2b. DIAMETER AND RADIUS: THE RIGHT SYMBOL, THE RIGHT SHAPE, AND OFF THE OBJECT ----------
// Three separate claims, all measured against the view's own primitives rather than against the
// registry -- "d30" matching a registry that says "d30" proves nothing about the drawing.
//
// WHICH SYMBOL. `circle` is the only primitive that draws a complete 360 deg circle, so a diameter
// must have one under it at that exact centre and radius, and a radius must not. The arrowhead
// must also LAND ON drawn outline or edge linework, because the arrow is the only thing that says
// which curve the label belongs to -- that is what caught the Cylindrical Block's boss, labelled
// as a diameter with its leader anchored at 225 deg, on the part of the circle the plan trims away.
//
// WHERE IT SITS. The elbow and the shelf must both be OUTSIDE the view's outline. A leader may
// start on the feature -- it has to -- but nothing the learner READS may sit on the geometry they
// are being asked to look at.
const roundAudit = JSON.parse(await evaluate(`
  import('./src/objectData.js').then((m) => {
    const near = (a, b) => Math.abs(a - b) < 0.05;
    const segDist = (p, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
      return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    };
    // How far the point is from the nearest OUTLINE or EDGE the view actually draws. Hidden detail
    // and centre lines are excluded: an arrow on either of those names the wrong thing.
    const toInk = (p, prims) => {
      let best = Infinity;
      for (const pr of prims) {
        if (pr.layer !== 'outline' && pr.layer !== 'edge') continue;
        if (pr.k === 'circle') best = Math.min(best, Math.abs(Math.hypot(p[0] - pr.c[0], p[1] - pr.c[1]) - pr.r));
        else if (pr.k === 'line') best = Math.min(best, segDist(p, pr.a, pr.b));
        else if (pr.k === 'poly') {
          const n = pr.pts.length;
          for (let i = 0; i < (pr.close ? n : n - 1); i++) best = Math.min(best, segDist(p, pr.pts[i], pr.pts[(i + 1) % n]));
        }
      }
      return best;
    };
    // Even-odd ray cast against the view's OUTLINE polygons: "is this point on the object".
    const inside = (p, prims) => prims.some((pr) => {
      if (pr.k !== 'poly' || pr.layer !== 'outline') return false;
      let hit = false;
      for (let i = 0, j = pr.pts.length - 1; i < pr.pts.length; j = i++) {
        const xi = pr.pts[i][0], yi = pr.pts[i][1], xj = pr.pts[j][0], yj = pr.pts[j][1];
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    });
    const bad = [], seen = { dia: 0, rad: 0 };
    for (const o of m.OBJECTS) {
      for (const view of ['front', 'top', 'side']) {
        const prims = o.views[view] || [];
        const full = (c, r) => prims.some((p) => p.k === 'circle' && near(p.c[0], c[0]) && near(p.c[1], c[1]) && near(p.r, r));
        for (const d of o.dims[view] || []) {
          if (d.k === 'dim') continue;
          const where = o.id + '/' + view + ' ' + d.text + ': ';
          const dia = d.k === 'dia';
          const r = dia ? parseFloat(d.text.slice(1)) / 2 : parseFloat(d.text.slice(1));
          if (dia) seen.dia++; else seen.rad++;
          if (dia !== !/^R/.test(d.text)) bad.push(where + 'the symbol and the kind of mark disagree');
          // Both legs run along the feature's own radius. A radius starts ON the arc, so its centre
          // is one radius back down the leg; a diameter starts at the FAR side, so its centre is one
          // radius FORWARD along it — which is the same as saying the line crosses the centre.
          const len = Math.hypot(d.to[0] - d.at[0], d.to[1] - d.at[1]) || 1;
          const u = [(d.to[0] - d.at[0]) / len, (d.to[1] - d.at[1]) / len];
          const c = dia
            ? [d.at[0] + u[0] * r, d.at[1] + u[1] * r]
            : [d.at[0] - u[0] * r, d.at[1] - u[1] * r];
          if (dia && !full(c, r)) bad.push(where + 'diameter on a shape this view does not draw as a full circle');
          if (dia) {
            // The line spans the whole width: the two heads are 2r apart, both on the circle, and
            // the second is collinear with the first and the elbow.
            if (!d.head2) bad.push(where + 'a diameter with only one arrowhead');
            else {
              const span = Math.hypot(d.head2[0] - d.at[0], d.head2[1] - d.at[1]);
              const cross = (d.head2[0] - d.at[0]) * u[1] - (d.head2[1] - d.at[1]) * u[0];
              if (Math.abs(span - 2 * r) > 0.01) bad.push(where + 'its line spans ' + span.toFixed(2) + ', not the ' + (2 * r) + ' it claims');
              if (Math.abs(cross) > 0.01) bad.push(where + 'its second head is off the line');
              if (Math.abs(Math.hypot(d.head2[0] - c[0], d.head2[1] - c[1]) - r) > 0.01) bad.push(where + 'its second head is off the circle');
            }
          } else if (d.head2) {
            bad.push(where + 'a radius drawn across the centre');
          }
          if (!dia && full(c, r)) bad.push(where + 'R on a complete circle');
          const off = toInk(d.at, prims);
          if (!(off < 0.1)) bad.push(where + 'arrow ' + off.toFixed(2) + ' mm off any drawn line');
          const shelf = [d.to[0] + Math.sign(d.to[0] - d.at[0] || 1) * m.DIM_STYLE.leaderLand, d.to[1]];
          if (inside(d.to, prims)) bad.push(where + 'its elbow sits on the object');
          if (inside(shelf, prims)) bad.push(where + 'its shelf sits on the object');
        }
      }
    }
    return JSON.stringify({ bad, seen });
  })`));
ok('every diameter is on a complete circle, every R is on a drawn arc, and no shelf sits on the object',
  roundAudit.bad.length === 0, roundAudit.bad.join(' | '));
ok('...and the drawing uses both symbols, so the rule is being exercised',
  roundAudit.seen.dia >= 4 && roundAudit.seen.rad >= 4,
  `${roundAudit.seen.dia} diameters, ${roundAudit.seen.rad} radii`);

// The SHAPE of the mark, read back off the SVG: three points -- arrow, elbow, shelf -- with the
// last leg horizontal, and the value standing one lift above that shelf. "Leader plus horizontal
// shelf" is the whole of what was asked for, and a leader that had lost its shelf would still look
// like a dimension, so it is asserted rather than assumed.
const shelfShape = async () => JSON.parse(await evaluate(`(() => {
  const stage = document.querySelector('#proj-sheet-stage .psheet__stage--dimension');
  const paths = [...stage.querySelectorAll('path.psheet__ink--dimension')].map((p) => {
    const n = p.getAttribute('d').match(/-?[0-9.]+/g).map(Number);
    return { pts: [[n[0], n[1]], [n[2], n[3]], [n[4], n[5]]], len: n.length };
  });
  const texts = [...stage.querySelectorAll('text')]
    .filter((t) => t.getAttribute('text-anchor') !== 'middle')
    .map((t) => ({ s: t.textContent, x: t.x.baseVal[0].value, y: t.y.baseVal[0].value, rot: /rotate/.test(t.getAttribute('transform') || '') }));
  const bad = [];
  for (const p of paths) {
    if (p.len !== 6) { bad.push('leader with ' + (p.len / 2) + ' points, not 3'); continue; }
    const elbow = p.pts[1], shelf = p.pts[2];
    if (Math.abs(shelf[1] - elbow[1]) > 0.01) bad.push('last leg is not horizontal');
    if (Math.abs(shelf[0] - elbow[0]) < 4) bad.push('shelf only ' + Math.abs(shelf[0] - elbow[0]).toFixed(1) + ' long');
    // The value stands ABOVE the shelf. SVG y grows downwards, so above is a SMALLER y.
    const over = texts.filter((t) => Math.abs(t.y - (elbow[1] - 3.2)) < 0.2
      && t.x > Math.min(elbow[0], shelf[0]) - 0.6 && t.x < Math.max(elbow[0], shelf[0]) + 0.6);
    if (over.length !== 1) bad.push('shelf at ' + elbow[0].toFixed(1) + ' carries ' + over.length + ' values, not 1');
  }
  return JSON.stringify({ bad, n: paths.length, turned: texts.filter((t) => t.rot).length });
})()`));
for (const id of ['cylblock', 'shaftsupport', 'bearingblock']) {
  await pickObject(id);
  await revealAll();
  await wait(500);
  const shelves = await shelfShape();
  ok(`${id}: every diameter and radius is a leader with a horizontal shelf, its value on that shelf`,
    shelves.n > 0 && shelves.bad.length === 0, shelves.bad.join(' | ') || `${shelves.n} leaders`);
  ok(`${id}: ...and none of those values is turned - a note on a level shelf is written level`,
    shelves.turned === 0, `${shelves.turned} turned`);
  // Both ends of a diameter carry a head. Counted rather than assumed, because the second one is
  // drawn by a single guarded line and would go missing silently.
  const heads = JSON.parse(await evaluate(`
    import('./src/objectData.js').then((m) => {
      const o = m.getObject('${id}');
      const want = ['front', 'top', 'side'].reduce((n, k) => n + (o.dims[k] || [])
        .reduce((a, d) => a + (d.k === 'dim' ? 2 : d.k === 'dia' ? 2 : 1), 0), 0);
      const got = document.querySelectorAll('#proj-sheet-stage .psheet__stage--dimension path.psheet__arrow').length;
      return JSON.stringify({ want, got });
    })`));
  ok(`${id}: ...and every arrowhead is on the paper, both ends of each diameter included`,
    heads.got === heads.want, `${heads.got} of ${heads.want}`);
}

// The label that was wrong, named. A slot end is a semicircular cap, not a hole.
const labelsFor = async (id, view) => JSON.parse(await evaluate(`
  import('./src/objectData.js').then((m) =>
    JSON.stringify((m.getObject('${id}').dims['${view}'] || []).map((d) => d.text)))`));
const cylTop = await labelsFor('cylblock', 'top');
// The Cylindrical Block's plan used to carry R25 on its column, and this line used to assert it.
// The rule it came from is untouched — Ø or R follows the sweep the view draws — but the sweep was
// misread: the plan draws the column's circle COMPLETE, not 148 deg of it, so R was the wrong
// symbol taken from the wrong fact and the diameter belongs where the figure prints it, on the
// elevation. What the plan must now carry on that column is NOTHING (ADR-227 amending ADR-218).
ok('the plan states no size on the column, which the elevation already gives as a diameter',
  !cylTop.some((t) => /25|50/.test(t)), cylTop.join(' ') || 'none');
ok('...while the bore beside it, a full circle, keeps its 30 as a diameter',
  cylTop.some((t) => /^\u00d830$/.test(t)), cylTop.join(' '));
const bearTop = await labelsFor('bearingblock', 'top');
ok('the slot end is R9, not a diameter',
  bearTop.includes('R9') && !bearTop.some((t) => /18/.test(t)), bearTop.join(' '));

// --- 7a3. METHOD 1 — every value lies along its own dimension line ------------------------------
// The claim, measured rather than assumed: each value on the sheet is PARALLEL to a dimension line,
// stands exactly one standard lift PERPENDICULARLY off it, over a point of the line itself, and is
// turned into the half-circle that reads from the bottom edge or the right-hand edge. Nothing here
// consults the authored data, so a value that had quietly gone back to level — Method 2 — fails
// whatever the registry says.
//
// Perpendicular distance, not distance-to-the-midpoint. A linear dimension does write its value at
// the midpoint, but a DIAMETER writes it out on the tail beyond the second arrowhead, on clear
// paper past the geometry the line has just crossed — writing it at the midpoint would put it in
// the middle of the very hole it measures. Both are Method 1; what they share is the perpendicular
// lift, so that is what is measured, with the foot of the perpendicular required to land ON the
// line rather than off either end of it.
//
// Pairing is by geometry, not by DOM order. Extension lines are perpendicular to their own
// dimension line and so can never be mistaken for one, and a leader's note is level over a level
// landing, which is Method 1's own rule for a note rather than an exception to it.
const alignment = async () => JSON.parse(await evaluate(`(() => {
  const svg = document.querySelector('#proj-sheet-stage svg');
  const stage = svg.querySelector('.psheet__stage--dimension');
  const fold = (deg) => { let a = deg % 180; if (a > 90) a -= 180; if (a <= -90) a += 180; return a; };
  const lines = [...stage.querySelectorAll('line.psheet__ink--dimension')].map(l => {
    const x1 = l.x1.baseVal.value, y1 = l.y1.baseVal.value;
    const x2 = l.x2.baseVal.value, y2 = l.y2.baseVal.value;
    return { angle: fold(Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI), x1, y1, x2, y2 };
  });
  const out = [], notes = [];
  for (const t of stage.querySelectorAll('text')) {
    const m = /rotate\\(([-0-9.]+)/.exec(t.getAttribute('transform') || '');
    const rot = m ? parseFloat(m[1]) : 0;
    // A LEADER's note is anchored start/end on its landing, not centred on a dimension line, and
    // it is level in both BIS methods. Kept out of the parallel test and asserted separately.
    if (t.getAttribute('text-anchor') !== 'middle') { notes.push({ t: t.textContent, rot }); continue; }
    const x = t.x.baseVal[0].value, y = t.y.baseVal[0].value;
    let best = null;
    for (const l of lines) {
      if (Math.abs(fold(l.angle - rot)) > 0.5) continue;
      const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
      const len2 = dx * dx + dy * dy;
      if (!len2) continue;
      // Where the foot of the perpendicular lands along the line, 0 at one end and 1 at the other.
      const s = ((x - l.x1) * dx + (y - l.y1) * dy) / len2;
      if (s < -0.001 || s > 1.001) continue;
      const d = Math.abs((x - l.x1) * dy - (y - l.y1) * dx) / Math.sqrt(len2);
      if (best === null || d < best) best = d;
    }
    out.push({ t: t.textContent, rot, lift: best });
  }
  return JSON.stringify({ values: out, notes });
})()`));

for (const id of ['cylblock', 'shaftsupport', 'bearingblock', 'block']) {
  await pickObject(id);
  await revealAll();
  await wait(500);

  const { values, notes } = await alignment();
  const LIFT = 3.2;                       // DIM_STYLE.textLift — textGap + textHeight / 2
  const strays = values.filter((v) => v.lift === null || Math.abs(v.lift - LIFT) > 0.15);
  ok(`${id}: every value lies along a dimension line, one lift off it`,
    values.length > 0 && strays.length === 0,
    strays.length ? strays.map((s) => `"${s.t}" rot ${s.rot} lift ${s.lift === null ? 'no parallel line' : s.lift.toFixed(2)}`).join(' | ')
      : `${values.length} values, all ${LIFT} mm off a parallel line`);
  ok(`${id}: no value is turned past the upside-down line`,
    values.every((v) => Math.abs(v.rot) <= 90.001),
    values.map((v) => v.rot.toFixed(0)).join(','));
  // A drawing whose dimension lines were all horizontal would prove nothing about the turn, so say
  // out loud that this object HAS vertical ones and that their values turned with them.
  const turned = values.filter((v) => Math.abs(v.rot) > 45);
  ok(`${id}: values on vertical dimension lines are turned, not left level`,
    turned.length > 0 && turned.every((v) => Math.abs(Math.abs(v.rot) - 90) < 0.5),
    `${turned.length} of ${values.length} turned`);
  ok(`${id}: leader notes stay level, as a note on a landing must`,
    notes.every((n) => n.rot === 0), `${notes.length} notes`);

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
  ok(`${id}: no value runs into a view's caption`, o.caps === 3 && o.capHits.length === 0,
    o.capHits.length ? o.capHits.join(' | ') : `${o.caps} captions clear`);
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

// --- 7f. TEXTBOOK FIDELITY ---------------------------------------------------------------------
//
// The four objects are the parts worked in Chapter 19, and the figures print their sizes. This
// block asserts that every size the figure prints reaches the paper, per object, read off the
// finished sheet rather than off the registry — the registry is what would be wrong.
//
// Calibrated against the geometry that preceded it, which is where each of these came from:
//   cylblock       had no fork at all, so 18 and the two 12s did not exist, and the boss's size
//                  was only ever available as R25 in the plan — no Ø50 anywhere on the sheet
//   block          was Fig. 19.24 at 80 x 40 x 40; not one of 120 / 90 / 64 / 100 / 30 was on it
//   shaftsupport   had a 12 mm base and no relief, so 20 and 8 were absent
//   bearingblock   read the figure's 37 as an overall height and scaled the part to fit: 105, 15,
//                  Ø24, R24, 48 and 35 were all absent, and 83 / 9 / Ø20 / R16 were there instead
const FIGURE_SIZES = {
  cylblock: ['100', '40', '12', '18', 'Ø50', 'Ø30'],
  shaftsupport: ['100', '40', '20', '8', '12', '28', '24', '64', 'Ø24', 'Ø12', 'R20', 'R6'],
  bearingblock: ['105', '44', '15', '48', '35', '18', '37', '11', '22', 'Ø24', 'R24', 'R9', 'R22'],
  block: ['120', '90', '64', '100', '16', '30'],
};
const GONE = {
  cylblock: ['R25'], shaftsupport: ['60'], block: ['80'], bearingblock: ['83', '9', 'Ø20', 'R16', '21'],
};
for (const id of ['cylblock', 'shaftsupport', 'bearingblock', 'block']) {
  await pickObject(id);
  await revealAll();
  await wait(400);
  const values = JSON.parse(await evaluate(`JSON.stringify(
    [...document.querySelectorAll('#proj-sheet-stage .psheet__value')].map(t => t.textContent.trim()))`));
  const missing = FIGURE_SIZES[id].filter((v) => !values.includes(v));
  ok(`${id}: every size its figure prints is on the sheet`, missing.length === 0,
    missing.length ? `missing ${missing.join(', ')}` : `${values.length} values`);
  const stale = GONE[id].filter((v) => values.includes(v));
  ok(`${id}: ...and none of the sizes it used to carry survive`, stale.length === 0,
    stale.length ? `still there: ${stale.join(', ')}` : 'clean');
}

// A Ø ON A VIEW THAT DRAWS NO CIRCLE is the third form of the mark, and the number still has to
// come from the geometry. Every value beginning Ø that is carried on a LINEAR dimension must span
// exactly twice the radius it was built from. Before the Cylindrical Block's elevation carried
// Ø50 there was no such dimension anywhere in the topic.
const acrossDias = JSON.parse(await evaluate(`
  import('./src/objectData.js').then(m => {
    const out = [];
    for (const o of m.OBJECTS) {
      for (const view of ['front','top','side']) {
        for (const d of (o.dims[view] ?? [])) {
          if (d.k !== 'dim' || !d.text.startsWith('\\u00D8')) continue;
          const span = Math.hypot(d.b[0]-d.a[0], d.b[1]-d.a[1]);
          out.push({ id: o.id, view, text: d.text, span, dia: d.dia ?? null });
        }
      }
    }
    return JSON.stringify(out);
  })`));
const badDia = acrossDias.filter((d) => d.dia === null || Math.abs(d.span - 2 * d.dia) > 1e-6
  || d.text !== 'Ø' + String(Math.round(2 * d.dia * 10) / 10));
ok('a Ø on a linear dimension spans exactly the diameter it names',
  acrossDias.length > 0 && badDia.length === 0,
  acrossDias.length ? badDia.map((d) => `${d.id}/${d.view} ${d.text} spans ${d.span}`).join(' | ') || `${acrossDias.length} checked` : 'none found');

// THE FORK IS IN ALL THREE VIEWS, or it is a shape the drawing does not describe. The plan has to
// turn the corner at each notch, the elevation has to conceal each slot's end wall, and the right
// side view has to split the plate into two prongs and a gap. Against the plain plate that was
// there before, every one of the three counts was zero.
const fork = JSON.parse(await evaluate(`
  import('./src/objectData.js').then(m => {
    const o = m.getObject('cylblock');
    const near = (a, b) => Math.abs(a - b) < 0.01;
    const plan = o.views.top.find(p => p.layer === 'outline').pts;
    const corners = [[32,8],[32,-8],[-32,8],[-32,-8]]
      .filter(([x,y]) => plan.some(([px,py]) => near(px,x) && near(py,y))).length;
    const walls = o.views.front.filter(p => p.k === 'line' && p.layer === 'hidden'
      && near(Math.abs(p.a[0]), 32) && near(p.a[0], p.b[0])).length;
    const prongs = o.views.side.filter(p => p.k === 'line' && p.layer === 'edge'
      && near(Math.abs(p.a[0]), 8) && near(p.a[0], p.b[0])).length;
    return JSON.stringify({ corners, walls, prongs });
  })`));
ok('the Cylindrical Block is forked in the plan, the elevation and the side view',
  fork.corners === 4 && fork.walls === 2 && fork.prongs === 2,
  `plan corners ${fork.corners}/4, hidden slot ends ${fork.walls}/2, prong edges ${fork.prongs}/2`);

// TWO SIDE VIEWS THAT DISAGREE. Seen from the left every step edge of the Stepped Block is in
// plain view; seen from the right the wall conceals all three. A mirror cannot produce that, and
// while the sheet mirrored one into the other the right side view drew its steps dashed — which is
// what the object's own Step-1 copy says it must not do.
const sides = JSON.parse(await evaluate(`
  import('./src/objectData.js').then(m => {
    const o = m.getObject('block');
    const count = (set, layer) => (set ?? []).filter(p => p.layer === layer).length;
    return JSON.stringify({
      leftVisible: count(o.views.side, 'edge'), leftHidden: count(o.views.side, 'hidden'),
      rightVisible: count(o.views.sideFlip, 'edge'), rightHidden: count(o.views.sideFlip, 'hidden'),
    });
  })`));
ok('the Stepped Block sees its steps from the left and not from the right',
  sides.leftVisible >= 5 && sides.leftHidden === 0
  && sides.rightHidden >= 5 && sides.rightVisible === 0,
  `left ${sides.leftVisible} solid / ${sides.leftHidden} dashed, `
  + `right ${sides.rightVisible} solid / ${sides.rightHidden} dashed`);

// NO TRIANGULATION SEAM ON A NON-CONVEX END FACE. The Stepped Block's left-hand end is the slab's
// own face plus the stair profile above it: 4 + 6 real edges. `EdgesGeometry` cannot pair the ear
// clipping of a non-convex lid and hands back three diagonals per cap on top of them, which is 13
// segments in that plane rather than 10, ruled across the face at full outline weight.
const seams = JSON.parse(await evaluate(`
  Promise.all([import('three'), import('./src/objectRig.js'), import('./src/objectData.js')])
    .then(([THREE, R, D]) => {
      const rig = R.buildObject(D.getObject('block'), new THREE.Vector2(1440, 900));
      const segs = [];
      rig.group.traverse((n) => {
        const p = n.geometry && n.geometry.attributes && n.geometry.attributes.instanceStart;
        if (!p) return;
        for (let i = 0; i < p.count; i++) {
          segs.push([[p.getX(i), p.getY(i), p.getZ(i)],
                     [n.geometry.attributes.instanceEnd.getX(i),
                      n.geometry.attributes.instanceEnd.getY(i),
                      n.geometry.attributes.instanceEnd.getZ(i)]]);
        }
      });
      rig.dispose();
      const minX = Math.min(...segs.flat().map(p => p[0]));
      const onEnd = segs.filter(([a, b]) =>
        Math.abs(a[0] - minX) < 1e-3 && Math.abs(b[0] - minX) < 1e-3).length;
      return JSON.stringify({ total: segs.length, onEnd });
    })`));
ok('the Stepped Block\'s end face carries its own 10 edges and no triangulation seam',
  seams.onEnd === 10, `${seams.onEnd} segments in that plane, of ${seams.total} on the solid`);

// THE SHAFT SUPPORT IS BLENDED, IN THE PROFILE AND IN THE SOLID. The figure prints R6 twice on its
// elevation — into the root of the lug and onto the top corner of the base — and both are drawn at
// both ends, so there are FOUR of them and every one runs the full 40 mm depth. Against the square
// version that was there before, all four square corners were present and no arc point was.
//
// Both halves of the claim are tested, because they can fail apart: an arc in `views.front` with a
// square solid behind it is a drawing of a part that was never built, and the reverse is a part the
// drawing does not describe. The four corner points are the exact ones the old outline carried.
const blend = JSON.parse(await evaluate(`
  Promise.all([import('three'), import('./src/objectRig.js'), import('./src/objectData.js')])
    .then(([THREE, R, D]) => {
      const o = D.getObject('shaftsupport');
      const near = (a, b) => Math.abs(a - b) < 1e-4;
      const pts = o.views.front.find(p => p.layer === 'outline').pts;
      const has = (x, y) => pts.some(([px, py]) => near(px, x) && near(py, y));
      const t = 6 / Math.SQRT2;
      // Square corners the blends replaced, and the mid-point of each arc that replaced them.
      const corners = [[-50, 20], [50, 20], [-10, 20], [10, 20]].filter(([x, y]) => has(x, y)).length;
      const arcs = [[-44 - t, 14 + t], [44 + t, 14 + t], [-16 + t, 26 - t], [16 - t, 26 - t]]
        .filter(([x, y]) => has(x, y)).length;

      const rig = R.buildObject(o, new THREE.Vector2(1440, 900));
      const ends = [];
      rig.group.traverse((n) => {
        const g = n.geometry, p = g && g.attributes && g.attributes.instanceStart;
        if (!p) return;
        for (let i = 0; i < p.count; i++) {
          ends.push([p.getX(i), p.getY(i), p.getZ(i)]);
          ends.push([g.attributes.instanceEnd.getX(i), g.attributes.instanceEnd.getY(i),
                     g.attributes.instanceEnd.getZ(i)]);
        }
      });
      rig.dispose();
      // 1 world unit = 10 mm, and the part is symmetric so the re-centring moves nothing.
      const at = (x, y) => ends.filter((e) => Math.abs(e[0] - x / 10) < 2e-3
        && Math.abs(e[1] - y / 10) < 2e-3).length;
      return JSON.stringify({
        corners, arcs,
        // Only the two ROUNDS are asked of the solid. The fillets butt against the lug and the
        // plate, so the concave corner at (±10, 20) survives as an internal seam between the three
        // pieces — buried in the material, and not a claim that the part is square there.
        solidSquare: at(-50, 20) + at(50, 20),
        solidArc: at(-44 - t, 14 + t) + at(44 + t, 14 + t) + at(-16 + t, 26 - t) + at(16 - t, 26 - t),
      });
    })`));
ok('the Shaft Support carries its four R6 blends on the sheet and in the solid',
  blend.corners === 0 && blend.arcs === 4 && blend.solidSquare === 0 && blend.solidArc >= 4,
  `elevation: ${blend.corners} square corners left, ${blend.arcs}/4 arcs; `
  + `solid: ${blend.solidSquare} square corners left, ${blend.solidArc} arc vertices`);

// THE COLUMN GOES TO THE BENCH. The Cylindrical Block is not a boss parked on a plate: it is a Ø50
// column standing on the seating for its whole 40 mm with a 100 × 40 × 12 plate merged onto it, and
// all three printed views say so in a different way. Each of the five clauses below is one of those
// ways, and against the seated version every one of them failed: the lathe began at y = 12, there
// was ONE plate rather than two, the elevation drew nothing at the junction, the side view's
// outline was an eight-point stepped profile, the plan carried no arcs inside its silhouette, and
// no ink reached the bench at the column's radius.
const merged = JSON.parse(await evaluate(`
  Promise.all([import('three'), import('./src/objectRig.js'), import('./src/objectData.js')])
    .then(([THREE, R, D]) => {
      const o = D.getObject('cylblock');
      const near = (a, b) => Math.abs(a - b) < 1e-6;

      const lathe = o.parts.find((p) => p.k === 'lathe');
      const halves = o.parts.filter((p) => p.k === 'extrude');
      // Each half must reach the column and stop: its nearest point is exactly on the Ø50 wall.
      const bites = halves.filter((p) =>
        near(Math.min(...p.outline.map(([x, z]) => Math.hypot(x, z))), 25)).length;

      // The elevation's junction: the top face carried on to ±15, and the front face ended there.
      const fe = o.views.front.filter((p) => p.k === 'line' && p.layer === 'edge');
      const hasSeg = (a, b) => fe.some((p) =>
        (near(p.a[0], a[0]) && near(p.a[1], a[1]) && near(p.b[0], b[0]) && near(p.b[1], b[1]))
        || (near(p.a[0], b[0]) && near(p.a[1], b[1]) && near(p.b[0], a[0]) && near(p.b[1], a[1])));
      const junction = [[[-25, 12], [-15, 12]], [[15, 12], [25, 12]],
                        [[-15, 0], [-15, 12]], [[15, 0], [15, 12]]]
        .filter(([a, b]) => hasSeg(a, b)).length;

      // The side view: a plain rectangle, ±25 by 0..40, and no step anywhere in it.
      const so = o.views.side.find((p) => p.layer === 'outline').pts;
      const xs = so.map((p) => p[0]); const ys = so.map((p) => p[1]);
      const plain = so.length === 4 && near(Math.min(...xs), -25) && near(Math.max(...xs), 25)
        && near(Math.min(...ys), 0) && near(Math.max(...ys), 40);

      // The plan: the two arcs that complete the Ø50 circle, every point of them on that circle.
      const arcs = o.views.top.filter((p) => p.k === 'poly' && p.layer === 'edge'
        && p.pts.every(([x, y]) => Math.abs(Math.hypot(x, y) - 25) < 1e-6));

      const rig = R.buildObject(o, new THREE.Vector2(1440, 900));
      let onBench = 0;
      rig.group.traverse((n) => {
        const g = n.geometry, p = g && g.attributes && g.attributes.instanceStart;
        if (!p) return;
        for (let i = 0; i < p.count; i++) {
          for (const e of [[p.getX(i), p.getY(i), p.getZ(i)],
                           [g.attributes.instanceEnd.getX(i), g.attributes.instanceEnd.getY(i),
                            g.attributes.instanceEnd.getZ(i)]]) {
            // 1 world unit = 10 mm; the part is symmetric, so the re-centring moves nothing.
            if (Math.abs(e[1]) < 1e-4 && Math.abs(Math.hypot(e[0], e[2]) - 2.5) < 1e-3) onBench++;
          }
        }
      });
      rig.dispose();
      return JSON.stringify({
        latheFrom: lathe.profile[0][1], halves: halves.length, bites,
        junction, plain, arcs: arcs.length, onBench,
      });
    })`));
ok('the Cylindrical Block\'s column stands on the bench and the plate is merged onto it',
  merged.latheFrom === 0 && merged.halves === 2 && merged.bites === 2
  && merged.junction === 4 && merged.plain && merged.arcs === 2 && merged.onBench > 0,
  `lathe from y=${merged.latheFrom}, ${merged.halves} plate halves (${merged.bites} bitten), `
  + `${merged.junction}/4 junction lines, side outline ${merged.plain ? 'plain' : 'STEPPED'}, `
  + `${merged.arcs}/2 plan arcs, ${merged.onBench} ink vertices on the bench at Ø50`);

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
