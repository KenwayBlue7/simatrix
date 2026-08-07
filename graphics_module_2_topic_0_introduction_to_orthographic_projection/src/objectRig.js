// Object rig — turns an `objectData` part list into the 3D teaching solid Step 1 is orbited.
//
// ONE switch, over geometry KINDS (`extrude` / `lathe`) — never over object names, so adding a
// fifth textbook part is appending one object to the registry, not editing this file (the sibling
// topic's ADR-043 pattern).
//
// WHY THOSE TWO KINDS AND NO MORE. Every machine part in Chapter 19 is a set of PRISMATIC pieces:
// a profile, optionally with holes in it, pushed along one principal axis. `ExtrudeGeometry` with
// bevelling off builds exactly that, closed, with the holes carried through — so a bolt hole is
// real material missing rather than a circle drawn on a face, and orbiting the part can never
// expose a lie. The one thing an extrusion cannot express is a BLIND pocket, because a blind pocket
// has a floor; that is what `lathe` is for, and the cylindrical block's bore is the only place it
// is used.
//
// Where two pieces meet they meet on a shared FACE (the boss standing on its plate, a lug standing
// on its base). That is a butt joint, not the overlapping-volume defect RULES.md §3.29 forbids —
// nothing here stacks two extrusions through the same material, and this topic runs no occlusion
// raycaster for a pile of coincident triangles to slow down.
//
// Linework rules honoured: fat lines only (§3.12/§3.13), hard-edged bodies so `EdgesGeometry` finds
// real creases (§3.14), `polygonOffset` on the body or faces z-fight the outline (§3.18),
// `computeLineDistances()` on every line object (§3.17), `LineMaterial.resolution` re-synced on
// resize (§3.16). Everything built here is owned here and freed by its own `dispose()`, so the
// single `rebuild()` pipeline can drop a whole object in one call (§3.1/§3.3).
//
// Layering (CLAUDE.md): leaf module. Imports THREE, the fat-line addons, the pure-data
// `objectData.js` and the stateless `tokens.js` util (RULES.md §3.6a) — never a behaviour leaf.

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { toWorld } from './objectData.js';
import { roleColor, WEIGHT } from './tokens.js';

/** Segments around a revolved surface. Enough that a bore rim reads as a smooth circle. */
const LATHE_SEGMENTS = 64;

/**
 * Crease angle for `EdgesGeometry`, in degrees.
 *
 * Deliberately generous. A tessellated fillet or bore wall is a fan of facets a few degrees apart;
 * at a small threshold every one of them earns a line and the part grows a comb of seams down every
 * curved surface. At 24 deg only real corners survive, which is what a drafted outline shows.
 */
const CREASE_DEG = 24;

/** Build a `THREE.Shape` from an outline loop plus optional hole loops, all in a 2D profile frame. */
function shapeFrom(outline, holes = []) {
  const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const loop of holes) {
    shape.holes.push(new THREE.Path(loop.map(([u, v]) => new THREE.Vector2(u, v))));
  }
  return shape;
}

/**
 * One part spec -> one geometry, already placed in world space and seated so the object rests on
 * y = 0 (the seating the orthographic views assume, which is what lets a height read straight
 * across from the elevation).
 *
 * PROFILE FRAMES. `ExtrudeGeometry` always pushes along its shape's own +z, so each axis needs one
 * fixed rotation, and each rotation imposes which pair of world coordinates the profile is authored
 * in. Those pairs are the ones `objectData.js` documents; the sign flips below are the rotations,
 * not a second convention.
 *
 * @param {object} part
 * @returns {THREE.BufferGeometry}
 */
function buildPart(part) {
  switch (part.k) {
    case 'extrude': {
      const depth = toWorld(Math.abs(part.to - part.from));
      const scale = ([u, v]) => [toWorld(u), toWorld(v)];
      const axis = part.axis;
      // Author-frame -> shape-frame. See the rotations applied straight after.
      const map = axis === 'y'
        ? ([x, z]) => scale([x, -z])      // XZ profile, pushed up
        : axis === 'x'
          ? ([z, y]) => scale([-z, y])    // ZY profile, pushed along +x
          : ([x, y]) => scale([x, y]);    // XY profile, pushed along +z

      const shape = shapeFrom(part.outline.map(map), (part.holes ?? []).map((h) => h.map(map)));
      const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });

      if (axis === 'y') { g.rotateX(-Math.PI / 2); g.translate(0, toWorld(part.from), 0); }
      else if (axis === 'x') { g.rotateY(Math.PI / 2); g.translate(toWorld(part.from), 0, 0); }
      else { g.translate(0, 0, toWorld(part.from)); }
      return g;
    }
    case 'lathe': {
      const pts = part.profile.map(([r, y]) => new THREE.Vector2(toWorld(r), toWorld(y)));
      const g = new THREE.LatheGeometry(pts, LATHE_SEGMENTS);
      const [x, z] = part.at ?? [0, 0];
      g.translate(toWorld(x), 0, toWorld(z));
      return g;
    }
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

