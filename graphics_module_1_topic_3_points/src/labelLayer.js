// labelLayer.js — the CSS2D label layer (leaf module, ADR-007/ADR-033): every DOM
// label that names things in the viewport — the HP / VP plane callouts and the
// X / Y fold-line end marks, the I–IV quadrant numerals (showQuad), the boxed
// P / p / p′ point chips (the ADR-016 naming convention), the P(x, y, z) signed-mm
// coordinate read-out (showCoord), and the BIS first-angle symbol badge
// (#fa-symbol, shown while the sheet is folded flat).
//
// Ported from the Topic 2 sibling (graphics_module_1_topic_2_spatial_framework)
// with this topic's view-flag vocabulary (see pointSteps.js DEFAULT_VIEW):
//   • the plane callouts + X/Y end marks are ALWAYS drawn — the HP/VP corner is
//     on stage from boot in this topic, never step-gated;
//   • `showHP` / `showVP` gate the PROJECTION chips (p / p′), matching the legacy
//     Points lesson where those flags revealed the top / front view layers;
//   • the coordinate chip is new here: the legacy draw3D's showCoord read-out,
//     P(±distVP, ±distHP, ±distRP) in signed mm, rebuilt as a CSS2D label.
//
// WHY CSS2D (RULES.md §3.27): a CSS2DObject is a real DOM node positioned at a 3D
// point — zero asset cost, crisp at any DPR, themed from the same CSS tokens as
// the chrome (the .lbl / .lbl--chip / .fa-symbol classes in index.html carry every
// colour, so nothing is hard-coded here — RULES.md §4.1), and readable by
// assistive tech.
//
// The fold: labels that name HP-riding things — the HP sheet callout and the
// top-view chip p — live in an internal pivot hinged on the X fold line, mirroring
// the hvPlanes.js / point.js hinges. The orchestrator drives all three leaves'
// setFoldAngle(a) from the one easeFold tween, so the names ride the folding floor
// while VP's never move.
//
// DISPOSAL (RULES.md §3.5): clear()/dispose() physically remove every
// CSS2DObject's backing DOM node from the document BEFORE dropping the objects.
// Three's automatic element cleanup only fires on the object Object3D.remove()
// directly removes — a group-level clear would strand every nested label's <div>
// in the overlay, and they accumulate fast across rebuilds.
//
// Layering (RULES.md §3.6): leaf module — imports three + CSS2DObject only, never
// a sibling leaf. main.js owns the CSS2DRenderer and drives this from rebuild().

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ── Label anchors (world units — legacy Module1 placements, via Topic 2) ──
/** Plane callouts: HP low on the floor's front-left, VP high on the wall's left,
 *  and the fold line named by its END marks — 'X' just past the left end, 'Y'
 *  just past the right (the textbook convention that makes it "the XY line"). */
const PLANE_ANCHOR = {
  hp: [-3.6, -0.3, 3.6],
  // Dropped from y=3.7 to y=2.5 so the VP callout clears the top-left viewport cluster
  // (quick-views + the "Compare 2D drawing" chip) — at the old height it collided with the
  // chip. Still unmistakably on the upper VP wall, just below the persistent chrome band.
  vp: [-3.6, 2.5, 0.05],
  x: [-4.85, -0.35, 0],
  y: [4.85, -0.35, 0],
};

/** The four room numerals, each pushed to the FAR OUTER CORNER of its dihedral
 *  room (just inside the 4.5-unit sheet extents): x at the right end of the fold
 *  line — clear of the HP/VP/X callouts on the left and of P's default profile
 *  mid-plane (x = 0) — and y/z at the sheets' outer edges, so the numerals never
 *  overlap or clash with P, p, p′, or the projectors. */
const QUAD_ANCHORS = [
  { text: 'I',   quadrant: 'Q1', at: [4.1, 4.1, 4.1] },
  { text: 'II',  quadrant: 'Q2', at: [4.1, 4.1, -4.1] },
  { text: 'III', quadrant: 'Q3', at: [4.1, -4.1, -4.1] },
  { text: 'IV',  quadrant: 'Q4', at: [4.1, -4.1, 4.1] },
];

/** Chip standoffs from the marker each one names, so the boxed label sits just
 *  clear of the dot / sphere and its linework. */
