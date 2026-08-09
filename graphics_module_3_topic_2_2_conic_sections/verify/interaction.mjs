// The INTERACTION oracle (ADR-088). Asserts the things a learner does rather than the things
// the topic contains: that the cut is theirs to make and visibly makes one, that the sheet
// follows the cut rather than sitting beside it, that Step 4's answer arrives in stages, and
// that the drawing sheet explains itself under the cursor.
//
// Same CDP harness as verify/shipped-module.mjs — Node built-ins only, no puppeteer
// (ADR-019, RULES.md §2.17-§2.19). Screenshots go to the OS temp directory.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = 'C:/xampp/htdocs/SImatrix';
const TOPIC = '/graphics_module_3_topic_2_2_conic_sections/';
const PORT = 8222, CDP_PORT = 9422;
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
  '--user-data-dir=' + process.env.TEMP + '/simatrix-hover', 'about:blank'], { stdio: 'ignore' });
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

// Inked (non-white) pixels on the drawing sheet — the only honest way to ask whether the
// sheet actually drew something. Hoisted: two sections use it.
const inked = `(() => { const c = document.getElementById('compare-canvas'); const g = c.getContext('2d');
  const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 235 || d[i+1] < 235 || d[i+2] < 235) n++; return n; })()`;

// Rendered AND visible. A `visibility: hidden` element still reports a box, so a height check
// alone once passed a state in which both viewers had been hidden and the bench was blank.
const shown = (id) => `(() => { const e = document.getElementById('${id}');
  if (!e || e.getBoundingClientRect().height <= 0) return false;
  return getComputedStyle(e).visibility !== 'hidden'; })()`;

let fails = 0;
const ok = (n, c, d = '') => { if (!c) fails++; console.log(`${c ? 'ok  ' : 'FAIL'} ${n}${d ? ' ' + d : ''}`); };
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
};

const until = async (expr, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (await evaluate(expr)) return true;
    if (Date.now() > deadline) return false;
    await wait(150);
  }
};

// Run a construction out to its finished figure. Since ADR-118 the sheet opens on the GIVEN
// DATA, so a section that reads the completed drawing has to draw it first — exactly as a
// learner would. Pressing Next past the end is a no-op, so an over-estimate is safe.
const finishConstruction = async () => {
  for (let i = 0; i < 24; i++) await evaluate('document.getElementById("btn-build-next").click()');
  await wait(1400);
};

// Pick a construction the way a learner does now: choose the curve, then the method from that
// curve's own list (CHANGE 2/3 — the list holds one curve at a time).
const pickMethod = async (curve, id) => {
  await evaluate(`[...document.querySelectorAll('#curve-picker button')].find(b => b.dataset.curve === '${curve}').click()`);
  await wait(700);
  await evaluate(`(() => { const s = document.getElementById('ctl-method'); s.value = '${id}'; s.dispatchEvent(new Event('change')); })()`);
  await wait(600);
};

// --- 1. The cut is the learner's to make (CHANGE 1, the reference topic's interaction) ---
await evaluate('document.getElementById("btn-next").click()');   // Step 2
await wait(900);
ok('Step 2 offers the cut as a choice',
  (await evaluate('!!document.getElementById("tgl-cut") && !document.getElementById("tgl-cut").checked')) === true);

// The renderer does not preserve its drawing buffer, so the cut is asserted through the
// contract the learner actually meets: the readout promises a shape while the box is
// unticked and describes one once it is ticked, and both states are captured for a human
// to check the geometry.
const readSection = 'document.getElementById("section-readout").textContent';
ok('the readout says what ticking the box will do',
  (await evaluate(readSection)).startsWith('Tick'));
await shot('cut-off');

await evaluate('document.getElementById("tgl-cut").click()');
await wait(1000);
ok('ticking it cuts, and the readout describes the face rather than promising it',
  !(await evaluate(readSection)).startsWith('Tick'), (await evaluate(readSection)).slice(0, 46));
await shot('cut-on');

await evaluate('document.getElementById("tgl-cut").click()');
await wait(900);
ok('unticking puts the cone back together',
  (await evaluate(readSection)).startsWith('Tick'));
await evaluate('document.getElementById("tgl-cut").click()');
await wait(900);

// --- 2. The sheet follows the cut (SYNCHRONIZATION) --------------------------------------
await evaluate('document.getElementById("btn-next").click()'); await wait(900);   // Step 3
await evaluate('document.getElementById("btn-next").click()'); await wait(2400);  // Step 4
const readCurve = 'document.getElementById("conic-readout").textContent';
await evaluate('(() => { const r = document.getElementById("rng-cut-tilt"); r.value = 10; r.dispatchEvent(new Event("input")); })()');
await wait(600);
const flat = await evaluate(readCurve);
await evaluate('(() => { const r = document.getElementById("rng-cut-tilt"); r.value = 85; r.dispatchEvent(new Event("input")); })()');
await wait(600);
const steep = await evaluate(readCurve);
ok('tilting the cut changes what the sheet is drawing',
  /Less than 1|ratio is 0[.]/.test(flat) && /More than 1/.test(steep), `${flat.slice(-40)} | ${steep.slice(-30)}`);
ok('and it is quoted against the cone the learner shaped', /slopes \d+°/.test(steep));

// --- 3. Step 4 is a proof the learner walks (ADR-095) ------------------------------------
// The stage-by-stage coverage lives in verify/proof.mjs; what matters here is that Step 4
// arrives at the start of its proof, holds there, and hands nothing to the sheet unasked.
await evaluate('(() => { const r = document.getElementById("rng-cut-tilt"); r.value = 35; r.dispatchEvent(new Event("input")); })()');
await wait(700);
const readStage = 'document.getElementById("proof-stage").textContent';
ok('Step 4 opens on the first stage of its proof',
  (await evaluate(readStage)).startsWith('Stage 1 of 7'), await evaluate(readStage));
ok('and holds the vocabulary back',
  (await evaluate('document.getElementById("hint-locus-terms").hidden')) === true);
const pillNow = (t) => `[...document.querySelectorAll('.vlabel')].some(e => e.textContent === '${t}')`;
// Seven stages since ADR-097 split the two tangencies apart, so six presses.
for (let i = 0; i < 6; i++) {
  await evaluate('document.getElementById("btn-proof-next").click()');
  await until('document.getElementById("btn-proof-next").disabled === false'
    + ' || document.getElementById("proof-stage").textContent.includes("Stage 7")', 6000);
  await wait(200);
}
ok('walking it to the end puts the focus and the directrix on the solid',
  (await evaluate(pillNow('Focus'))) === true && (await evaluate(pillNow('Directrix'))) === true);
ok('and only then are focus, directrix and eccentricity named',
  (await evaluate('document.getElementById("hint-locus-terms").hidden')) === false);

// --- 3b. The two panes never contradict each other (ADR-090) -----------------------------
// §6.1's three non-conic sections. In each one the 3-D pane, the drawing sheet and the dock
// must be talking about the same thing — the defect this section exists to catch is a sheet
// that goes on drawing an ellipse for a cut that has no curve at all.
const readCut = 'document.getElementById("conic-readout").textContent';
const setTilt = async (deg) => {
  await evaluate(`(() => { const r = document.getElementById("rng-cut-tilt"); r.value = ${deg}; r.dispatchEvent(new Event("input")); })()`);
  await wait(600);
};
await setTilt(0);
ok('a flat cut is reported as a circle, with no directrix',
  /circle/i.test(await evaluate(readCut)) && /no directrix/.test(await evaluate(readCut)),
  (await evaluate(readCut)).slice(0, 90));
const circleInk = await evaluate(inked);
ok('and the sheet has something to show for it', circleInk > 200, `${circleInk} inked px`);
await shot('cut-circle');

