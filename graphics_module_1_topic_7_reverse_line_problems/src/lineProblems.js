// lineProblems.js — Problem Library data for the REVERSE Lines topic (a leaf layer).
//
// Unlike Topic 6 (where the learner DIALS TL/theta/phi/aHP/aVP by hand and the self-check
// compares the live dialled state to a target), this topic shows the learner a FINISHED,
// LOCKED drawing and asks them to guess one or more of its numeric parameters. Every problem
// stores:
//   - shapeData   the FULL solved { TL, theta, phi, aHP, aVP, aLat } — feeds lineData.resolveLine()
//                 unchanged, so the drawing renders exactly as the textbook figure would.
//   - askFields   which of { TL, theta, phi, htDist, vtDist } the learner must guess. Every other
//                 field is shown (never hidden) — main.js reads askFields to decide which of
//                 lineRig.js's on-screen dimension labels to suppress (hiddenFields), so a guessed
//                 field's numeric answer never leaks onto the 3D/2D drawing itself.
//   - target      the correct value for each askFields key. TL/theta/phi read straight from
//                 shapeData (kept in sync by construction); htDist/vtDist are NOT part of
//                 shapeData (traces are a derived construction, not a driving parameter) so they
//                 are stored separately, computed by intersecting the line AB with y=0 (H.T.) and
//                 z=0 (V.T.) — the same "produce the line to meet the plane" the textbook itself
//                 describes in Art 10-9/10-10.
//   - givenFields which fields are DISPLAYED (read-only) as the problem's stated data — usually
//                 the complement of askFields, but htDist/vtDist are only listed here when the
//                 problem statement itself hands them to the learner (e.g. 10-20's H.T.).
//
// Sign convention (matches lineData.js): aHP > 0 = above HP, aVP > 0 = in front of VP. htDist > 0
// = in front of VP, vtDist > 0 = above HP — negative values are the "behind VP" / "below HP" cases
// Art 10-12 calls out explicitly (traces are not always on the same side as the line).
//
// Every problem cites its source: N.D. Bhatt, "Engineering Drawing" (Charotar), the excerpt
// "Projection of Straight Lines.pdf" at the Simatrix root, chapter 10. PDF page = book page − 194
// in that excerpt. A few problems (10-5, 10-6, and parts of 10-15/10-20) are METHOD DEMONSTRATIONS
// in this edition — the book shows the construction procedure on a figure but prints no numeric
// data in the prose (Problem 10-5's Fig 10-15/10-17, Problem 10-6's Fig 10-27/10-28). For those,
// this file supplies a concrete, internally-consistent instance of the same procedure and says so
// in the problem's own `source` note — the GEOMETRY method is authentic even where the specific
// millimetres are this file's own choice, not the book's.

/** Ordered tiers (fewest unknowns → most). */
export const TIERS = Object.freeze([
  { id: 'easier',   label: 'One or two unknowns',      blurb: 'Traces only, or a single pair of angles — the rest of the drawing is given.' },
  { id: 'moderate', label: 'Three unknowns',            blurb: 'True length plus an angle or a trace — read the drawing carefully.' },
  { id: 'hard',     label: 'Full position problems',    blurb: 'True length, both inclinations, and both traces — nothing is given but the two end positions.' },
]);

/** Human labels for every field the given/ask panels may show. */
export const FIELD_LABELS = Object.freeze({
  TL:      'true length',
  theta:   'angle with the HP (θ)',
  phi:     'angle with the VP (φ)',
  aHP:     'distance of end A from the HP',
  aVP:     'distance of end A from the VP',
  htDist:  'position of the H.T. (+ = in front of VP, − = behind)',
  vtDist:  'position of the V.T. (+ = above HP, − = below)',
});

