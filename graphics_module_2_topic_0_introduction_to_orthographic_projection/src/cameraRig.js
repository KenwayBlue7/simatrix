// Camera rig — every view change in this topic is an eased flight, never a teleport, and every
// PRINCIPAL view lands in a true orthographic projection.
//
// Two things are going on here, and the second one is the reason this topic could not just reuse
// the sibling's rig unchanged.
//
// 1. MOVEMENT. The camera must MOVE between viewpoints so the learner keeps their bearings
//    (DESIGN.md §5.10). A cut would destroy the one thing the topic is trying to build — the sense
//    that the four principal views and the pictorial view are the SAME object seen from different
//    directions. Poses are stored as DIRECTIONS, not positions, and the distance is derived per
//    rebuild from the live content radius, so an 80 mm block and an 83 mm bearing block both sit
//    comfortably in frame with no auto-zoom chasing them afterwards (RULES.md §5.1/§5.2).
//
// 2. PROJECTION. A perspective view of a solid seen from the front shows the top of a boss as an
//    ellipse, near edges longer than far ones, and no true size anywhere — every single thing an
//    orthographic view is defined by NOT showing. A topic whose first claim is "this is what the
//    elevation looks like" therefore cannot present a perspective picture when the learner presses
//    Front. So the rig carries the platform's DUAL-CAMERA PAIR and moves between them with the
//    `projectionMorphK` matrix morph (RULES.md §5.18): the ortho camera's `projectionMatrix` is
//    lerped element-wise toward the perspective camera's across the SAME tween, so the view
//    continuously loses (or gains) depth and the hand-off between the two camera objects is a
//    visual no-op. A straight swap would make off-plane geometry pop into depth in one frame —
//    exactly the cut §5.18 forbids.
//
//    Free orbit is perspective; the four principal directions are orthographic; the transition
//    between them is the morph. Grabbing the object while it is square-on hands the view back to
//    perspective over the first third of a second of the drag, so a learner who starts turning
//    an orthographic view is not fighting a locked projection.
//
// Layering (CLAUDE.md): leaf module. Imports THREE and the shared `anim.js` tween engine; owns no
// DOM and no scene objects. main.js injects the perspective camera and the controls, and asks the
// rig which camera to render with each frame.

import * as THREE from 'three';
import { tween, easeCamera, easeStandard } from './anim.js';

/**
 * Named viewing DIRECTIONS (unit vectors from the target toward the camera).
 *
 * A direction is named for where the observer STANDS, which is how a drawing office names a view:
 * the "left side view" is the view from the left, and the camera for it sits at -x. Where that view
 * is then DRAWN is a separate question, and the answer is first angle — see `FIRST_ANGLE_PLACEMENT`
 * in objectData.js.
 *
 * `top` carries a tiny z nudge to keep OrbitControls off its polar singularity — a dead-vertical eye
 * has no defined "up" and the controls snap.
 */
export const DIRECTIONS = {
  front: new THREE.Vector3(0, 0, 1),
  top: new THREE.Vector3(0, 1, 0.02).normalize(),
  left: new THREE.Vector3(-1, 0, 0),
  right: new THREE.Vector3(1, 0, 0),
  /** Free-orbit home. Top-Left-Front, so the unfolded drawing reads predictably (RULES.md §5.20). */
  pictorial: new THREE.Vector3(-0.72, 0.5, 0.86).normalize(),
};

/** The directions that are real orthographic views, and therefore land on the ortho camera. */
const PRINCIPAL = new Set(['front', 'top', 'left', 'right']);

/**
 * Blank paper round the object, as a multiplier on its on-screen half-extent.
 *
 * A PROJECTED-BOX fit, not a bounding-sphere one. A sphere's radius is the box half-DIAGONAL, and
 * for an 83 x 44 x 37 bearing block that is 51 mm against an on-screen half-extent of 22 mm from
 * the right — so a sphere fit frames better than twice as much empty paper as the view needs and
 * the part reads as a speck. Each principal direction sees exactly two of the box's three
 * half-extents, so the right pair is simply picked per direction.
 *
 * The pictorial pose keeps the sphere, because a part turned at an angle really can throw a corner
 * out to its half-diagonal.
 */
