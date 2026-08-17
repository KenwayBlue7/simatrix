// Projection sheet — Step 2's first-angle drawing, built as SVG and revealed one stage at a time.
//
// WHY SVG. The sibling Module-4 topic established the SVG "views sheet" for this platform
// (RULES.md §3.6b: pick by 2D richness), and this sheet earns it twice over. It is authored and
// laid out entirely in MILLIMETRES and fitted into the pane with one `viewBox`, so a real
// millimetre reads the same length everywhere on the sheet at every pane size — the measured-drawing
// invariant RULES.md §5.19 protects, obtained here for free rather than by locking a scale against
// a live bbox. And progressive drawing, the thing this step exists to show, is one attribute on a
// DOM node (`stroke-dashoffset` against `pathLength="1"`) instead of a second WebGL pass with its
// own renderer, its own resize contract and its own pixelRatio boundary.
//
// FIRST ANGLE, and why the side view crosses over:
//
//        ┌────────┐    ┌───────────────┐
//        │  RIGHT │    │   ELEVATION   │        the elevation sits at the top
//        │  SIDE  │    │               │        the plan sits below it, aligned
//        └────────┘    └───────────────┘
//                      ┌───────────────┐        the RIGHT side view is drawn on the LEFT
//                      │     PLAN      │        the LEFT  side view is drawn on the RIGHT
//                      └───────────────┘
//
// BLANK PAPER. The sheet draws the object and nothing else — no XY line, no plane tags, no
// quadrant apparatus. Those belong to the lesson that DERIVES first angle from the two planes
// (`graphics_module_1_topic_2_spatial_framework`, and Module 2's own fold). Here the learner is
// being shown what a finished multiview drawing looks like and how it is built up, and a beginner
// meeting HP/VP/XY in the same breath as their first drawing is being asked to learn two things at
// once. The XY ordinate still EXISTS in the layout maths below, as the datum every view is placed
// against — it is simply not drawn (ADR-208).
//
// The crossover is not a rule to memorise, it is what the planes do. The object sits between the
// observer and the plane, so the view from the right lands on the plane BEYOND the object's left,
// and hinging that plane out into the paper carries it to the left of the elevation. The same
// hinge is why the plan's near edge finishes furthest from XY. `objectData.js` states the two
// resulting frames; this file only places them.
//
// THE STAGE LIST IS DERIVED, NEVER TABULATED (RULES.md §3.52). Each view contributes a stage per
// LAYER IT ACTUALLY CARRIES: the stepped block's elevation has no hidden linework and no centre
// line, so it has no hidden or centre stage, and nothing anywhere holds a per-object table of
// stage indices that a fifth object would silently invalidate.
//
// Layering (CLAUDE.md): leaf module. Imports the pure-data `objectData.js` for the frame constants
// it places against, and nothing else — no THREE, no sibling behaviour leaf. It owns its own SVG
// subtree and hands main.js a stage list.

import { FIRST_ANGLE_PLACEMENT, DIM_STYLE, alignedDim } from './objectData.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ---- Sheet metrics, all in millimetres (the sheet's own unit) -------------------------------

/** Clear space between the elevation and the views projected off it. */
const GAP = 26;
/** How far every projector overruns the drawing, as on a real sheet. */
const OVERRUN = 9;
/** Blank paper round the whole drawing. */
const PAD = 14;

/**
 * Dimension geometry — BIS SP 46 Type B (RULES.md §6.19), filled 3:1 heads as on the Points sheet.
 * The numbers come from the data module, because the 3-D dimension layer draws the same standard
 * and the two must not be able to disagree.
 */
const ARROW_LEN = DIM_STYLE.arrow;
const ARROW_HALF = ARROW_LEN / 6;   // 3:1 length : width
const EXT_GAP = DIM_STYLE.extGap;
const EXT_OVER = DIM_STYLE.extOver;
const TEXT_LIFT = DIM_STYLE.textLift;
const LEADER_LAND = DIM_STYLE.leaderLand;

/**
 * A view's caption: its own height, and the clear air between the drawing and it, in sheet mm.
 * `CAPTION_HEIGHT` must match `.psheet__caption`'s `font-size`, because the caption is anchored on
 * its CENTRE and half of it therefore hangs back towards the view.
 */
