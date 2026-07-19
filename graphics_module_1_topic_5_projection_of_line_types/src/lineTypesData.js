// lineTypesData.js — pure data layer for "Projection of Straight Lines — Types of Lines"
// (no Three.js, no DOM). This topic is a CONCEPTUAL teaching tour of the six standard
// positions a straight line can take relative to HP and VP — NOT a numerical problem solver.
//
// It carries three things:
//   • LineCase + resolveLine()  — the geometry resolver, shared with the Lines problem topic:
//     it turns raw parameters (case, TL, θ, φ, end-A distances) into signed endpoint mm plus
//     every derived view metric (fvLen, tvLen, true θ/φ, apparent α/β, point/true flags).
//   • STEPS — the six guided line-type lessons (one standard position per step). Each step
//     LOCKS its case + the angles it does not teach, and declares which controls are meaningful.
//   • TERMS — the inline glossary the step copy links to.
//
// World/engineering axes (Module-1 family convention, identical to the Lines topic):
//   x = lateral position along the XY fold line
//   y = height ABOVE HP            (distHP)
//   z = depth IN FRONT OF VP       (distVP)
//   HP = XZ plane (y=0) · VP = XY plane (z=0) · fold line = X-axis · 1 world unit = 10 mm.

export const LineCase = Object.freeze({
  PARALLEL_BOTH: 'PARALLEL_BOTH', // ∥ HP and ∥ VP          → FV = TV = TL, both ∥ XY
  PERP_HP:       'PERP_HP',       // ⟂ HP, ∥ VP             → TV is a point, FV = TL
  PERP_VP:       'PERP_VP',       // ⟂ VP, ∥ HP             → FV is a point, TV = TL
  INCL_HP:       'INCL_HP',       // inclined θ to HP, ∥ VP  → FV = TL @ θ, TV foreshortened
  INCL_VP:       'INCL_VP',       // inclined φ to VP, ∥ HP  → TV = TL @ φ, FV foreshortened
  INCL_BOTH:     'INCL_BOTH',     // inclined to both        → FV < TL, TV < TL (Rotation Method)
});

// Canonical starting state — a 70 mm line, end A held 18 mm above HP / 18 mm in front of VP,
// lying parallel to both planes (the Step-1 position). Each step overrides `case` + the angles
// it locks; TL persists as the learner drags it. aLat only shifts absolute x — the rig re-centres
// every line on its own mid-lateral, so it never affects framing.
export function defaultTypeData() {
  return { case: LineCase.PARALLEL_BOTH, TL: 70, theta: 0, phi: 0, aHP: 18, aVP: 18, aLat: -35 };
}

const DEG = Math.PI / 180, deg = (r) => r * 180 / Math.PI;

/**
 * Resolve raw line parameters into endpoints + view metrics.
 * @returns {{A,B,d:{x,y,z},tl,fvLen,tvLen,theta,phi,alpha,beta,valid}}
 */
export function resolveLine(data) {
  const TL = data.TL, th = data.theta * DEG, ph = data.phi * DEG;
  let dx, dy, dz, valid = true;

  switch (data.case) {
    case LineCase.PARALLEL_BOTH: dx = TL;                 dy = 0;               dz = 0;                 break;
    case LineCase.PERP_VP:       dx = 0;                  dy = 0;               dz = TL;                break;
    case LineCase.PERP_HP:       dx = 0;                  dy = TL;              dz = 0;                 break;
    case LineCase.INCL_HP:       dx = TL * Math.cos(th);  dy = TL * Math.sin(th); dz = 0;               break;
    case LineCase.INCL_VP:       dx = TL * Math.cos(ph);  dy = 0;               dz = TL * Math.sin(ph); break;
    case LineCase.INCL_BOTH: {
      // θ fixes the rise (Δy), φ fixes the depth change (Δz); the lateral run is whatever is
      // left over. Physically valid only while sin²θ + sin²φ ≤ 1 (i.e. θ + φ ≤ 90°).
      dy = TL * Math.sin(th); dz = TL * Math.sin(ph);
      const lat2 = TL * TL - dy * dy - dz * dz;
      valid = lat2 >= 0;
      dx = Math.sqrt(Math.max(0, lat2));
      break;
    }
    default: dx = TL; dy = 0; dz = 0;
  }

  const A = { x: data.aLat,      y: data.aHP,      z: data.aVP };
  const B = { x: data.aLat + dx, y: data.aHP + dy, z: data.aVP + dz };

  const hRun  = Math.hypot(dx, dz);
  const tl    = Math.hypot(dx, dy, dz);
  const fvLen = Math.hypot(dx, dy);           // front view length (VP: x,y)
  const tvLen = Math.hypot(dx, dz);           // top view length   (HP: x,z)
  const theta = deg(Math.atan2(Math.abs(dy), hRun));
  const phi   = deg(Math.atan2(Math.abs(dz), Math.hypot(dx, dy)));
  const eps = 1e-6;
  const alpha = deg(Math.atan2(Math.abs(dy), Math.abs(dx) + eps));
  const beta  = deg(Math.atan2(Math.abs(dz), Math.abs(dx) + eps));

  return { A, B, d: { x: dx, y: dy, z: dz }, tl, fvLen, tvLen, theta, phi, alpha, beta, valid };
}

