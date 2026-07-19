// sheet2DLayout.js — the PURE 2D-sheet geometry shared by the orthographic sheet and its
// constructions. No THREE, no DOM — just the fixed-scale mapping from a resolved line to
// sheet-space coordinates, plus the trace (HT/VT) intersection math.
//
// This is the genericSolid.js-style shared exception to the no-cross-import rule (ADR-007 /
// RULES.md §3.6): it is pure math, so compareSheet.js, traces.js, and trueLength.js may all
// import it. Keeping ONE layout source guarantees the constructions land pixel-aligned on the
// same front/top views the base sheet draws.
//
// FIXED scale locked to the static sheet bounds (ADR-038 / §5.19): a real millimetre reads the
// same on-screen length at any True Length / inclination — never auto-zooming.

export const SHEET = 60;         // world-unit sheet size (mirrors lineRig / the legacy Lines sheet)
export const HW = 6.2, HH = 4.6; // sheet-space half-extents (the legacy sheet2D layout)
export const W = (mm) => mm * 0.1;                 // mm → world units (ADR-018)
// FIXED scale framed to the True-Length slider MAX (150 mm), the primary content dimension —
// the Points-consistent "frame the slider max" pattern (its REF_SPAN = the distance-slider max,
// so a typical drawing FILLS the sheet rather than floating tiny in it). §5.19's own guidance is
// that a rare over-range line (a very tall inclined line) "extends past the sheet edge rather than
// shrinking the drawing"; the earlier (SHEET/2)*10 = 300 mm framed the absolute worst case so
// nothing ever overflowed, at the cost of a tiny measured drawing that broke visual parity with
// the Points sheet. Still a FIXED scale — 10 mm reads the same length at any TL / inclination.
export const SHEET2D_SPAN = 150;                   // mm per vertical half = True-Length slider max
export const FIT = (HH - 0.9) / W(SHEET2D_SPAN);   // constant world-unit → sheet-space factor

/**
 * Fixed-scale sheet layout: the front view (a′b′) above the XY line, the top view (ab) below.
 * @param {{A,B,tl,fvLen,tvLen}} M  a resolveLine() result (mm)
 * @returns layout coords + view classification flags
 */
export function layout2D(M) {
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
