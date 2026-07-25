// traces.js — the Horizontal-Trace (HT) / Vertical-Trace (VT) construction leaf.
//
// A trace is where the line — or its extension — pierces a reference plane: HT on the HP, VT on
// the VP. The textbook construction, animated on the orthographic sheet: extend the FRONT view to
// XY at h and drop a perpendicular projector, extend the TOP view to meet it → HT; extend the TOP
// view to XY at v and raise a projector, extend the FRONT view to meet it → VT.
//
// Phase 4E scope: the construction GEOMETRY only (extension + projector lines, the right-angle
// symbol, h/v dots, and the HT/VT trace circles). Text callouts (h, v, HT, VT letters) are the
// CSS2D-label phase — deferred. Construction aids are THIN THREE.Line + small meshes (not fat
// lines), so they need no LineMaterial resolution sync; they render in compareSheet's ortho scene
// (the 2nd pass) and are disposed by compareSheet.clearConstruction() (the disposal contract).
//
// Layering (ADR-007 / §3.6): leaf module — imports only the pure-math sheet2DLayout.js. main.js
// mounts the returned group into compareSheet and drives animate(progress).

import * as THREE from 'three';
import { layout2D, computeTraces } from './sheet2DLayout.js';
import { addLabel } from './labels.js';
import { PLACEMENT } from './labelPlacement.js';

const TRACE = PLACEMENT.sheet2D.trace; // h/v feet + HT/VT circle label standoffs (one shared policy)

const DURATION = 5400;

const rootStyle = () => getComputedStyle(document.documentElement);
const cssColor = (name, fallback) => new THREE.Color(rootStyle().getPropertyValue(name).trim() || fallback);
const mix = (a, b, t) => a.clone().lerp(b, t);

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const lc = (x, a, b) => clamp01((x - a) / (b - a));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const lerp2 = (P, Q, t) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];