/**
 * The FRONT arrow — the chapter's own `F`, the mark that says which way the elevation is taken.
 *
 * Every worked figure in Chapter 19 carries it, and it is the thing that makes "the front view" a
 * fact about the drawing rather than a guess: without it, the learner has to infer which face the
 * draughtsman called the front. It sits clear of the object at +z, points back at the front face
 * along -z, and is labelled with a live DOM node (RULES.md §3.27) rather than a baked sprite.
 *
 * COLOUR — a named exception to the Chrome-Only Blue Rule (RULES.md §4.5, ADR-130). The arrow is
 * not domain geometry and carries no engineering meaning: it is an INSTRUCTION to the learner
 * about where to stand, the same category as the accent `.vp-hint` chips that already float in
 * this viewport. Reading it as ink would make it a feature of the part, which it is not. Nothing
 * else in the viewport may take the accent.
 *
 * @returns {{ group: THREE.Group, label: CSS2DObject, dispose: () => void }}
 */
function buildFrontArrow(bounds, resolution) {
  const group = new THREE.Group();
  const owned = { geometries: [], materials: [] };

  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z);

  // The arrow lies ENTIRELY in front of the part: its point stops just short of the front face and
  // its tail runs away from there. Sizing it from a length and then subtracting put the point
  // inside the material on any part deeper than the arrow is long, which reads as an arrow stuck
  // THROUGH the object rather than one aimed at it.
  const tipZ = bounds.max.z + span * 0.05;
  const len = span * 0.20;
  const tailZ = tipZ + len;
  const head = Math.min(len * 0.20, span * 0.032);
  // Kept low, at the height of the front face rather than the middle of the part, so it reads as
  // an eye-level sight line onto the front rather than as a feature hanging in space.
  const y = bounds.min.y + size.y * 0.32;

  const material = new LineMaterial({
    color: roleColor('guide'),
    // The DIMENSION weight — the thinnest in the palette. The textbook's `F` is a fine leader
    // with a small head; the object is the subject and its annotation must not out-draw it, which
    // is the same reasoning `tokens.js` gives for dimension linework.
    linewidth: WEIGHT.dimension,
    transparent: true,
    opacity: 1,
  });
  material.resolution.copy(resolution);
  owned.materials.push(material);

  const shaft = new LineSegmentsGeometry();
  shaft.setPositions([centre.x, y, tailZ, centre.x, y, tipZ + head]);
  owned.geometries.push(shaft);
  const line = new LineSegments2(shaft, material);
  line.computeLineDistances();
  group.add(line);

  const coneGeo = new THREE.ConeGeometry(head * 0.28, head, 16);
  coneGeo.rotateX(-Math.PI / 2);                    // point along -z, at the front face
  coneGeo.translate(centre.x, y, tipZ + head / 2);
  owned.geometries.push(coneGeo);
  const coneMat = new THREE.MeshBasicMaterial({ color: roleColor('guide') });
  owned.materials.push(coneMat);
  group.add(new THREE.Mesh(coneGeo, coneMat));

  const el = document.createElement('span');
  el.className = 'vp-label vp-label--front';
  el.textContent = 'Front';
  const label = new CSS2DObject(el);
  // BELOW the part, not on the arrow's tail. Seen from the front the arrow points straight at the
  // camera and foreshortens to a dot, so a label at the tail lands in the middle of the object it
  // is naming. Dropped clear, it reads from every direction the arrow is shown in — which is only
  // the front, but the front is exactly the degenerate one.
  label.position.set(centre.x, bounds.min.y - span * 0.10, tailZ + span * 0.03);
  group.add(label);

  return {
    group,
    /**
     * Show or hide the whole mark.
     *
     * The label is toggled BY NAME as well as through the group. `CSS2DRenderer` tests each
     * object's own `visible` flag as it walks the scene and never consults its ancestors, so a
     * hidden parent group hides the arrow's WebGL linework and leaves its DOM label floating on
     * screen with nothing to point at.
     */
    setVisible(on) {
      group.visible = on;
      label.visible = on;
    },
    setResolution(w, h) { material.resolution.set(w, h); },
    dispose() {
      // The DOM node must leave with the geometry, or labels accumulate (RULES.md §3.5).
      el.remove();
      label.removeFromParent();
      group.removeFromParent();
      owned.geometries.forEach((g) => g.dispose());
      owned.materials.forEach((m) => m.dispose());
      group.clear();
    },
  };
}

