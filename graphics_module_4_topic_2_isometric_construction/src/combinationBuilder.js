// Combination builder — N solids from `shapeData` folded into ONE synthetic solid.
//
// WHY THIS FILE IS THE WHOLE EXTENSION. The textbook's §16.8 says the procedure for a combination
// is *the same procedure*: "Drawing procedure for the isometric projection of a combination of two
// or more solids is similar to that of individual solids. The point to be specially considered is
// the relative position of them." So a combination is not a new kind of subject and must not become
// one — it is the existing subject with one extra fact, WHERE each solid sits.
//
// That is exactly what this module encodes. It takes an ordered list of solid ids (bottom first),
// seats each one on the top face of the one below, and returns an object that satisfies the SAME
// contract `shapeData.js` documents for a solid:
//
//   dims · axisSymbols · bounds(d) · body(d) · views(d) · construction(d) · extraDims(d)
//   · trueDiameterInProjection · formNote · name · blurb
//
// Because the contract is identical, EVERY consumer downstream is untouched by the existence of
// combinations: `shapeFactory`, `constructionEngine`, `orthographicDrawer`, `dimensionLayer`,
// `uiManager` and `main.js` keep interpreting one solid, and neither they nor `rebuild()` ever
// learn whether that solid came from `SOLIDS` or from here (ADR-043's rule, one level up).
//
// THE SEATING CONVENTION does all the placement work, and it costs one number. Every solid in
// `shapeData` is already authored resting on its own y = 0 and centred in plan, so placing a part is
// setting its `y` to the running height of the stack. Parts therefore meet FACE TO FACE — never
// interpenetrating, never floating — which is the only relationship the textbook's examples pose
// ("surmounted over", "placed centrally over", "resting centrally on top of").
//
// KEY NAMESPACING. Two cones in one combination both declare a `diameter`, so every component's
// dimension keys are prefixed `p0_`, `p1_`, … The prefix is applied to the FIELD LIST the dock is
// built from and unwound again before a component's own functions are called, so no solid in
// `shapeData` knows it is part of a combination and no consumer has to know a key was renamed.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO. No free positioning, no rotation, no constraint solving,
// no per-combination special cases. There is no `if (combination === 'cone-on-slab')` here or
// anywhere else — a combination is a LIST, and the list is interpreted generically.
//
// Layering (CLAUDE.md): leaf DATA module. Imports the stateless `shapeData` util only (RULES.md
// §3.6a). Knows nothing about THREE, the DOM, the scene or the UI.

import { SOLIDS, getSolid, resolveDims } from './shapeData.js';

/** Fewest components that make a combination a combination. */
export const MIN_PARTS = 2;

/**
 * Most components the UI offers.
 *
 * The MODEL has no limit — `layout()` is a running sum and every consumer already iterates — so this
 * is a teaching cap, not a technical one: the textbook poses two-solid combinations throughout
 * §16.8, and a stack deeper than four stops fitting the framing radius the camera rig derives.
 */
export const MAX_PARTS = 4;

/** The prefix a component's dimension keys carry inside a combination. */
const prefix = (i) => `p${i}_`;

/** Tier word shown against each row of the builder, and used in the announcements. */
export function tierLabel(index, total) {
  if (index === 0) return 'Base';
  if (index === total - 1) return 'On top';
  return `Then`;
}

/** The solids a component may be. Every solid in the registry is allowed in every position. */
export function combinableSolids() {
  return SOLIDS.map((s) => ({ id: s.id, name: s.name }));
}

/**
 * The combination the sim opens on when the learner first switches to combination mode: the
 * textbook's own opening example (§16.8, Fig. 16.26 — a cone placed over a square slab).
 */
export function defaultCombination() {
  return [{ solidId: 'square-prism' }, { solidId: 'cone' }];
}

/** Pull one component's own dimension set back out of the prefixed set. */
function unprefix(solid, index, d) {
  const pre = prefix(index);
  const out = {};
  for (const f of solid.dims) out[f.key] = d[pre + f.key];
  return out;
}

/**
 * Resolve the stack: each component's own dimensions, its own bounds, and the height its base sits
 * at. One pass, one running sum — which is the whole of what stacking costs when every solid is
 * authored resting on its own y = 0.
 */
function layout(parts, d) {
  const units = [];
  let y = 0;
  parts.forEach((part, i) => {
    const solid = getSolid(part.solidId);
    const dims = unprefix(solid, i, d);
    const bounds = solid.bounds(dims);
    units.push({ index: i, solid, dims, bounds, y });
    y += bounds.height;
  });
  return units;
}

