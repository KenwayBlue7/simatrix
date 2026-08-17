// trueLength.js — the True-Length & true-inclinations construction leaf (rotating-line method).
//
// When a line is inclined to BOTH planes, neither view shows the true length. The rotating-line
// method swings each view parallel to XY to reveal it: Part A rotates the TOP view about the pivot
// end → True Length & θ (with HP); Part B rotates the FRONT view about the pivot → True Length &
// φ (with VP). A 14-phase animated construction on the orthographic sheet (ADR-165: beat 0 is the
// given-state, beat 1 draws the four Fig 10-15(ii)/10-16(ii) loci up front, beats 2-13 are the
// original 12-phase rotate/arc/project/join sequence, shifted).
//
// Phase 4E scope: the construction GEOMETRY only (the rotated view, its locus arc, the projector,
// the horizontal locus, the recovered True-Length line, and the θ/φ angle arcs). Text callouts
// (b₁, TL value, θ/φ labels) are the CSS2D-label phase — deferred. All aids are THIN THREE.Line +
// small meshes (no fat lines → no resolution sync), rendered in compareSheet's ortho scene (the
// 2nd pass) and disposed by compareSheet.clearConstruction() (the disposal contract).
//
// Layering (ADR-007 / §3.6): leaf module — imports only the pure-math sheet2DLayout.js.

import * as THREE from 'three';
import { layout2D, methodII, meet } from './sheet2DLayout.js';
import { addLabel } from './labels.js';
import { PLACEMENT, bisectorAnchor } from './labelPlacement.js';

const P2 = PLACEMENT.sheet2D; // marker letter · angle-bisector radius · TL-value lift (one shared policy)

const TL_N = 14;
const DURATION = 9000;
const DURATION_FLAT = 400; // both views already TL (θ=φ=0 default) — nothing to rotate through
const TL2_N = 8;
const DURATION2 = 6000;

const rootStyle = () => getComputedStyle(document.documentElement);
const cssColor = (name, fallback) => new THREE.Color(rootStyle().getPropertyValue(name).trim() || fallback);

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lc = (x, a, b) => clamp01((x - a) / (b - a));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lerp2 = (P, Q, t) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];

/** @param {{ resolved:object, method?:'I'|'II' }} o  @returns {{ group, animate:(p:number)=>void, duration:number }}
 *  `method` defaults to 'I' (the rotating-line construction). Art 10-11 (Traces.pdf p.212):
 *  when both projections are ⟂ xy (θ+φ=90°) there is no rotation locus to swing through, so the
 *  caller should pass `method: 'II'` — main.js selects it from `computeTraces(...).method`. */
