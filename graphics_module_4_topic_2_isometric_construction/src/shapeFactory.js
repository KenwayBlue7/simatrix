// Shape factory — turns a `shapeData` body SPEC into a Simatrix teaching solid.
//
// One switch, over geometry KINDS (`box` / `revolve` / `prism` / `pyramid` / `sphere` /
// `hemisphere`) — not over solid NAMES. Ten solids ship today and they resolve to six kinds; adding
// an eleventh almost never adds a kind, which is exactly the property the data-driven model buys
// (ADR-043).
//
// Everything this module builds is OWNED by it and freed by its own `dispose()`, so the caller's
// single `rebuild()` pipeline (RULES.md §3.1/§3.3) can drop a whole solid in one call and see
// `renderer.info.memory` stay flat across repeated regeneration (§3.4).
//
// Linework rules it must honour:
//   • fat lines only — `LineSegments2` + `LineMaterial` (§3.12/§3.13)
//   • hard-edged bodies — flat shading, so `EdgesGeometry` finds real creases (§3.14)
//   • `polygonOffset` on every body, or faces z-fight the outline (§3.18)
//   • `computeLineDistances()` on every line object (§3.17)
//   • `LineMaterial.resolution` re-synced on resize (§3.16)
//
// CURVED SOLIDS AND THE SILHOUETTE PROBLEM. A cylinder's outline is not a fixed set of edges:
// `EdgesGeometry` returns only its two rim circles, so the sides would read as a soft fill boundary
// where a drafted line belongs. The same view-dependent silhouette generators Topic 1 introduced
// solve it here — two ink lines built once at local ±r and parked in a holder that `update(camera)`
// spins about Y, plus camera-facing rings for the sphere and hemisphere. Cost is one rotation per
// frame; no geometry is rewritten.
//
// Layering (CLAUDE.md): leaf module. Imports THREE, the fat-line addons, and the stateless
// `tokens.js` util (RULES.md §3.6a) — never a sibling behaviour leaf.

import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { toWorld } from './shapeData.js';
import { roleColor, WEIGHT } from './tokens.js';

/** Segment count for every revolved surface. High enough that a rim reads as a smooth ellipse,
 *  low enough that `EdgesGeometry` stays cheap. */
const RADIAL_SEGMENTS = 64;

/** Points on a camera-facing ring (the sphere / hemisphere outline). */
const BILLBOARD_SEGMENTS = 72;

/**
 * Build the raw body geometry for a spec, already seated so the solid RESTS ON y = 0 — the same
 * seating the orthographic views assume, which is what lets a height read straight across from the
 * front view onto the vertical isometric axis.
 *
 * @param {object} spec  From `solid.body(dims)`; all lengths in millimetres.
 * @returns {{ geometry: THREE.BufferGeometry, extra: THREE.BufferGeometry[] }}
 *   `extra` holds any additional closed piece (the hemisphere's flat cap) so the surface stays
 *   manifold — no overlapping or duplicated extrusions (RULES.md §3.29).
 */
/**
 * How far the solid still spreads AT ITS TOP, in world units — the horizontal half-extent of the
 * highest part of the geometry.
 *
 * This is NOT the enclosing box's half-width. A cube fills its box right up to the top corners; a
 * sphere, a cone and a pyramid come to a single point; a cylinder or a frustum end in a circle
 * narrower than the box. The figure title is placed clear of whatever the solid actually throws
 * highest on screen, so it needs the real top spread — using the box instead lifts the title far
 * too high above anything that tapers, which is exactly what it used to do.
 *
 * THE one switch, over geometry KINDS (ADR-043) — never over solid names.
 *
 * The shape of that top matters too, not just its size. A ROUND top reaches its furthest point in
 * one direction only, so its highest projected point is `r` away along the screen-up direction; a
 * RECTANGULAR top reaches a corner, which combines both half-extents and sits up to √2 higher. One
 * flag keeps the caller from having to guess which rule applies.
 *
 * @param {object} spec  The same body spec `buildShape` consumes.
 * @returns {{ hw: number, hd: number, round: boolean }} Half-extents in world units; both 0 for a
 *   solid that ends in a point.
 */