// The apex cut: reachable from the offset slider, which Step 3 onward puts on the rail.
await evaluate(`(() => { const r = document.getElementById("rng-sec-offset"); r.value = 0; r.dispatchEvent(new Event("input")); })()`);
await wait(700);
await setTilt(70);
const apexSays = await evaluate(readCut);
ok('a cut through the tip is reported as straight sides, not a curve',
  /not a curve/.test(apexSays), apexSays.slice(0, 90));
ok('and its proof offers no ratio to measure',
  /Straight lines|Nothing to measure/.test(await evaluate('document.getElementById("proof-readout").textContent'))
  || /of 2/.test(await evaluate(readStage)), await evaluate(readStage));
await shot('cut-apex');

// Back to a real conic, and the dock must return to quoting a ratio.
await evaluate(`(() => { const r = document.getElementById("rng-sec-offset"); r.value = -12; r.dispatchEvent(new Event("input")); })()`);
await wait(500);
await setTilt(35);
ok('moving the cut off the tip brings the curve back',
  /ratio is 0[.]\d/.test(await evaluate(readCut)), (await evaluate(readCut)).slice(0, 80));

// --- 3b-bis. Step 4 answers the SECOND question: why these four names (ADR-107) ---------
{
  // The four named conics, offered through the same catalogue and the same call as Step 3.
  const chips = await evaluate('[...document.querySelectorAll("#why-chips [data-cut]")].map(c => c.dataset.cut)');
  ok('Step 4 offers the four named cuts', chips.length === 4
    && ['Circle', 'Ellipse', 'Parabola', 'Hyperbola'].every((k) => chips.includes(k)), chips.join(','));

  // Each one must move the cut, the badge, the sentence and the highlighted row TOGETHER — and
  // the value has to be the real eccentricity of the cut, not a number looked up from the name.
  const readBand = `(() => ({
    e: document.getElementById('ecc-value').textContent,
    curve: document.getElementById('ecc-curve').textContent,
    why: document.getElementById('ecc-why').textContent,
    here: [...document.querySelectorAll('#ecc-table [data-curve]')].filter(r => r.dataset.here === 'true').map(r => r.dataset.curve),
    live: window.__eccProbe,
  }))()`;
  // The slider is whole degrees, so a named cut lands within one degree of its exact tilt —
  // the tolerance is the resolution of the control, and it is the classifier's own 0.5 degrees.
  for (const [cut, test, label] of [
    ['Circle', (v) => v < 0.05, 'e ≈ 0'],
    ['Ellipse', (v) => v > 0.05 && v < 0.95, '0 < e < 1'],
    ['Parabola', (v) => Math.abs(v - 1) < 0.05, 'e ≈ 1'],
    ['Hyperbola', (v) => v > 1.02, 'e > 1'],
  ]) {
    await evaluate(`document.querySelector('#why-chips [data-cut="${cut}"]').click()`);
    // The plane TWEENS to the named cut, so wait for ARRIVAL, not for a fixed sleep: mid-tween
    // the badge legitimately reads the curve it is passing through. The chip's own pressed
    // state is the definitive signal — it is set from the live classification — and the value
    // must have stopped moving as well, since the tween eases to a stop.
    let last = null;
    for (let i = 0; i < 24; i++) {
      await wait(250);
      const now = await evaluate(`(() => ({
        e: document.getElementById('ecc-value').textContent,
        arrived: document.querySelector('#why-chips [data-cut="${cut}"]').getAttribute('aria-pressed') === 'true',
      }))()`);
      if (now.arrived && now.e === last) break;
      last = now.e;
    }
    const st = await evaluate(readBand);
    const value = parseFloat(st.e);
    ok(`${cut}: the badge reads ${label}`, Number.isFinite(value) && test(value), `e = ${st.e}`);
    ok(`…and names it ${cut}`, st.curve === cut, st.curve);
    ok('…and highlights exactly its own row in the table',
      st.here.length === 1 && st.here[0] === cut, st.here.join(','));
    ok('…and the explanation is that curve’s own', st.why.length > 40
      && new RegExp(cut === 'Circle' ? 'horizontal' : cut === 'Ellipse' ? 'closes'
        : cut === 'Parabola' ? 'never closes' : 'two separate branches').test(st.why),
      st.why.slice(0, 46));
    ok('…and the chip shows it is the live cut',
      (await evaluate(`document.querySelector('#why-chips [data-cut="${cut}"]').getAttribute('aria-pressed')`)) === 'true');
  }

  // The badge is the SAME number the step already quotes, not a second opinion.
  const quoted = await evaluate('document.getElementById("conic-readout").textContent');
  const badge = await evaluate('document.getElementById("ecc-value").textContent');
  ok('the badge agrees with the ratio the step quotes', quoted.includes(badge),
    `badge ${badge} vs "${quoted.slice(-40)}"`);
}

// --- 3c. The terminology figure, on request (ADR-092) ------------------------------------
// The densest sheet in the topic: §6.2's terms plus the curve's own. It is opt-in for that
// reason, and the caption pass may legitimately drop one — but it must not drop most of them.
await evaluate('document.getElementById("tgl-show-names").click()');
await wait(700);
// Fullscreen is gone from the thumbnail (ADR-106) — Switch view is how a sheet gets big now.
await evaluate('document.getElementById("switch-view").click()');
await wait(1200);
const termsInk = await evaluate(inked);
ok('the terminology figure draws', termsInk > 1500, `${termsInk} inked px`);
await shot('terminology');
await evaluate('document.getElementById("switch-view").click()');
await wait(900);
await evaluate('document.getElementById("tgl-show-names").click()');
await wait(500);

// --- 4. The sheet is a drawing to read, not a picture (CHANGE 5) --------------------------
// Reach Step 5, where the construction lives, and expand the sheet for room.
await evaluate('document.getElementById("btn-next").click()');
await wait(900);
// --- 4a. The sheet is a WORKSHEET: it reports what it measures (ADR-091) -----------------
const rows = '[...document.querySelectorAll("#measure-list div")].map((d) => d.textContent)';
ok('the drawing reports what it gives you',
  (await evaluate(shown('measure-group'))) === true
  && (await evaluate(`${rows}.length`)) >= 4,
  `${await evaluate(`${rows}.length`)} quantities`);
console.log('   ', (await evaluate(rows)).join(' | '));

// Exercise 4's question — "determine its axes" — is answered by numbers that are NOT the
// conjugate diameters it was given.
await pickMethod('Ellipse', 'ellipse-parallelogram');
const paraRows = await evaluate(rows);
ok('choosing another construction re-measures the drawing',
  paraRows.some((t) => /Major axis/.test(t)) && !paraRows.some((t) => /150\.0 mm/.test(t)),
  paraRows.slice(0, 2).join(' | '));

// Exercise 5's question — the intersecting-arc method reports the axes it produces.
await pickMethod('Ellipse', 'ellipse-arcs');
ok('the parabola block leaves with the parabola',
  (await evaluate(shown('props-group'))) === false,
  `curve is ${await evaluate('document.getElementById("ctl-method").value')}`);
ok('and the arc method reports the axes it produces',
  (await evaluate(rows)).some((t) => /Major axis.*mm/.test(t)),
  (await evaluate(rows)).find((t) => /Major axis/.test(t)) ?? '');
// The block sits at the FOOT of the panel — after the givens, which is the order a drawing is
// actually made in. Scroll to it before the screenshot, or the shot proves nothing.
await evaluate(`(() => { const s = document.querySelector('#step-card .card__scroll'); s.scrollTop = s.scrollHeight; })()`);
await wait(400);
await shot('measurements');
await pickMethod('Ellipse', 'eccentricity');

// --- 4b. §6.6's three properties, drawn (ADR-093) -----------------------------------------
// The control belongs to the parabola, so it must be absent for the others and present for it.
await pickMethod('Ellipse', 'ellipse-concentric');
ok('the parabola properties stay out of the way of the other curves',
  (await evaluate(shown('props-group'))) === false);