/**
 * Shift one construction primitive up the stack.
 *
 * THE one switch, over the construction primitive vocabulary `shapeData.js` documents — never over
 * solid names. A primitive is pure data with known height fields, so seating a component is a pure
 * transform of its own stage list and `constructionEngine.js` needs no knowledge of combinations
 * at all.
 */
function shiftPrimitive(p, dy) {
  switch (p.k) {
    case 'axisLine': return { ...p, y0: p.y0 + dy, y1: p.y1 + dy };
    case 'ring': return { ...p, y: p.y + dy };
    case 'poly': return { ...p, y: p.y + dy };
    case 'verticals': return { ...p, y0: p.y0 + dy, y1: p.y1 + dy };
    case 'spokes': return { ...p, y: p.y + dy, apexY: p.apexY + dy };
    case 'generators': return { ...p, y0: p.y0 + dy, y1: p.y1 + dy };
    case 'edges': return { ...p, y0: p.y0 + dy, y1: p.y1 + dy };
    case 'marker': return { ...p, y: p.y + dy };
    case 'billboard': return { ...p, y: p.y + dy };
    default: return p;
  }
}

/** Offset one 2D view primitive within the composed view. `cx`/`cy` are the sheet's own convention. */
const offsetShape = (s, dx, dy) => ({ ...s, cx: (s.cx ?? 0) + dx, cy: (s.cy ?? 0) + dy });

/**
 * Name the combination the way the textbook names it — top solid first, seated solid last:
 * "Cone on Square Prism", "Sphere on Hexagonal Prism".
 */
function combinationName(parts) {
  const names = parts.map((p) => getSolid(p.solidId).name);
  return [...names].reverse().join(' on ');
}

/**
 * Build the synthetic solid for one combination.
 *
 * @param {{solidId: string}[]} parts  Ordered BOTTOM FIRST. Each entry names a solid in `SOLIDS`.
 * @returns {import('./shapeData.js').Solid & {
 *   isCombination: true,
 *   partBoxes: (d: Record<string, number>) => {id:string,label:string,width:number,depth:number,height:number,y:number}[],
 * }}
 */