// ============================================================================
// STEPS — the six standard positions, one per step. Each is an independent mini-lesson.
//   • `set`      LOCKS the case + the angles this step does NOT teach (so the line is already
//                correctly positioned on entry). TL is never in `set` — it persists across steps.
//   • `controls` the ONLY meaningful controls for this line type (dynamic parameter panel).
//   • `cam`      the vantage main.js gently glides the free-orbit camera to on entry, so each
//                type reads clearly before the learner orbits.
//   • body       the explanation panel — What is happening / Why / What to observe (kept concise).
// ============================================================================

const T = (k, label) => `<button class="term" data-t="${k}">${label}</button>`;

export const STEPS = [
  {
    id: 'parallel-both',
    n: 1,
    title: 'Parallel to both HP and VP',
    railLabel: 'Parallel to both',
    lead: 'The simplest line: it lies flat, square to the floor and the wall.',
    body: [
      `<b>What:</b> the line runs level and straight across, ${T('parallel','parallel')} to both the ${T('hp','HP')} and the ${T('vp','VP')}. Both angles are zero: θ = 0°, φ = 0°.`,
      `<b>Why:</b> because the line never leans away from either plane, neither view is squashed — the ${T('fv','front view')} and the ${T('tv','top view')} both come out at the full ${T('tl','true length')}.`,
      `<b>Observe:</b> drag Length and watch the 3D stick and <i>both</i> views grow together, always equal. No ${T('foreshorten','foreshortening')} anywhere.`,
    ],
    hint: 'Drag Length — the stick, the front view and the top view all stay equal (both = True Length).',
    spotlight: 'two-views',
    set: { case: LineCase.PARALLEL_BOTH, theta: 0, phi: 0 },
    controls: ['tl', 'fold'],
    cam: { pos: [-21, 15, 22], target: [0, 2, 0] },
    orbitHint: true,
  },
  {
    id: 'perp-hp',
    n: 2,
    title: 'Perpendicular to HP, parallel to VP',
    railLabel: '⟂ HP',
    lead: 'Stand the line straight up from the floor.',
    body: [
      `<b>What:</b> the line is ${T('perp','perpendicular')} to the ${T('hp','HP')} (it points straight up) while staying parallel to the ${T('vp','VP')}.`,
      `<b>Why:</b> looking straight <i>down</i> for the ${T('tv','top view')}, the whole vertical line stacks onto a single spot — so the top view collapses to a <b>point</b>. Looking at the wall, the ${T('fv','front view')} sees the line side-on at its full ${T('tl','true length')}.`,
      `<b>Observe:</b> the top view is one dot; the front view is a vertical line equal to the real length. Drag Length — only the front view changes; the point stays a point.`,
    ],
    hint: 'Top view = a point. Front view = True Length. A view becomes a point when the line points straight at it.',
    spotlight: 'point-view',
    set: { case: LineCase.PERP_HP, theta: 90, phi: 0 },
    controls: ['tl', 'fold'],
    cam: { pos: [-19, 18, 23], target: [0, 3, 0] },
  },
  {
    id: 'perp-vp',
    n: 3,
    title: 'Perpendicular to VP, parallel to HP',
    railLabel: '⟂ VP',
    lead: 'Push the line straight into the wall.',
    body: [
      `<b>What:</b> the line is ${T('perp','perpendicular')} to the ${T('vp','VP')} (it drives straight back into the wall) while staying parallel to the ${T('hp','HP')}.`,
      `<b>Why:</b> looking horizontally at the wall for the ${T('fv','front view')}, the line points straight at you and stacks onto one spot — the front view collapses to a <b>point</b>. Looking down, the ${T('tv','top view')} sees its full ${T('tl','true length')}.`,
      `<b>Observe:</b> the exact mirror of the last position — front view is a dot, top view is True Length. It is the plane the line aims at that receives the point.`,
    ],
    hint: 'Front view = a point. Top view = True Length. The mirror image of the previous position.',
    set: { case: LineCase.PERP_VP, theta: 0, phi: 90 },
    controls: ['tl', 'fold'],
    cam: { pos: [-24, 13, 17], target: [0, 2, 2] },
  },
  {
    id: 'incl-hp',
    n: 4,
    title: 'Inclined to HP, parallel to VP',
    railLabel: 'Inclined to HP',
    lead: 'Tilt the line up from the floor — but keep it flat against the wall.',
    body: [
      `<b>What:</b> the line leans up from the ${T('hp','HP')} by an angle ${T('theta','θ')}, staying parallel to the ${T('vp','VP')}.`,
      `<b>Why:</b> the line lies flat in a plane parallel to the wall, so the ${T('fv','front view')} still sees its full ${T('tl','true length')} — tilted at θ. But seen from above, the tilt hides part of the length, so the ${T('tv','top view')} ${T('foreshorten','foreshortens')} to TL·cos θ.`,
      `<b>Observe:</b> slide θ from 0° to 90°. The front view keeps its length and swings up; the top view shrinks — reaching a point at 90° (which is exactly the ⟂ HP position).`,
    ],
    hint: 'Slide θ — front view stays True Length, top view shortens. This is foreshortening.',
    spotlight: 'foreshorten',
    set: { case: LineCase.INCL_HP, theta: 35, phi: 0 },
    controls: ['tl', 'theta', 'fold'],
    cam: { pos: [-18, 15, 23], target: [0, 3, 0] },
  },
  {
    id: 'incl-vp',
    n: 5,
    title: 'Inclined to VP, parallel to HP',
    railLabel: 'Inclined to VP',
    lead: 'Swing the line away from the wall — but keep it level with the floor.',
    body: [
      `<b>What:</b> the line swings away from the ${T('vp','VP')} by an angle ${T('phi','φ')}, staying parallel to the ${T('hp','HP')}.`,
      `<b>Why:</b> the line stays level, so the ${T('tv','top view')} sees its full ${T('tl','true length')} — turned at φ. Seen from the front, the swing hides part of it, so the ${T('fv','front view')} ${T('foreshorten','foreshortens')} to TL·cos φ.`,
      `<b>Observe:</b> slide φ from 0° to 90°. The top view keeps its length and turns; the front view shrinks — reaching a point at 90° (the ⟂ VP position). The exact mirror of Step 4.`,
    ],
    hint: 'Slide φ — top view stays True Length, front view shortens. Mirror of the previous step.',
    set: { case: LineCase.INCL_VP, theta: 0, phi: 35 },
    controls: ['tl', 'phi', 'fold'],
    cam: { pos: [-24, 13, 17], target: [0, 2, 2] },
  },
  {
    id: 'incl-both',
    n: 6,
    title: 'Inclined to both HP and VP',
    railLabel: 'Inclined to both',
    lead: 'The general case — and the reason the Rotation Method exists.',
    body: [
      `<b>What:</b> the line now leans away from <i>both</i> planes: ${T('theta','θ')} with the ${T('hp','HP')} and ${T('phi','φ')} with the ${T('vp','VP')}. A real line only holds together while θ + φ ≤ 90°.`,
      `<b>Why:</b> tilted every way, <i>neither</i> view escapes ${T('foreshorten','foreshortening')} — both the ${T('fv','front view')} and the ${T('tv','top view')} come out shorter than the real stick. No single view shows the ${T('tl','true length')} any more.`,
      `<b>Observe:</b> open <b>Rotation Method</b>. It swings each foreshortened view parallel to XY until it lies flat to a plane — and that rotated line reads the recovered True Length and the true angles θ and φ.`,
    ],
    hint: 'Both views are now shorter than True Length. Use Rotation Method to swing them flat and recover it.',
    spotlight: 'true-length',
    set: { case: LineCase.INCL_BOTH, theta: 30, phi: 30 },
    controls: ['tl', 'theta', 'phi', 'rotation', 'fold'],
    cam: { pos: [-22, 16, 22], target: [0, 3, 0] },
  },
];