export function topHalfExtent(spec) {
  const round = (r) => ({ hw: r, hd: r, round: true });
  const point = { hw: 0, hd: 0, round: true };
  switch (spec.kind) {
    // A stack throws highest whatever its TOP component throws, so the answer is that component's.
    case 'assembly': {
      const top = spec.parts?.[spec.parts.length - 1];
      return top ? topHalfExtent(top.spec) : point;
    }
    case 'box': return { hw: toWorld(spec.w) / 2, hd: toWorld(spec.d) / 2, round: false };
    case 'revolve': return round(toWorld(spec.rTop));   // cone → 0, cylinder/frustum → the top circle
    // A polygon is treated as its circumscribing square: a corner can sit anywhere on that circle,
    // so this errs high by design rather than letting a vertex poke through the title.
    case 'prism': return { hw: toWorld(spec.r), hd: toWorld(spec.r), round: false };
    // A pyramid ends in an apex; a FRUSTUM of one ends in a polygon, read like a prism's top.
    case 'pyramid': return spec.rTop
      ? { hw: toWorld(spec.rTop), hd: toWorld(spec.rTop), round: false }
      : point;
    case 'sphere': return point;                         // the pole, directly over the centre
    case 'hemisphere': return point;                     // the crown of the dome
    default: return point;
  }
}

function buildGeometry(spec) {
  switch (spec.kind) {
    case 'box': {
      const g = new THREE.BoxGeometry(toWorld(spec.w), toWorld(spec.h), toWorld(spec.d));
      g.translate(0, toWorld(spec.h) / 2, 0);
      return { geometry: g, extra: [] };
    }
    case 'revolve': {
      // Cylinder, cone (rTop = 0) and frustum are one family: a lathe between two radii.
      const g = new THREE.CylinderGeometry(
        toWorld(spec.rTop), toWorld(spec.rBottom), toWorld(spec.h), RADIAL_SEGMENTS, 1, false,
      );
      g.translate(0, toWorld(spec.h) / 2, 0);
      return { geometry: g, extra: [] };
    }
    case 'prism': {
      const g = new THREE.CylinderGeometry(
        toWorld(spec.r), toWorld(spec.r), toWorld(spec.h), spec.sides, 1, false,
      );
      g.rotateY(spec.rot ?? 0);
      g.translate(0, toWorld(spec.h) / 2, 0);
      return { geometry: g, extra: [] };
    }
    case 'pyramid': {
      // An n-sided cone IS an n-gonal pyramid: regular base, identical sloping faces, apex centred
      // over the base by construction. A `rTop` cuts that apex off parallel to the base, which is a
      // lathe between two polygons — the same relationship `revolve` has to its own frustum, so the
      // family stays one case rather than becoming two kinds.
      const g = spec.rTop
        ? new THREE.CylinderGeometry(toWorld(spec.rTop), toWorld(spec.r), toWorld(spec.h), spec.sides, 1, false)
        : new THREE.ConeGeometry(toWorld(spec.r), toWorld(spec.h), spec.sides);
      g.rotateY(spec.rot ?? 0);
      g.translate(0, toWorld(spec.h) / 2, 0);
      return { geometry: g, extra: [] };
    }
    case 'sphere': {
      const r = toWorld(spec.r);
      const g = new THREE.SphereGeometry(r, RADIAL_SEGMENTS, RADIAL_SEGMENTS / 2);
      g.translate(0, r, 0);
      return { geometry: g, extra: [] };
    }
    case 'hemisphere': {
      const r = toWorld(spec.r);
      // Upper half of a sphere, closed by a flat disc — two pieces meeting exactly at the equator,
      // so the surface is closed with nothing coincident (§3.29).
      const dome = new THREE.SphereGeometry(r, RADIAL_SEGMENTS, RADIAL_SEGMENTS / 4, 0, Math.PI * 2, 0, Math.PI / 2);
      const cap = new THREE.CircleGeometry(r, RADIAL_SEGMENTS);
      cap.rotateX(Math.PI / 2); // face down
      return { geometry: dome, extra: [cap] };
    }
    default: {
      const g = new THREE.BoxGeometry(1, 1, 1);
      g.translate(0, 0.5, 0);
      return { geometry: g, extra: [] };
    }
  }
}

/**
 * Which silhouette generators a spec needs, expressed as world-space segments in the solid's LOCAL
 * frame at local +x / -x. `update(camera)` spins their holder about Y so they always lie on the
 * outline the camera actually sees.
 * @returns {{ segments: number[][], billboard: null | { y: number, r: number, half?: string } }}
 */
