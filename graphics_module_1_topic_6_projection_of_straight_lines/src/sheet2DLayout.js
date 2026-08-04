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

const EPS = 1e-6;

/** Intersection of the INFINITE lines through P,Q and through R,S (both produced as needed);
 *  null when the two lines are parallel. */
export const meet = (P, Q, R, S) => {
  const d1x = Q[0] - P[0], d1y = Q[1] - P[1];
  const d2x = S[0] - R[0], d2y = S[1] - R[1];
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < EPS) return null;
  const t = ((R[0] - P[0]) * d2y - (R[1] - P[1]) * d2x) / den;
  return [P[0] + d1x * t, P[1] + d1y * t];
};

/**
 * Art 10-8 Method II (True Length.pdf figs. 10-18/10-19) — the trapezoid raised on ONE view.
 * Erect perpendiculars at the view's two ends, each equal to that end's SIGNED distance from xy
 * in the OTHER view, then join their far ends: that join is the True Length, and its angle with
 * the view is the line's true inclination with the plane the OTHER view lies on.
 *
 * Offsets are SIGNED (not `Math.abs`), so problem 10-7 / fig. 10-30's opposite-sides case — the
 * two ends on opposite sides of xy — falls out with no special-case branch. `side` mirrors the
 * trapezoid to the view's other edge; Art 10-8's own note allows either, and a reflection fixes
 * every point of the view line, so it cannot move where a produced trapezoid meets that view.
 *
 * @returns {{P1:number[],Q1:number[],tl:number,angle:number}|null} null for a point view (Art
 *   10-9 covers that case separately — there is no trapezoid to raise on a single point)
 */
export function trapezoid(P, Q, offP, offQ, side = 1) {
  const dx = Q[0] - P[0], dy = Q[1] - P[1];
  const len = Math.hypot(dx, dy);
  if (len < EPS) return null;
  const nx = (-dy / len) * side, ny = (dx / len) * side;
  return {
    P1: [P[0] + nx * offP, P[1] + ny * offP],
    Q1: [Q[0] + nx * offQ, Q[1] + ny * offQ],
    tl: Math.hypot(len, offQ - offP),
    angle: Math.atan2(Math.abs(offQ - offP), len),
  };
}

/** Both Method II trapezoids for a layout: `fv` (raised on the front view, offsets from the top
 *  view) yields TL + φ (True Length.pdf fig. 10-18); `tv` (raised on the top view, offsets from
 *  the front view) yields TL + θ (fig. 10-19). Either may be null for a point view. */
export function methodII(L) {
  const { A1, B1, A2, B2 } = L;
  return {
    fv: trapezoid(A1, B1, -A2[1], -B2[1]),
    tv: trapezoid(A2, B2, A1[1], B1[1], -1),
  };
}

/**
 * Trace math. Four cases, per Traces.pdf Arts 10-9/10-10/10-11:
 *  (a) a point view (line ⟂ that view's plane) — the trace on THAT plane coincides with the
 *      point view itself (fig. 10-21); there is no trace on the other plane.
 *  (b) both projections ⟂ xy (θ + φ = 90°, Art 10-7) — Method I cannot locate the traces
 *      ("it is not possible to find the traces by the first method" — Art 10-11); each trapezoid
 *      raised by Method II, produced, meets its own view at that view's trace (fig. 10-26/10-30).
 *  (c) a view lying WHOLLY on xy (both its ends at zero offset from that plane) — the line is
 *      embedded in the plane, not merely parallel to it: every point of AB is common to the line
 *      and the plane, so there is no single trace point to find (distinct from (d), Art 10-9's
 *      "no trace" — that case is a view genuinely parallel to the plane at a NONZERO offset).
 *  (d) otherwise — Method I (Art 10-10): extend the front view to XY at h, project to the top
 *      view produced → HT (or no trace, if parallel at nonzero offset); extend the top view to
 *      XY at v, project to the front view produced → VT (symmetric no-trace case).
 * `htReason`/`vtReason` name which of (a)/(c)/(d) produced that side's result — `'trace'` (a
 * real point, whether found by Method I/II or by point-view coincidence), `'inPlane'` (case c),
 * or `'parallel'` (case d's genuine no-trace, or (a)'s "no trace on the other plane").
 * @param {ReturnType<typeof layout2D>} L
 */
export function computeTraces(L) {
  const { A1, B1, A2, B2 } = L;
  const fvPoint = Math.hypot(B1[0] - A1[0], B1[1] - A1[1]) < EPS; // ⟂ VP: front view is a point
  const tvPoint = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]) < EPS; // ⟂ HP: top view is a point
  const perpXY  = !fvPoint && !tvPoint && Math.abs(B1[0] - A1[0]) < EPS; // θ+φ = 90°

  let h = null, HT = null, v = null, VT = null, method = 'I';
  let htReason = 'trace', vtReason = 'trace';

  if (tvPoint || fvPoint) {
    method = 'coincident';
    if (tvPoint) { const xh = xAtY(A1, B1, 0); if (xh !== null) h = [xh, 0]; HT = [A2[0], A2[1]]; vtReason = 'parallel'; }
    if (fvPoint) { const xv = xAtY(A2, B2, 0); if (xv !== null) v = [xv, 0]; VT = [A1[0], A1[1]]; htReason = 'parallel'; }
  } else if (perpXY) {
    method = 'II';
    const M = methodII(L);
    if (M.fv) VT = meet(A1, B1, M.fv.P1, M.fv.Q1);
    if (M.tv) HT = meet(A2, B2, M.tv.P1, M.tv.Q1);
    if (!VT) vtReason = 'parallel';
    if (!HT) htReason = 'parallel';
  } else {
    const inHP = Math.abs(A1[1]) < EPS && Math.abs(B1[1]) < EPS; // whole line lies IN the HP
    const inVP = Math.abs(A2[1]) < EPS && Math.abs(B2[1]) < EPS; // whole line lies IN the VP

    if (inHP) {
      htReason = 'inPlane';
    } else {
      const xh = xAtY(A1, B1, 0);                       // FV produced → XY at h
      if (xh !== null) { h = [xh, 0]; const y = yAtX(A2, B2, xh); if (y !== null) HT = [xh, y]; }
      htReason = HT ? 'trace' : 'parallel';
    }

    if (inVP) {
      vtReason = 'inPlane';
    } else {
      const xv = xAtY(A2, B2, 0);                       // TV produced → XY at v
      if (xv !== null) { v = [xv, 0]; const y = yAtX(A1, B1, xv); if (y !== null) VT = [xv, y]; }
      vtReason = VT ? 'trace' : 'parallel';
    }
  }

  return { h, HT, v, VT, noHT: !HT, noVT: !VT, htReason, vtReason, method };
}