const CAPTION_HEIGHT = 5;
const CAPTION_AIR = 2.5;

/** Draw-on pacing. One stage is one press, so the whole stage has to land inside a beat. */
const DRAW_MS = 460;
const STAGGER_MS = 55;
const MAX_STAGGER = 8;

const VIEW_ORDER = ['front', 'top', 'side'];

const VIEW_TITLE = { front: 'Elevation', top: 'Plan', side: 'Side view' };
const LAYER_TITLE = {
  construction: 'Construction lines',
  outline: 'Outline',
  hidden: 'Hidden detail',
  centre: 'Centre lines',
};

// ---- Small helpers ---------------------------------------------------------------------------

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const round2 = (v) => Math.round(v * 100) / 100;

/** Every point a primitive touches, in its own view frame — the input to a view's bbox. */
function primPoints(p) {
  switch (p.k) {
    case 'poly': return p.pts;
    case 'line': return [p.a, p.b];
    case 'circle':
    case 'cross': return [[p.c[0] - p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] + p.r]];
    default: return [];
  }
}

function bboxOf(prims) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const p of prims) {
    for (const [x, y] of primPoints(p)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

/** Distinct ordinates a set of primitives touches along one axis, to 0.5 mm, at most `cap` of them. */
function ordinates(prims, index, cap = 12) {
  const seen = new Set();
  for (const p of prims) {
    for (const pt of primPoints(p)) seen.add(Math.round(pt[index] * 2) / 2);
  }
  const list = [...seen].sort((a, b) => a - b);
  if (list.length <= cap) return list;
  // Keep the two extremes and thin the middle evenly — a projector every 2 mm is noise, and the
  // extremes are the ones that carry the overall size.
  const out = [list[0]];
  const stride = (list.length - 1) / (cap - 1);
  for (let i = 1; i < cap - 1; i++) out.push(list[Math.round(i * stride)]);
  out.push(list[list.length - 1]);
  return [...new Set(out)];
}

// ---- Public ------------------------------------------------------------------------------------

/**
 * Mount the sheet.
 *
 * @param {HTMLElement} mount            The element the SVG lives in.
 * @param {{ prefersReducedMotion?: boolean }} [opts]
 * @returns {{
 *   layout: (data: object) => { id:string, view:string, layer:string, title:string, note:string }[],
 *   revealTo: (index: number, animate?: boolean) => number,
 *   stages: () => object[],
 *   dispose: () => void,
 * }}
 */
export function initProjectionSheet(mount, { prefersReducedMotion = false } = {}) {
  let svg = null;
  /** Stage descriptors, in reveal order. */
  let stageList = [];
  /** stage id -> the <g> holding that stage's linework. */
  const stageGroups = new Map();
  /** view key -> the <g> holding that view's projectors, so it can fade once the view is inked. */
  const projectorGroups = new Map();

  function clear() {
    if (svg) svg.remove();
    svg = null;
    stageList = [];
    stageGroups.clear();
    projectorGroups.clear();
  }

  // -- Drawing primitives, all taking SHEET coordinates (mm, +y UP) -----------------------------
  // One `P()` at the emit boundary is the only place the sheet's y-up frame becomes SVG's y-down.

  let flipY = 0;
  const PX = (x) => round2(x);
  const PY = (y) => round2(flipY - y);

  function stroke(g, node, layer, drawable) {
    node.setAttribute('class', `psheet__ink psheet__ink--${layer}`);
    if (drawable) node.setAttribute('pathLength', 1);
    g.appendChild(node);
    return node;
  }

  function emitPrim(g, ox, oy, p, layer, drawable) {
    const X = (x) => PX(ox + x);
    const Y = (y) => PY(oy + y);
    switch (p.k) {
      case 'poly': {
        const d = p.pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${X(x)} ${Y(y)}`).join(' ')
          + (p.close === false ? '' : ' Z');
        stroke(g, el('path', { d }), layer, drawable);
        break;
      }
      case 'line':
        stroke(g, el('line', { x1: X(p.a[0]), y1: Y(p.a[1]), x2: X(p.b[0]), y2: Y(p.b[1]) }), layer, drawable);
        break;
      case 'circle':
        stroke(g, el('circle', { cx: X(p.c[0]), cy: Y(p.c[1]), r: round2(p.r) }), layer, drawable);
        break;
      case 'cross':
        // A centre cross is drawn as two chain lines through the feature, overrunning it — the
        // convention, and the reason a circle never needs a separate "this is round" annotation.
        stroke(g, el('line', { x1: X(p.c[0] - p.r), y1: Y(p.c[1]), x2: X(p.c[0] + p.r), y2: Y(p.c[1]) }), layer, drawable);
        stroke(g, el('line', { x1: X(p.c[0]), y1: Y(p.c[1] - p.r), x2: X(p.c[0]), y2: Y(p.c[1] + p.r) }), layer, drawable);
        break;
      default:
        break;
    }
  }

  /** A filled 3:1 arrowhead whose point is at `tip`, pointing along the unit vector `u`. */
  function arrowHead(g, tip, u) {
    const back = [tip[0] - u[0] * ARROW_LEN, tip[1] - u[1] * ARROW_LEN];
    const n = [-u[1], u[0]];
    const p1 = [back[0] + n[0] * ARROW_HALF, back[1] + n[1] * ARROW_HALF];
    const p2 = [back[0] - n[0] * ARROW_HALF, back[1] - n[1] * ARROW_HALF];
    g.appendChild(el('path', {
      class: 'psheet__arrow',
      d: `M ${PX(tip[0])} ${PY(tip[1])} L ${PX(p1[0])} ${PY(p1[1])} L ${PX(p2[0])} ${PY(p2[1])} Z`,
    }));
  }

  function text(g, at, str, { angle = 0, cls = 'psheet__value', anchor = 'middle' } = {}) {
    const node = el('text', { x: PX(at[0]), y: PY(at[1]), class: cls, 'text-anchor': anchor });
    if (angle) node.setAttribute('transform', `rotate(${round2(-angle)} ${PX(at[0])} ${PY(at[1])})`);
    node.textContent = str;
    g.appendChild(node);
    return node;
  }

  /**
   * One ALIGNED linear dimension (BIS Method 1). Every placement decision — where the dimension
   * line lands, how far the value is turned and which side of the line it sits on — is
   * `alignedDim()`'s, shared with the dimension layer on the solid so the two media cannot drift
   * into two conventions. This function only adds the view's origin and strokes the result.
   */
  function emitDim(g, ox, oy, d) {
    const P = ([x, y]) => [ox + x, oy + y];
    const { u, n, s, A, B, angle, textAt } = alignedDim(d);
    const ends = [[P(d.a), P(A)], [P(d.b), P(B)]];

    for (const [p, q] of ends) {
      g.appendChild(el('line', {
        class: 'psheet__ink psheet__ink--dimension',
        x1: PX(p[0] + n[0] * s * EXT_GAP), y1: PY(p[1] + n[1] * s * EXT_GAP),
        x2: PX(q[0] + n[0] * s * EXT_OVER), y2: PY(q[1] + n[1] * s * EXT_OVER),
      }));
    }
    const [, a2] = ends[0];
    const [, b2] = ends[1];
    g.appendChild(el('line', {
      class: 'psheet__ink psheet__ink--dimension',
      x1: PX(a2[0]), y1: PY(a2[1]), x2: PX(b2[0]), y2: PY(b2[1]),
    }));
    arrowHead(g, a2, [-u[0], -u[1]]);
    arrowHead(g, b2, u);
    text(g, P(textAt), d.text, { angle });
  }

  /**
   * A leader: an arrow on the feature, a sloping leg, a short horizontal landing, the note above it.
   *
   * A DIAMETER is the same mark with its leg started at the far side of the circle, so the leg
   * crosses the centre on its way out, and with a second arrowhead at `head2` on the near side. The
   * two heads then sit at the two ends of the diameter, pointing outwards, and the shelf still
   * carries the value clear of the geometry.
   */
  function emitNote(g, ox, oy, d) {
    const at = [ox + d.at[0], oy + d.at[1]];
    const to = [ox + d.to[0], oy + d.to[1]];
    const dir = Math.sign(to[0] - at[0]) || 1;
    const land = [to[0] + dir * LEADER_LAND, to[1]];
    const u = [at[0] - to[0], at[1] - to[1]];
    const m = Math.hypot(u[0], u[1]) || 1;
    g.appendChild(el('path', {
      class: 'psheet__ink psheet__ink--dimension',
      d: `M ${PX(at[0])} ${PY(at[1])} L ${PX(to[0])} ${PY(to[1])} L ${PX(land[0])} ${PY(land[1])}`,
    }));
    arrowHead(g, at, [u[0] / m, u[1] / m]);
    if (d.head2) arrowHead(g, [ox + d.head2[0], oy + d.head2[1]], [-u[0] / m, -u[1] / m]);
    text(g, [(to[0] + land[0]) / 2, to[1] + TEXT_LIFT], d.text, {
      anchor: dir > 0 ? 'start' : 'end',
    });
  }

  // -- Layout ------------------------------------------------------------------------------------

  /**
   * Lay the whole sheet out for one object and return its stage list. Everything is built hidden;
   * `revealTo()` is the only thing that shows linework, so a re-layout can never leave a stage on
   * screen that the stepper thinks is still to come.
   */
  function layout(data, { sideView = data.sideView } = {}) {
    clear();

    // The learner chooses WHICH side view the drawing carries. Each object's side linework is
    // authored in the frame of its own textbook side, so asking for the other one is a mirror in
    // that view's local x — which is exactly what the two frames differ by (objectData.js states
    // them: right side view is -z, left side view is +z). Mirroring a dimension mirrors its
    // offset normal too, so `off` flips with it or the value lands inside the material.
    const mirrored = sideView !== data.sideView;
    const flipPt = ([x, y]) => [-x, y];
    const flipPrim = (pr) => {
      if (!mirrored) return pr;
      if (pr.k === 'poly') return { ...pr, pts: pr.pts.map(flipPt) };
      if (pr.k === 'line') return { ...pr, a: flipPt(pr.a), b: flipPt(pr.b) };
      return { ...pr, c: flipPt(pr.c) };            // circle / cross
    };
    const flipDim = (d) => {
      if (!mirrored) return d;
      if (d.k === 'dim') return { ...d, a: flipPt(d.a), b: flipPt(d.b), off: -d.off };
      const f = { ...d, at: flipPt(d.at), to: flipPt(d.to) };
      if (d.head2) f.head2 = flipPt(d.head2);
      return f;
    };

    /** The two points a dimension mark actually reaches, whatever kind it is. */
    const dimSpan = (d) => (d.k === 'dim' ? [d.a, d.b] : [d.at, d.to]);

    const views = {
      front: data.views.front,
      top: data.views.top,
      side: data.views.side.map(flipPrim),
    };
    // ALWAYS built. Whether they are SHOWN is `setDimensions()`, a switch the learner can throw at
    // any moment — including mid-construction. Making it a layout input instead meant every flick
    // of the switch rebuilt the stage list, which rewound the drawing to blank paper: turning
    // dimensions ON made the whole drawing disappear, the opposite of what the control says.
    const dims = {
      front: data.dims.front ?? [],
      top: data.dims.top ?? [],
      side: (data.dims.side ?? []).map(flipDim),
    };

    /**
     * The box of the DRAWING ITSELF — outline and visible edges, nothing else.
     *
     * `boxes` below takes in every primitive, centre lines included, and that is right for LAYOUT:
     * a centre line that overhangs the part still needs paper, and the views have to be spaced so
     * it gets some. It is wrong for a CAPTION, because a caption is a label for the drawing and has
     * to be centred on the drawing. The Bearing Block's elevation is the case that showed it: its
     * bore centre line reaches 7 mm past the lug on the left and nothing balances it on the right,
     * so the all-primitives midpoint sits 3.5 mm left of the part and "Elevation" printed visibly
     * off-centre over a view that is itself symmetrical about x = 0.
     *
     * Hidden detail is left out for the same reason it is invisible to the silhouette: it lies
     * inside the outline and can only agree with it.
     */
    const inkBoxes = {
      front: bboxOf(views.front.filter((p) => p.layer === 'outline' || p.layer === 'edge')),
      top: bboxOf(views.top.filter((p) => p.layer === 'outline' || p.layer === 'edge')),
      side: bboxOf(views.side.filter((p) => p.layer === 'outline' || p.layer === 'edge')),
    };

    /**
     * How far outboard a view REACHES, on the side its caption hangs from: its own linework, and
     * then whatever its dimensions actually put beyond that.
     *
     * MEASURED ON THE PLACED MARK, not on its offset. The earlier version added `|off|` to the
     * dimension's own coordinates, which is only true when the offset happens to point the way the
     * caption hangs. A VERTICAL dimension's offset is HORIZONTAL — it moves the mark sideways and
     * adds nothing above the view at all. The Cylindrical Block's elevation carries a boss height
     * thrown 37 mm clear to the LEFT, and that 37 mm was being charged as headroom, pushing
     * "Elevation" 38 mm further up the sheet than anything it had to clear.
     *
     * So the reach is taken from where the mark really lands: `alignedDim()`'s own dimension-line
     * ends for a linear size, the elbow for a leader, and in both cases the value standing one lift
     * off that with half its own height. The same functions that draw it decide it, so it cannot
     * drift from what is on the paper.
     */
    const VALUE_REACH = TEXT_LIFT + DIM_STYLE.textHeight / 2;
    const reachOf = (key, box, set) => {
      const away = key === 'top' ? -1 : 1;
      const outer = (a, b) => (away > 0 ? Math.max(a, b) : Math.min(a, b));
      let reach = away > 0 ? box.maxY : box.minY;
      for (const d of set) {
        const ys = d.k === 'dim'
          ? (({ A, B }) => [A[1], B[1]])(alignedDim(d))
          : dimSpan(d).map(([, y]) => y);
        reach = outer(reach, (away > 0 ? Math.max(...ys) : Math.min(...ys)) + away * VALUE_REACH);
      }
      // Clear air, then half the caption — it is anchored on its centre, not on its baseline.
      return reach + away * (CAPTION_AIR + CAPTION_HEIGHT / 2);
    };

    const boxes = {
      front: bboxOf(views.front),
      top: bboxOf(views.top),
      side: bboxOf(views.side),
    };
    /** Which side of the elevation the chosen side view is drawn on (first angle). */
    const placement = FIRST_ANGLE_PLACEMENT[sideView];

    // View origins in sheet coordinates. The elevation defines the frame: it stands ON the XY line
    // (y = 0) and is centred on x = 0 by the authoring convention.
    const origins = {
      front: [0, 0],
      top: [0, -(GAP + boxes.top.maxY)],
      side: [
        placement === 'left'
          ? boxes.front.minX - GAP - boxes.side.maxX
          : boxes.front.maxX + GAP - boxes.side.minX,
        0,
      ],
    };

    /**
     * Caption heights. The ELEVATION AND THE SIDE VIEW SHARE ONE LINE.
     *
     * They stand on the same band of the sheet — both origins are at y = 0, and first angle puts
     * them side by side across the top — so their names are one row of headings and have to read as
     * one. Left to their own clearances they drift apart by whatever the two views happen to carry:
     * the Cylindrical Block's elevation has a boss height thrown 37 mm clear of the part while its
     * side view carries a single 12 mm lane, which put "Elevation" 45 mm above "Right side view"
     * over two drawings standing on the same line.
     *
     * So the pair takes the OUTER of the two reaches. Whichever view needs more room sets the row,
     * and the other rises to meet it — never a nudge on one of them, which would go stale the
     * moment either view's dimensions changed.
     *
     * The plan is not part of that row. It hangs off the far side of its own view, below, with its
     * own clearance, and nothing else shares that band.
     */
    const reaches = {
      front: reachOf('front', boxes.front, dims.front),
      top: reachOf('top', boxes.top, dims.top),
      side: reachOf('side', boxes.side, dims.side),
    };
    const topRow = Math.max(reaches.front, reaches.side);
    const capY = { front: topRow, top: reaches.top, side: topRow };

    // The 45 deg mitre line, which is how depth actually gets from the plan to the side view by
    // hand. Both views are affine in the same world z, so the mapping between them is a straight
    // 45 deg line; its slope carries the sign flip between the two frames.
    const slope = placement === 'left' ? 1 : -1;
    const mitreC = origins.side[0] - slope * origins.top[1];

    // -- Sheet extents ---------------------------------------------------------------------------
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    const swallow = (x, y) => {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    };
    for (const key of VIEW_ORDER) {
      const [ox, oy] = origins[key];
      const b = boxes[key];
      swallow(ox + b.minX, oy + b.minY);
      swallow(ox + b.maxX, oy + b.maxY);
      // Dimensions and captions hang outboard of the linework. The offset is applied along the
      // measured direction's normal, which can be either axis, so the allowance has to be made on
      // BOTH — an allowance made sideways only clips a vertical dimension's value off the edge
      // (RULES.md §3.60: one margin does not serve both axes).
      for (const d of dims[key]) {
        const pts = dimSpan(d);
        const pad = d.k === 'dim' ? Math.abs(d.off) + 12 : LEADER_LAND + 22;
        for (const [x, y] of pts) { swallow(ox + x - pad, oy + y - pad); swallow(ox + x + pad, oy + y + pad); }
      }
    }
    swallow(minX - OVERRUN, 0);
    swallow(maxX + OVERRUN, 0);
    // The mitre corner sits outside every view, in the quadrant between the plan and the side view.
    swallow(mitreC + slope * (origins.top[1] + boxes.top.minY), origins.top[1] + boxes.top.minY);

    const x0 = minX - PAD; const x1 = maxX + PAD;
    const y0 = minY - PAD; const y1 = maxY + PAD;
    flipY = y1;

    svg = el('svg', {
      class: 'psheet__svg',
      viewBox: `${round2(x0)} 0 ${round2(x1 - x0)} ${round2(y1 - y0)}`,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': `First-angle orthographic drawing of the ${data.name}: elevation at the top, `
        + `plan below it, ${sideView} side view to the ${placement} of the elevation.`,
    });
    // `PY()` already maps sheet y = y1 to SVG y = 0 and sheet y = y0 to SVG y = y1 - y0, which is
    // exactly the viewBox above — so the root group carries no transform of its own.
    const root = el('g');
    svg.appendChild(root);

    // -- Stage assembly -------------------------------------------------------------------------
    stageList = [];

    /** Open a stage group; it stays hidden until `revealTo()` reaches it. */
    function openStage(id, view, layer, title, note) {
      const g = el('g', { class: `psheet__stage psheet__stage--${layer}` });
      root.appendChild(g);
      stageGroups.set(id, g);
      stageList.push({ id, view, layer, title, note });
      return g;
    }

    for (const key of VIEW_ORDER) {
      const [ox, oy] = origins[key];
      const prims = views[key];
      const b = boxes[key];

      // ---- Construction ------------------------------------------------------------------------
      const cid = `${key}:construction`;
      const gStage = openStage(
        cid, key, 'construction',
        `${captionFor(key, sideView)} — construction`,
        constructionNote(key, sideView, placement),
      );
      // The WORKING lines go in their own subgroup, which is the thing that fades. Its parent
      // stage also holds the datum (below), which must not.
      const gC = el('g', { class: 'psheet__proj' });
      gStage.appendChild(gC);
      projectorGroups.set(key, gStage);

      if (key === 'front') {
        // Blank paper: the enclosing rectangle of the elevation and nothing else. The XY ordinate
        // is still the datum the layout above places every view against — it is simply not drawn
        // (see the header note; ADR-208).
        emitPrim(gC, ox, oy, {
          k: 'poly', pts: [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]], close: true,
        }, 'construction', true);
      } else if (key === 'top') {
        // Verticals carrying every width down out of the elevation. This is the alignment the
        // whole drawing depends on, so it is drawn before the plan exists, not after.
        for (const x of ordinates(views.front, 0)) {
          emitPrim(gC, 0, 0, {
            k: 'line',
            a: [x, boxes.front.minY - 2],
            b: [x, oy + b.minY - OVERRUN],
          }, 'construction', true);
        }
      } else {
        // Horizontals carrying every height across out of the elevation...
        const xFar = placement === 'left' ? ox + b.minX - OVERRUN : ox + b.maxX + OVERRUN;
        const xNear = placement === 'left' ? boxes.front.minX + 2 : boxes.front.maxX - 2;
        for (const y of ordinates(views.front, 1)) {
          emitPrim(gC, 0, 0, { k: 'line', a: [xNear, y], b: [xFar, y] }, 'construction', true);
        }
        // ...and the 45 deg mitre, which is how the DEPTH gets there from the plan.
        const zs = [origins.top[1] + boxes.top.minY - 4, origins.top[1] + boxes.top.maxY + 4];
        emitPrim(gC, 0, 0, {
          k: 'line',
          a: [mitreC + slope * zs[0], zs[0]],
          b: [mitreC + slope * zs[1], zs[1]],
        }, 'construction', true);
        for (const yPlan of [origins.top[1] + boxes.top.minY, origins.top[1] + boxes.top.maxY]) {
          const xm = mitreC + slope * yPlan;
          emitPrim(gC, 0, 0, { k: 'line', a: [placement === 'left' ? boxes.top.minX : boxes.top.maxX, yPlan], b: [xm, yPlan] }, 'construction', true);
          emitPrim(gC, 0, 0, { k: 'line', a: [xm, yPlan], b: [xm, b.minY - 2] }, 'construction', true);
        }
      }

      // ---- Outline / hidden / centre --------------------------------------------------------
      for (const layer of ['outline', 'hidden', 'centre']) {
        // The silhouette and the internal visible geometry are two WEIGHTS of one idea — "what you
        // can see" — so they are inked in the same press. Splitting them into two stages would add
        // a beat that says nothing the previous one did not (RULES.md §3.53).
        const set = prims.filter((p) => (layer === 'outline'
          ? (p.layer === 'outline' || p.layer === 'edge')
          : p.layer === layer));
        if (!set.length) continue;   // no stage for a layer this view does not carry
        const g = openStage(
          `${key}:${layer}`, key, layer,
          `${captionFor(key, sideView)} — ${LAYER_TITLE[layer].toLowerCase()}`,
          layerNote(key, layer, sideView),
        );
        // The primitive's OWN layer decides its weight, not the stage's. The outline stage holds
        // both the silhouette and the internal visible geometry, and they are drawn at different
        // widths — passing the stage's name here classed every edge as a silhouette.
        for (const p of set) emitPrim(g, ox, oy, p, p.layer, layer === 'outline');
      }

      // A view's caption, revealed with its outline.
      //
      // Placed clear of that view's own DIMENSIONS, not just its linework. Captions hang on the
      // far side of the view from the XY line, which is exactly where an overall size wants to go
      // too; a fixed clearance measured off the outline puts the two on top of each other the
      // moment a view carries a dimension out there (RULES.md §3.60 — re-check caption fit against
      // what is actually drawn, per axis).
      const capG = stageGroups.get(`${key}:outline`);
      if (capG) {
        // ACROSS: the middle of the drawing. DOWN: the band this view's caption shares.
        const ink = inkBoxes[key];
        text(capG, [ox + (ink.minX + ink.maxX) / 2, oy + capY[key]],
          captionFor(key, sideView), { cls: 'psheet__caption' });
      }
    }

    // ---- Dimensions --------------------------------------------------------------------------
    const anyDims = VIEW_ORDER.some((k) => dims[k].length);
    if (anyDims) {
      const g = openStage(
        'dims', 'all', 'dimension',
        'Dimensioning',
        'Last, the sizes. Each one is written along the line it measures and sits just above it, '
          + 'so you read the sheet from the bottom or from the right. Every size is given ONCE, on '
          + 'the view that shows that feature best.',
      );
      for (const key of VIEW_ORDER) {
        const [ox, oy] = origins[key];
        for (const d of dims[key]) {
          if (d.k === 'dim') emitDim(g, ox, oy, d);
          else emitNote(g, ox, oy, d);
        }
      }
    }

    mount.appendChild(svg);
    // After the SVG is in the document, so it has a laid-out box to measure against.
    syncInkScale();
    requestAnimationFrame(syncInkScale);
    revealTo(-1, false);
    return stageList;
  }

  // -- Copy the stage list carries ---------------------------------------------------------------

  function captionFor(key, sideView) {
    if (key !== 'side') return VIEW_TITLE[key];
    return sideView === 'right' ? 'Right side view' : 'Left side view';
  }

  function constructionNote(key, sideView, placement) {
    if (key === 'front') {
      return 'Start with a light box the size of the whole front view — as long as the object and '
        + 'as tall. Thin lines, because they are only there to build on.';
    }
    if (key === 'top') {
      return 'Drop lines straight down from the front view. You never measure the length again: '
        + 'the view above has already fixed it, and these lines are what carry it down.';
    }
    return `Heights come straight across from the front view. The DEPTH comes round from the plan `
      + `through the 45° line — that is the trick that turns a depth measured downwards into the `
      + `same depth measured sideways. You picked the view from the ${sideView}, so it is drawn on `
      + `the ${placement}: in first-angle projection each side view goes to the OPPOSITE side.`;
  }

  function layerNote(key, layer, sideView) {
    const view = captionFor(key, sideView).toLowerCase();
    switch (layer) {
      case 'outline':
        return `The real edges of the ${view}, drawn thick and solid — the ones you could see if `
          + 'the object were in front of you. The building lines fade back now.';
      case 'hidden':
        return `Edges hidden inside the material, drawn as short dashes. Without them nobody can `
          + 'tell there is a hole there at all — so dashes are not decoration, they are information.';
      default:
        return `A long chain line through the middle of anything round. It says "this is round, and `
          + 'this is where its centre is" without writing a word.';
    }
  }

  // -- Reveal --------------------------------------------------------------------------------------

  /**
   * Show stages 0..index, hide the rest, and return the number of milliseconds the newest stage
   * needs to finish. main.js gates its own forward control on that, so nothing can be pressed past
   * half-drawn (RULES.md §3.49).
   *
   * Going BACKWARDS never animates: a Back that replays the drawing is a Back the learner cannot
   * use to check something they just missed.
   */
  function revealTo(index, animate = true) {
    let duration = 0;
    stageList.forEach((stage, i) => {
      const g = stageGroups.get(stage.id);
      if (!g) return;
      const on = i <= index;
      const fresh = animate && on && i === index;
      g.classList.toggle('is-on', on);
      const strokes = fresh ? [...g.querySelectorAll('[pathLength]')] : [];
      strokes.forEach((node, k) => {
        const delay = Math.min(k, MAX_STAGGER) * STAGGER_MS;
        node.style.transitionDuration = `${DRAW_MS}ms`;
        node.style.transitionDelay = `${delay}ms`;
      });
      if (fresh) {
        duration = prefersReducedMotion
          ? 0
          : DRAW_MS + Math.min(strokes.length, MAX_STAGGER) * STAGGER_MS;
      }
      if (!fresh) {
        for (const node of g.querySelectorAll('[pathLength]')) {
          node.style.transitionDelay = '0ms';
        }
      }
    });

    // Projection lines animate, then fade. Once a view carries its own outline the projectors have
    // done their job, so they drop to a ghost; by the time the sheet is being dimensioned they are
    // gone altogether, because a dimensioned drawing is a finished drawing.
    const reached = (id) => stageList.findIndex((s) => s.id === id) <= index
      && stageList.some((s) => s.id === id);
    const dimsDone = stageList.length && stageList[stageList.length - 1].layer === 'dimension'
      && index >= stageList.length - 1;
    for (const [key, g] of projectorGroups) {
      g.classList.toggle('is-faded', reached(`${key}:outline`) && !dimsDone);
      g.classList.toggle('is-gone', dimsDone);
    }
    return duration;
  }

  /**
   * Show or hide every dimension, note and value on the sheet, at any point in the construction.
   *
   * A class on the mount rather than a relayout: the linework is untouched, the stage list is
   * untouched, and a learner half way through a drawing keeps their place.
   */
  function setDimensions(on) {
    mount.classList.toggle('is-nodims', !on);
  }

  /**
   * Publish how many sheet-millimetres one device pixel is, so the line alphabet can be authored in
   * the benchmark's PIXELS while the geometry stays in millimetres.
   *
   * The sheet is fitted with `preserveAspectRatio`, so its scale depends on both the drawing's own
   * extent and the pane it lands in — 1.95 to 2.30 px/mm across the four objects at one window
   * size, and different again at another. A fixed millimetre stroke would therefore render at a
   * different weight on every object, which is exactly the drift this replaces. Called on layout
   * and on resize; there is nothing to recompute in between, because neither input changes.
   */
  function syncInkScale() {
    if (!svg) return;
    const vb = svg.viewBox.baseVal;
    const r = svg.getBoundingClientRect();
    if (!vb.width || !vb.height || !r.width || !r.height) return;
    const scale = Math.min(r.width / vb.width, r.height / vb.height);
    if (scale > 0) svg.style.setProperty('--ink-scale', String(1 / scale));
  }

  return {
    layout,
    revealTo,
    setDimensions,
    syncInkScale,
    stages: () => stageList,
    dispose() { clear(); },
  };
}