/** @param {{ resolved:object }} o  @returns {{ group, animate:(p:number)=>void, duration:number }} */
export function createTraces({ resolved }) {
  const group = new THREE.Group();
  const COL = {
    hp: cssColor('--color-hp-line', '#007f7c'),
    vp: cssColor('--color-vp-line', '#bc5d1e'),
    ink: cssColor('--color-ink', '#06070b'),
    construct: cssColor('--construct', '#5a5d66'),
  };
  const PCOL = mix(COL.construct, COL.ink, 0.5); // projector: darker than extensions

  // --- thin construction primitives ---
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
  const setOp = (o, v) => o.traverse((c) => {
    if (c.material) { c.material.transparent = true; c.material.opacity = v; }
    else if (c.element) c.element.style.opacity = v; // CSS2D labels fade with their marker
  });

  /** A drafting trace circle: a thin ring + a tiny centre dot. */
  function engCircle(x, y, colHex, r = 0.15) {
    const g = new THREE.Group(); g.position.set(x, y, 0); group.add(g);
    const n = 36, pts = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0)); }
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: colHex, transparent: true })));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(r * 0.3, 16), new THREE.MeshBasicMaterial({ color: colHex, transparent: true, depthTest: false }));
    dot.renderOrder = 3; g.add(dot);
    return g;
  }
  function smallDot(x, y, colHex, r = 0.07) {
    const g = new THREE.Group(); g.position.set(x, y, 0); group.add(g);
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 18), new THREE.MeshBasicMaterial({ color: colHex, transparent: true, depthTest: false }));
    d.renderOrder = 3; g.add(d); return g;
  }
  /** Right-angle (⊥) symbol where a projector crosses XY at (x,0). down=true opens into HP. */
  function raSymbol(x, down, colHex, s = 0.2) {
    const g = new THREE.Group(); group.add(g);
    const dy = down ? -s : s;
    const pts = [new THREE.Vector3(x + s, 0, 0), new THREE.Vector3(x + s, dy, 0), new THREE.Vector3(x, dy, 0)];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: colHex, transparent: true })));
    return g;
  }

  const L = layout2D(resolved);
  const { A1, B1, A2, B2 } = L;
  const T = computeTraces(L);
  const both = !T.noHT && !T.noVT;

  const feNear = Math.abs(A1[1]) <= Math.abs(B1[1]) ? A1 : B1; // FV end nearest XY starts the extension
  const teNear = Math.abs(A2[1]) <= Math.abs(B2[1]) ? A2 : B2;

  let extFV, projHT, tvExt, raH, hG, htG, tvNear;
  let extTV, projVT, fvExt, raV, vG, vtG, fvNear;
  if (!T.noHT) {
    tvNear = Math.abs(A2[0] - T.HT[0]) <= Math.abs(B2[0] - T.HT[0]) ? A2 : B2;
    extFV = conLine(COL.construct.getHex(), true);
    projHT = conLine(PCOL.getHex(), true);
    tvExt = conLine(COL.construct.getHex(), true);
    raH = raSymbol(T.h[0], true, PCOL.getHex());
    hG = smallDot(T.h[0], T.h[1], COL.ink.getHex());
    addLabel(hG, 'h', TRACE.h, { color: '--color-ink', size: '10px' });
    htG = engCircle(T.HT[0], T.HT[1], COL.hp.getHex(), 0.15);
    addLabel(htG, 'HT', TRACE.ht, { color: '--color-hp-line', size: '10px' });
  }
  if (!T.noVT) {
    fvNear = Math.abs(A1[0] - T.VT[0]) <= Math.abs(B1[0] - T.VT[0]) ? A1 : B1;
    extTV = conLine(COL.construct.getHex(), true);
    projVT = conLine(PCOL.getHex(), true);
    fvExt = conLine(COL.construct.getHex(), true);
    raV = raSymbol(T.v[0], false, PCOL.getHex());
    vG = smallDot(T.v[0], T.v[1], COL.ink.getHex());
    addLabel(vG, 'v', TRACE.v, { color: '--color-ink', size: '10px' });
    vtG = engCircle(T.VT[0], T.VT[1], COL.vp.getHex(), 0.15);
    addLabel(vtG, 'VT', TRACE.vt, { color: '--color-vp-line', size: '10px' });
  }

  // Reveal windows: `both` runs HT then VT; a lone trace gets the full span.
  const HT_E = both ? [0, 0.12] : [0, 0.16], HT_P = both ? [0.14, 0.26] : [0.18, 0.42],
        HT_X = both ? [0.27, 0.39] : [0.44, 0.66], HT_R = both ? 0.42 : 0.74;
  const VT_E = both ? [0.50, 0.62] : [0, 0.16], VT_P = both ? [0.64, 0.76] : [0.18, 0.42],
        VT_X = both ? [0.77, 0.89] : [0.44, 0.66], VT_R = both ? 0.92 : 0.74;

  function animate(prog) {
    if (!T.noHT) {
      setSeg(extFV, feNear, lerp2(feNear, T.h, easeOut(lc(prog, HT_E[0], HT_E[1])))); setOp(extFV, prog > HT_E[0] ? 1 : 0);
      setOp(hG, lc(prog, HT_E[1] - 0.03, HT_E[1] + 0.03));
      setSeg(projHT, T.h, [T.h[0], T.h[1] + (T.HT[1] - T.h[1]) * easeOut(lc(prog, HT_P[0], HT_P[1]))]); setOp(projHT, prog >= HT_P[0] ? 1 : 0);
      setOp(raH, lc(prog, HT_P[0] + 0.02, HT_P[0] + 0.08));
      setSeg(tvExt, tvNear, lerp2(tvNear, T.HT, easeOut(lc(prog, HT_X[0], HT_X[1])))); setOp(tvExt, prog >= HT_X[0] ? 1 : 0);
      setOp(htG, lc(prog, HT_R - 0.02, HT_R + 0.05));
    }
    if (!T.noVT) {
      setSeg(extTV, teNear, lerp2(teNear, T.v, easeOut(lc(prog, VT_E[0], VT_E[1])))); setOp(extTV, prog > VT_E[0] ? 1 : 0);
      setOp(vG, lc(prog, VT_E[1] - 0.03, VT_E[1] + 0.03));
      setSeg(projVT, T.v, [T.v[0], T.v[1] + (T.VT[1] - T.v[1]) * easeOut(lc(prog, VT_P[0], VT_P[1]))]); setOp(projVT, prog >= VT_P[0] ? 1 : 0);
      setOp(raV, lc(prog, VT_P[0] + 0.02, VT_P[0] + 0.08));
      setSeg(fvExt, fvNear, lerp2(fvNear, T.VT, easeOut(lc(prog, VT_X[0], VT_X[1])))); setOp(fvExt, prog >= VT_X[0] ? 1 : 0);
      setOp(vtG, lc(prog, VT_R - 0.02, VT_R + 0.05));
    }
  }

  animate(0);
  return { group, animate, duration: DURATION };
}