export function createTrueLength({ resolved, method = 'I' }) {
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
  const { A1, B1, A2, B2, fvTrue, tvTrue } = L;

  if (method === 'II') {
    // Art 10-8 Method II (True Length.pdf figs. 10-18/10-19), the Art 10-11 fallback: raise a
    // trapezoid on each view (perpendiculars equal to the OTHER view's signed offsets from xy),
    // join the far ends — that join is the True Length, at the true inclination with the plane
    // the other view lies on. Part A = the top-view trapezoid → TL & θ (marker b₁′); Part B = the
    // front-view trapezoid → TL & φ (marker b₁) — same labelling convention as Method I above.
    const M = methodII(L);

    function buildTrapezoid(P, Q, trap, markerLabel) {
      if (!trap) return null;
      const perpP = conLine(COL.construct, true);
      const perpQ = conLine(COL.construct, true);
      const hyp = conLine(COL.tlg, false);
      const apex = meet(P, Q, trap.P1, trap.Q1); // null when the hypotenuse is parallel (angle 0)
      const arc = conLine(COL.tlg, false);
      const mk = marker(trap.Q1[0], trap.Q1[1], COL.tlg, markerLabel);
      return { P, Q, trap, perpP, perpQ, hyp, apex, arc, mk };
    }

    const tvRig = buildTrapezoid(A2, B2, M.tv, 'b₁′');
    const fvRig = buildTrapezoid(A1, B1, M.fv, 'b₁');

    // α/β (Inclined_to_Both.pdf Art 10-5, fig. 10-13): the ORIGINAL view segment's own angle
    // with xy — always ≥ θ/φ, drawn at the same end each view already anchors on (A2/A1).
    const alphaArc = conLine(COL.tlg, false);
    const betaArc = conLine(COL.tlg, false);
    const alphaDir = Math.atan2(B1[1] - A1[1], B1[0] - A1[0]);
    const betaDir = Math.atan2(B2[1] - A2[1], B2[0] - A2[0]);

    const tlLift = P2.tlValueLift;
    const midTV = tvRig ? [(tvRig.trap.P1[0] + tvRig.trap.Q1[0]) / 2, (tvRig.trap.P1[1] + tvRig.trap.Q1[1]) / 2] : [0, 0];
    const midFV = fvRig ? [(fvRig.trap.P1[0] + fvRig.trap.Q1[0]) / 2, (fvRig.trap.P1[1] + fvRig.trap.Q1[1]) / 2] : [0, 0];
    const thLbl = addLabel(group, `θ=${Math.round(resolved.theta)}°`, [midTV[0], midTV[1] - tlLift, 0], { color: '--tl-green', size: '11px' });
    const tlLblA = addLabel(group, `TL ${Math.round(resolved.tl)}`, [midTV[0], midTV[1] - tlLift * 2, 0], { color: '--tl-green', mono: true, size: '10px' });
    const phLbl = addLabel(group, `φ=${Math.round(resolved.phi)}°`, [midFV[0], midFV[1] + tlLift, 0], { color: '--tl-green', size: '11px' });
    const tlLblB = addLabel(group, `TL ${Math.round(resolved.tl)}`, [midFV[0], midFV[1] + tlLift * 2, 0], { color: '--tl-green', mono: true, size: '10px' });
    const betaLbl = addLabel(group, `β=${Math.round(resolved.beta)}°`, [midTV[0], midTV[1] - tlLift * 3, 0], { color: '--tl-green', size: '11px' });
    const alphaLbl = addLabel(group, `α=${Math.round(resolved.alpha)}°`, [midFV[0], midFV[1] + tlLift * 3, 0], { color: '--tl-green', size: '11px' });
    [thLbl, tlLblA, phLbl, tlLblB, betaLbl, alphaLbl].forEach((l) => setOp(l, 0));

    function runRig(rig, PA, PB, H, ARC, LBL) {
      if (!rig) return;
      setSeg(rig.perpP, rig.P, lerp2(rig.P, rig.trap.P1, easeOut(lc(G, PA[0], PA[1])))); setOp(rig.perpP, G > PA[0] ? 1 : 0);
      setSeg(rig.perpQ, rig.Q, lerp2(rig.Q, rig.trap.Q1, easeOut(lc(G, PB[0], PB[1])))); setOp(rig.perpQ, G > PB[0] ? 1 : 0);
      setSeg(rig.hyp, rig.trap.P1, lerp2(rig.trap.P1, rig.trap.Q1, easeOut(lc(G, H[0], H[1])))); setOp(rig.hyp, G >= H[0] ? 1 : 0);
      setOp(rig.mk, lc(G, H[1] - 0.1, H[1] + 0.1));
      if (rig.apex) {
        const a0 = Math.atan2(rig.P[1] - rig.apex[1], rig.P[0] - rig.apex[0]);
        const a1 = Math.atan2(rig.trap.P1[1] - rig.apex[1], rig.trap.P1[0] - rig.apex[0]);
        setArc(rig.arc, rig.apex[0], rig.apex[1], 0.8, a0, a1); setOp(rig.arc, lc(G, ARC[0], ARC[1]));
      }
      setOp(LBL[0], lc(G, ARC[0], ARC[1])); setOp(LBL[1], lc(G, H[1] - 0.1, H[1] + 0.3));
    }

    let G = 0;
    function animate(p) {
      G = p * TL2_N;
      runRig(tvRig, [0, 1], [1, 2], [2, 3], [3, 3.6], [thLbl, tlLblA]);
      setArc(betaArc, A2[0], A2[1], 1.1, 0, betaDir); setOp(betaArc, lc(G, 3, 3.6));
      setOp(betaLbl, lc(G, 3.2, 3.8));
      runRig(fvRig, [4, 5], [5, 6], [6, 7], [7, 7.6], [phLbl, tlLblB]);
      setArc(alphaArc, A1[0], A1[1], 1.1, 0, alphaDir); setOp(alphaArc, lc(G, 7, 7.6));
      setOp(alphaLbl, lc(G, 7.2, 7.8));
    }
    animate(0);
    // Discrete-step phase table (constructionStepper.js) — breakpoints along the SAME G/TL2_N
    // domain animate() already uses; captions grounded in True Length.pdf Art 10-8 (Method II,
    // figs 10-18/10-19) + Inclined to Both.pdf Art 10-5/10-6 (apparent angles). A rig that came
    // back null (trap hypotenuse parallel, angle 0) contributes no stops, mirroring runRig's own
    // `if (!rig) return` guard.
    const phases = [];
    if (tvRig) {
      phases.push(
        { t: 1 / TL2_N, caption: 'Erect a perpendicular to the top view at a, equal to a’s distance from xy in the front view.' },
        { t: 2 / TL2_N, caption: 'Erect a second perpendicular at b, equal to b’s distance from xy in the front view.' },
        { t: 3 / TL2_N, caption: `Join the two perpendiculars’ far ends on the top view — the true length of AB (${Math.round(resolved.tl)} mm).` },
        { t: 3.8 / TL2_N, caption: `θ = ${Math.round(resolved.theta)}° — AB’s true inclination with the H.P. (β = ${Math.round(resolved.beta)}° shown alongside, the top view’s own larger apparent angle).` },
      );
    }
    if (fvRig) {
      phases.push(
        { t: 5 / TL2_N, caption: 'Erect a perpendicular to the front view at a′, equal to a’s distance from xy in the top view.' },
        { t: 6 / TL2_N, caption: 'Erect a second perpendicular at b′, equal to b’s distance from xy in the top view.' },
        { t: 7 / TL2_N, caption: `Join the two perpendiculars’ far ends on the front view — the true length of AB (${Math.round(resolved.tl)} mm).` },
        { t: 7.8 / TL2_N, caption: `φ = ${Math.round(resolved.phi)}° — AB’s true inclination with the V.P. (α = ${Math.round(resolved.alpha)}° shown alongside, the front view’s own larger apparent angle).` },
      );
    }
    return { group, animate, duration: DURATION2, phases };
  }

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

  // The four loci (Fig 10-15(ii)/10-16(ii)): straight reference lines parallel to xy through
  // each of the four view points — cd/pq (elevation, through a′/b′) and ef/rs (plan, through
  // a/b) — the paths each point would travel if rotated to lie on xy. Revealed together as the
  // construction's setup beat (animate()'s locusLines, below); previously only pq/rs (fvLoc/
  // tvLoc) were drawn — ef/cd (tvPivLoc/fvPivLoc) were missing entirely (ADR-165).
  const tvPivLoc = conLine(COL.locus, true);  // ef — through a (tvPiv), plan
  const fvLoc = conLine(COL.locus, true);     // pq — through b′ (fvOth), elevation
  const fvPivLoc = conLine(COL.locus, true);  // cd — through a′ (fvPiv), elevation
  const tvLoc = conLine(COL.locus, true);     // rs — through b (tvOth), plan
  // Part A elements (top-view rotation → TL & θ)
  const rotTV = conLine(COL.hp, false);
  const arcA = conLine(COL.locus, false);
  const projA = conLine(COL.construct, true);
  const markA = marker(bTLA[0], bTLA[1], COL.tlg, 'b₁′');
  const tlA = conLine(COL.tlg, false);
  const thetaA = conLine(COL.tlg, false);
  // Part B elements (front-view rotation → TL & φ)
  const rotFV = conLine(COL.vp, false);
  const arcB = conLine(COL.locus, false);
  const projB = conLine(COL.construct, true);
  const markB = marker(bTLB[0], bTLB[1], COL.tlg, 'b₂'); // Fig 10-16(ii) names this point b₂, not b₁ (ADR-165 fix)
  const tlB = conLine(COL.tlg, false);
  const phiB = conLine(COL.tlg, false);
  // α/β (Inclined_to_Both.pdf Art 10-5, fig. 10-13): the ORIGINAL (unrotated) view's own angle
  // with xy, always ≥ θ/φ — same pivots θ/φ land on (fvPiv/tvPiv), so all four sit side by side.
  const alphaArc = conLine(COL.tlg, false);
  const betaArc = conLine(COL.tlg, false);

  // CSS2D construction labels (θ / φ true angles + the recovered True-Length value), driven by
  // the animation windows below. b₁ / b₁′ ride their markers (marker() adds them).
  const R = P2.angleRadius, tlLift = P2.tlValueLift;
  const thLbl = addLabel(group, `θ=${Math.round(resolved.theta)}°`, bisectorAnchor(fvPiv, dirA / 2, R), { color: '--tl-green', size: '11px' });
  const tlLblA = addLabel(group, `TL ${Math.round(resolved.tl)}`, [(fvPiv[0] + bTLA[0]) / 2, (fvPiv[1] + bTLA[1]) / 2 + tlLift, 0], { color: '--tl-green', mono: true, size: '10px' });
  const phLbl = addLabel(group, `φ=${Math.round(resolved.phi)}°`, bisectorAnchor(tvPiv, dirB / 2, R), { color: '--tl-green', size: '11px' });
  const tlLblB = addLabel(group, `TL ${Math.round(resolved.tl)}`, [(tvPiv[0] + bTLB[0]) / 2, (tvPiv[1] + bTLB[1]) / 2 - tlLift, 0], { color: '--tl-green', mono: true, size: '10px' });
  const R2 = { x: R.x * 1.4, y: R.y * 1.4 }; // wider elliptical radius so α/β labels clear θ/φ's
  const alphaLbl = addLabel(group, `α=${Math.round(resolved.alpha)}°`, bisectorAnchor(fvPiv, startB / 2, R2), { color: '--tl-green', size: '11px' });
  const betaLbl = addLabel(group, `β=${Math.round(resolved.beta)}°`, bisectorAnchor(tvPiv, startA / 2, R2), { color: '--tl-green', size: '11px' });
  [thLbl, tlLblA, phLbl, tlLblB, alphaLbl, betaLbl].forEach((l) => setOp(l, 0));

  // Part A's own swing/arc/projector (dimmed, not hidden, once Part B starts); Part B's own
  // swing/arc/projector (hidden until Part B starts). The four loci are shared setup — they
  // reveal once at beat 1 and are never re-hidden or dimmed by either part starting.
  const locusLines = [tvPivLoc, fvPivLoc, fvLoc, tvLoc];
  const aidsA = [rotTV, arcA, projA], aidsB = [rotFV, arcB, projB];

  function animate(p) {
    const G = p * TL_N;
    // Beat 1 (setup, Fig 10-15(ii)/10-16(ii)): all four loci — straight lines at their FINAL
    // fixed extents (they depend only on the resolved line, not on animation progress).
    setSeg(tvPivLoc, tvPiv, [bTLA[0], tvPiv[1]]);
    setSeg(fvLoc, fvOth, [bTLA[0], fvOth[1]]);
    setSeg(fvPivLoc, fvPiv, [bTLB[0], fvPiv[1]]);
    setSeg(tvLoc, tvOth, [bTLB[0], tvOth[1]]);
    locusLines.forEach((o) => setOp(o, lc(G, 1.6, 2.2)));
    // ---- Part A ----
    { const t = easeOut(lc(G, 2, 3)), ang = startA + (0 - startA) * t;
      setSeg(rotTV, tvPiv, [tvPiv[0] + Math.cos(ang) * Lplan, tvPiv[1] + Math.sin(ang) * Lplan]); setOp(rotTV, G > 2 ? 1 : 0); }
    { const t = easeOut(lc(G, 3, 4)); setArc(arcA, tvPiv[0], tvPiv[1], Lplan, startA, startA + (0 - startA) * t); setOp(arcA, G >= 3 ? 1 : 0); }
    { const t = easeOut(lc(G, 4, 5)); setSeg(projA, tvRot, [tvRot[0], tvRot[1] + (bTLA[1] - tvRot[1]) * t]); setOp(projA, G >= 4 ? 1 : 0); }
    setOp(markA, lc(G, 5, 5.5));
    { const t = easeOut(lc(G, 6, 7)); setSeg(tlA, fvPiv, lerp2(fvPiv, bTLA, t)); setOp(tlA, G >= 6 ? 1 : 0); }
    setArc(thetaA, fvPiv[0], fvPiv[1], 0.8, 0, dirA); setOp(thetaA, lc(G, 7, 7.4));
    setOp(tlLblA, lc(G, 6.3, 6.9)); setOp(thLbl, lc(G, 7, 7.6));
    setArc(alphaArc, fvPiv[0], fvPiv[1], 1.1, 0, startB); setOp(alphaArc, lc(G, 7.1, 7.5));
    setOp(alphaLbl, lc(G, 7.3, 7.9));
    // ---- Part B ----
    { const t = easeOut(lc(G, 8, 9)), ang = startB + (0 - startB) * t;
      setSeg(rotFV, fvPiv, [fvPiv[0] + Math.cos(ang) * Lelev, fvPiv[1] + Math.sin(ang) * Lelev]); setOp(rotFV, G >= 8 ? 1 : 0); }
    { const t = easeOut(lc(G, 9, 10)); setArc(arcB, fvPiv[0], fvPiv[1], Lelev, startB, startB + (0 - startB) * t); setOp(arcB, G >= 9 ? 1 : 0); }
    { const t = easeOut(lc(G, 10, 11)); setSeg(projB, fvRot, [fvRot[0], fvRot[1] + (bTLB[1] - fvRot[1]) * t]); setOp(projB, G >= 10 ? 1 : 0); }
    setOp(markB, lc(G, 11, 11.5));
    { const t = easeOut(lc(G, 12, 13)); setSeg(tlB, tvPiv, lerp2(tvPiv, bTLB, t)); setOp(tlB, G >= 12 ? 1 : 0); }
    setArc(phiB, tvPiv[0], tvPiv[1], 0.8, 0, dirB); setOp(phiB, lc(G, 13, 13.4));
    setOp(tlLblB, lc(G, 12.3, 12.9)); setOp(phLbl, lc(G, 13, 13.6));
    setArc(betaArc, tvPiv[0], tvPiv[1], 1.1, 0, startA); setOp(betaArc, lc(G, 13.1, 13.5));
    setOp(betaLbl, lc(G, 13.3, 13.9));
    // Part B started → dim Part A's own swing/arc/projector (not its recovered TL line/angles,
    // and not the shared loci, which stay legible throughout).
    if (G >= 8) aidsA.forEach((o) => setOp(o, 0.18));
    if (G < 8) { aidsB.forEach((o) => setOp(o, 0)); setOp(markB, 0); setOp(tlB, 0); setOp(phiB, 0); setOp(tlLblB, 0); setOp(phLbl, 0); }
  }

  animate(0);
  // Discrete-step phase table (constructionStepper.js) — breakpoints along the SAME G/TL_N
  // domain animate() already uses; captions grounded in True Length.pdf Art 10-8 (Method I,
  // figs 10-15/10-16/10-17) + Inclined to Both.pdf Art 10-5/10-6 (apparent angles α/β).
  // 14 beats (ADR-165, up from 12): beat 0 is the given state (free — animate(0) already draws
  // nothing extra); beat 1 draws the four loci up front (Fig 10-15(ii)/10-16(ii)'s setup, not
  // previously represented as its own step); beats 2-13 are the original rotate/arc/project/join
  // sequence. Beat 13's caption also folds in Fig 10-17(ii)'s "hold B, turn A" variant as a
  // footnote — it proves the pivot choice is arbitrary but adds no new geometry, so it doesn't
  // earn its own beat.
  const phases = [
    { t: 0, caption: 'Given: the reference line xy, the front view a′b′, and the top view ab — neither view shows the true length.' },
    { t: 2 / TL_N, caption: 'Through each end draw a line parallel to xy — cd and pq in the front view, ef and rs in the top view. These are the paths the ends travel as each view rotates.' },
    { t: 3 / TL_N, caption: 'Swing the top view’s free end about the pivot until parallel to xy.' },
    { t: 4 / TL_N, caption: 'Trace the arc it sweeps — centre at the pivot, radius equal to the top view’s length — to b₁ on ef.' },
    { t: 5.5 / TL_N, caption: 'Drop a projector through b₁ to meet b′’s horizontal locus pq at b′₁.' },
    { t: 7 / TL_N, caption: `Join the pivot’s front-view point to b′₁ — the true length of AB (${Math.round(resolved.tl)} mm).` },
    { t: 7.6 / TL_N, caption: `θ = ${Math.round(resolved.theta)}° — the angle this line makes with xy is AB’s true inclination with the H.P.` },
    { t: 7.9 / TL_N, caption: `α = ${Math.round(resolved.alpha)}° — the original (unrotated) front view’s own angle with xy, always greater than θ (apparent inclination).` },
    { t: 9 / TL_N, caption: 'Swing the front view’s free end about the pivot until parallel to xy.' },
    { t: 10 / TL_N, caption: 'Trace the arc it sweeps, to b′₂ on cd.' },
    { t: 11.5 / TL_N, caption: 'Drop a projector through b′₂ to meet b’s locus rs at b₂.' },
    { t: 13 / TL_N, caption: `Join the pivot’s top-view point to b₂ — the true length of AB (${Math.round(resolved.tl)} mm).` },
    { t: 13.6 / TL_N, caption: `φ = ${Math.round(resolved.phi)}° — the angle this line makes with xy is AB’s true inclination with the V.P.` },
    { t: 13.9 / TL_N, caption: `β = ${Math.round(resolved.beta)}° — the original top view’s own angle with xy, always greater than φ (apparent inclination). Holding B fixed and turning A instead gives the same true length (Fig. 10-17(ii)).` },
  ];
  return { group, animate, duration: (fvTrue && tvTrue) ? DURATION_FLAT : DURATION, phases };
}