export function buildCombination(parts) {
  const list = (parts?.length ? parts : defaultCombination()).slice(0, MAX_PARTS);
  const solids = list.map((p) => getSolid(p.solidId));

  // ---- The dimension fields, namespaced per component -----------------------------------------
  // Each field keeps its own symbol, range and optional/auto metadata — a frustum inside a
  // combination is still a frustum whose top diameter the learner may withhold — and gains two
  // pieces of grouping data the dock reads: which component it belongs to, and whether that
  // component is drawn at true size in an isometric projection (Step 5's per-row scale).
  const dims = [];
  solids.forEach((solid, i) => {
    const pre = prefix(i);
    for (const f of solid.dims) {
      const field = {
        ...f,
        key: pre + f.key,
        part: solid.name,
        partIndex: i,
        trueSize: Boolean(solid.trueDiameterInProjection),
      };
      // `auto` is handed the WHOLE prefixed set by `resolveDims`, so it has to be re-bound onto the
      // component's own view of it. Everything else about the field is carried through untouched.
      if (typeof f.auto === 'function') {
        field.auto = (all) => f.auto(unprefix(solid, i, all));
      }
      dims.push(field);
    }
  });

  const resolveFor = (d) => layout(list, d);

  const overall = (units) => {
    let width = 0; let depth = 0; let height = 0;
    for (const u of units) {
      width = Math.max(width, u.bounds.width);
      depth = Math.max(depth, u.bounds.depth);
      height += u.bounds.height;
    }
    return { width, depth, height };
  };

  const names = solids.map((s) => s.name);

  return {
    id: `combination:${list.map((p) => p.solidId).join('+')}`,
    isCombination: true,
    name: combinationName(list),
    blurb: `${names.join(', then ')} — each one seated centrally on the top face of the one below. `
      + 'The construction is the same four phases in the same order; the only new thing to settle is '
      + 'where each solid sits relative to the one under it.',

    dims,
    axisSymbols: { width: 'L', depth: 'B', height: 'H' },

    /** A sphere rule that holds for the whole assembly only when nothing in it has an axial length. */
    trueDiameterInProjection: solids.every((s) => Boolean(s.trueDiameterInProjection)),
    /** The first component that has something to say about the two forms says it for the drawing. */
    formNote: solids.find((s) => s.formNote)?.formNote,

    /** The enclosing box of the WHOLE assembly: widest part, deepest part, total height. */
    bounds(d) { return overall(resolveFor(d)); },

    /**
     * One body spec per component, each with the height its base sits at and whether the isometric
     * scale leaves it alone. `shapeFactory` reads this as the `assembly` kind and gives every
     * component its own placement + body pair — which is what lets a sphere be drawn at its TRUE
     * diameter while the height of its centre is still reduced (the sphere rule, unchanged).
     */
    body(d) {
      return {
        kind: 'assembly',
        parts: resolveFor(d).map((u) => ({
          spec: u.solid.body(u.dims),
          y: u.y,
          h: u.bounds.height,
          trueSize: Boolean(u.solid.trueDiameterInProjection),
        })),
      };
    },

    /**
     * The three views of the whole assembly: each component's own outline, lifted to the height it
     * sits at. Views are centred on the assembly, so a component sits at its own centre height minus
     * the assembly's. In plan every component is centred, so the top view is simply their outlines
     * drawn about one point — which is what "placed centrally" means on a drawing.
     */
    views(d) {
      const units = resolveFor(d);
      const b = overall(units);
      const front = { w: b.width, h: b.height, shapes: [] };
      const top = { w: b.width, h: b.depth, shapes: [] };
      const side = { w: b.depth, h: b.height, shapes: [] };
      for (const u of units) {
        const v = u.solid.views(u.dims);
        const cy = u.y + u.bounds.height / 2 - b.height / 2;
        for (const s of v.front.shapes) front.shapes.push(offsetShape(s, 0, cy));
        for (const s of v.top.shapes) top.shapes.push(offsetShape(s, 0, 0));
        for (const s of v.side.shapes) side.shapes.push(offsetShape(s, 0, cy));
      }
      return { front, top, side };
    },

    /**
     * Every component's own construction stages, BOTTOM UP, flattened into one list — the order a
     * hand actually draws the assembly, and the order Phase C already reveals a stage list in. Each
     * stage keeps its own sentence and gains the name of the solid it belongs to, so the learner is
     * never in doubt about which component is being constructed.
     */
    construction(d) {
      const out = [];
      for (const u of resolveFor(d)) {
        for (const st of u.solid.construction(u.dims)) {
          out.push({
            id: `p${u.index}:${st.id}`,
            label: `${u.solid.name} · ${st.label}`,
            note: st.note,
            draw: st.draw.map((p) => shiftPrimitive(p, u.y)),
          });
        }
      }
      return out;
    },

    /**
     * ONE BOUNDING BOX PER COMPONENT, each standing on the finished top face of the one below.
     *
     * This is how the drawing is really blocked out, and a single box round the whole assembly would
     * hide exactly the step Phase B teaches: a cone's base ellipse is inscribed in the top face of
     * the SLAB's box, not in the bottom of some larger box that contains both.
     *
     * `constructionEngine` asks for this and falls back to one box from `bounds()` when a solid does
     * not declare it — so a single solid is unaffected, byte for byte.
     */
    partBoxes(d) {
      return resolveFor(d).map((u) => ({
        id: `p${u.index}`,
        label: u.solid.name,
        width: u.bounds.width,
        depth: u.bounds.depth,
        height: u.bounds.height,
        y: u.y,
      }));
    },

    /** Any size a component declares that its own box cannot carry, lifted to where it now sits. */
    extraDims(d) {
      const out = [];
      for (const u of resolveFor(d)) {
        for (const ex of u.solid.extraDims?.(u.dims) ?? []) {
          out.push({
            ...ex,
            from: [ex.from[0], ex.from[1] + u.y, ex.from[2]],
            to: [ex.to[0], ex.to[1] + u.y, ex.to[2]],
          });
        }
      }
      return out;
    },
  };
}

/**
 * Fresh default dimensions for a combination — each component's own defaults, namespaced.
 *
 * A slab is a solid drawn short, so a component seated UNDER another opens at a slab-like height
 * rather than at the tall default it would use on its own. That is a starting value only: every
 * range is the solid's own and the learner may drag anywhere within it.
 */
export function defaultCombinationDims(parts) {
  const list = (parts?.length ? parts : defaultCombination()).slice(0, MAX_PARTS);
  const out = {};
  list.forEach((part, i) => {
    const solid = getSolid(part.solidId);
    const pre = prefix(i);
    const isBase = i === 0 && list.length > 1;
    for (const f of solid.dims) {
      let value = f.default;
      // Only the height-like field of a supporting component is shortened, and only down to its own
      // declared minimum — never below the range the solid says it is valid over.
      if (isBase && (f.key === 'height' || f.key === 'thickness')) {
        value = Math.max(f.min, Math.min(f.default, 25));
      }
      out[pre + f.key] = value;
    }
  });
  return out;
}

/** The resolved set a combination's geometry is built from (the same boundary a solid uses). */
export function resolveCombinationDims(solid, dims, unspecified) {
  return resolveDims(solid, dims, unspecified);
}
