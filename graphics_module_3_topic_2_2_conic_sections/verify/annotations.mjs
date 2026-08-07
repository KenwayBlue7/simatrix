// The ANNOTATION oracle (ADR-087): asserts that Step 1's labels name only §6.1's vocabulary,
// carry a plain-English sentence each, never stack on one another or leave the pane at ANY
// orbit angle, leave with the geometry they name, and explain themselves on a deliberate
// hover rather than a passing one. Same CDP harness as verify/shipped-module.mjs — Node
// built-ins only, no puppeteer (ADR-019, RULES.md §2.17–§2.19).
//
// Screenshots go to the OS temp directory (or to the directory given as argv[2]) so a
// reviewer can eyeball the linework the assertions cannot judge — the axis centre line, its
// concealed run, and the leaders — without dropping binaries into the repo.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = 'C:/xampp/htdocs/SImatrix';
const TOPIC = '/graphics_module_3_topic_2_2_conic_sections/';
const PORT = 8144;
const CDP_PORT = 9344;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.argv[2] || tmpdir();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const body = await readFile(join(ROOT, normalize(p)));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(PORT, r));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--disable-gpu-sandbox',
  '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1440,900',
  '--no-first-run', '--user-data-dir=' + process.env.TEMP + '/simatrix-labelprobe',
  'about:blank',
], { stdio: 'ignore' });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40; i++) {
  try { target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json(); break; }
  catch { await wait(500); }
}
if (!target) { console.log('FAIL: no Chrome'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let msgId = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  else if (d.method) events.push(d);
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++msgId; pending.set(id, resolve);
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
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}${TOPIC}` });
await wait(3500);

let fails = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fails++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? ' ' + detail : ''}`);
};

const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
};

// --- What the labels report -------------------------------------------------
const READ = `(() => {
  const vp = document.getElementById('sim-viewport').getBoundingClientRect();
  const pills = [...document.querySelectorAll('.vlabel')].filter(el => el.offsetParent !== null || el.getClientRects().length);
  const rects = pills.map(el => { const r = el.getBoundingClientRect(); return { text: el.textContent, tip: el.dataset.tip, top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; });
  let overlaps = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) overlaps++;
  }
  const outside = rects.filter(r => r.w > 0 && (r.left < vp.left - 0.5 || r.right > vp.right + 0.5 || r.top < vp.top - 0.5 || r.bottom > vp.bottom + 0.5)).map(r => r.text);
  return { texts: rects.map(r => r.text), tips: rects.map(r => r.tip), overlaps, outside, rects, vp: { left: vp.left, top: vp.top, right: vp.right, bottom: vp.bottom } };
})()`;

const step1 = await evaluate(READ);
ok('step 1 names exactly the §6.1 vocabulary',
  JSON.stringify(step1.texts.slice().sort()) === JSON.stringify(['Apex', 'Axis', 'Base', 'Generator', 'Lower nappe', 'Upper nappe']),
  JSON.stringify(step1.texts));
ok('every label carries a plain-English sentence', step1.tips.every(t => t && t.length > 10 && t.length < 120), `${step1.tips.length} tips`);
ok('no two labels overlap at the default view', step1.overlaps === 0, `overlaps ${step1.overlaps}`);
ok('no label leaves the viewport', step1.outside.length === 0, JSON.stringify(step1.outside));
await shot('labels-step1');

// --- Orbit: labels must stay clear at every angle ---------------------------
const drag = async (dx, dy) => {
  const cx = 400, cy = 450;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1, buttons: 1 });
  for (let s = 1; s <= 6; s++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx + (dx * s) / 6, y: cy + (dy * s) / 6, button: 'left', buttons: 1 });
    await wait(30);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + dx, y: cy + dy, button: 'left', buttons: 0 });
  await wait(500);
};

let worstOverlap = 0; let escaped = [];
for (const [dx, dy] of [[220, 0], [220, 0], [220, 60], [220, -80], [-500, 0]]) {
  await drag(dx, dy);
  const r = await evaluate(READ);
  worstOverlap = Math.max(worstOverlap, r.overlaps);
  escaped = escaped.concat(r.outside);
}
ok('labels stay unstacked while orbiting', worstOverlap === 0, `worst ${worstOverlap}`);
ok('labels stay inside the pane while orbiting', escaped.length === 0, JSON.stringify(escaped));
await shot('labels-orbited');

// --- Tooltip ----------------------------------------------------------------
await evaluate('window.simAPI.reset()');
await wait(900);
const spot = await evaluate(`(() => {
  const el = [...document.querySelectorAll('.vlabel')].find(e => e.textContent === 'Generator');
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
})()`);
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: spot.x, y: spot.y });
await wait(600);
const early = await evaluate('document.getElementById("vlabel-tip").hidden');
ok('tooltip does not fire on a passing cursor', early === true, '600 ms');
await wait(1000);
const tip = await evaluate(`(() => { const t = document.getElementById('vlabel-tip'); const r = t.getBoundingClientRect(); const vp = document.getElementById('sim-viewport').getBoundingClientRect();
  return { hidden: t.hidden, text: t.textContent, inside: r.left >= vp.left && r.right <= vp.right && r.top >= vp.top && r.bottom <= vp.bottom }; })()`);
ok('tooltip opens after the hover delay', tip.hidden === false, `"${tip.text}"`);
ok('tooltip is one plain sentence', /^[^.]{15,90}\.$/.test(tip.text || ''), `${(tip.text || '').length} chars`);
ok('tooltip stays inside the pane', tip.inside === true);
await shot('labels-tooltip');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: spot.x, y: spot.y + 260 });
await wait(200);
ok('tooltip closes when the cursor leaves', await evaluate('document.getElementById("vlabel-tip").hidden') === true);

// --- Visibility follows geometry --------------------------------------------
await evaluate('document.getElementById("tgl-nappes").click()');
await wait(500);
const oneNappe = await evaluate(READ);
ok('hiding the second half takes BOTH nappe labels with it',
  oneNappe.texts.every(t => !/nappe/i.test(t)) && oneNappe.texts.length === 4, JSON.stringify(oneNappe.texts));
await shot('labels-one-nappe');
await evaluate('document.getElementById("tgl-nappes").click()');
await wait(400);

// --- Later steps carry no anatomy labels ------------------------------------
for (let s = 2; s <= 6; s++) {
  await evaluate('document.getElementById("btn-next").click()');
  await wait(s === 3 ? 1600 : 700);
  const r = await evaluate(READ);
  ok(`step ${s} shows no anatomy labels`, r.texts.length === 0, JSON.stringify(r.texts));
  if (s === 2 || s === 4) await shot(`labels-step${s}`);
}

// --- Console clean -----------------------------------------------------------
const errs = events.filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
  .filter((e) => !(e.params.entry.url ?? '').endsWith('/favicon.ico')) // the probe server has none
  .map((e) => e.params.entry.text)
  .concat(events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.text));
ok('no console errors', errs.length === 0, errs.join(' | ').slice(0, 300));

console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILED`);
ws.close(); chrome.kill(); server.close();
process.exit(fails === 0 ? 0 : 1);