const PADDING = { principal: 1.25, pictorial: 1.15 };

/** Which two box half-extents each direction projects onto the screen, as (width, height). */
const SCREEN_EXTENT = {
  front: (h) => [h.x, h.y],
  top: (h) => [h.x, h.z],
  left: (h) => [h.z, h.y],
  right: (h) => [h.z, h.y],
};

/** Ortho frustum half-height at zoom 1. Zoom does the framing; this is just the unit. */
const ORTHO_HALF_H = 1;

/** How long the drag-away hand-off from an orthographic view back to perspective takes. */
const RELEASE_MS = 340;

/** How long an idle re-aim onto new content takes. Short — it is a correction, not a move. */
const RETARGET_MS = 260;

/** Scratch vectors for the flight path — allocated once, not per frame. */
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** A direction counts as level when its rise is small enough to orbit as a compass bearing. */
const isLevel = (dir) => Math.abs(dir.y) < 0.2;

/**
 * Describe a camera flight as a ROTATION ABOUT THE TARGET, not a straight line between two points.
 *
 * Lerping the two POSITIONS is wrong for any pair of viewpoints more than a right angle apart, and
 * catastrophically wrong at exactly 180 deg: Left and Right sit on opposite sides of the object, so
 * the straight line between them runs THROUGH the target. Half way across the camera is at the
 * target, its distance is zero and `lookAt` has no defined answer. Front and Top are only 90 deg
 * apart, so their chord misses the centre and the same bug never shows — which is exactly why the
 * two pairs felt different.
 *
 * TWO CASES, and the first one is the whole of the Left/Right fix.
 *
 * LEVEL TO LEVEL (Front, Left, Right, and any orbit the learner leaves at eye height). These are
 * compass bearings round a part standing on a bench, so the axis is world Y and nothing else: the
 * camera walks round the object and the horizon never tilts. The signed angle comes from `atan2`,
 * so the sweep takes the SHORT way; at exactly 180 deg — Left to Right — short is undefined, and
 * the sign is chosen to pass in FRONT of the object rather than behind it, because the front is the
 * face the learner has been told everything is named from.
 *
 * ANYTHING INVOLVING TOP. Top is not a bearing, so its flights tilt in a vertical plane and the
 * axis is the ordinary `from × to`. That path is 90 deg at most and never approaches the
 * degenerate case.
 *
 * A previous version of this function claimed to use world up for the 180 deg case and actually
 * computed `up × fromDir`, which is PERPENDICULAR to up: Left to Right rotated about +Z and took
 * the camera straight over the pole and out the other side upside down. Hence the explicit rule.
 */
function arcBetween(fromPos, fromTarget, toPos, toTarget) {
  const fromOffset = fromPos.clone().sub(fromTarget);
  const toOffset = toPos.clone().sub(toTarget);
  const fromDist = fromOffset.length() || 1e-3;
  const toDist = toOffset.length() || 1e-3;
  const fromDir = fromOffset.divideScalar(fromDist);
  const toDir = toOffset.divideScalar(toDist);

  if (isLevel(fromDir) && isLevel(toDir)) {
    // Signed bearing change about +Y. The y component of `from × to` carries the sense.
    let angle = Math.atan2(
      fromDir.z * toDir.x - fromDir.x * toDir.z,
      THREE.MathUtils.clamp(fromDir.dot(toDir), -1, 1),
    );
    if (Math.abs(Math.abs(angle) - Math.PI) < 1e-4) {
      // Half a turn: both signs are equally short, so take the one whose midpoint faces the
      // observer (+z). Left to Right and Right to Left then both sweep across the front.
      const mid = fromDir.clone().applyAxisAngle(_up, angle / 2);
      if (mid.z < 0) angle = -angle;
    }
    return { fromDir, axis: _up.clone(), angle, fromDist, toDist };
  }

  const dot = THREE.MathUtils.clamp(fromDir.dot(toDir), -1, 1);
  const axis = new THREE.Vector3().crossVectors(fromDir, toDir);
  // Only reachable for a level/steep pair, which cannot be antiparallel, so the cross is real.
  if (axis.lengthSq() < 1e-8) axis.copy(_up);
  axis.normalize();
  return { fromDir, axis, angle: Math.acos(dot), fromDist, toDist };
}