await pickMethod('Parabola', 'parabola-rectangle');
ok('and appear with a parabola', (await evaluate(shown('props-group'))) === true);

await evaluate('document.getElementById("btn-props").click()');
await wait(500);
const readProps = 'document.getElementById("props-readout").textContent';
ok('property 1 is drawn first', (await evaluate(readProps)).startsWith('1 of 3'), await evaluate(readProps));
ok('the sheet swapped to the properties figure', (await evaluate(inked)) > 800);
const canvasBox = await evaluate(`(() => { const c = document.getElementById('compare-canvas'); const r = c.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); })()`);
console.log('    compact sheet canvas:', canvasBox);
await shot('parabola-property-1');
ok('it reaches the focal-chord tangents', await until(`${readProps}.startsWith("2 of 3")`, 8000));
await shot('parabola-property-2');
ok('and the bisecting diameter', await until(`${readProps}.startsWith("3 of 3")`, 8000));
await shot('parabola-property-3');

// A TOGGLE, and the way back (ADR-116). It used to be a one-way door: the only escape was to
// nudge some other control, so pressing it again appeared to leave the drawing broken.
//
// The restore is asserted against the DRAWING, not just the panel — and against a fresh,
// independent render of the same construction rather than a reading taken earlier in the
// session. That is the stronger claim ("what is on the paper is exactly what this construction
// draws"), and it is not hostage to the first-paint label metrics that make any sheet's very
// first render differ from its settled one by a per cent or two.
ok('the properties control says it is on', (await evaluate('document.getElementById("btn-props").getAttribute("aria-pressed")')) === 'true');
await evaluate('document.getElementById("btn-props").click()');
await wait(700);
ok('pressing it again turns the properties off',
  (await evaluate('document.getElementById("btn-props").getAttribute("aria-pressed")')) === 'false');
ok('…and the readout goes with them',
  (await evaluate('document.getElementById("props-readout").hidden')) === true);
const restoredInk = await evaluate(inked);
await shot('parabola-properties-restored');
await pickMethod('Ellipse', 'ellipse-concentric');
await pickMethod('Parabola', 'parabola-rectangle');
ok('…and the construction is back, exactly as a fresh one draws it',
  restoredInk === (await evaluate(inked)),
  `${restoredInk} restored vs ${await evaluate(inked)} freshly drawn`);

// It is also an aside, not a mode: touching any control that changes the drawing gives it back.
await evaluate('document.getElementById("btn-props").click()');
await wait(600);
await pickMethod('Ellipse', 'eccentricity');
ok('changing the construction hands the sheet back',
  (await evaluate('document.getElementById("props-readout").hidden')) === true);

// --- 4c. The syllabus three are staged, paused and badged (ADR-098) ----------------------
const stageText = 'document.getElementById("build-readout").textContent';
const badge = 'document.getElementById("method-badge")';
for (const [curve, id, want] of [['Ellipse', 'ellipse-oblong', 'required'],
  ['Ellipse', 'ellipse-concentric', 'required'], ['Parabola', 'parabola-tangent', 'required']]) {
  await pickMethod(curve, id);
  ok(`${id} offers the step-by-step playback`,
    (await evaluate(shown('btn-play-build'))) === true && (await evaluate(shown('build-nav'))) === true);
  ok(`…and is badged "${want}"`, (await evaluate(`${badge}.dataset.scope`)) === want,
    await evaluate(`${badge}.textContent`));
  // Method / Purpose / How it works / Instruments / Output / Steps / In the exam (CHANGE 4).
  ok('…with a full methodology card',
    (await evaluate('[...document.querySelectorAll("#method-info div")].length')) === 7);
  // Play it, and check it actually walks its own stages.
  await evaluate('document.getElementById("btn-play-build").click()');
  await wait(500);
  // Stage COUNTS differ per method (the oblong gained a mirrored fan, ADR-104); what matters
  // is that Play rewinds to the first stage of whichever construction is showing.
  ok(`${id} starts at its first stage`, /^1 of \d/.test(await evaluate(stageText)),
    await evaluate(stageText));
  ok('…and Pause is offered once it is running', (await evaluate(shown('btn-pause-build'))) === true);
  await evaluate('document.getElementById("btn-pause-build").click()');
  const held = await evaluate(stageText);
  await wait(2600);
  ok('…Pause holds it where it stands', (await evaluate(stageText)) === held, held.slice(0, 24));
  ok('…and the control offers to resume',
    (await evaluate('document.getElementById("btn-pause-build").textContent')) === 'Resume');
  await evaluate('document.getElementById("btn-build-next").click()');
  await wait(300);
  ok('…Next steps it on by hand', (await evaluate(stageText)) !== held);
  await evaluate('document.getElementById("btn-build-prev").click()');
  await wait(300);
  ok('…and Back steps it return', (await evaluate(stageText)) === held);
}
await shot('syllabus-construction');