/**
 * Build one textbook object.
 *
 * @param {object} data              An entry from `OBJECTS`.
 * @param {THREE.Vector2} resolution Drawing-buffer size for `LineMaterial`.
 * @returns {{
 *   group: THREE.Group,
 *   bounds: THREE.Box3,
 *   setOpacity: (v:number) => void,
 *   setAnnotations: (on:boolean) => void,
 *   setResolution: (w:number,h:number) => void,
 *   dispose: () => void,
 * }}
 */
export function buildObject(data, resolution) {
  const group = new THREE.Group();
  const geometries = [];
  const materials = [];

  const bodyMaterial = new THREE.MeshPhongMaterial({
    color: roleColor('solid'),
    shininess: 0,             // flat CAD read: no PBR, no shadows (RULES.md §3.24)
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,   // extrusion winding varies with how a profile was authored
  });
  materials.push(bodyMaterial);

  const inkMaterial = new LineMaterial({
    color: roleColor('finished'),
    linewidth: WEIGHT.finished,
    transparent: true,
    opacity: 1,
  });
  inkMaterial.resolution.copy(resolution);
  materials.push(inkMaterial);

  for (const part of data.parts) {
    const geometry = buildPart(part);
    geometries.push(geometry);
    group.add(new THREE.Mesh(geometry, bodyMaterial));

    const source = new THREE.EdgesGeometry(geometry, CREASE_DEG);
    const lineGeo = new LineSegmentsGeometry().fromEdgesGeometry(source);
    source.dispose();
    geometries.push(lineGeo);
    const edges = new LineSegments2(lineGeo, inkMaterial);
    edges.computeLineDistances();
    group.add(edges);
  }

  // Centre the object about the origin in x and z, leaving it seated on y = 0. Authoring is done
  // against the textbook's own datum (a base that runs from -41 to +42, say), and the camera rig
  // frames a centre — so the part is re-hung once, here, rather than every author having to keep
  // their numbers symmetrical.
  const raw = new THREE.Box3().setFromObject(group);
  group.position.x = -(raw.min.x + raw.max.x) / 2;
  group.position.z = -(raw.min.z + raw.max.z) / 2;

  const partBounds = new THREE.Box3().setFromObject(group);

  // The annotation layer. Its own child group, so one flag hides every mark the topic adds to the
  // part without touching the part itself.
  const arrow = buildFrontArrow(partBounds, resolution);
  group.add(arrow.group);

  // Framed WITH the arrow. The front view is unaffected either way — it frames x and y, and the
  // arrow only adds depth — while the top and side views, where the arrow lies across the screen,
  // make room for it instead of cropping it at the edge.
  const bounds = new THREE.Box3().setFromObject(group);

  return {
    group,
    bounds,
    /** The solid's box in its OWN frame, before the re-centring above — what the dimension layer
     *  places its planes against, since it is parented inside this same group. */
    localBounds: partBounds,
    setOpacity(v) {
      bodyMaterial.opacity = v;
      inkMaterial.opacity = v;
      group.visible = v > 0.001;
    },
    /**
     * Show or hide the Front arrow.
     *
     * Driven by main.js, which shows it only while the camera is at the FRONT and annotations are
     * on: the arrow says "the elevation is taken this way", and pointing at the front of a solid
     * being read from the top or the side is an instruction about a view the learner is not in.
     */
    setFrontArrow(on) { arrow.setVisible(on); },
    setResolution(w, h) {
      inkMaterial.resolution.set(w, h);
      arrow.setResolution(w, h);
    },
    dispose() {
      arrow.dispose();
      group.removeFromParent();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => { m.map?.dispose(); m.dispose(); });
      geometries.length = 0;
      materials.length = 0;
      group.clear();
    },
  };
}