function silhouetteSpec(spec) {
  switch (spec.kind) {
    case 'revolve': {
      const rb = toWorld(spec.rBottom); const rt = toWorld(spec.rTop); const h = toWorld(spec.h);
      // Cone: both generators run to the single apex point; cylinder / frustum: to the top radius.
      return {
        segments: [
          [rb, 0, 0, rt, h, 0],
          [-rb, 0, 0, -rt, h, 0],
        ],
        billboard: null,
      };
    }
    case 'sphere': {
      const r = toWorld(spec.r);
      return { segments: [], billboard: { y: r, r, half: 'full' } };
    }
    case 'hemisphere': {
      const r = toWorld(spec.r);
      return { segments: [], billboard: { y: 0, r, half: 'upper' } };
    }
    default:
      return { segments: [], billboard: null };
  }
}

/** Ring / half-ring vertices in the XY plane, ready to be billboarded at the camera. */
function billboardPositions({ r, half }) {
  const full = half !== 'upper';
  const span = full ? Math.PI * 2 : Math.PI;
  const steps = full ? BILLBOARD_SEGMENTS : BILLBOARD_SEGMENTS / 2;
  const pos = [];
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * span;
    const a1 = ((i + 1) / steps) * span;
    pos.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0);
  }
  if (!full) pos.push(-r, 0, 0, r, 0, 0); // close the semicircle across its diameter
  return pos;
}

/**
 * Build one teaching solid from a body spec.
 *
 * ONE OR MANY, ONE RIG. A single solid and a combination are the same structure here: the spec is
 * normalised into a list of COMPONENTS, and a plain solid is simply the one-component case. Nothing
 * below branches on how many there are.
 *
 * EACH COMPONENT IS A TWO-GROUP RIG:
 *   placement   position only — the height its base sits at, scaled by the ISOMETRIC SCALE
 *   body        uniform scale — the component's own drawn size
 * The split is not decoration: it is what lets a component be drawn at its TRUE diameter while the
 * height of its centre is still reduced. That pair IS the sphere rule, and expressing it as two
 * numbers is what keeps this file from ever having to know which solids are spheres.
 *
 * @param {object} spec        `solid.body(dims)`. `{ kind:'assembly', parts:[…] }` for a combination.
 * @param {THREE.Vector2} resolution  Drawing-buffer size for `LineMaterial`.
 * @param {{ trueSize?: boolean, height?: number }} [opts]  For a single solid: whether the isometric
 *   scale leaves it alone, and its overall height in mm (so the figure title can be placed against
 *   the drawn top rather than against an assumed one).
 * @returns {{
 *   group: THREE.Group,
 *   setOpacity: (v:number) => void,
 *   setEdgesVisible: (on:boolean) => void,
 *   setFormScale: (axial:number) => void,
 *   formScale: () => number,
 *   drawnTop: () => { y:number, hw:number, hd:number, round:boolean },
 *   setResolution: (w:number,h:number) => void,
 *   update: (camera: THREE.Camera) => void,
 *   dispose: () => void,
 * }}
 */