// --- 4c-bis. The Step 5 dock: right defaults, no dead controls, playback in reach (ADR-102)
{
  // BUG 2 — each curve opens on the construction it should. Two curves are offered, not three:
  // the hyperbola is taught as a SECTION and not constructed (ADR-115).
  const pickerCurves = await evaluate(`[...document.querySelectorAll('#curve-picker button')].map(b => b.dataset.curve)`);
  ok('the curve picker offers exactly the two curves the module constructs',
    pickerCurves.length === 2 && pickerCurves.includes('Ellipse') && pickerCurves.includes('Parabola'),
    pickerCurves.join(','));
  for (const [curve, want] of [['Ellipse', 'ellipse-concentric'], ['Parabola', 'parabola-tangent']]) {
    await evaluate(`[...document.querySelectorAll('#curve-picker button')].find(b => b.dataset.curve === '${curve}').click()`);
    await wait(700);
    ok(`${curve} opens on its recommended construction`,
      (await evaluate('document.getElementById("ctl-method").value')) === want,
      await evaluate('document.getElementById("ctl-method").value'));
    ok(`…and the sheet is actually drawing a ${curve.toLowerCase()}`,
      (await evaluate('document.getElementById("ctl-method").dataset.curve')) === curve,
      await evaluate('document.getElementById("ctl-method").dataset.curve'));
  }

  // IMPROVEMENT 4 — a control that does nothing is worse than an absent one. e and the focal
  // distance drive the focus-directrix construction alone.
  await pickMethod('Ellipse', 'ellipse-concentric');
  ok('the eccentricity fields are absent from a construction that never reads them',
    (await evaluate(shown('fld-ecc'))) === false && (await evaluate(shown('fld-fa'))) === false);
  ok('…and its own dimensions ARE offered',
    (await evaluate(shown('fld-dim1'))) === true && (await evaluate(shown('fld-dim2'))) === true);
  await pickMethod('Ellipse', 'eccentricity');
  ok('…and they come back for the construction they belong to',
    (await evaluate(shown('fld-ecc'))) === true && (await evaluate(shown('fld-fa'))) === true);
  // Seven of the thirteen never draw a tangent, so the tangent controls go with them.
  await pickMethod('Ellipse', 'ellipse-four-centre');
  ok('the tangent controls leave with a construction that draws no tangent',
    (await evaluate(shown('fld-tangent'))) === false && (await evaluate(shown('fld-point'))) === false);

  // BUG 1 — the professor reported the construction "not appearing" under problem mode. The
  // pipeline was never touched; the control that STARTS it sat below the fold of a scroller
  // that the problem header pushed further down. It must open in reach.
  await pickMethod('Ellipse', 'ellipse-concentric');
  const reach = await evaluate(`(() => {
    const b = document.getElementById('btn-play-build').getBoundingClientRect();
    const s = document.querySelector('#step-card .card__scroll').getBoundingClientRect();
    return { below: Math.round(b.top - s.top), tall: Math.round(s.height) };
  })()`);
  ok('the playback control opens within the panel, not below its foot',
    reach.below + 44 <= reach.tall, `${reach.below}px down a ${reach.tall}px panel`);

  // Step 5 is Step 4's layout with the primary view swapped (ADR-105): one full-bleed pane and
  // one floating thumbnail, measured rather than inferred from a class.
  const rect = (id) => `(() => { const r = document.getElementById('${id}').getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top), r: Math.round(r.right) }; })()`;
  const sheetR = await evaluate(rect('compare-card'));
  const coneR = await evaluate(rect('view-box'));
  ok('Step 5 opens with the drawing as the main view',
    sheetR.w > coneR.w * 1.5, `sheet ${sheetR.w} vs cone ${coneR.w}`);
  ok('…and the 3D is a floating thumbnail, not a second pane',
    coneR.w <= 430 && coneR.h <= 330, `${coneR.w}x${coneR.h}`);

  // ADR-106 — the MAIN view is a panel, not a window: no title bar, no window controls.
  ok('the main view has no title bar',
    (await evaluate(`(() => { const h = document.querySelector('#compare-card .compare-card__head');
      return !h || getComputedStyle(h).display === 'none' || h.getBoundingClientRect().height === 0; })()`)) === true);

  // ADR-108 — Step 5's own control swaps main and thumbnail, in one press and with no menu.
  const mainIsDrawing = `(() => document.body.classList.contains('drawing-main'))()`;
  const startedOnDrawing = await evaluate(mainIsDrawing);
  ok('Step 5 offers the view switch', (await evaluate(shown('switch-view'))) === true);
  await evaluate('document.getElementById("switch-view").click()');
  await wait(900);
  ok('…and it swaps main and thumbnail', (await evaluate(mainIsDrawing)) !== startedOnDrawing);
  await evaluate('document.getElementById("switch-view").click()');
  await wait(900);
  ok('…and swaps back', (await evaluate(mainIsDrawing)) === startedOnDrawing);

  // The 3-D beside the drawing must be showing the curve being drawn.
  const tilt = () => evaluate('Number(document.getElementById("rng-cut-tilt").value)');
  await evaluate(`[...document.querySelectorAll('#curve-picker button')].find(b => b.dataset.curve === 'Ellipse').click()`);
  await wait(1400);
  const tiltEllipse = await tilt();
  await evaluate(`[...document.querySelectorAll('#curve-picker button')].find(b => b.dataset.curve === 'Parabola').click()`);
  await wait(1400);
  const tiltParabola = await tilt();
  ok('choosing a curve aims the 3D reference at that cut', tiltParabola > tiltEllipse + 5,
    `ellipse ${tiltEllipse}° -> parabola ${tiltParabola}°`);

  // ONE control on the thumbnail head (ADR-115) — minimize, and nothing else.
  ok('the thumbnail carries a minimize control', (await evaluate(shown('view-min'))) === true);
  const headBtns = await evaluate(`document.querySelectorAll('#view-head button').length`);
  ok('…and it is the ONLY control on the thumbnail', headBtns === 1, `${headBtns} button(s)`);
  const cardBtns = await evaluate(`document.querySelectorAll('#compare-card .compare-card__head button').length`);
  ok('…the drawing thumbnail likewise', cardBtns === 1, `${cardBtns} button(s)`);
  ok('no close control is left on either head',
    (await evaluate(`!document.getElementById('view-close') && !document.getElementById('compare-close')`)) === true);
  await evaluate('document.getElementById("view-min").click()');
  await wait(900);
  ok('minimizing collapses it to a chip', (await evaluate(shown('thumb-restore'))) === true);
  ok('…the large view is still on screen', (await evaluate(shown('compare-card'))) === true);
  await evaluate('document.getElementById("thumb-restore").click()');
  await wait(900);
  ok('…and the chip restores it', (await evaluate(shown('view-box'))) === true
    && (await evaluate(shown('thumb-restore'))) === false);

  // COMPARE MODE — the two views side by side, and nothing else.
  const label = () => evaluate('document.getElementById("compare-chip-label").textContent');
  // ISSUE 1 (ADR-109) — minimize the thumbnail FIRST: Compare Mode must build its own layout
  // and show both panes regardless, then hand the lesson back exactly as it was found.
  await evaluate('document.getElementById("view-min").click()');
  await wait(800);
  ok('the lesson thumbnail is minimized before Compare is pressed',
    (await evaluate(shown('thumb-restore'))) === true);
  await evaluate('document.getElementById("compare-chip").click()');
  await wait(1300);
  ok('Compare Mode shows BOTH panes even so',
    (await evaluate(shown('compare-card'))) === true && (await evaluate(shown('view-box'))) === true);
  await evaluate('document.getElementById("compare-chip").click()');
  await wait(1300);
  ok('…and leaving restores the minimized thumbnail it found',
    (await evaluate(shown('thumb-restore'))) === true);
  await evaluate('document.getElementById("thumb-restore").click()');
  await wait(800);

  const stepBefore = await evaluate('document.getElementById("step-current").textContent');
  const methodBefore = await evaluate('document.getElementById("ctl-method").value');
  ok('Compare invites the comparison', (await label()) === 'Compare', await label());
  await evaluate('document.getElementById("compare-chip").click()');
  await wait(1200);
  ok('Compare opens the side-by-side mode',
    (await evaluate("document.body.classList.contains('compare-split')")) === true);
  const both = await evaluate(`(() => {
    const r = (id) => { const e = document.getElementById(id); const b = e.getBoundingClientRect();
      return { w: Math.round(b.width), x: Math.round(b.left) }; };
    return { view: r('sim-viewport'), sheet: r('compare-card'),
      wizard: document.getElementById('wizard').getBoundingClientRect().width,
      rail: document.getElementById('workbench-rail').getBoundingClientRect().height }; })()`);
  ok('…3D on the left, drawing on the right, evenly', both.view.x < both.sheet.x
    && Math.abs(both.view.w - both.sheet.w) <= 4, `${both.view.w} | ${both.sheet.w}`);
  ok('…with no lesson sidebar', both.wizard === 0, `wizard ${both.wizard}`);
  // ADR-109 — one centred control strip beneath BOTH panes, carrying the cone and the cut.
  const strip = await evaluate(`(() => {
    const r = document.getElementById('workbench-rail');
    const b = r.getBoundingClientRect();
    const view = document.getElementById('sim-viewport').getBoundingClientRect();
    const sheet = document.getElementById('compare-card').getBoundingClientRect();
    return { groups: [...r.querySelectorAll('[data-ctrl]')].map((n) => n.dataset.ctrl),
      h: Math.round(b.height), below: Math.round(b.top) >= Math.round(Math.min(view.bottom, sheet.bottom)) - 2,
      spans: Math.round(b.left) <= Math.round(view.left) + 2 && Math.round(b.right) >= Math.round(sheet.right) - 2,
      // VISIBLE ranges: a display:none field is still in querySelectorAll.
      sliders: [...r.querySelectorAll('input[type="range"]')]
        .filter((i) => i.getBoundingClientRect().height > 0).length,
      toggles: r.querySelectorAll('input[type="checkbox"]').length }; })()`);
  ok('…and one control strip beneath both panes', strip.h > 100 && strip.below && strip.spans,
    `${strip.h}px, below=${strip.below}, spans=${strip.spans}`);
  ok('…carrying the cone and the cut', strip.groups.join(',') === 'cone,section', strip.groups.join(','));
  // ADR-110 — the slide is gone: which conic a cut makes is the TILT's doing.
  ok('…with the cone’s two sizes and the tilt, and both toggles',
    strip.sliders === 3 && strip.toggles === 2, `${strip.sliders} sliders, ${strip.toggles} toggles`);
  ok('…and no "slide it past the tip"',
    (await evaluate(shown('fld-sec-offset'))) === false);

  // …and the tilt alone must still reach all four conics, or removing the slide broke the mode.
  // The parabola is ONE angle — the cone's own generator — so it is asked for by name rather
  // than stumbled on: a coarse sweep steps straight over it.
  const gen = Math.round(parseFloat(
    (await evaluate('document.getElementById("cone-readout").textContent')).match(/(\d+)°/)[1]));
  const names = new Set();
  for (const t of [0, 20, 40, gen, 80, 90]) {
    await evaluate(`(() => { const r = document.getElementById('rng-cut-tilt'); r.value = ${t}; r.dispatchEvent(new Event('input')); })()`);
    await wait(400);
    const said = await evaluate('document.getElementById("section-readout").textContent');
    for (const n of ['Circle', 'Ellipse', 'Parabola', 'Hyperbola']) if (said.startsWith(n)) names.add(n);
  }
  ok('…and the tilt alone still reaches all four conics',
    ['Circle', 'Ellipse', 'Parabola', 'Hyperbola'].every((n) => names.has(n)), [...names].join(','));

  // Live: a slider in the strip must move BOTH pictures.
  const inkNow = () => evaluate(inked);
  const beforeSlider = await inkNow();
  await evaluate(`(() => { const r = document.getElementById('rng-cut-tilt'); r.value = String(Number(r.value) < 45 ? 70 : 20); r.dispatchEvent(new Event('input')); })()`);
  await wait(1200);
  ok('…and moving the tilt redraws the sheet beside the cone', (await inkNow()) !== beforeSlider,
    `${beforeSlider} -> ${await inkNow()} inked px`);
  ok('…and Switch view is out of the way', (await evaluate(shown('switch-view'))) === false);
  ok('…the button now offers the way back', (await label()) === 'Back to 3D', await label());

  await evaluate('document.getElementById("compare-chip").click()');
  await wait(1200);
  ok('Back to 3D restores the lesson',
    (await evaluate("document.body.classList.contains('compare-split')")) === false
    && (await evaluate('document.getElementById("wizard").getBoundingClientRect().width')) > 300);
  ok('…and resets nothing', (await evaluate('document.getElementById("step-current").textContent')) === stepBefore
    && (await evaluate('document.getElementById("ctl-method").value')) === methodBefore,
    `step ${stepBefore}, method ${methodBefore}`);
}

