// trueLength.js — the True-Length & true-inclinations construction leaf (rotating-line method).
//
// When a line is inclined to BOTH planes, neither view shows the true length. The rotating-line
// method swings each view parallel to XY to reveal it: Part A rotates the TOP view about the pivot
// end → True Length & θ (with HP); Part B rotates the FRONT view about the pivot → True Length &
// φ (with VP). A 12-phase animated construction on the orthographic sheet.
//
// Phase 4E scope: the construction GEOMETRY only (the rotated view, its locus arc, the projector,
// the horizontal locus, the recovered True-Length line, and the θ/φ angle arcs). Text callouts
// (b₁, TL value, θ/φ labels) are the CSS2D-label phase — deferred. All aids are THIN THREE.Line +
// small meshes (no fat lines → no resolution sync), rendered in compareSheet's ortho scene (the
// 2nd pass) and disposed by compareSheet.clearConstruction() (the disposal contract).
//
// Layering (ADR-007 / §3.6): leaf module — imports only the pure-math sheet2DLayout.js.

import * as THREE from 'three';
import { layout2D } from './sheet2DLayout.js';
import { addLabel } from './labels.js';
import { PLACEMENT, bisectorAnchor } from './labelPlacement.js';

const P2 = PLACEMENT.sheet2D; // marker letter · angle-bisector radius · TL-value lift (one shared policy)

const TL_N = 12;
const DURATION = 9000;

const rootStyle = () => getComputedStyle(document.documentElement);
const cssColor = (name, fallback) => new THREE.Color(rootStyle().getPropertyValue(name).trim() || fallback);

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lc = (x, a, b) => clamp01((x - a) / (b - a));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lerp2 = (P, Q, t) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];