const CHIP_OFFSET = {
  P:      [0.30, 0.60, 0.30], // nudged IN toward the ink sphere so 'P' hugs the point,
                              // but its y is lifted back to 0.60 (was over-reduced to 0.44,
                              // which let 'P' collide with p′ in the viewport) — still HIGH +
                              // toward the viewer, now clearly ABOVE p′'s (0.26, 0.30) offset
                              // so the two chips never cross during the rabatment swing (P also
                              // fades out as it folds — see pFoldFade / setFoldAngle)
  p:      [0.30, 0.24, 0],    // proud of the floor, beside the top-view dot
  pPrime: [0.26, 0.30, 0.06], // proud of the wall, beside the front-view dot
  coord:  [0.45, 0.95, 0.30], // the read-out floats above P's chip, clear of the linework
};

/** P is a 3D-space concept; as the corner flattens into the 2D first-angle drawing
 *  (foldAngle 0 → +π/2) its chip dissolves so the answer sheet reads as just the two
 *  views (p, p′) — and, en route, so the fading 'P' never lands squarely on top of p′.
 *  Reaches 0 by ~80% of the swing (×1.25) for a clean flat sheet. */
const FOLD_FULL = Math.PI / 2;
const pFoldFade = (a) => Math.max(0, 1 - (a / FOLD_FULL) * 1.25);

/**
 * Build the CSS2D label layer. Same lifecycle as the geometry leaves: created
 * fresh by every rebuild(), disposed by the disposal contract, hinged by the fold
 * tween — so main.js manages all three identically.
 *
 * @param {Object} [options]
 * @param {number} [options.width]   Viewport CSS px (stored for contract parity —
 *   no fat linework lives here, but main.js drives resolution uniformly).
 * @param {number} [options.height]
 * @returns {{
 *   group: THREE.Group,
 *   generate: (state: {
 *     view?: Object,
 *     position?: { x: number, y: number, z: number },
 *     coords?: { x: number, y: number, z: number },
 *     quadrant?: string|null,
 *     foldAngle?: number,
 *   }) => void,
 *   setFoldAngle: (a: number) => void,
 *   setSymbol: (on: boolean) => void,
 *   setResolution: (w: number, h: number) => void,
 *   updateOcclusion: (camera: THREE.Camera, occluderRoot: THREE.Object3D) => void,
 *   clear: () => void,
 *   dispose: () => void,
 * }}
 */