// --- 4d. The Engineering Terms panel highlights on the drawing (ADR-098) -----------------
// This section reads what the FINISHED drawing contains, and since ADR-118 a freshly chosen
// construction shows only its given data — so draw it out first.
await pickMethod('Parabola', 'parabola-tangent');
await pickMethod('Ellipse', 'ellipse-concentric');
await finishConstruction();
const terms = await evaluate('[...document.querySelectorAll("#terms-list li b")].map(b => b.textContent)');
ok('the terms panel lists what this drawing contains', terms.length >= 4, terms.join(', '));
ok('…and every one of them carries a one-line explanation',
  (await evaluate('[...document.querySelectorAll("#terms-list li span")].every(s => s.textContent.length > 15)')) === true);
// Hovering a term must change the drawing — that is the highlight, and it is the SAME one
// the cursor drives, so nothing is duplicated.
await evaluate('document.getElementById("terms-panel").open = true');
await wait(200);
// Baseline against a SETTLED paint. The very first paint of a sheet measures its captions
// before the font has finished loading, so a caption or two lands differently and the ink
// count is ~4% off steady state for that one frame; every paint after it is identical. The
// property under test is the hover ROUND TRIP, not first-paint equality.
const enter = `(() => { const li = document.querySelector('#terms-list li');
  li.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true })); })()`;
const leave = `(() => { const li = document.querySelector('#terms-list li');
  li.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true })); })()`;

// Asserted as a ROUND TRIP rather than against a first-paint baseline: the very first paint of
// a sheet measures its captions before the font has settled, so one frame's collision outcomes
// differ and its ink count is a few per cent off every later paint. What matters here is that
// the highlight goes on and comes back off — so the two "highlight cleared" states must match.
// Settle first, on AGREEMENT rather than a fixed number of cycles. The first paint of a sheet
// lays its captions out with metrics that are one frame stale, so ~3% of the ink differs on
// that frame alone; every paint after it is identical (measured: 13844 → 13400 → 13400 → …).
// Cycle the highlight until two consecutive cleared states match, then measure from there.
let clearedOnce = await evaluate(inked);
for (let i = 0; i < 6; i++) {
  await evaluate(enter); await wait(350);
  await evaluate(leave); await wait(350);
  const now = await evaluate(inked);
  if (now === clearedOnce) break;
  clearedOnce = now;
}

await evaluate(enter);
await wait(400);
const duringTerm = await evaluate(inked);
ok('hovering a term highlights it on the sheet', duringTerm !== clearedOnce,
  `${clearedOnce} → ${duringTerm} inked px`);
await shot('terms-highlight');
await evaluate(leave);
await wait(400);
ok('…and the highlight leaves with the pointer', (await evaluate(inked)) === clearedOnce,
  `${duringTerm} → ${await evaluate(inked)}, cleared baseline ${clearedOnce}`);

// A construction beyond the syllabus says so in its BADGE — but since ADR-100 it is animated
// like every other one, because what a method is examined on and how it is drawn are separate.
await pickMethod('Ellipse', 'ellipse-four-centre');
ok('a construction beyond the syllabus is badged as such',
  (await evaluate(`${badge}.dataset.scope`)) === 'beyond', await evaluate(`${badge}.textContent`));
ok('…and is animated all the same', (await evaluate(shown('btn-play-build'))) === true);
// …and the syllabus tier's own heading carries no icon (ADR-115): an <optgroup> label is
// already typographically distinct, and a star in front of it read as decoration on a control.
const tierLabels = await evaluate(`[...document.querySelectorAll('#ctl-method optgroup')].map(g => g.label)`);
ok('the syllabus heading names itself with no icon',
  tierLabels.includes('Required by the Diploma syllabus'), tierLabels.join(' | '));
ok('…and no heading carries a star or bullet',
  tierLabels.every((l) => !/[★⭐•·]/.test(l)), tierLabels.join(' | '));
await pickMethod('Ellipse', 'eccentricity');

// Make the sheet the MAIN view, for room to sweep it.
await evaluate('document.getElementById("switch-view").click()');
await wait(1200);

// The sweep asks what every part of the drawing IS, so the drawing has to be complete.
await finishConstruction();