/**
 * @typedef {Object} Problem
 * @property {string}   id
 * @property {string}   tier          One of TIERS[].id.
 * @property {string}   title
 * @property {string}   statement     Word-problem text (textbook-grounded).
 * @property {string}   source        Citation: book, problem number, page.
 * @property {Object}   shapeData     Full { TL, theta, phi, aHP, aVP, aLat } — drives the drawing.
 * @property {string[]} givenFields   Fields shown read-only (subset of FIELD_LABELS keys).
 * @property {string[]} askFields     Fields the learner must guess (subset of FIELD_LABELS keys).
 * @property {Object}   target        { [askField]: correctValue }.
 * @property {string}   hint          One scaffolded hint (kept to one line per RULES.md brevity).
 */

/** @type {ReadonlyArray<Problem>} */
export const PROBLEMS = Object.freeze([
  // ══ Easier — one or two unknowns ═════════════════════════════════════════════
  {
    id: 'rl-10-6-traces',
    tier: 'easier',
    title: 'Find both traces (10-6)',
    statement: 'The projections of a line PQ are given: it is 90 mm long, inclined at 35° to the H.P. and 25° to the V.P. End P is 10 mm above the H.P. and 15 mm in front of the V.P. Determine the positions of its traces.',
    source: 'N.D. Bhatt, Problem 10-6, p.213 — Fig 10-27/10-28 is a method demo with no printed numeric data in this edition; the geometry (produce the top view to meet xy for the V.T., the front view for the H.T.) is Art 10-10 Method I, this instance\'s millimetres are this file\'s own.',
    shapeData: { TL: 90, theta: 35, phi: 25, aHP: 10, aVP: 15, aLat: 0 },
    givenFields: ['TL', 'theta', 'phi', 'aHP', 'aVP'],
    askFields: ['htDist', 'vtDist'],
    target: { htDist: 7.63, vtDist: -10.36 },
    hint: 'Produce the line AB (beyond A if needed) until it crosses the HP (y = 0, that is the H.T.) and the VP (z = 0, that is the V.T.) — the V.T. lands below the HP here, which Art 10-12 says can happen.',
  },
  {
    id: 'rl-10-7-traces',
    tier: 'easier',
    title: 'Find both traces (10-7)',
    statement: 'A point A is 50 mm below the H.P. and 12 mm behind the V.P. A point B is 10 mm above the H.P. and 25 mm in front of the V.P. The distance between the projectors of A and B is 40 mm. Determine the traces of the line joining A and B.',
    source: 'N.D. Bhatt, Problem 10-7, p.213 (exact textbook data).',
    shapeData: { TL: 81.05, theta: 47.75, phi: 27.15, aHP: -50, aVP: -12, aLat: 0 },
    givenFields: ['TL', 'theta', 'phi', 'aHP', 'aVP'],
    askFields: ['htDist', 'vtDist'],
    target: { htDist: 18.83, vtDist: -30.54 },
    hint: 'A is below the HP and behind the VP, B is above the HP and in front — the line crosses BOTH planes between A and B, so both traces fall on the segment itself, not an extension.',
  },
  {
    id: 'rl-10-11-angles',
    tier: 'easier',
    title: 'Find θ and φ from the two views (10-11)',
    statement: 'The top view of a 75 mm long line AB measures 65 mm, while the length of its front view is 50 mm. Its end A is in the H.P. and 12 mm in front of the V.P. Draw the projections of AB and determine its inclinations with the H.P. and the V.P.',
    source: 'N.D. Bhatt, Problem 10-11, p.216–217 (exact textbook data; no numeric answer printed on this page, so the target below is this file\'s own trig solve of the three given lengths).',
    shapeData: { TL: 75, theta: 29.93, phi: 48.19, aHP: 0, aVP: 12, aLat: 0 },
    givenFields: ['TL', 'aHP', 'aVP'],
    askFields: ['theta', 'phi'],
    target: { theta: 29.93, phi: 48.19 },
    hint: 'The top view length only equals TL·cos(θ)-style shortening from the HP tilt, and the front view from the VP tilt — with TL, top view, and front view all given, both angles are pinned by the same triangle relations Method I builds.',
  },
  {
    id: 'rl-10-12-angles',
    tier: 'easier',
    title: 'Find θ and φ from two end positions (10-12)',
    statement: 'A line AB, 65 mm long, has its end A 20 mm above the H.P. and 25 mm in front of the V.P. The end B is 40 mm above the H.P. and 65 mm in front of the V.P. Draw the projections of AB and show its inclinations with the H.P. and the V.P.',
    source: 'N.D. Bhatt, Problem 10-12, p.217 (exact textbook data).',
    shapeData: { TL: 65, theta: 17.93, phi: 37.98, aHP: 20, aVP: 25, aLat: 0 },
    givenFields: ['TL', 'aHP', 'aVP'],
    askFields: ['theta', 'phi'],
    target: { theta: 17.93, phi: 37.98 },
    hint: 'Both ends\' positions fully fix the line — the height difference (20mm) gives θ, the depth difference (40mm) gives φ, once you know how far apart the projectors sit.',
  },
  {
    id: 'rl-10-15-tl-phi',
    tier: 'easier',
    title: 'Find TL and φ, given θ (10-15)',
    statement: 'Incomplete projections of a line PQ, inclined at 30° to the H.P., are given: end P is 15 mm above the H.P. and 15 mm in front of the V.P. Complete the projections and determine the true length of PQ and its inclination with the V.P.',
    source: 'N.D. Bhatt, Problem 10-15, p.219 — Fig 10-40 gives θ=30° in the prose; the figure\'s own P-position dims read "15"/"15" but are not fully legible in this excerpt, so this file uses 15/15 and picks TL=70, φ=25° as a consistent instance of the same "turn the top view parallel to xy" procedure.',
    shapeData: { TL: 70, theta: 30, phi: 25, aHP: 15, aVP: 15, aLat: 0 },
    givenFields: ['theta', 'aHP', 'aVP'],
    askFields: ['TL', 'phi'],
    target: { TL: 70, phi: 25 },
    hint: 'You already know θ = 30° and the top view is shown — turning it parallel to xy (Fig 10-40\'s own method) reveals both the true length and, via the same rotation on the front view, φ.',
  },
  {
    id: 'rl-10-16-tl-vt',
    tier: 'easier',
    title: 'Find TL and the V.T. (10-16)',
    statement: 'The end A of a line AB is 25 mm behind the V.P. and below the H.P. The end B is 12 mm in front of the V.P. and above the H.P. The distance between the projectors is 65 mm. The line is inclined at 40° to the H.P. and its H.T. is 20 mm behind the V.P. Draw the projections of the line and determine its true length and the V.T.',
    source: 'N.D. Bhatt, Problem 10-16, p.219–220 — dx=65, θ=40°, A\'s VP distance (25 behind) and the H.T. (20 behind VP) are exact textbook data; the book states A/B\'s heights only qualitatively ("below"/"above" the HP, no mm), so this file back-solves A\'s exact height from the H.T. constraint (the only value consistent with the given H.T., θ, and projector spacing).',
    shapeData: { TL: 97.64, theta: 40, phi: 22.27, aHP: -8.48, aVP: -25, aLat: 0 },
    givenFields: ['theta', 'aHP', 'aVP'],
    askFields: ['TL', 'vtDist'],
    target: { TL: 97.64, vtDist: 33.93 },
    hint: 'The H.T. is already fixed for you (20 mm behind the V.P.) — since the line\'s inclination (40°) and the 65 mm projector spacing are also known, the true length and where the SAME line crosses the V.P. both follow from producing it the other way.',
  },
  {
    id: 'rl-10-37-tl-theta',
    tier: 'easier',
    title: 'Find TL and θ, given φ (10-37)',
    statement: 'The distance between the end-projectors of a line AB is 80 mm. Point A is 15 mm below the H.P. and 20 mm in front of the V.P. Point B is 60 mm behind the V.P. Draw the projections of the line if it is inclined at 45° to the V.P. Determine also the true length and inclination with the H.P.',
    source: 'N.D. Bhatt, Problem 10-37, p.234 (exact textbook data; the book\'s own construction draws A\'B\' parallel to xy through a\', which forces θ = 0 — the printed marginal "43°" on this page\'s figure could not be reconciled with that construction from this excerpt and is not used).',
    shapeData: { TL: 113.14, theta: 0, phi: 45, aHP: -15, aVP: 20, aLat: 0 },
    givenFields: ['phi', 'aHP', 'aVP'],
    askFields: ['TL', 'theta'],
    target: { TL: 113.14, theta: 0 },
    hint: 'With only the projector spacing, A\'s position, B\'s VP distance, and φ given — no height for B is stated at all — the book\'s own construction keeps B level with A. What does that make θ?',
  },

  // ══ Moderate — three unknowns ═════════════════════════════════════════════════
  {
    id: 'rl-10-5-tl-theta-phi',
    tier: 'moderate',
    title: 'Find TL, θ, and φ from the two views (10-5)',
    statement: 'The top view ab (about 87 mm) and the front view a′b′ (about 94 mm) of a line AB are given. End A is 15 mm above the H.P. and 20 mm in front of the V.P. Determine its true length and the inclinations with the H.P. and the V.P.',
    source: 'N.D. Bhatt, Problem 10-5, p.206–208 — Fig 10-15/10-17 (Method I) is a method demo with no printed numeric data in this edition; this instance (TL=100, θ=30°, φ=20°) is this file\'s own, chosen so the two view lengths quoted in the statement are exactly what that TL/θ/φ produce.',
    shapeData: { TL: 100, theta: 30, phi: 20, aHP: 15, aVP: 20, aLat: 0 },
    givenFields: ['aHP', 'aVP'],
    askFields: ['TL', 'theta', 'phi'],
    target: { TL: 100, theta: 30, phi: 20 },
    hint: 'This is the textbook\'s Method I in reverse: rotate the top view until it is parallel to xy and project — the point where the projector meets the front view\'s locus line gives the true length directly.',
  },
  {
    id: 'rl-10-19-tl-theta-ht',
    tier: 'moderate',
    title: 'Find TL, θ, and the H.T. (10-19)',
    statement: 'A line AB, inclined at 40° to the V.P., has its ends 20 mm and 50 mm above the H.P. The length of its front view is 65 mm and its V.T. is 10 mm above the H.P. Determine the true length of AB, its inclination with the H.P., and its H.T.',
    source: 'N.D. Bhatt, Problem 10-19, p.221 (exact textbook data; end A taken as the 20 mm-above-HP end).',
    shapeData: { TL: 84.85, theta: 20.71, phi: 40, aHP: 20, aVP: 18.18, aLat: 0 },
    givenFields: ['phi', 'aHP'],
    askFields: ['TL', 'theta', 'htDist'],
    target: { TL: 84.85, theta: 20.71, htDist: -18.18 },
    hint: 'φ and the front-view length fix the depth run; the V.T.\'s given height (10 mm above HP) then pins exactly where end A sits in front of the V.P. — from there, true length, θ, and the H.T. all fall out of the same triangle.',
  },
  {
    id: 'rl-10-20-tl-phi-vt',
    tier: 'moderate',
    title: 'Find TL, φ, and the V.T. (10-20)',
    statement: 'The front view a′b′ (about 59 mm) and the H.T. (3.7 mm in front of the V.P.) of a line AB, inclined at 23° to the H.P., are given. End A is 12 mm above the H.P. and 20 mm in front of the V.P. Determine the true length of AB, its inclination with the V.P., and its V.T.',
    source: 'N.D. Bhatt, Problem 10-20, p.222 — θ=23° is exact textbook data; Fig 10-45\'s other dims (12, 10, 50) were not fully legible in this excerpt, so this file supplies a consistent instance (TL=70, φ=32°) whose front view and H.T. match the numbers quoted in the statement.',
    shapeData: { TL: 70, theta: 23, phi: 32, aHP: 12, aVP: 20, aLat: 0 },
    givenFields: ['theta', 'aHP', 'aVP', 'htDist'],
    givenValues: { htDist: 3.72 }, // H.T. isn't part of shapeData (a derived trace, not a driving
                                    // param) so its GIVEN value needs its own channel — see
                                    // uiManager.js / main.js's sim.getGivenValue().
    askFields: ['TL', 'phi', 'vtDist'],
    target: { TL: 70, phi: 32, vtDist: -2.75 },
    hint: 'The H.T. is already given, so producing the line the OTHER way (through the front view, to meet the VP) is what finds the V.T. — the same construction gives you the true length and φ along the way.',
  },
  {
    id: 'rl-10-33-classic',
    tier: 'moderate',
    title: 'Find TL, θ, and φ from two positions (10-33)',
    statement: 'The distance between the end-projectors of a line PQ is 50 mm. Point P is 29 mm above the H.P. and 20.71 mm behind the V.P. Point Q is 42 mm below the H.P. and 30 mm in front of the V.P. Draw the projections of the line and determine the true length and the true inclinations of the line with the H.P. and the V.P.',
    source: 'N.D. Bhatt, Problem 10-33, p.232 — exact textbook data; the book prints the answer (∠θ = 45°, ∠φ = 30°, true length = 100 mm), reproduced here exactly by lineData.js\'s own resolver.',
    shapeData: { TL: 100, theta: 45, phi: 30, aHP: 29, aVP: -20.71, aLat: 0 },
    givenFields: ['aHP', 'aVP'],
    askFields: ['TL', 'theta', 'phi'],
    target: { TL: 100, theta: 45, phi: 30 },
    hint: 'P sits above the HP and behind the VP; Q sits below the HP and in front — the line runs right through both planes on its way from one end to the other, same trapezoid-rotation method as 10-13/10-18.',
  },

  // ══ Hard — full position problems ═════════════════════════════════════════════
  {
    id: 'rl-10-13-full',
    tier: 'hard',
    title: 'Full solve: TL, both traces, θ and φ (10-13)',
    statement: 'The projectors of the ends of a line AB are 50 mm apart. End A is 20 mm above the H.P. and 30 mm in front of the V.P. End B is 10 mm below the H.P. and 40 mm behind the V.P. Determine the true length and traces of AB, and its inclinations with the two planes.',
    source: 'N.D. Bhatt, Problem 10-13, p.217–218 (exact textbook data).',
    shapeData: { TL: 91.1, theta: 19.23, phi: 50.21, aHP: 20, aVP: 30, aLat: 0 },
    givenFields: ['aHP', 'aVP'],
    askFields: ['TL', 'theta', 'phi', 'htDist', 'vtDist'],
    target: { TL: 91.1, theta: 19.23, phi: 50.21, htDist: -16.67, vtDist: 7.14 },
    hint: 'Everything here follows from the two end positions alone — find the true length first (Method I or II, your choice, exactly as Fig 10-37/10-38 shows), then both traces fall out of producing the projections to meet xy.',
  },
  {
    id: 'rl-10-18-full',
    tier: 'hard',
    title: 'Full solve: same-projector line (10-18)',
    statement: 'The ends of a line PQ are on the same projector. End P is 30 mm below the H.P. and 12 mm behind the V.P. End Q is 55 mm above the H.P. and 45 mm in front of the V.P. Determine the true length and traces of PQ, and its inclinations with the two planes.',
    source: 'N.D. Bhatt, Problem 10-18, p.220–221 — exact textbook data. Note (per the book): when both ends share a projector, Method I cannot be used — Method II (rotate about the projections) is the only route, exactly as Art 10-13\'s own note says.',
    shapeData: { TL: 102.34, theta: 56.15, phi: 33.85, aHP: -30, aVP: -12, aLat: 0 },
    givenFields: ['aHP', 'aVP'],
    askFields: ['TL', 'theta', 'phi', 'htDist', 'vtDist'],
    target: { TL: 102.34, theta: 56.15, phi: 33.85, htDist: 8.12, vtDist: -12.11 },
    hint: 'Same projector means the top view and front view are both single, overlapping strokes — you cannot rotate a view parallel to xy the usual way, so this one needs Method II (erect perpendiculars at each end, per Fig 10-43).',
  },
]);