/**
 * @param {{
 *   camera: THREE.PerspectiveCamera,
 *   controls: any,
 *   prefersReducedMotion: boolean,
 *   aspect: () => number,
 * }} deps
 */
export function initCameraRig({ camera, controls, prefersReducedMotion, aspect }) {
  /** Live framing focus, refreshed by `focusOn()` from the rebuild pipeline. */
  let center = new THREE.Vector3(0, 0, 0);
  let half = new THREE.Vector3(1, 1, 1);
  let radius = 3;

  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
  ortho.up.copy(camera.up);

  /** Which camera main.js should render with. */
  let active = camera;
  /** 0 = pure orthographic, 1 = pure perspective, null = no blend live. */
  let morphK = null;

  let flying = false;
  let handle = null;
  let releaseHandle = null;
  let retargetHandle = null;

  /**
   * Point the rig at some content.
   * @param {THREE.Box3} box  The object's world-space bounds, from the rebuild pipeline.
   */
  function focusOn(box) {
    box.getCenter(center);
    box.getSize(half).multiplyScalar(0.5);
    half.set(Math.max(half.x, 0.05), Math.max(half.y, 0.05), Math.max(half.z, 0.05));
    radius = Math.max(half.length(), 0.5);

    // THE TARGET MOVES WITH THE CONTENT — BUT IT MOVES, IT DOES NOT TELEPORT.
    //
    // Orbit and zoom both pivot on `controls.target`, so a target left on the previous object's
    // centre — or on the centre of the same object before its dimension layer changed the box —
    // makes the next scroll pull the part sideways across the pane instead of growing it in place.
    // That is why the target has to follow the content at all (RULES.md §5.22).
    //
    // Setting it in one step, though, IS the view-change jump. Pressing a direction rebuilds the
    // annotation layer BEFORE the flight starts; the new view's dimension set is a different shape
    // from the old one, so the content box and its centre move. Re-aiming the pivot at the new
    // centre swings the camera about a fixed eye point, and the flight's first `lookAt` applied the
    // whole of that swing in a single frame — measured on the Front label, 71–219 px of the pane
    // between one frame and the next, at the head of a 1200 ms flight that was otherwise perfectly
    // smooth. Translating the eye by the same delta to hold the offset does not help and is
    // slightly worse: the eye-to-target vector is preserved, but the eye has still MOVED, so the
    // whole scene slides across the pane by the parallax of that move. There is no instant target
    // change that the learner cannot see.
    //
    // So it is a tween, on the same engine as everything else that moves here. Two consequences,
    // and both are the point:
    //   • A FLIGHT cancels it and reads `controls.target` where it stands — which is still the old
    //     centre, because the tween has only applied t = 0. The flight then carries the target the
    //     whole way itself, alongside the eye, exactly as it already did. The pop disappears
    //     because the instant step it was made of no longer exists.
    //   • An IDLE re-frame — a new object, or the Dimensions switch — eases onto the new centre
    //     over a quarter of a second instead of snapping to it.
    if (flying) return;   // the flight owns the target for its whole duration and lands it exactly
    retargetHandle?.cancel();
    retargetHandle = null;
    if (controls.target.distanceToSquared(center) < 1e-8) return;

    const from = controls.target.clone();
    const to = center.clone();
    retargetHandle = tween({
      from: 0,
      to: 1,
      duration: prefersReducedMotion ? 0 : RETARGET_MS,
      ease: easeStandard,
      onUpdate: (t) => { controls.target.lerpVectors(from, to, t); },
      onComplete: () => {
        retargetHandle = null;
        controls.target.copy(to);
        settle();
      },
    });
  }

  /**
   * Apply a pose change to the controls with the damping loop SILENT.
   *
   * `controls.update()` with damping on also spends whatever rotation and dolly inertia the last
   * drag left in the controls — so a learner who flicks the object and then presses Front gets the
   * flight's exact landing pose plus a residue of their own flick, and the view creeps off square in
   * the frames after it lands. Turning damping off for the one flushing update discards that residue
   * instead of applying it; the setting is restored immediately, so the next real drag still eases.
   */
  function settle() {
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    controls.update();
    controls.enableDamping = damping;
  }

  /**
   * The vertical half-extent the frame has to hold for a named direction, in world units.
   *
   * Both cameras frame VERTICALLY, so a pane narrower than it is tall is bound by WIDTH: the
   * width requirement is converted into the vertical field it implies (`w / aspect`) and whichever
   * of the two is larger wins. Without that a principal view leaves frame sideways the moment the
   * drawing sheet takes half the bench.
   */
  function halfHeightFor(name) {
    const a = Math.max(aspect?.() ?? 1, 1e-3);
    const extent = SCREEN_EXTENT[name];
    if (!extent) return radius * PADDING.pictorial * Math.max(1, 1 / a);
    const [w, h] = extent(half);
    return Math.max(h, w / a) * PADDING.principal;
  }

  /** Resolve a named direction into a concrete pose against the live framing. */
  function pose(name, override = {}) {
    const dir = DIRECTIONS[name] ?? DIRECTIONS.pictorial;
    const c = override.center ?? center;
    const halfH = override.halfHeight ?? halfHeightFor(name);
    const dist = halfH / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    return { pos: c.clone().addScaledVector(dir, dist), target: c.clone() };
  }

  /** Size the ortho frustum to the viewport, keeping whatever zoom is set. */
  function syncOrthoFrustum() {
    const a = Math.max(aspect?.() ?? 1, 1e-3);
    ortho.left = -ORTHO_HALF_H * a;
    ortho.right = ORTHO_HALF_H * a;
    ortho.top = ORTHO_HALF_H;
    ortho.bottom = -ORTHO_HALF_H;
    ortho.updateProjectionMatrix();
  }

  /**
   * The zoom at which the ortho camera frames the same content the perspective camera does from
   * `dist`. Matching it is what makes the morph read as a projection change rather than a dolly.
   */
  function zoomFor(dist) {
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
    return ORTHO_HALF_H / Math.max(halfH, 1e-3);
  }

  /** Hand the view to the ortho camera at the perspective camera's exact current pose. */
  function engageOrtho() {
    if (active === ortho) return;
    ortho.position.copy(camera.position);
    ortho.up.copy(camera.up);
    ortho.quaternion.copy(camera.quaternion);
    syncOrthoFrustum();
    ortho.zoom = zoomFor(camera.position.distanceTo(controls.target));
    ortho.updateProjectionMatrix();
    active = ortho;
    controls.object = ortho;
  }

  /** Hand the view back to the perspective camera at the ortho camera's exact current pose. */
  function releaseOrtho() {
    if (active !== ortho) return;
    camera.position.copy(ortho.position);
    camera.up.copy(ortho.up);
    camera.quaternion.copy(ortho.quaternion);
    active = camera;
    controls.object = camera;
    morphK = null;
    ortho.updateProjectionMatrix();   // discard the blend; leave a clean matrix behind
    controls.update();
  }

  /**
   * Fly to a NAMED direction.
   *
   * A principal direction lands on the ortho camera with the morph running perspective -> ortho on
   * the flight's own curve; the pictorial home runs it the other way and hands back. Either way the
   * projection change and the pose change are the SAME move, which is what stops it reading as two.
   */
  function flyToNamed(name, { duration = 1200, ease = easeCamera, onDone } = {}) {
    handle?.cancel();
    releaseHandle?.cancel();
    releaseHandle = null;
    // The flight takes the target over from here — including any idle re-aim that has only just
    // started, which is what keeps the head of the flight continuous.
    retargetHandle?.cancel();
    retargetHandle = null;

    const wantOrtho = PRINCIPAL.has(name);
    const target = pose(name);

    if (wantOrtho) engageOrtho();
    // Leaving a principal view: stay on the ortho camera for the flight and morph it back to
    // perspective, then swap at the end — where the two matrices are identical, so nothing pops.
    const cam = active;
    const fromPos = cam.position.clone();
    const fromTarget = controls.target.clone();
    const arc = arcBetween(fromPos, fromTarget, target.pos, target.target);
    const fromZoom = ortho.zoom;
    const toZoom = zoomFor(target.pos.distanceTo(target.target));
    const fromK = morphK ?? (cam === ortho ? 1 : 0);
    const toK = wantOrtho ? 0 : 1;
    const onOrtho = cam === ortho;

    flying = true;
    controls.enabled = false;
    if (onOrtho) morphK = fromK;

    handle = tween({
      from: 0,
      to: 1,
      duration: prefersReducedMotion ? 0 : duration,
      ease,
      onUpdate: (t) => {
        // Swing the eye round the target: rotate the offset direction and ease the distance.
        controls.target.lerpVectors(fromTarget, target.target, t);
        _dir.copy(arc.fromDir).applyAxisAngle(arc.axis, arc.angle * t);
        cam.position.copy(controls.target)
          .addScaledVector(_dir, THREE.MathUtils.lerp(arc.fromDist, arc.toDist, t));
        cam.up.copy(_up);
        cam.lookAt(controls.target);
        if (onOrtho) {
          ortho.zoom = THREE.MathUtils.lerp(fromZoom, toZoom, t);
          syncOrthoFrustum();                       // pure ortho; the morph blends on top
          morphK = fromK + (toK - fromK) * t;
        }
      },
      onComplete: () => {
        cam.position.copy(target.pos);
        controls.target.copy(target.target);
        if (onOrtho) {
          ortho.zoom = toZoom;
          syncOrthoFrustum();
          morphK = toK;
        }
        settle();
        controls.enabled = true;
        flying = false;
        handle = null;
        // Landing on the pictorial home means the morph has reached perspective, where the two
        // matrices agree — so the swap is invisible.
        if (!wantOrtho) releaseOrtho();
        onDone?.();
      },
    });
  }

  /**
   * The learner has grabbed an orthographic view. Give the depth back over the first third of a
   * second of the drag rather than snapping — they keep dragging throughout, and the view gains
   * depth as it turns, which is the honest thing for it to do.
   */
  function releaseOnDrag() {
    if (active !== ortho || releaseHandle || flying) return;
    const fromK = morphK ?? 0;
    releaseHandle = tween({
      from: 0,
      to: 1,
      duration: prefersReducedMotion ? 0 : RELEASE_MS,
      onUpdate: (t) => { morphK = fromK + (1 - fromK) * t; },
      onComplete: () => { releaseHandle = null; releaseOrtho(); },
    });
  }

  /**
   * Stamp the blended projection onto the ortho camera for this frame. main.js calls it in the
   * render loop, last, so it is the final word on the matrix before the draw.
   *
   * An element-wise lerp of two projection matrices is not a physically exact camera, but between
   * matched-framing endpoints over a sub-second move it reads cleanly as the scene losing or
   * gaining depth — and it is the only thing that removes the projection-type cut.
   */
  function update() {
    if (active !== ortho || morphK === null) return;
    const o = ortho.projectionMatrix.elements;
    const p = camera.projectionMatrix.elements;
    for (let i = 0; i < 16; i++) o[i] += (p[i] - o[i]) * morphK;
    ortho.projectionMatrixInverse.copy(ortho.projectionMatrix).invert();
  }

  /** Abort any flight and hand the camera straight back to the learner. */
  function cancel() {
    handle?.cancel();
    releaseHandle?.cancel();
    retargetHandle?.cancel();
    handle = null;
    releaseHandle = null;
    retargetHandle = null;
    flying = false;
    controls.enabled = true;
  }

  /** Land on a pose with no motion at all (boot + reset). Perspective only — reset goes home. */
  function snapTo(target) {
    cancel();
    releaseOrtho();
    camera.position.copy(target.pos);
    controls.target.copy(target.target);
    settle();
  }

  /** Keep the ortho frustum square with the pane. Unconditional: a resize while the perspective
   *  camera is live still has to leave a correct frustum behind for the next engage. */
  function resize() {
    syncOrthoFrustum();
  }

  return {
    focusOn,
    pose,
    flyToNamed,
    releaseOnDrag,
    snapTo,
    cancel,
    update,
    resize,
    isFlying: () => flying,
    /** Which camera main.js should render and resize this frame. */
    activeCamera: () => active,
  };
}