// Sweep the sheet and collect every explanation the hit-test offers.
const box = await evaluate(`(() => { const r = document.getElementById('compare-canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
const seen = new Map();
for (let gy = 0; gy < 34; gy++) {
  for (let gx = 0; gx < 52; gx++) {
    const x = Math.round(box.x + (box.w * (gx + 0.5)) / 52);
    const y = Math.round(box.y + (box.h * (gy + 0.5)) / 34);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    const t = await evaluate('(() => { const e = document.getElementById("sheet-tip"); return e.hidden ? null : e.textContent; })()');
    if (t && !seen.has(t)) seen.set(t, { x, y });
  }
}
console.log(`explanations reachable on the sheet: ${seen.size}`);
for (const [t] of seen) console.log('   •', t.slice(0, 74));
ok('the sheet explains what it draws', seen.size >= 4, `${seen.size} distinct`);

// Park on one and screenshot the highlight.
const first = [...seen.values()][0];
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: first.x, y: first.y });
await wait(300);
await shot('hover-sheet');

// Leaving the canvas takes the explanation away.
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(box.x + box.w / 2), y: Math.round(box.y - 40) });
await send('Input.dispatchMouseEvent', { type: 'mouseLeft', x: Math.round(box.x + box.w / 2), y: Math.round(box.y - 40) });
await wait(300);
ok('the explanation leaves with the cursor', await evaluate('document.getElementById("sheet-tip").hidden') === true);

// The construction-line toggle must visibly change the drawing.
const withLines = await evaluate(inked);
await evaluate('document.getElementById("tgl-construction").click()');
await wait(700);
const withoutLines = await evaluate(inked);
ok('hiding the construction lines visibly changes the sheet',
  withoutLines < withLines * 0.9, `${withLines} → ${withoutLines} inked px`);
await evaluate('document.getElementById("tgl-construction").click()');
await wait(500);

// The manual stage stepper, from wherever the construction currently stands.
const stageNow = () => evaluate('document.getElementById("build-readout").textContent');
const stageIndex = async () => Number((await stageNow()).match(/^(\d+) of (\d+)/)?.[1] ?? -1);
const atEnd = await stageIndex();
ok('the construction reports which of its stages is on the paper', atEnd === 8,
  (await stageNow()).slice(0, 50));
await evaluate('document.getElementById("btn-build-prev").click()');
await wait(500);
ok('stepping back a line narrates that stage', (await stageIndex()) === atEnd - 1,
  (await stageNow()).slice(0, 50));
await evaluate('document.getElementById("btn-build-next").click()');
await wait(500);
ok('and forward again', (await stageIndex()) === atEnd);

// --- 5b. A construction OPENS on its given data, never on its answer (ADR-118) -----------
// The finished figure on arrival is what made 'Draw it step by step' look like it started
// from the middle: the answer was already on the paper. Each of the three the syllabus names
// is checked, because what counts as 'given' differs between them — the concentric method's
// two circles are its auxiliary circles and wait, the oblong is handed its rectangle, and the
// tangent method's triangle is not a triangle until AE and BE are joined.
for (const [curve, id, setup] of [['Ellipse', 'ellipse-concentric', 1],
  ['Ellipse', 'ellipse-oblong', 2], ['Parabola', 'parabola-tangent', 1]]) {
  await pickMethod(curve, id);
  const opensAt = await evaluate('document.getElementById("build-readout").textContent');
  const openInk = await evaluate(inked);
  ok(`${id} opens on its given data, not its answer`,
    /given data is set out/.test(opensAt), opensAt.slice(0, 60));
  await finishConstruction();
  const doneInk = await evaluate(inked);
  ok(`…and drawing it out adds the construction`, doneInk > openInk * 1.4,
    `${openInk} given → ${doneInk} finished`);
  // …and the stage it opened on is the one the catalogue names as its setup.
  await pickMethod(curve, id);
  await evaluate('document.getElementById("btn-build-next").click()');
  await wait(500);
  ok(`…from stage ${setup + 1} of its own list`,
    (await evaluate('document.getElementById("build-readout").textContent')).startsWith(`${setup + 1} of`),
    (await evaluate('document.getElementById("build-readout").textContent')).slice(0, 30));
}
await shot('given-data-on-arrival');

// --- 6. Every step owns its own sheet (ADR-117) --------------------------------------------
// Step 6 used to show whatever Step 5 had left on the paper — a finished engineering
// construction sitting beside a question about a solid. The sheet is now derived per step, so
// this walks 5 → 6 → 5 and asserts all three things that has to mean.
{
  // A signature, not a pixel count: two different drawings can ink the same number of pixels.
  const sig = `(() => { const c = document.getElementById('compare-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, h = 0;
    for (let i = 0; i < d.length; i += 4) { const on = (d[i] < 235 || d[i+1] < 235 || d[i+2] < 235) ? 1 : 0;
      n += on; h = (h * 31 + on * (i + 1)) % 2147483647; }
    return n + '/' + h; })()`;
  const goto = async (n) => {
    for (let i = 0; i < 8; i++) await evaluate('document.getElementById("btn-back").click()');
    await wait(700);
    for (let i = 1; i < n; i++) { await evaluate('document.getElementById("btn-next").click()'); await wait(1200); }
    await wait(1400);
  };

  await goto(5);
  await pickMethod('Ellipse', 'ellipse-oblong');
  const onStep5 = await evaluate(sig);
  ok('Step 5 draws its construction sheet', Number(onStep5.split('/')[0]) > 800, onStep5);

  await evaluate('document.getElementById("btn-next").click()');
  await wait(1700);
  const onStep6 = await evaluate(sig);
  ok('Step 6 is NOT showing Step 5’s engineering drawing', onStep6 !== onStep5,
    `${onStep5} then ${onStep6}`);

  // The plane moves under the learner in Step 6 — a dealt question is a new cut, and the
  // thumbnail has to follow it rather than hold the one it opened on.
  const dealt = new Set([onStep6]);
  for (let i = 0; i < 5; i++) {
    await evaluate('document.getElementById("btn-deal-cut").click()');
    await wait(1500);
    dealt.add(await evaluate(sig));
  }
  ok('…and it follows each fresh cut it is dealt', dealt.size >= 3, `${dealt.size} distinct of 6 deals`);
  ok('…without ever falling back to the construction', !dealt.has(onStep5));
  await shot('step-6-own-thumbnail');

  // Step 5 must come back exactly as it was left: Step 6 BORROWS the cut for its paint and
  // never writes it into the sheet state, which is the whole point of deriving it.
  await evaluate('document.getElementById("btn-back").click()');
  await wait(1700);
  ok('stepping back finds the construction exactly as it was left',
    (await evaluate(sig)) === onStep5, `${onStep5} vs ${await evaluate(sig)}`);
  await evaluate('document.getElementById("btn-next").click()');
  await wait(1700);
  ok('…and forward again is the cut once more, not the drawing',
    (await evaluate(sig)) !== onStep5);
}
// --- 7. ONE thumbnail box, on every step that has one (ADR-125, superseding ADR-120) --------
// This section used to assert the opposite: that Steps 4 and 6 DOCKED the sheet as a full-height
// column beside the solid, which is what ADR-120 decided and what made the same panel 420x320 on
// four steps and 403x876 on two. The product owner asked twice for one consistent thumbnail, so
// the docked mode was deleted and this is what replaces it.
//
// Asserted as an EQUALITY of the full rect against Step 5's thumbnail, not as an absence of a
// class: the claim is that one box serves every step, and `!contains('sheet-docked')` would pass
// a third size introduced under some other name. Position is included because "stays anchored in
// the same place" is half of what was asked for.
{
  const goto = async (n) => {
    for (let i = 0; i < 8; i++) await evaluate('document.getElementById("btn-back").click()');
    await wait(700);
    for (let i = 1; i < n; i++) { await evaluate('document.getElementById("btn-next").click()'); await wait(1200); }
    await wait(1500);
  };
  const cardBox = `(() => { const e = document.getElementById('compare-card');
    const r = e.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map(Math.round).join(','); })()`;
  // Step 5's thumbnail is whichever pane is NOT leading, and which that is depends on whether the
  // learner has pressed Switch view — so it is found by area, not by id.
  const thumbBox = `(() => {
    const rects = ['view-box', 'compare-card'].map((id) => document.getElementById(id).getBoundingClientRect());
    const r = rects[0].width * rects[0].height <= rects[1].width * rects[1].height ? rects[0] : rects[1];
    return [r.x, r.y, r.width, r.height].map(Math.round).join(','); })()`;

  // The card is only OPEN from Step 4 on, so the walk goes out to 4 first, then back down to 1
  // collecting as it goes, then forward again. ONE continuous walk rather than a rewind per step:
  // the earlier shape re-walked the lesson twelve times and pushed this oracle past ten minutes,
  // which is how an oracle stops being run at all.
  const overlap = `(() => {
    const a = document.getElementById('view-box').getBoundingClientRect();
    const b = document.getElementById('compare-card').getBoundingClientRect();
    const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return Math.round(ox * oy); })()`;
  const sample = async () => ({
    box: await evaluate(cardBox),
    cls: await evaluate('document.body.className.trim()'),
    over: await evaluate(overlap),
  });
  const next = async (ms = 1300) => { await evaluate('document.getElementById("btn-next").click()'); await wait(ms); };
  const back = async (ms = 1300) => { await evaluate('document.getElementById("btn-back").click()'); await wait(ms); };

  const seen = {};
  await goto(4);
  seen[4] = await sample();
  for (const step of [3, 2, 1]) { await back(); seen[step] = await sample(); }
  await shot('shared-thumb');
  for (let i = 0; i < 3; i++) await next();      // back out to Step 4
  await next(1800);                              // Step 5
  const canonical = await evaluate(thumbBox);    // Step 5 is the reference implementation
  // Asserted through the control that IS `sheetPrimaryOn` rather than through `body.drawing-main`.
  // That class also requires paneFocus === 'drawing', and Switch view (exercised in section
  // 4c-bis) legitimately leaves the cone leading — so a class check here fails on a state the
  // learner is entitled to be in. Switch view is hidden on every step but this one.
  ok('Step 5 still owns its own two-pane workspace',
    (await evaluate(`!document.getElementById('switch-view').hidden`)) === true,
    await evaluate('document.body.className || "(no layout class)"'));
  await next(1800);                              // Step 6
  seen[6] = await sample();

  for (const step of [1, 2, 3, 4, 6]) {
    ok(`Step ${step}'s thumbnail is the same box as Step 5's`, seen[step].box === canonical,
      `${seen[step].box} vs ${canonical}`);
  }

  // The box has to come from ONE rule, not from N rules that currently agree. A second sizing
  // mode is exactly how this drifted the first time, so the body is required to be in its
  // no-layout-class state on every step that shows the card floating.
  for (const step of [1, 4, 6]) {
    ok(`…and Step ${step} carries no per-step sizing class`, seen[step].cls === '',
      seen[step].cls || '(none)');
  }

  // What deleting the docked mode gives back, MEASURED and printed rather than asserted away, so
  // the trade stays visible: on Steps 4 and 6 the card again sits over the box the camera framed
  // the cone into. Reported, never failed — the consistent thumbnail was chosen over it with the
  // trade on the table. If it is ever addressed, reframe the CAMERA; do not re-add a per-step
  // sizing mode, which is what this section exists to prevent.
  for (const step of [4, 6]) {
    console.log(`note Step ${step} sheet-over-solid overlap: ${seen[step].over}px² (accepted, ADR-125)`);
  }

  // Minimize still empties the corner, and restore still brings the same box back. Done here on
  // Step 6, where the card is the thumbnail — on Step 5 it is the main pane.
  await evaluate('document.getElementById("compare-min").click()');
  await wait(1200);
  ok('minimizing still collapses the thumbnail to its chip',
    (await evaluate(`(() => { const e = document.getElementById('compare-card');
      return e.hidden || getComputedStyle(e).display === 'none'; })()`)) === true);
  await evaluate('document.getElementById("thumb-restore").click()');
  await wait(1200);
  ok('…and restoring brings back the same box, not a new one',
    (await evaluate(cardBox)) === canonical, `${await evaluate(cardBox)} vs ${canonical}`);

  await evaluate('document.getElementById("compare-chip").click()');
  await wait(1700);
  ok('…and Compare Mode is still its own body-level split',
    (await evaluate(`document.body.classList.contains('compare-split')`)) === true);
  await evaluate('document.getElementById("compare-chip").click()');
  await wait(1700);
}

// --- 8. One loud action per step, and no message outlives its step (ADR-121) --------------
{
  const primary = (id) => evaluate(`(() => { const e = document.getElementById('${id}');
    return e && !e.hidden && e.classList.contains('btn--primary'); })()`);
  const loudCount = () => evaluate(`[...document.querySelectorAll('#step-card .btn--primary')]
    .filter(b => !b.hidden && b.offsetParent !== null && !b.disabled).length`);
  const goStep = async (n) => {
    for (let i = 0; i < 8; i++) await evaluate('document.getElementById("btn-back").click()');
    await wait(700);
    for (let i = 1; i < n; i++) { await evaluate('document.getElementById("btn-next").click()'); await wait(1250); }
    await wait(1500);
  };

  // Step 4 carried two identical blue "Next" buttons doing different things: one walked a stage
  // of the proof, the other left the step and abandoned it.
  await goStep(4);
  ok('Step 4 has exactly one loud action while the proof is unwalked', (await loudCount()) === 1,
    `${await loudCount()} primary buttons`);
  ok('…and it is the proof stepper, which is what the step is for', (await primary('btn-proof-next')) === true);
  ok('…so the wizard Next waits its turn', (await primary('btn-next')) === false);

  for (let i = 0; i < 12; i++) {
    await until('!document.getElementById("btn-proof-next").disabled', 9000);
    if (/Proof complete/.test(await evaluate('document.getElementById("btn-proof-next").textContent'))) break;
    await evaluate('document.getElementById("btn-proof-next").click()');
    await wait(400);
  }
  await wait(1000);
  ok('once the proof is complete the accent moves to moving on', (await primary('btn-next')) === true);
  ok('…and the finished proof button hands it back', (await primary('btn-proof-next')) === false,
    await evaluate('document.getElementById("btn-proof-next").textContent'));
  ok('…still exactly one loud action', (await loudCount()) === 1, `${await loudCount()} primary buttons`);

  // Step 6 stacked THREE full-width primaries after the Finish-button rollout: f8771ab dropped
  // ADR-121's own class toggle and added #btn-finish on top. The accent belongs to the payoff —
  // Finish lesson in free play, "Try another problem" once a problem is loaded (2026-08-09
  // addendum to ADR-121).
  await goStep(6);
  ok('Step 6 has exactly one loud action in free play', (await loudCount()) === 1,
    `${await loudCount()} primary buttons`);
  ok('…and it is Finish lesson, not the exercise or the library link',
    (await primary('btn-finish')) === true
    && (await primary('btn-deal-cut')) === false
    && (await primary('btn-complete-next')) === false);

  // Load a problem: the payoff moves, and the count still holds.
  await evaluate('document.getElementById("open-problem-library").click()');
  await wait(600);
  await evaluate('document.querySelector(".problem-card").click()');
  await wait(400);
  await evaluate(`(() => { const c = document.getElementById('problem-confirm-load');
    if (c && !document.getElementById('problem-library-confirm').hidden) c.click(); })()`);
  await wait(2000);            // loadProblem() routes through sim.reset() → Step 1
  await goStep(6);
  ok('Step 6 still has exactly one loud action mid-problem', (await loudCount()) === 1,
    `${await loudCount()} primary buttons`);
  ok('…and mid-problem the accent is "Try another problem"',
    (await primary('btn-complete-next')) === true && (await primary('btn-finish')) === false);

  // Exiting the problem (no reset — "your drawing is kept") must not leave a stale accent:
  // exitProblem() doesn't route through sim.reset(), so it has to call sim.syncNav() itself.
  await evaluate('document.getElementById("exit-problem").click()');
  await wait(400);
  ok('exiting the problem hands the accent back to Finish lesson',
    (await primary('btn-finish')) === true && (await primary('btn-complete-next')) === false);
  ok('…still exactly one loud action', (await loudCount()) === 1, `${await loudCount()} primary buttons`);

  // A message is anchored to the step that raised it. Both slots hold for 4.5s, which outlives
  // a learner pressing Next twice in three seconds — and Step 2's note names a control Step 3
  // does not have.
  await goStep(2);
  await evaluate('document.getElementById("btn-next").click()');
  await wait(600);
  const carried = await evaluate(`(() => { const e = document.getElementById('vp-flow-note');
    return (!e || e.hidden) ? '' : e.textContent; })()`);
  ok('a step change retires the previous step’s flow note', !/Cut the cone/.test(carried),
    carried ? carried.trim().slice(0, 50) : '(cleared)');

  // The counter is a label and stays uppercase; the stage NAME is a title and is not.
  await goStep(4);
  const caps = await evaluate(`(() => { const n = document.querySelector('.proof-stage__name');
    return n ? getComputedStyle(n).textTransform : 'missing'; })()`);
  ok('the proof stage name is not set in capitals', caps === 'none', caps);
  ok('…while its counter still reads as a label',
    (await evaluate(`getComputedStyle(document.querySelector('.proof-stage__count')).textTransform`)) === 'uppercase');
}

// --- 9. The sim is usable on a phone, not merely present on one (ADR-123) ------------------
// Measured on the emulated device rather than by reading the stylesheet, because the failure
// this replaces was arithmetic: 42% of a 640px screen left the step card a 99px scroll port,
// about one line, and Step 6's "Set up a cut" sat 130px below the fold of it. A rule-based
// check ("is there a mobile breakpoint?") passed that layout. These are the four properties a
// learner actually meets — room to read, the step's action in reach, one pane at a time, and
// controls a thumb can hit — plus the same four turned sideways. Runs LAST: it leaves the
// device metrics overridden.
{
  // Effective touch target. A 32px glyph with a centred 44px ::before hit area passes, because
  // that IS the target; a checkbox measures as the label that wraps it, for the same reason.
  const targets = `(() => {
    const bad = [];
    for (const e of document.querySelectorAll('button, select, input, [role="button"]')) {
      const cs = getComputedStyle(e);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (e.closest('.term')) continue;                       // inline prose, not a control strip
      const host = e.closest('.toggle') || e;                 // a checkbox's target is its label
      const hr = host.getBoundingClientRect();
      const pseudo = parseFloat(getComputedStyle(e, '::before').minHeight) || 0;
      const h = Math.max(hr.height, pseudo);
      const w = Math.max(hr.width, parseFloat(getComputedStyle(e, '::before').minWidth) || 0);
      if (h < 44 || w < 44) bad.push((e.id || e.className || e.tagName) + ' ' + Math.round(w) + 'x' + Math.round(h));
    }
    return [...new Set(bad)].join(', ');
  })()`;

  // Both panes are absolutely positioned over the same box on a phone, so "no overlap" is the
  // wrong question — the right one is whether the covered pane is still being painted.
  const painted = (id) => `(() => { const e = document.getElementById('${id}');
    if (!e || e.hidden) return false;
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`;

  const scrollPort = `Math.round(document.querySelector('.card__scroll').getBoundingClientRect().height)`;

  const boot = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}${TOPIC}` });
    for (let i = 0; i < 40; i++) { if (await evaluate('!!window.simAPI')) break; await wait(400); }
    await wait(2200);
  };
  // Walk to a step from a cold boot. Step 2's cut has to be made before the lesson moves on.
  const walkTo = async (n) => {
    await evaluate('document.getElementById("btn-next").click()'); await wait(900);
    await evaluate('document.getElementById("tgl-cut").click()'); await wait(900);
    for (let i = 2; i < n; i++) { await evaluate('document.getElementById("btn-next").click()'); await wait(1300); }
    await wait(1200);
  };

  await boot(390, 844);
  ok('a phone gets a coarse-pointer layout', (await evaluate(`matchMedia('(pointer: coarse)').matches`)) === true);
  ok('the step card has room to read on a phone', (await evaluate(scrollPort)) >= 200,
    `${await evaluate(scrollPort)}px scroll port`);
  ok('…and nothing runs off the side of the screen',
    (await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')) === true);
  ok('every control meets the 44px target floor on touch',
    (await evaluate(targets)) === '', await evaluate(targets));

  await walkTo(4);
  await shot('phone-step4');
  ok('the sheet opens minimized on a phone, so the step still has its solid',
    (await evaluate(`document.body.classList.contains('thumb-min')`)) === true
    && (await evaluate(painted('view-box'))) === true
    && (await evaluate(painted('compare-card'))) === false);

  await evaluate('document.getElementById("thumb-restore").click()');
  await wait(1400);
  await shot('phone-step4-sheet');
  ok('…and restoring it hands over the WHOLE viewport, not a slice of one',
    (await evaluate(`document.body.classList.contains('sheet-solo')`)) === true);
  ok('…so only one pane is ever painted at phone width',
    (await evaluate(painted('compare-card'))) === true
    && (await evaluate(painted('view-box'))) === false);
  const sheetShare = await evaluate(`(() => {
    const c = document.getElementById('compare-card').getBoundingClientRect();
    const v = document.getElementById('sim-viewport').getBoundingClientRect();
    return Math.round(100 * (c.width * c.height) / (v.width * v.height)); })()`);
  ok('…the sheet is the viewport, not a card floating in it', sheetShare >= 99, `${sheetShare}% of the pane`);
  await evaluate('document.getElementById("compare-min").click()');
  await wait(1000);

  // The step whose only way in was 130px below the fold.
  await evaluate('document.getElementById("btn-next").click()'); await wait(1300);
  await evaluate('document.getElementById("btn-next").click()'); await wait(1500);
  const reach = await evaluate(`(() => {
    const b = document.getElementById('btn-deal-cut'); const s = document.querySelector('.card__scroll');
    if (!b || !s) return 'missing';
    b.scrollIntoView({ block: 'nearest' });
    const r = b.getBoundingClientRect(), p = s.getBoundingClientRect();
    return (r.top >= p.top - 1 && r.bottom <= p.bottom + 1) ? '' : Math.round(r.top) + ' outside ' + Math.round(p.top) + '..' + Math.round(p.bottom);
  })()`);
  ok("Step 6's only way in is reachable inside the card", reach === '', reach);
  await shot('phone-step6');

  // Turned sideways the scarce axis flips, and stacking is the wrong answer there.
  await boot(667, 375);
  ok('a phone in landscape puts the panes back in columns',
    (await evaluate(`(() => { const v = document.getElementById('sim-viewport').getBoundingClientRect();
      const w = document.getElementById('wizard').getBoundingClientRect();
      return w.left >= v.right - 1; })()`)) === true);
  ok('…and the step card still has a readable port', (await evaluate(scrollPort)) >= 150,
    `${await evaluate(scrollPort)}px scroll port`);
  ok('…with the solid still a picture rather than a band',
    (await evaluate(`Math.round(document.getElementById('sim-viewport').getBoundingClientRect().width)`)) >= 300);

  // The narrow band the desktop layout has to survive on the way down: a 340px wizard gives the
  // card 193px of content and the nav footer wants 261, so it used to clip Next off its edge.
  await send('Emulation.setDeviceMetricsOverride', { width: 768, height: 1024, deviceScaleFactor: 1, mobile: true });
  await wait(900);
  const clipped = await evaluate(`(() => [...document.querySelectorAll('#step-card *')]
    .filter(e => e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && getComputedStyle(e).overflowX !== 'visible')
    .map(e => (e.id || e.className) + ' ' + e.clientWidth + '<' + e.scrollWidth).join(', '))()`);
  ok('nothing in the step card clips at the 768px band', clipped === '', clipped);
}

const errs = events.filter((e) => e.method === 'Log.entryAdded' && e.params.entry.level === 'error')
  .filter((e) => !(e.params.entry.url ?? '').endsWith('/favicon.ico'))
  .map((e) => e.params.entry.text)
  .concat(events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.text));
ok('no console errors', errs.length === 0, errs.join(' | ').slice(0, 300));

console.log(fails === 0 ? '\nALL GREEN' : `\n${fails} FAILED`);
ws.close(); chrome.kill(); server.close();
process.exit(fails === 0 ? 0 : 1);