export function createLabelLayer({ width = 1, height = 1 } = {}) {
  const resolution = new THREE.Vector2(width, height);

  const group = new THREE.Group();
  group.name = 'Points Labels';

  /** The HP-riding labels' hinge (mirrors the hvPlanes.js / point.js pivots).
   *  Structural — survives clear(); only dispose() drops it. */
  const hpRiders = new THREE.Group();
  group.add(hpRiders);

  /** The BIS first-angle badge — static chrome owned by index.html; this layer
   *  only manages its visibility, never creates or removes the node itself. */
  const faSymbol = document.getElementById('fa-symbol');

  /** The live 'P' chip (or null when P is off stage / cleared). Held so the fold
   *  tween can fade it out through setFoldAngle() as the corner flattens. */
  let pChip = null;

  /** The live quadrant numerals (I–IV), held for the per-frame occlusion pass:
   *  a CSS2DObject is a DOM node the GPU depth buffer can't clip, so a numeral
   *  sitting BEHIND the HP/VP sheets from the camera would otherwise read through
   *  them. updateOcclusion() raycasts camera → numeral against the sheet fills
   *  and hides any numeral a sheet occludes. */
  const quadLabels = [];
  const occlusionRay = new THREE.Raycaster();
  const occluderMeshes = [];
  const anchorWorld = new THREE.Vector3();
  const rayDir = new THREE.Vector3();
  /** Clearance so a numeral flush against a sheet's far edge doesn't self-occlude. */
  const OCCLUSION_EPS = 0.05;

  /** One label: a DOM node wrapped in a CSS2DObject at a world anchor. All
   *  styling (colour, weight, chip box) lives on the CSS classes. */
  function makeLabel(parent, text, className, x, y, z) {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text;
    const obj = new CSS2DObject(el);
    obj.position.set(x, y, z);
    obj.center.set(0.5, 0.5);
    parent.add(obj);
    return obj;
  }

  /** Reveal/hide the first-angle badge. Reveal waits one frame so the opacity
   *  transition runs from the un-hidden state (the legacy setFaSymbol timing). */
  function setSymbol(on) {
    if (!faSymbol) return;
    if (on) {
      faSymbol.hidden = false;
      requestAnimationFrame(() => faSymbol.classList.add('is-visible'));
    } else {
      faSymbol.classList.remove('is-visible');
      faSymbol.hidden = true;
    }
  }

  /** The legacy coordinate read-out text: P(±distVP, ±distHP, ±distRP) in signed
   *  mm, a true minus sign (−) for negatives — coords are DATA-SPACE signed mm
   *  from pointData.resolvePosition (x = ±distVP, y = ±distHP, z = ±distRP). */
  function coordText({ x, y, z }) {
    const part = (n) => `${n < 0 ? '−' : ''}${Math.abs(n).toFixed(0)}`;
    return `P(${part(x)}, ${part(y)}, ${part(z)})`;
  }

  return {
    group,

    /**
     * (Re)build every label for the current state — the label half of the
     * rebuild() pipeline. Clears first, so it is safe to call repeatedly.
     *
     * @param {Object} state
     * @param {Object} [state.view]       The merged currentView flags.
     * @param {{x:number,y:number,z:number}} [state.position]  P's WORLD position
     *   (main.js's worldPosition() remap — same value the point rig receives).
     * @param {{x:number,y:number,z:number}} [state.coords]  P's DATA-SPACE signed
     *   mm (pointData.resolvePosition), for the showCoord read-out chip.
     * @param {string|null} [state.quadrant]  P's current room (highlights its numeral).
     * @param {number} [state.foldAngle]  Hinge angle, so a rebuild mid-fold or in
     *   the folded state lands the riding labels in pose.
     */
    generate({ view = {}, position = { x: 0, y: 0, z: 0 }, coords = null, quadrant = null, foldAngle = 0 } = {}) {
      this.clear();
      hpRiders.rotation.x = foldAngle;
      const { x: px, y: py, z: pz } = position;

      // ── Plane callouts — ALWAYS on stage in this topic (the corner is never
      //    step-gated). HP's rides the trapdoor; VP's and the X/Y end marks never
      //    move (the fold line is the hinge itself, so its ends stay put).
      makeLabel(hpRiders, 'HP', 'lbl lbl--hp', ...PLANE_ANCHOR.hp);
      makeLabel(group, 'VP', 'lbl lbl--vp', ...PLANE_ANCHOR.vp);
      makeLabel(group, 'X', 'lbl lbl--xy', ...PLANE_ANCHOR.x);
      makeLabel(group, 'Y', 'lbl lbl--xy', ...PLANE_ANCHOR.y);

      // ── The four room numerals. They name REGIONS of space, not the floor
      //    sheet, so they never ride the hinge. P's current room reads ink + 700;
      //    the rest recede (Two-Cue pairing lives on the CSS classes).
      if (view.showQuad) {
        for (const { text, quadrant: q, at } of QUAD_ANCHORS) {
          quadLabels.push(makeLabel(group, text,
            view.showPoint && q === quadrant ? 'lbl lbl--quad is-active' : 'lbl lbl--quad', ...at));
        }
      }

      // ── The point chips (ADR-016 naming: P in space, p on HP, p′ on VP). The
      //    top view's chip rides the folding floor with its dot. showHP / showVP
      //    gate the two projection layers independently — the legacy Points
      //    progressive reveal (top view on step 2, front view on step 3).
      if (view.showPoint) {
        const [ox, oy, oz] = CHIP_OFFSET.P;
        pChip = makeLabel(group, 'P', 'lbl lbl--chip lbl--ink', px + ox, py + oy, pz + oz);
        // Seed the fade so a rebuild mid-fold (or in the folded state) lands in pose.
        pChip.element.style.opacity = String(pFoldFade(foldAngle));
      }
      if (view.showPoint && view.showHP) {
        const [hx, hy] = CHIP_OFFSET.p;
        makeLabel(hpRiders, 'p', 'lbl lbl--chip lbl--hp', px + hx, hy, pz);
      }
      if (view.showPoint && view.showVP) {
        const [vx, vy, vz] = CHIP_OFFSET.pPrime;
        makeLabel(group, 'p′', 'lbl lbl--chip lbl--vp', px + vx, py + vy, vz);
      }

      // ── The coordinate read-out (legacy showCoord): the point's full address
      //    in signed mm, floating above P clear of the chips and linework.
      if (view.showPoint && view.showCoord && coords) {
        const [cx, cy, cz] = CHIP_OFFSET.coord;
        makeLabel(group, coordText(coords), 'lbl lbl--coord', px + cx, py + cy, pz + cz);
      }

      // ── The BIS first-angle badge (shown while the sheet is folded flat —
      //    main.js passes the computed flag; fold()/unfold() also drive setSymbol
      //    directly, since the fold itself never rebuilds).
      setSymbol(!!view.showSymbol);
    },

    /** The rabatment hinge: rotate the HP-riding labels with the floor AND fade the
     *  'P' chip out as the corner flattens (so it never crosses p′, and the flat
     *  answer sheet reads as just p / p′). Pure transform — safe every tween frame. */
    setFoldAngle(a) {
      hpRiders.rotation.x = a;
      if (pChip) pChip.element.style.opacity = String(pFoldFade(a));
    },

    /** Badge visibility, exposed for the orchestrator's fold driver: the fold is
     *  pure transforms (no rebuild), so fold()/unfold() flip the badge here. */
    setSymbol,

    /** No fat lines here, but main.js drives resolution uniformly across the
     *  leaves on resize; store it so the contract holds. */
    setResolution(w, h) {
      resolution.set(w, h);
    },

    /** Per-frame occlusion for the quadrant numerals: hide any numeral the HP/VP
     *  sheets sit in front of, from the live camera's vantage. CSS2D labels are DOM —
     *  the depth buffer can't clip them — so this raycasts camera → numeral against
     *  `occluderRoot`'s fill MESHES only (the Line2 grids/borders are skipped: they are
     *  expensive to raycast and a hairline should never hide a label). Called from the
     *  render loop (main.js) with the ACTIVE camera and the hvPlanes leaf's group;
     *  cheap — at most 4 rays against a handful of plane quads. No-op with no numerals. */
    updateOcclusion(camera, occluderRoot) {
      if (!quadLabels.length || !occluderRoot || !camera) return;
      occluderMeshes.length = 0;
      // NOTE: Line2/LineSegments2 EXTEND Mesh (isMesh is true), so the fat-line grids/borders
      // must be excluded explicitly — their raycast() needs Raycaster.camera and would throw.
      occluderRoot.traverse((o) => {
        if (o.isMesh && o.visible && !o.isLine2 && !o.isLineSegments2) occluderMeshes.push(o);
      });
      if (!occluderMeshes.length) return;
      for (const obj of quadLabels) {
        obj.getWorldPosition(anchorWorld);
        rayDir.copy(anchorWorld).sub(camera.position);
        const dist = rayDir.length();
        if (dist < 1e-6) continue;
        occlusionRay.set(camera.position, rayDir.normalize());
        occlusionRay.near = 0;
        occlusionRay.far = dist - OCCLUSION_EPS;
        const hidden = occlusionRay.intersectObjects(occluderMeshes, false).length > 0;
        obj.element.style.visibility = hidden ? 'hidden' : '';
      }
    },

    /** Remove every CSS2DObject AND its backing DOM node (RULES.md §3.5). The
     *  element is detached from the document explicitly — clearing the groups
     *  alone would leave the <div>s stranded in the CSS2D overlay. */
    clear() {
      pChip = null; // its DOM node is dropped in the sweep below; drop the handle too
      quadLabels.length = 0; // their DOM nodes fall in the same sweep; drop the occlusion handles
      const doomed = [];
      group.traverse((obj) => { if (obj.isCSS2DObject) doomed.push(obj); });
      for (const obj of doomed) {
        obj.element?.remove();   // physically drop the DOM node first
        obj.removeFromParent();  // then detach the object (group OR hpRiders)
      }
    },

    /** Full disposal contract (ADR-004/RULES.md §3.5): drop every label's DOM
     *  node, hide the badge (so no stale symbol outlives the view that showed
     *  it), and empty the group. Terminal — rebuild() creates a fresh layer. */
    dispose() {
      this.clear();
      setSymbol(false);
      group.clear();
    },
  };
}
