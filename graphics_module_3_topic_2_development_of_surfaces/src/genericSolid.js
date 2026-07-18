// Pure math layer extracted from src_csharp/GenericPrism.cs and
// src_csharp/GenericPyramid.cs. Every shape generator that builds from
// a regular N-gon (prism, pyramid, cylinder as N→∞, cone likewise)
// imports from here so the trigonometry has one source of truth.
//
// Stateless and side-effect-free. Per CLAUDE.md "Cross-cutting rules",
// this is the one module other shape modules are permitted to import.

/**
 * Circumradius of a regular N-gon — distance from center to corner.
 *
 *   R = s / (2 · sin(π/N))
 *
 * Derivation: in the isosceles triangle (center, two adjacent corners),
 * half the side length s/2 lies opposite the half central angle π/N, so
 * s/2 = R · sin(π/N). Handedness-invariant — no Three.js sign correction.
 *
 * @param {number} sides       N ≥ 3.
 * @param {number} baseLength  Edge length s in world units.
 * @returns {number}           R in world units.
 */
export function circumradius(sides, baseLength) {
  return baseLength / (2 * Math.sin(Math.PI / sides));
}

/**
 * Apothem of a regular N-gon — distance from center to the midpoint of an edge.
 *
 *   a = s / (2 · tan(π/N))
 *
 * Needed by {@link slantAngle}: a regular pyramid's slant face pivots
 * about a base edge whose midpoint sits at distance `a` from the central
 * axis. Also useful directly when placing labels or guide markers on edges
 * rather than vertices.
 *
 * @param {number} sides
 * @param {number} baseLength
 * @returns {number}           a in world units.
 */
export function apothem(sides, baseLength) {
  return baseLength / (2 * Math.tan(Math.PI / sides));
}

/**
 * Slant angle α (radians) of a regular pyramid — the angle between a
 * lateral face and the base, measured at the base edge.
 *
 *   α = arctan(height / apothem)
 *
 * Drives the "Face Inclination HP/VP" mode in the rotation priority
 * hierarchy (CLAUDE.md): the shape is rotated by (target − α) about the
 * front-facing base edge so the slant face ends up parallel to the target
 * plane. The worked example — square pyramid baseLength=2, height=3,
 * target=45° — uses this directly.
 *
 * @param {number} sides
 * @param {number} baseLength
 * @param {number} height
 * @returns {number}           α in radians.
 */
export function slantAngle(sides, baseLength, height) {
  return Math.atan(height / apothem(sides, baseLength));
}

/**
 * Alignment strategy for orienting a regular N-gon in the XZ plane.
 *
 * Two strategies survive because the C# prototype's prism and pyramid
 * generators chose different "front-facing" conventions:
 *
 * - **PRISM**: faithful port of `GenericPrism.cs::GetAngle`. N=4 → π/4
 *   (diamond, edges along all four axes); other even N → π/N; odd N → 0.
 *   Note this does NOT actually put a flat edge at +Z for N ≥ 6 — a
 *   hexagon ends up with a *vertex* at +Z — but matches the prototype,
 *   which is acceptable because a prism's HP/VP projections are dominated
 *   by its top/bottom faces, not the side rim.
 *
 * - **FLAT_EDGE_FRONT**: a flat *edge* — never a corner — faces +Z, the side
 *   this sim's camera views. Required for pyramids and cones: angleHP pivots
 *   about the front-facing base edge so the slant FACE (not a corner) tilts
 *   toward HP. Offsets: −π/2 for N=3,5; π/4 for N=4; 0 for N=6 and beyond.
 *   NOTE the odd-N sign flip from `GenericPyramid.cs::GetAngle`, which uses
 *   +π/2: Unity's camera sits at −Z, so its "front" is our −Z. Re-derived for
 *   Three.js's +Z camera (CLAUDE.md: "every negative sign in the Unity code is
 *   suspect") and verified against the rendered triangular + pentagonal pyramids.
 *
 * @enum {string}
 */
export const PolygonAlignment = Object.freeze({
  PRISM: 'prism',
  FLAT_EDGE_FRONT: 'flat-edge-front',
});

/**
 * Per-N rotation offset (radians) added to every vertex angle of an N-gon
 * for the given alignment. Exposed so non-vertex callers — an apex helper,
 * a dimension label, the default camera azimuth — can hit the same "front
 * edge" the polygon hits without re-implementing the table.
 *
 * @param {number} sides
 * @param {PolygonAlignment} alignment
 * @returns {number}
 */
export function alignmentOffset(sides, alignment) {
  if (alignment === PolygonAlignment.FLAT_EDGE_FRONT) {
    // Odd N: −π/2 puts a flat EDGE on +Z (the side this sim's camera views) and
    // the lone vertex on −Z. The C# source uses +π/2 because Unity's camera sits
    // at −Z; re-derived for Three.js's +Z camera the sign flips (CLAUDE.md: every
    // negative sign in the Unity code is suspect). Verified against the rendered
    // triangular + pentagonal pyramids.
    if (sides === 3 || sides === 5) return -Math.PI / 2;
    if (sides === 4) return Math.PI / 4;
    // N=6 has flat edges at ±Z under no rotation; N > 6 fall through unchanged.
    return 0;
  }

  // PolygonAlignment.PRISM
  if (sides === 4) return Math.PI / 4;
  if (sides % 2 === 0) return Math.PI / sides;
  return 0;
}

/**
 * Angle (radians) of the i-th corner of a regular N-gon, distributed CCW
 * around a circle in the XZ plane.
 *
 *   angle = (i / N) · 2π + alignmentOffset(N, alignment)
 *
 * Callers place the corner at `(R · cos angle, y, R · sin angle)`. Passing
 * `index === sides` wraps cleanly to the same angle as index 0 plus 2π —
 * convenient for side-face loops that need both endpoints of an edge.
 *
 * @param {number} sides
 * @param {number} index
 * @param {PolygonAlignment} alignment
 * @returns {number}
 */
export function polygonVertexAngle(sides, index, alignment) {
  return (index / sides) * (2 * Math.PI) + alignmentOffset(sides, alignment);
}
