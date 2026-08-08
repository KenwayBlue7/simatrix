// Camera rig — every view change in this topic is an eased flight, never a teleport.
//
// The task brief and the platform motion language agree on the rule: the camera must MOVE between
// viewpoints so the learner keeps their bearings (DESIGN.md §5.10; Topic 1 established the same
// contract for Module 4). A cut would silently destroy the one thing this topic is trying to build —
// the sense that the orthographic views and the isometric drawing are the SAME object seen from
// different directions.
//
// Poses are stored as DIRECTIONS, not positions, and the distance is derived per rebuild from the
// live content radius. That is what lets a 20 mm cube and a 110 mm cuboid both sit comfortably in
// frame without an auto-zoom chasing the geometry: the framing is recomputed once, at the moment the
// solid changes, and every flight after that is a fixed-duration eased move (RULES.md §5.1/§5.2 —
// a one-shot eased dolly, never a per-frame exponential follow).
//
// Layering (CLAUDE.md): leaf module. Imports THREE and the shared `anim.js` tween engine; owns no
// DOM and no scene objects. main.js injects the camera and controls.

import * as THREE from 'three';
import { tween, easeCamera } from './anim.js';

/**
 * Named viewing DIRECTIONS (unit vectors from the target toward the camera).
 *
 * `isometric` is the equal-component direction (1,1,1): from there the three principal edge
 * directions make equal angles with the picture plane, which is the definition of the isometric
 * position and the reason the vertical axis draws vertical and the other two at 30°.
 *
 * `top` carries a tiny z nudge to keep OrbitControls off its polar singularity — a dead-vertical eye
 * has no defined "up" and the controls snap.
 */
export const DIRECTIONS = {
  front: new THREE.Vector3(0, 0, 1),
  top: new THREE.Vector3(0, 1, 0.02).normalize(),
  side: new THREE.Vector3(1, 0, 0),
  threeQuarter: new THREE.Vector3(0.62, 0.42, 0.75).normalize(),
  isometric: new THREE.Vector3(1, 1, 1).normalize(),
};

/**
 * Multiplier on the content radius that sets how much blank paper surrounds the solid.
 *
 * The isometric pose is the loosest on purpose: during Steps 4 and 6 the frame has to hold not just
 * the solid but the enclosing box, the three axes with their overshoot, and the dimension callouts
 * pinned outboard of the box edges. Framing it as tightly as the principal views crops the very
 * construction the step exists to show.
 */
const FRAMING = {
  front: 2.6,
  top: 2.6,
  side: 2.6,
  threeQuarter: 3.4,
  isometric: 4.2,
};

/**
 * @param {{ camera: THREE.PerspectiveCamera, controls: any, prefersReducedMotion: boolean }} deps
 */
export function initCameraRig({ camera, controls, prefersReducedMotion }) {
  /** Live framing focus, refreshed by `focusOn()` from the rebuild pipeline. */
  let center = new THREE.Vector3(0, 0, 0);
  let radius = 3;

  let flying = false;
  let handle = null;

  /**
   * Point the rig at some content. Called once per rebuild with the solid's own bounds, and again
   * for Step 5 where TWO solids must both fit.
   * @param {THREE.Vector3} newCenter
   * @param {number} newRadius  Half the diagonal of the content, in world units.
   */
  function focusOn(newCenter, newRadius) {
    center = newCenter.clone();
    radius = Math.max(newRadius, 0.5);
  }

  /**
   * Resolve a named direction into a concrete pose against the live framing.
   * @param {keyof typeof DIRECTIONS} name
   * @param {{ center?: THREE.Vector3, radius?: number }} [override]
   */
  function pose(name, override = {}) {
    const dir = DIRECTIONS[name] ?? DIRECTIONS.isometric;
    const c = override.center ?? center;
    const r = override.radius ?? radius;
    const dist = r * (FRAMING[name] ?? 2.7);
    return { pos: c.clone().addScaledVector(dir, dist), target: c.clone() };
  }

  /**
   * Fly the camera to a pose. Orbit is disabled for the duration so the learner's drag and our own
   * motion can never fight; damping is skipped while flying (main.js checks `isFlying()`).
   *
   * @param {{pos:THREE.Vector3,target:THREE.Vector3}} target
   * @param {{ duration?: number, ease?: (x:number)=>number, onDone?: () => void }} [opts]
   */
  function flyTo(target, { duration = 1300, ease = easeCamera, onDone } = {}) {
    handle?.cancel();
    const fromPos = camera.position.clone();
    const fromTarget = controls.target.clone();
    flying = true;
    controls.enabled = false;

    handle = tween({
      from: 0,
      to: 1,
      duration: prefersReducedMotion ? 0 : duration,
      ease,
      onUpdate: (k) => {
        camera.position.lerpVectors(fromPos, target.pos, k);
        controls.target.lerpVectors(fromTarget, target.target, k);
        camera.lookAt(controls.target);
      },
      onComplete: () => {
        camera.position.copy(target.pos);
        controls.target.copy(target.target);
        controls.update();
        controls.enabled = true;
        flying = false;
        handle = null;
        onDone?.();
      },
    });
  }

  /** Convenience: fly to a NAMED direction against the live framing. */
  function flyToNamed(name, opts) { flyTo(pose(name), opts); }

  /** Abort any flight and hand the camera straight back to the learner. */
  function cancel() {
    handle?.cancel();
    handle = null;
    flying = false;
    controls.enabled = true;
  }

  /**
   * Slide what the camera is AIMED at, without changing where it is looking FROM.
   *
   * Both the eye and the target move by the same delta, so the viewing direction and the distance
   * are untouched — an orbit the learner set by hand survives intact. This exists for Phase A: the
   * 30° annotation is only true while the construction origin sits on the principal axis, and a
   * dimension edit moves that origin. Re-flying the camera would restart the phase; re-posing it
   * would throw away the learner's orbit. Shifting the target does neither.
   *
   * @param {THREE.Vector3} point
   */
  function retarget(point) {
    const delta = point.clone().sub(controls.target);
    if (delta.lengthSq() < 1e-10) return;
    camera.position.add(delta);
    controls.target.copy(point);
    controls.update();
  }

  /** Land the camera on a pose with no motion at all (boot + reset). */
  function snapTo(target) {
    cancel();
    camera.position.copy(target.pos);
    controls.target.copy(target.target);
    controls.update();
  }

  return {
    focusOn,
    pose,
    flyTo,
    flyToNamed,
    retarget,
    snapTo,
    cancel,
    isFlying: () => flying,
    /** Live framing, so callers can widen it (Step 5's two solids) without re-deriving it. */
    framing: () => ({ center: center.clone(), radius }),
  };
}
