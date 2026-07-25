// LabelManager.js — owns the 3D label LIFECYCLE: create → position → parent → dispose.
//
// Single responsibility: orchestration. It calls LabelFactory for the DOM node and LabelPlacement for
// the coordinates, then writes the position and parents the label. It contains NO DOM creation of its
// own and NO placement math of its own.
//
// STEP 5 — EXACTLY ONE WRITER of `label.position`: the private `add()` below is the only function in
// the entire 3D label system that assigns `obj.position`. LabelPlacement returns numbers; nothing else
// ever touches a label's position.
//
// STEP 8 — OWNERSHIP: every label is a child of the SAME group that owns the geometry it names:
//   • HP callout, top-view feet a / b   → `hpGroup` (the fold floor — they swing with the fold)
//   • VP callout, x / y, A / B, a′ / b′, θ / φ → `group` (the static rig root — like their geometry)
// No label is attached to the bare scene; each shares its geometry's group, so orbit / fold / rebuild
// keep every label glued to what it describes.

import { createLabel } from './LabelFactory.js';
import { LabelType } from './LabelStyles.js';
import * as Place from './LabelPlacement.js';

/**
 * @param {{ group: THREE.Group, hpGroup: THREE.Group }} owners
 *   group   = the static rig root (VP + space rod + front view + fold line live here)
 *   hpGroup = the fold hinge child of group (HP floor + top view live here)
 * @returns {{ build: Function, dispose: Function }}
 */
export function createLabelManager({ group, hpGroup }) {
  /** Every CSS2DObject this manager created, held only for disposal. */
  const labels = [];

  /** THE single writer of label.position (STEP 5). Create → position → parent → track. */
  function add(owner, type, text, pos) {
    const obj = createLabel(type, text);
    obj.position.set(pos[0], pos[1], pos[2]); // ← the one and only assignment of a label's position
    owner.add(obj);
    labels.push(obj);
    return obj;
  }

  return {
    /**
     * (Re)build every applicable label for the current line/state. Called once per lineRig build,
     * so it mirrors the rebuild() lifecycle. Clears nothing itself — a fresh manager is made per
     * rebuild and the old one is disposed by lineRig.dispose().
     * @param {object}  state
     * @param {object}  state.view   the active step's viewport flags (showFV / showTV)
     * @param {?object} state.line   endpoints in LOCAL coords { A,B,aF,bF,aT,bT }, or null (no line)
     * @param {number}  state.theta  true inclination with HP (deg) — gates + texts θ
     * @param {number}  state.phi    true inclination with VP (deg) — gates + texts φ
     */
    build({ view = {}, line = null, theta = 0, phi = 0 } = {}) {
      // Plane + axis labels — always on stage (the HP/VP corner is never step-gated).
      add(hpGroup, LabelType.HP, 'HP', Place.PLANE_HP_ANCHOR);
      add(group,   LabelType.VP, 'VP', Place.PLANE_VP_ANCHOR);
      add(group,   LabelType.X,  'x',  Place.AXIS_X_ANCHOR);
      add(group,   LabelType.Y,  'y',  Place.AXIS_Y_ANCHOR);

      if (!line) return;
      const { A, B, aF, bF, aT, bT } = line;

      // Space endpoints A / B — the rod lives on `group` (static).
      add(group, LabelType.A, 'A', Place.endpoint(A, B));
      add(group, LabelType.B, 'B', Place.endpoint(B, A));

      // Front view a′ / b′ — on VP (static → `group`).
      if (view.showFV) {
        add(group, LabelType.aPrime, "a'", Place.endpoint(aF, bF));
        add(group, LabelType.bPrime, "b'", Place.endpoint(bF, aF));
      }

      // Top view a / b — on HP (rides the fold → `hpGroup`).
      if (view.showTV) {
        add(hpGroup, LabelType.a, 'a', Place.endpoint(aT, bT));
        add(hpGroup, LabelType.b, 'b', Place.endpoint(bT, aT));
      }

      // True inclinations θ (with HP) / φ (with VP), off the rod mid-point.
      const midY = (A[1] + B[1]) / 2, midZ = (A[2] + B[2]) / 2;
      if (theta > 1 && theta < 89.5) add(group, LabelType.THETA, `θ=${Math.round(theta)}°`, Place.angleHP(A, midY, midZ));
      if (phi   > 1 && phi   < 89.5) add(group, LabelType.PHI,   `φ=${Math.round(phi)}°`,   Place.angleVP(B, midY, midZ));
    },

    /** Remove every label's DOM node (RULES.md §3.5) and detach it. Terminal — a rebuild makes a fresh
     *  manager. Only touches labels THIS manager created (the TL dimension label is disposed by the
     *  dimension subsystem, swept in lineRig.dispose). */
    dispose() {
      for (const obj of labels) { obj.element?.remove(); obj.removeFromParent(); }
      labels.length = 0;
    },
  };
}
