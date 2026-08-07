// The PROOF oracle (ADR-095) — Step 4's six stages, walked the way a learner walks them.
//
// It asserts the two things the redesign is FOR: that nothing moves unless the learner presses
// Next, and that each stage shows only its own idea — on the cone first, and on the paper only
// once the cone has explained it. It also captures each stage, because "does this read as one
// point of contact" is a judgement no assertion can make.
//
// Same CDP harness as the other oracles: Node built-ins only, no puppeteer (ADR-019,
// RULES.md §2.17-§2.19).
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = 'C:/xampp/htdocs/SImatrix';
const TOPIC = '/graphics_module_3_topic_2_2_conic_sections/';
const PORT = 8244, CDP_PORT = 9444;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.argv[2] || tmpdir();
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };

const server = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  try {
    const b = await readFile(join(ROOT, normalize(p)));
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404).end('x'); }
});
await new Promise((r) => server.listen(PORT, r));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--disable-gpu-sandbox',
  '--use-gl=angle', '--use-angle=swiftshader', '--window-size=1440,900', '--no-first-run',
  '--user-data-dir=' + process.env.TEMP + '/simatrix-proof', 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40; i++) { try { target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json(); break; } catch { await wait(500); } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const events = [];
ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method) events.push(d); });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}${TOPIC}` });
for (let i = 0; i < 40; i++) { if (await evaluate('!!window.simAPI')) break; await wait(400); }
await wait(2000);

let fails = 0;
const ok = (n, c, d = '') => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${d ? ' ' + d : ''}`); };
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
};
const until = async (expr, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  for (;;) { if (await evaluate(expr)) return true; if (Date.now() > deadline) return false; await wait(120); }
};

const STAGE = 'document.getElementById("proof-stage").textContent';
const SAY = 'document.getElementById("proof-readout").textContent';
const NEXT = 'document.getElementById("btn-proof-next")';
const PREV = 'document.getElementById("btn-proof-prev")';
// The apparatus is live CSS2D DOM, so the labels can be read straight out of the page.
const pill = (t) => `[...document.querySelectorAll('.vlabel')].some(e => e.textContent === '${t}')`;
// What the drawing sheet is showing, counted off its own canvas.
const inked = `(() => { const c = document.getElementById('compare-canvas'); const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 235 || d[i+1] < 235 || d[i+2] < 235) n++; return n; })()`;

// Reach Step 4 on an ordinary ellipse, so every part of the proof is on screen.
for (let i = 0; i < 3; i++) { await evaluate('document.getElementById("btn-next").click()'); await wait(900); }
await wait(1600);
await evaluate('(() => { const r = document.getElementById("rng-cut-tilt"); r.value = 35; r.dispatchEvent(new Event("input")); })()');
await wait(700);

// --- 1. It does not play ------------------------------------------------------------------
ok('Step 4 opens on stage 1', (await evaluate(STAGE)).startsWith('Stage 1 of 7'), await evaluate(STAGE));
const said1 = await evaluate(SAY);
await wait(2500);
ok('and it is still on stage 1 two and a half seconds later — nothing autoplays',
  (await evaluate(STAGE)).startsWith('Stage 1 of 7') && (await evaluate(SAY)) === said1);
ok('Back is refused at the first stage', (await evaluate(`${PREV}.disabled`)) === true);
ok('stage 1 shows the cut and nothing else',
  (await evaluate(pill('Focus'))) === false && (await evaluate(pill('Directrix'))) === false);
await shot('proof-1-cutting-plane');

// --- 2. One press, one idea ---------------------------------------------------------------
const step = async (n) => {
  await evaluate(`${NEXT}.click()`);
  await until(`${STAGE}.startsWith("Stage ${n} of 7")`, 6000);
  await until(`${NEXT}.disabled === false || ${STAGE}.startsWith("Stage 7 of 7")`, 6000);
  await wait(250);
};
const ringPill = 'Ring of contact — cone and ball';
const pointPill = 'Touches here — one point only';

await evaluate(`${NEXT}.click()`);
ok('Next is refused while the stage is still animating',
  (await evaluate(`${NEXT}.disabled`)) === true);
await until(`${NEXT}.disabled === false`, 6000);
ok('stage 2 fits the ball, and claims nothing else yet',
  (await evaluate(STAGE)).startsWith('Stage 2 of 7') && /ball/i.test(await evaluate(SAY)));
ok('…it names neither contact yet',
  (await evaluate(pill(ringPill))) === false && (await evaluate(pill(pointPill))) === false);
const sheet2 = await evaluate(inked);
await shot('proof-2-the-ball');

// --- 3. TANGENCY ONE: sphere against the CONE is a RING (ADR-097) -------------------------
await step(3);
ok('stage 3 is the ring, and says it is where the ball meets the CONE',
  /ring|circle/i.test(await evaluate(SAY)) && /cone/i.test(await evaluate(SAY)),
  (await evaluate(SAY)).slice(0, 70));
ok('…and gives the reason: a cone is the same all the way round',
  /all the way round|same all the way|round its axis/i.test(await evaluate(SAY)));
ok('the ring is named on the solid', (await evaluate(pill(ringPill))) === true);
ok('and the ONE-POINT contact is not on screen to be confused with it',
  (await evaluate(pill(pointPill))) === false && (await evaluate(pill('Focus'))) === false);
