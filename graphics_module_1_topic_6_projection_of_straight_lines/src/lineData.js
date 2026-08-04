// lineData.js — pure data layer for Projection of Straight Lines (no Three.js, no DOM).
// Mirrors the pattern of pointData.js. resolveLine() turns the raw parameters into
// signed endpoint coordinates (in mm) plus every derived metric the views need.
//
// World/engineering axes (identical convention to the Points module):
//   x = lateral position along the XY fold line
//   y = height ABOVE HP            (distHP)
//   z = depth IN FRONT OF VP       (distVP)
//   HP = XZ plane (y=0) · VP = XY plane (z=0) · fold line = X-axis

export const LineCase = Object.freeze({
  PARALLEL_BOTH: 'PARALLEL_BOTH',   // ∥ HP and ∥ VP        → FV = TV = TL, both ∥ XY
  PERP_VP:       'PERP_VP',         // ⟂ VP                 → FV is a point, TV = TL
  PERP_HP:       'PERP_HP',         // ⟂ HP                 → TV is a point, FV = TL
  INCL_HP:       'INCL_HP',         // inclined θ to HP, ∥ VP → FV = TL @ θ, TV foreshortened
  INCL_VP:       'INCL_VP',         // inclined φ to VP, ∥ HP → TV = TL @ φ, FV foreshortened
  INCL_BOTH:     'INCL_BOTH',       // inclined to both       → FV<TL, TV<TL, α>θ, β>φ
});

// Canonical defaults — a 60 mm line, end A held 18 above HP / 18 in front of VP.
// The sim is a single-case problem-solving stepper, so the case is always INCL_BOTH (the
// general resolver). θ = φ = 0 starts the line FLAT and parallel to both planes, so the
// "True Length" first step reads both views at full length and the Problem Library resets
// to a neutral baseline; the learner dials the inclinations on the Inclinations step.
export function defaultLineData() {
  return { case: LineCase.INCL_BOTH, TL: 60, theta: 0, phi: 0, aHP: 18, aVP: 18, aLat: -28 };
}

const DEG = Math.PI / 180, deg = r => r * 180 / Math.PI;

/**
 * Resolve raw line parameters into endpoints + view metrics.
 * @returns {{A,B,d:{x,y,z},tl,fvLen,tvLen,theta,phi,alpha,beta,valid}}
 */
export function resolveLine(data) {
  const TL = data.TL, th = data.theta * DEG, ph = data.phi * DEG;
  const eps = 1e-6;
  let dx, dy, dz, valid = true;

  switch (data.case) {
    case LineCase.PARALLEL_BOTH: dx = TL;            dy = 0;            dz = 0;            break;
    case LineCase.PERP_VP:       dx = 0;             dy = 0;            dz = TL;           break;
    case LineCase.PERP_HP:       dx = 0;             dy = TL;           dz = 0;            break;
    case LineCase.INCL_HP:       dx = TL*Math.cos(th); dy = TL*Math.sin(th); dz = 0;       break;
    case LineCase.INCL_VP:       dx = TL*Math.cos(ph); dy = 0;          dz = TL*Math.sin(ph); break;
    case LineCase.INCL_BOTH: {
      // θ fixes the rise (Δy), φ fixes the depth change (Δz); the lateral run is
      // whatever is left over. Physically valid only while sin²θ + sin²φ ≤ 1.
      dy = TL*Math.sin(th); dz = TL*Math.sin(ph);
      const lat2 = TL*TL - dy*dy - dz*dz;
      valid = lat2 >= -eps * TL * TL; // fp tolerance: sin²θ+sin²φ can overshoot 1 by ~1e-13 at
                                       // the exact θ+φ=90° boundary (e.g. 75/15) — a real trig
                                       // identity, not an invalid line; don't flag it as one.
      dx = Math.sqrt(Math.max(0, lat2));
      break;
    }
    default: dx = TL; dy = 0; dz = 0;
  }

  // Endpoints in mm. End A is the anchor; B is A + (dx,dy,dz).
  const A = { x: data.aLat,      y: data.aHP,      z: data.aVP };
  const B = { x: data.aLat + dx, y: data.aHP + dy, z: data.aVP + dz };

  const hRun = Math.hypot(dx, dz);            // horizontal run (projection on HP)
  const tl    = Math.hypot(dx, dy, dz);
  const fvLen = Math.hypot(dx, dy);           // front view length (VP: x,y)
  const tvLen = Math.hypot(dx, dz);           // top view length   (HP: x,z)
  const theta = deg(Math.atan2(Math.abs(dy), hRun));                 // true incl. with HP
  const phi   = deg(Math.atan2(Math.abs(dz), Math.hypot(dx, dy)));   // true incl. with VP
  const alpha = deg(Math.atan2(Math.abs(dy), Math.abs(dx) + eps));   // apparent FV angle to XY
  const beta  = deg(Math.atan2(Math.abs(dz), Math.abs(dx) + eps));   // apparent TV angle to XY

  return { A, B, d: { x: dx, y: dy, z: dz }, tl, fvLen, tvLen, theta, phi, alpha, beta, valid };
}
