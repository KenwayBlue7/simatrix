// sheet2DLayout.js — the PURE 2D-sheet geometry shared by the orthographic sheet and its
// constructions. No THREE, no DOM — just the fixed-scale mapping from a resolved line to
// sheet-space coordinates, plus the trace (HT/VT) intersection math.
//
// This is the genericSolid.js-style shared exception to the no-cross-import rule (ADR-007 /
// RULES.md §3.6): it is pure math, so compareSheet.js, traces.js, and trueLength.js may all
// import it. Keeping ONE layout source guarantees the constructions land pixel-aligned on the
// same front/top views the base sheet draws.
//
// INTRINSIC-SIZE scale (ADR-053 model, ADR-075): scale derives from the line's own True Length
// (M.tl), never a fixed mm span and never the live drawn layout — the TL-per-half analog of
// Module 2's solidSpanUnits (bounding-sphere diameter). A view's length is always ≤ TL, so
// framing each sheet half to TL guarantees it fits at ANY True Length, while staying invariant to
// the distance-from-HP/VP sliders (which only translate end A, never TL) and the angle sliders
// (which reorient, never lengthen). Supersedes ADR-038 / the ADR-072 SHEET2D_SPAN=150 amendment
// for this topic — see ADR-075.

export const SHEET = 60;         // world-unit sheet size (mirrors lineRig / the legacy Lines sheet)
export const HW = 6.2, HH = 4.6; // sheet-space half-extents (the legacy sheet2D layout)
export const W = (mm) => mm * 0.1;                 // mm → world units (ADR-018)
const MIN_SPAN_MM = 20;          // mm floor — a near-point line (TL→0) must not blow the scale up

/**
 * Intrinsic-scale sheet layout (ADR-053/ADR-075): the front view (a′b′) above the XY line, the
 * top view (ab) below. Scale is recomputed per call from M.tl, so it tracks the line's True
 * Length but never the live-drawn bbox.
 * @param {{A,B,tl,fvLen,tvLen}} M  a resolveLine() result (mm)
 * @returns layout coords + view classification flags
 */
export function layout2D(M) {
  const spanMm = Math.max(M.tl, MIN_SPAN_MM);        // intrinsic size = True Length
  const FIT = (HH - 0.9) / W(spanMm);                // per-half fit: a TL-long view fills its half
  const cx = (M.A.x + M.B.x) / 2;
  const ax = W(M.A.x - cx), bx = W(M.B.x - cx);
  const F = (n) => n * FIT;
  return {
    HW, HH, F,
    A1: [F(ax), F(W(M.A.y))], B1: [F(bx), F(W(M.B.y))],    // a′ b′ (elevation, above XY)
    A2: [F(ax), -F(W(M.A.z))], B2: [F(bx), -F(W(M.B.z))],  // a  b  (plan, below XY)
    fvTrue: Math.abs(M.fvLen - M.tl) < 0.5, tvTrue: Math.abs(M.tvLen - M.tl) < 0.5,
    fvPoint: M.fvLen < 0.6, tvPoint: M.tvLen < 0.6,
  };
}

const xAtY = (P, Q, y) => { const dy = Q[1] - P[1]; return Math.abs(dy) < 1e-4 ? null : P[0] + (Q[0] - P[0]) * (y - P[1]) / dy; };
const yAtX = (P, Q, x) => { const dx = Q[0] - P[0]; return Math.abs(dx) < 1e-4 ? null : P[1] + (Q[1] - P[1]) * (x - P[0]) / dx; };

/**
 * Trace math (the legacy Lines computeTraces): HT is where the front view produced meets XY at
 * h, dropped to the top view; VT is where the top view produced meets XY at v, raised to the
 * front view. A trace is null when the line is parallel to that plane (no intersection).
 * @param {ReturnType<typeof layout2D>} L
 */
export function computeTraces(L) {
  const { A1, B1, A2, B2 } = L;
  let h = null, HT = null, v = null, VT = null;
  const xh = xAtY(A1, B1, 0);                         // FV produced → XY at h
  if (xh !== null) { h = [xh, 0]; let y = yAtX(A2, B2, xh); if (y === null) y = A2[1]; HT = [xh, y]; }
  const xv = xAtY(A2, B2, 0);                         // TV produced → XY at v
  if (xv !== null) { v = [xv, 0]; let y = yAtX(A1, B1, xv); if (y === null) y = A1[1]; VT = [xv, y]; }
  return { h, HT, v, VT, noHT: !HT, noVT: !VT };
}