export function buildShape(spec, resolution, opts = {}) {
  const group = new THREE.Group();
  const owned = { geometries: [], materials: [] };

  // A plain solid is the one-component case, so there is exactly one code path below.
  const componentSpecs = spec?.kind === 'assembly'
    ? (spec.parts ?? [])
    : [{ spec, y: 0, h: opts.height ?? 0, trueSize: Boolean(opts.trueSize) }];

  // ONE body material and ONE ink material for the whole drawing. Opacity is a property of the
  // DRAWING, not of a component — a step cross-fades the finished solid in as a single object — so
  // sharing them keeps `setOpacity` a two-line operation however many components there are.
  const bodyMaterial = new THREE.MeshPhongMaterial({
    color: roleColor('solid'),
    shininess: 0,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide, // the hemisphere's cap is a single-sided disc
  });
  owned.materials.push(bodyMaterial);

  const inkMaterial = new LineMaterial({
    color: roleColor('finished'),
    linewidth: WEIGHT.finished,
    transparent: true,
    opacity: 1,
  });
  inkMaterial.resolution.copy(resolution);
  owned.materials.push(inkMaterial);

  const meshes = [];
  const units = componentSpecs.map((part) => {
    const placement = new THREE.Group();
    group.add(placement);
    const body = new THREE.Group();
    placement.add(body);

    const { geometry, extra } = buildGeometry(part.spec);
    owned.geometries.push(geometry, ...extra);
    const own = [new THREE.Mesh(geometry, bodyMaterial)];
    for (const g of extra) own.push(new THREE.Mesh(g, bodyMaterial));
    own.forEach((m) => { body.add(m); meshes.push(m); });

    // ---- Finished visible edges ------------------------------------------------------------
    const edgeSource = new THREE.EdgesGeometry(geometry, 20);
    const lineGeo = new LineSegmentsGeometry().fromEdgesGeometry(edgeSource);
    edgeSource.dispose();
    owned.geometries.push(lineGeo);
    const outline = new LineSegments2(lineGeo, inkMaterial);
    outline.computeLineDistances();
    body.add(outline);

    // ---- View-dependent silhouettes --------------------------------------------------------
    const sil = silhouetteSpec(part.spec);
    /** Holder spun about Y each frame so its two generators sit on the visible outline. */
    const silHolder = new THREE.Group();
    body.add(silHolder);
    if (sil.segments.length) {
      const geo = new LineSegmentsGeometry();
      geo.setPositions(sil.segments.flat());
      owned.geometries.push(geo);
      const line = new LineSegments2(geo, inkMaterial); // shares the ink material, so it fades along
      line.computeLineDistances();
      silHolder.add(line);
    }

    /** Camera-facing outline ring (sphere / hemisphere). */
    let billboard = null;
    if (sil.billboard) {
      const geo = new LineSegmentsGeometry();
      geo.setPositions(billboardPositions(sil.billboard));
      owned.geometries.push(geo);
      billboard = new LineSegments2(geo, inkMaterial);
      billboard.computeLineDistances();
      billboard.position.y = sil.billboard.y;
      body.add(billboard);
    }

    return {
      spec: part.spec,
      y: part.y ?? 0,
      h: part.h ?? 0,
      trueSize: Boolean(part.trueSize),
      placement,
      body,
      outline,
      silHolder,
      billboard,
      meshes: own,
      hasSilhouette: sil.segments.length > 0,
    };
  });

  /** The live isometric scale. 1 is an Isometric View; `ISOMETRIC_SCALE` is an Isometric Projection. */
  let axialScale = 1;

  function applyScale(axial) {
    axialScale = axial;
    for (const u of units) {
      // Drawn size: reduced, unless this component has no axial length to reduce.
      u.body.scale.setScalar(u.trueSize ? 1 : axial);
      // Where it sits: ALWAYS reduced. A seating height is a length set off along the vertical axis
      // like any other, even for the one component whose own size is not.
      u.placement.position.y = toWorld(u.y) * axial;
    }
  }
  applyScale(1);

  return {
    group,

    setOpacity(v) {
      bodyMaterial.opacity = v;
      inkMaterial.opacity = v;
      group.visible = v > 0.001;
    },

    /** Step 4 hides the finished edges while the construction is being drawn, so the learner is
     *  watching the construction produce them rather than tracing over an answer already on screen. */
    setEdgesVisible(on) {
      for (const u of units) {
        u.outline.visible = on;
        u.silHolder.visible = on;
        if (u.billboard) u.billboard.visible = on;
        u.meshes.forEach((m) => { m.visible = on; });
      }
    },

    /** Drive the drawing to one isometric scale. Step 5's toggle tweens through this. */
    setFormScale(axial) { applyScale(axial); },
    formScale: () => axialScale,

    /**
     * The top of the DRAWN figure, and how far it still spreads there — what the figure title has to
     * hang clear of. Derived from the live scales, so it is right in either form and for a stack of
     * any depth without the caller having to model any of it.
     */
    drawnTop() {
      let best = { y: 0, hw: 0, hd: 0, round: true };
      for (const u of units) {
        const s = u.body.scale.x;
        const y = toWorld(u.y) * axialScale + toWorld(u.h) * s;
        if (y < best.y) continue;
        const t = topHalfExtent(u.spec);
        best = { y, hw: t.hw * s, hd: t.hd * s, round: t.round };
      }
      return best;
    },

    setResolution(w, h) { inkMaterial.resolution.set(w, h); },

    update(camera) {
      const v = camera.position;
      for (const u of units) {
        if (u.hasSilhouette) {
          // Face the generators square-on to the camera in plan: the outline of a solid of
          // revolution is always the pair of generators perpendicular to the view direction.
          u.silHolder.rotation.y = Math.atan2(-v.x, -v.z) + Math.PI / 2;
        }
        // A sphere's outline is a true circle about its centre from EVERY direction, so the ring is
        // a pure billboard — it takes the camera's own orientation.
        if (u.billboard) u.billboard.quaternion.copy(camera.quaternion);
      }
    },

    dispose() {
      group.removeFromParent();
      owned.geometries.forEach((g) => g.dispose());
      owned.materials.forEach((m) => { m.map?.dispose(); m.dispose(); });
      owned.geometries.length = 0;
      owned.materials.length = 0;
      units.length = 0;
      meshes.length = 0;
      group.clear();
    },
  };
}