await shot('proof-3-the-ring');

// --- 4. TANGENCY TWO: sphere against the CUT is one POINT, and it is the focus -------------
await step(4);
ok('stage 4 is the single point, and contrasts it with the cut',
  /one point|ONE point/i.test(await evaluate(SAY)) && /cut/i.test(await evaluate(SAY)),
  (await evaluate(SAY)).slice(0, 70));
ok('the point is captioned where it happens', (await evaluate(pill(pointPill))) === true);
ok('…and the ring is no longer claiming attention', (await evaluate(pill(ringPill))) === false);
ok('the focus is named here', (await evaluate(pill('Focus'))) === true);
const sheet4 = await evaluate(inked);
ok('and it reaches the sheet only now', sheet4 > sheet2, `${sheet2} → ${sheet4} inked px`);
ok('the directrix is still nowhere', (await evaluate(pill('Directrix'))) === false);
await shot('proof-4-one-point');

// --- 5. The plane through the ring — named for the CONE it touches ------------------------
await step(5);
ok('stage 5 lays the plane through that ring',
  /through (that )?ring/i.test(await evaluate(SAY)) && /tangent plane/i.test(await evaluate(SAY)));
ok('…and says the name is about the CONE, not the ball',
  /about the CONE it touches, not the ball/i.test(await evaluate(SAY)),
  (await evaluate(SAY)).slice(-60));
ok('still no directrix, on the cone or on the paper',
  (await evaluate(pill('Directrix'))) === false);
await shot('proof-5-tangent-plane');

// --- 6. The directrix, drawn out of the two planes crossing --------------------------------
await step(6);
ok('stage 6 draws the directrix out of the two planes crossing',
  (await evaluate(pill('Directrix'))) === true && /cross/i.test(await evaluate(SAY)));
const sheet6 = await evaluate(inked);
ok('and it reaches the sheet with it', sheet6 > sheet4, `${sheet4} → ${sheet6} inked px`);
await shot('proof-6-the-directrix');

// --- 7. The bridge onto the paper ----------------------------------------------------------
await step(7);
await wait(1200);   // the hand-over is a fade: let it finish before judging what is on screen
ok('stage 7 hands both over to the drawing', /paper|drawing/i.test(await evaluate(SAY)));
const sheet7 = await evaluate(inked);
ok('the full construction is on the sheet at last', sheet7 > sheet6, `${sheet6} → ${sheet7} inked px`);
ok('Next is spent', (await evaluate(`${NEXT}.disabled`)) === true);
ok('and the vocabulary is released only here',
  (await evaluate('document.getElementById("hint-locus-terms").hidden')) === false);
await shot('proof-7-on-paper');

// --- 8. Back restores the previous stage exactly ------------------------------------------
await evaluate(`${PREV}.click()`);
await wait(400);
ok('Back returns to stage 6 at once, with no animation to sit through',
  (await evaluate(STAGE)).startsWith('Stage 6 of 7') && (await evaluate(`${NEXT}.disabled`)) === false);
ok('…and the scene is exactly stage 6 again', (await evaluate(pill('Directrix'))) === true);
await evaluate(`${PREV}.click()`); await wait(300);
await evaluate(`${PREV}.click()`); await wait(300);
ok('stepping back further takes the directrix away again',
  (await evaluate(STAGE)).startsWith('Stage 4 of 7') && (await evaluate(pill('Directrix'))) === false);

// --- 9. The degenerate cuts have no proof to walk -----------------------------------------
await evaluate('(() => { const r = document.getElementById("rng-sec-offset"); r.value = 0; r.dispatchEvent(new Event("input")); })()');
await wait(800);
ok('a cut through the apex restarts on its own first stage, and says what it is',
  (await evaluate(STAGE)) === 'Stage 1 of 2 · Straight lines' && /no curve/i.test(await evaluate(SAY)),
  await evaluate(STAGE));
await evaluate('(() => { const r = document.getElementById("rng-sec-offset"); r.value = -12; r.dispatchEvent(new Event("input")); })()');
await wait(600);
await evaluate('(() => { const r = document.getElementById("rng-cut-tilt"); r.value = 0; r.dispatchEvent(new Event("input")); })()');
await wait(600);
// A circle has a focus but no directrix, so its proof runs to the crossing stage and stops
// there — with the reason. One stage shorter than a conic's, not five (ADR-097).
ok('and a flat cut runs a six-stage proof that ends at the two parallel planes',
  (await evaluate(STAGE)) === 'Stage 1 of 6 · The cutting plane', await evaluate(STAGE));
for (let i = 0; i < 5; i++) { await evaluate(`${NEXT}.click()`); await until(`${NEXT}.disabled === false || ${STAGE}.includes('Stage 6 of 6')`, 6000); await wait(200); }
ok('…and that last stage explains why a circle has no directrix',
  /parallel/i.test(await evaluate(SAY)), (await evaluate(SAY)).slice(0, 80));
await shot('proof-circle-no-directrix');

const errs = events.filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
  .filter((e) => !(e.params.entry.url ?? '').endsWith('/favicon.ico'))
  .map((e) => e.params.entry.text);
ok('no console errors', errs.length === 0, errs.join(' | ').slice(0, 200));

console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILURE(S)`);
ws.close(); chrome.kill(); server.close();
process.exit(fails === 0 ? 0 : 1);