export const STEP_COUNT = STEPS.length;

export const TERMS = {
  hp:   { label: 'Horizontal Plane (HP)', def: 'The flat teal reference plane — the floor. The top view is projected onto it.' },
  vp:   { label: 'Vertical Plane (VP)',   def: 'The upright amber reference plane — the wall. The front view is projected onto it.' },
  xy:   { label: 'XY line',               def: 'The reference (ground) line where HP and VP meet. Every view is measured from it.' },
  tl:   { label: 'True Length (TL)',      def: 'The real, unforeshortened length of the line in space.' },
  fv:   { label: 'Front View (Elevation)', def: "The line's projection onto the VP — what you see looking horizontally at the wall." },
  tv:   { label: 'Top View (Plan)',        def: "The line's projection onto the HP — what you see looking straight down at the floor." },
  theta: { label: 'θ — inclination with HP', def: 'The true angle the line makes with the Horizontal Plane (the floor).' },
  phi:  { label: 'φ — inclination with VP',  def: 'The true angle the line makes with the Vertical Plane (the wall).' },
  parallel: { label: 'Parallel', def: 'A line is parallel to a plane when it never gets nearer to or further from it — its projection on that plane is the full true length.' },
  perp: { label: 'Perpendicular', def: 'A line is perpendicular to a plane when it points straight at it. Its projection on that plane shrinks to a single point.' },
  foreshorten: { label: 'Foreshortening', def: 'The way a tilted line looks shorter than it really is, because it leans away from you — like a pencil pointed at your eye. A view is foreshortened whenever the line is not parallel to that plane.' },
  projector: { label: 'Projector', def: 'A thin construction line dropped perpendicular from a point in space to a plane.' },
  rotation: { label: 'Rotation Method', def: 'To recover the true length of a line inclined to both planes, swing one view until it is parallel to XY. The line then lies flat to a plane, so the other view reads the real length and the true angle.' },
};