/** @param {{ resolved:object }} o  @returns {{ group, animate:(p:number)=>void, duration:number }} */
export function createTrueLength({ resolved }) {
  const group = new THREE.Group();
  const COL = {
    hp: cssColor('--color-hp-line', '#007f7c').getHex(),
    vp: cssColor('--color-vp-line', '#bc5d1e').getHex(),
    construct: cssColor('--construct', '#5a5d66').getHex(),
    locus: cssColor('--locus', '#938b7b').getHex(),
    tlg: cssColor('--tl-green', '#2f8f4e').getHex(),
  };

  function conLine(colHex, dashed) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color: colHex, dashSize: 0.16, gapSize: 0.12, transparent: true })
      : new THREE.LineBasicMaterial({ color: colHex, transparent: true });
    const l = new THREE.Line(geo, mat); group.add(l); return l;
  }
  const setSeg = (l, a, b) => {
    l.geometry.setFromPoints([new THREE.Vector3(a[0], a[1], 0), new THREE.Vector3(b[0], b[1], 0)]);
    if (l.material.isLineDashedMaterial) l.computeLineDistances();
  };
  function setArc(l, cx, cy, r, a0, a1) {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.12)), pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0)); }
    l.geometry.setFromPoints(pts); if (l.material.isLineDashedMaterial) l.computeLineDistances();
  }
  const setOp = (o, v) => o.traverse((c) => {
    if (c.material) { c.material.transparent = true; c.material.opacity = v; }
    else if (c.element) c.element.style.opacity = v; // CSS2D labels fade with their reveal
  });
  function marker(x, y, colHex, label) {
    const g = new THREE.Group(); g.position.set(x, y, 0); group.add(g);
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.12, 18), new THREE.MeshBasicMaterial({ color: colHex, transparent: true, depthTest: false }));
    d.renderOrder = 3; g.add(d);
    if (label) addLabel(g, label, P2.marker, { color: '--tl-green', size: '10px' });
    return g;
  }

  const L = layout2D(resolved);
  const { A1, B1, A2, B2 } = L;
  const pivotIsA = A1[0] <= B1[0];
  const fvPiv = pivotIsA ? A1 : B1, fvOth = pivotIsA ? B1 : A1;
  const tvPiv = pivotIsA ? A2 : B2, tvOth = pivotIsA ? B2 : A2;
  const pivX = fvPiv[0];
  const Lplan = Math.hypot(tvOth[0] - tvPiv[0], tvOth[1] - tvPiv[1]);
  const Lelev = Math.hypot(fvOth[0] - fvPiv[0], fvOth[1] - fvPiv[1]);
  const tvRot = [pivX + Lplan, tvPiv[1]], fvRot = [pivX + Lelev, fvPiv[1]];
  const bTLA = [pivX + Lplan, fvOth[1]], bTLB = [pivX + Lelev, tvOth[1]];
  const startA = Math.atan2(tvOth[1] - tvPiv[1], tvOth[0] - tvPiv[0]);
  const startB = Math.atan2(fvOth[1] - fvPiv[1], fvOth[0] - fvPiv[0]);
  const dirA = Math.atan2(bTLA[1] - fvPiv[1], bTLA[0] - fvPiv[0]);
  const dirB = Math.atan2(bTLB[1] - tvPiv[1], bTLB[0] - tvPiv[0]);

  // Part A elements (top-view rotation → TL & θ)
  const rotTV = conLine(COL.hp, false);
  const arcA = conLine(COL.locus, false);
  const projA = conLine(COL.construct, true);
  const fvLoc = conLine(COL.locus, true);
  const markA = marker(bTLA[0], bTLA[1], COL.tlg, 'b₁′');
  const tlA = conLine(COL.tlg, false);
  const thetaA = conLine(COL.tlg, false);
  // Part B elements (front-view rotation → TL & φ)
  const rotFV = conLine(COL.vp, false);
  const arcB = conLine(COL.locus, false);
  const projB = conLine(COL.construct, true);
  const tvLoc = conLine(COL.locus, true);
  const markB = marker(bTLB[0], bTLB[1], COL.tlg, 'b₁');
  const tlB = conLine(COL.tlg, false);
  const phiB = conLine(COL.tlg, false);

  // CSS2D construction labels (θ / φ true angles + the recovered True-Length value), driven by
  // the animation windows below. b₁ / b₁′ ride their markers (marker() adds them).
  const R = P2.angleRadius, tlLift = P2.tlValueLift;
  const thLbl = addLabel(group, `θ=${Math.round(resolved.theta)}°`, bisectorAnchor(fvPiv, dirA / 2, R), { color: '--tl-green', size: '11px' });
  const tlLblA = addLabel(group, `TL ${Math.round(resolved.tl)}`, [(fvPiv[0] + bTLA[0]) / 2, (fvPiv[1] + bTLA[1]) / 2 + tlLift, 0], { color: '--tl-green', mono: true, size: '10px' });
  const phLbl = addLabel(group, `φ=${Math.round(resolved.phi)}°`, bisectorAnchor(tvPiv, dirB / 2, R), { color: '--tl-green', size: '11px' });
  const tlLblB = addLabel(group, `TL ${Math.round(resolved.tl)}`, [(tvPiv[0] + bTLB[0]) / 2, (tvPiv[1] + bTLB[1]) / 2 - tlLift, 0], { color: '--tl-green', mono: true, size: '10px' });
  [thLbl, tlLblA, phLbl, tlLblB].forEach((l) => setOp(l, 0));

  const aidsA = [rotTV, arcA, projA, fvLoc], aidsB = [rotFV, arcB, projB, tvLoc];

  function animate(p) {
    const G = p * TL_N;
    // ---- Part A ----
    { const t = easeOut(lc(G, 0, 1)), ang = startA + (0 - startA) * t;
      setSeg(rotTV, tvPiv, [tvPiv[0] + Math.cos(ang) * Lplan, tvPiv[1] + Math.sin(ang) * Lplan]); setOp(rotTV, G > 0 ? 1 : 0); }
    { const t = easeOut(lc(G, 1, 2)); setArc(arcA, tvPiv[0], tvPiv[1], Lplan, startA, startA + (0 - startA) * t); setOp(arcA, G >= 1 ? 1 : 0); }
    { const t = easeOut(lc(G, 2, 3)); setSeg(projA, tvRot, [tvRot[0], tvRot[1] + (bTLA[1] - tvRot[1]) * t]); setOp(projA, G >= 2 ? 1 : 0);
      setSeg(fvLoc, [fvOth[0], fvOth[1]], [bTLA[0], fvOth[1]]); setOp(fvLoc, lc(G, 2.5, 3.2)); }
    setOp(markA, lc(G, 3, 3.5));
    { const t = easeOut(lc(G, 4, 5)); setSeg(tlA, fvPiv, lerp2(fvPiv, bTLA, t)); setOp(tlA, G >= 4 ? 1 : 0); }
    setArc(thetaA, fvPiv[0], fvPiv[1], 0.8, 0, dirA); setOp(thetaA, lc(G, 5, 5.4));
    setOp(tlLblA, lc(G, 4.3, 4.9)); setOp(thLbl, lc(G, 5, 5.6));
    // ---- Part B ----
    { const t = easeOut(lc(G, 6, 7)), ang = startB + (0 - startB) * t;
      setSeg(rotFV, fvPiv, [fvPiv[0] + Math.cos(ang) * Lelev, fvPiv[1] + Math.sin(ang) * Lelev]); setOp(rotFV, G >= 6 ? 1 : 0); }
    { const t = easeOut(lc(G, 7, 8)); setArc(arcB, fvPiv[0], fvPiv[1], Lelev, startB, startB + (0 - startB) * t); setOp(arcB, G >= 7 ? 1 : 0); }
    { const t = easeOut(lc(G, 8, 9)); setSeg(projB, fvRot, [fvRot[0], fvRot[1] + (bTLB[1] - fvRot[1]) * t]); setOp(projB, G >= 8 ? 1 : 0);
      setSeg(tvLoc, [tvOth[0], tvOth[1]], [bTLB[0], tvOth[1]]); setOp(tvLoc, lc(G, 8.5, 9.2)); }
    setOp(markB, lc(G, 9, 9.5));
    { const t = easeOut(lc(G, 10, 11)); setSeg(tlB, tvPiv, lerp2(tvPiv, bTLB, t)); setOp(tlB, G >= 10 ? 1 : 0); }
    setArc(phiB, tvPiv[0], tvPiv[1], 0.8, 0, dirB); setOp(phiB, lc(G, 11, 11.4));
    setOp(tlLblB, lc(G, 10.3, 10.9)); setOp(phLbl, lc(G, 11, 11.6));
    // Part B started → dim the Part A aids so the sheet stays readable.
    if (G >= 6) aidsA.forEach((o) => setOp(o, 0.18));
    if (G < 6) { aidsB.forEach((o) => setOp(o, 0)); setOp(markB, 0); setOp(tlB, 0); setOp(phiB, 0); setOp(tlLblB, 0); setOp(phLbl, 0); }
  }

  animate(0);
  return { group, animate, duration: DURATION };
}
