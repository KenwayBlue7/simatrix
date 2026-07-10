// Content layer for the "Introduction to Solids" gallery: the categorised shape
// roster the sidebar renders, the per-shape facts + key-part concepts the anatomy
// panel teaches, and the annotation-layer toggle list. Pure data — no DOM, no THREE.
//
// Layering (CLAUDE.md "Cross-cutting rules"): leaf module. Imports ONLY the data
// layer's ShapeType enum so the roster/facts key off the same canonical names every
// generator and main.js use. gallery.js (the DOM controller) consumes this; this
// module reaches back into nothing.

import { ShapeType } from './shapeData.js';

/** Shape the gallery opens on — the square pyramid shows an apex (O) and the axis OP
 *  immediately, the two ideas most students arrive without. */
export const DEFAULT_SHAPE = ShapeType.Pyramid;

/**
 * Sidebar roster: ordered categories → optional sub-groups → selectable items. The
 * two top-level categories are the lesson's spine (CLAUDE.md scope): POLYHEDRA
 * (flat-faced) and SOLIDS OF REVOLUTION (curved). Within Polyhedra the cube leads
 * (most familiar), then the prism and pyramid families. `subLabel: null` renders no
 * sub-heading — the items sit directly under the category.
 *
 * @typedef {{ label: string, shape: string }} RosterItem
 * @typedef {{ subLabel: string|null, items: RosterItem[] }} RosterGroup
 * @typedef {{ category: string, blurb: string, groups: RosterGroup[] }} RosterCategory
 * @type {RosterCategory[]}
 */
export const ROSTER = [
  {
    category: 'Polyhedra',
    blurb: 'Solids bounded entirely by flat polygon faces.',
    groups: [
      {
        subLabel: null,
        items: [{ label: 'Cube', shape: ShapeType.Cube }],
      },
      {
        subLabel: 'Prisms',
        items: [
          { label: 'Triangular prism', shape: ShapeType.TriangularPrism },
          { label: 'Square prism', shape: ShapeType.SquarePrism },
          { label: 'Pentagonal prism', shape: ShapeType.PentagonalPrism },
          { label: 'Hexagonal prism', shape: ShapeType.HexagonalPrism },
        ],
      },
      {
        subLabel: 'Pyramids',
        items: [
          { label: 'Triangular pyramid', shape: ShapeType.TriangularPyramid },
          { label: 'Square pyramid', shape: ShapeType.Pyramid },
          { label: 'Pentagonal pyramid', shape: ShapeType.PentagonalPyramid },
          { label: 'Hexagonal pyramid', shape: ShapeType.HexagonalPyramid },
        ],
      },
    ],
  },
  {
    category: 'Solids of Revolution',
    blurb: 'Curved solids swept by spinning a 2D shape about an axis.',
    groups: [
      {
        subLabel: null,
        items: [
          { label: 'Cylinder', shape: ShapeType.Cylinder },
          { label: 'Cone', shape: ShapeType.Cone },
        ],
      },
    ],
  },
];

/**
 * Per-shape teaching facts for the anatomy panel.
 *   • name / definition  — the panel heading + one-line plain-language definition.
 *   • base / faces / edges / vertices — the tabular fact grid (strings, since curved
 *     solids don't take integer counts cleanly — "3 (2 circular + 1 curved)").
 *   • hasApex / hasGenerators / hasTopFace — drive which CONCEPTS light up and whether
 *     the Generators layer toggle is enabled.
 *   • size — showcase dimensions fed to the generator (baseLength is the polygon edge,
 *     or the DIAMETER for cylinder/cone; height is base→top/apex). Tuned per shape so
 *     each frames well centred at the origin.
 *
 * @typedef {{
 *   name: string, definition: string, base: string,
 *   faces: string, edges: string, vertices: string,
 *   hasApex: boolean, hasGenerators: boolean, hasTopFace: boolean,
 *   size: { baseLength: number, height: number },
 * }} ShapeFacts
 * @type {Record<string, ShapeFacts>}
 */
export const SHAPE_FACTS = {
  [ShapeType.Cube]: {
    name: 'Cube',
    definition: 'A regular hexahedron — six equal square faces meeting at right angles, with the height equal to the base edge.',
    base: 'Square', faces: '6 (all squares)', edges: '12', vertices: '8',
    hasApex: false, hasGenerators: false, hasTopFace: true,
    size: { baseLength: 2, height: 2 },
  },
  [ShapeType.TriangularPrism]: {
    name: 'Triangular prism',
    definition: 'Two parallel, identical triangular bases joined by three rectangular faces — one base sits directly above the other.',
    base: 'Triangle', faces: '5 (2 triangles + 3 rectangles)', edges: '9', vertices: '6',
    hasApex: false, hasGenerators: false, hasTopFace: true,
    size: { baseLength: 2.2, height: 2.6 },
  },
  [ShapeType.SquarePrism]: {
    name: 'Square prism',
    definition: 'Two parallel square bases joined by four rectangular faces — a box (cuboid). With equal height it is a cube.',
    base: 'Square', faces: '6 (2 squares + 4 rectangles)', edges: '12', vertices: '8',
    hasApex: false, hasGenerators: false, hasTopFace: true,
    size: { baseLength: 2, height: 2.8 },
  },
  [ShapeType.PentagonalPrism]: {
    name: 'Pentagonal prism',
    definition: 'Two parallel regular-pentagon bases joined by five rectangular faces.',
    base: 'Regular pentagon', faces: '7 (2 pentagons + 5 rectangles)', edges: '15', vertices: '10',
    hasApex: false, hasGenerators: false, hasTopFace: true,
    size: { baseLength: 1.7, height: 2.6 },
  },
  [ShapeType.HexagonalPrism]: {
    name: 'Hexagonal prism',
    definition: 'Two parallel regular-hexagon bases joined by six rectangular faces.',
    base: 'Regular hexagon', faces: '8 (2 hexagons + 6 rectangles)', edges: '18', vertices: '12',
    hasApex: false, hasGenerators: false, hasTopFace: true,
    size: { baseLength: 1.5, height: 2.6 },
  },
  [ShapeType.TriangularPyramid]: {
    name: 'Triangular pyramid',
    definition: 'A triangular base with three triangular faces rising to a single apex (a tetrahedron when every face is equal).',
    base: 'Triangle', faces: '4 (all triangles)', edges: '6', vertices: '4',
    hasApex: true, hasGenerators: false, hasTopFace: false,
    size: { baseLength: 2.4, height: 2.8 },
  },
  [ShapeType.Pyramid]: {
    name: 'Square pyramid',
    definition: 'A square base with four triangular faces meeting at a single apex directly above the base centre.',
    base: 'Square', faces: '5 (1 square + 4 triangles)', edges: '8', vertices: '5',
    hasApex: true, hasGenerators: false, hasTopFace: false,
    size: { baseLength: 2.2, height: 3 },
  },
  [ShapeType.PentagonalPyramid]: {
    name: 'Pentagonal pyramid',
    definition: 'A regular-pentagon base with five triangular faces meeting at a single apex.',
    base: 'Regular pentagon', faces: '6 (1 pentagon + 5 triangles)', edges: '10', vertices: '6',
    hasApex: true, hasGenerators: false, hasTopFace: false,
    size: { baseLength: 1.9, height: 3 },
  },
  [ShapeType.HexagonalPyramid]: {
    name: 'Hexagonal pyramid',
    definition: 'A regular-hexagon base with six triangular faces meeting at a single apex.',
    base: 'Regular hexagon', faces: '7 (1 hexagon + 6 triangles)', edges: '12', vertices: '7',
    hasApex: true, hasGenerators: false, hasTopFace: false,
    size: { baseLength: 1.7, height: 3 },
  },
  [ShapeType.Cylinder]: {
    name: 'Cylinder',
    definition: 'A solid of revolution: two equal circular bases joined by one curved surface, swept by spinning a rectangle about its central axis.',
    base: 'Circle', faces: '3 (2 circular + 1 curved)', edges: '2 (circular)', vertices: '0',
    hasApex: false, hasGenerators: true, hasTopFace: true,
    size: { baseLength: 2.2, height: 2.8 },
  },
  [ShapeType.Cone]: {
    name: 'Cone',
    definition: 'A solid of revolution: one circular base and a curved surface tapering to a single apex, swept by spinning a right triangle about its central axis.',
    base: 'Circle', faces: '2 (1 circular + 1 curved)', edges: '1 (circular)', vertices: '1 (the apex)',
    hasApex: true, hasGenerators: true, hasTopFace: false,
    size: { baseLength: 2.4, height: 3.2 },
  },
};

/**
 * The "key parts" the panel teaches. `appliesTo(facts)` decides whether a part is
 * present for the selected shape — absent parts are dimmed (never colour-only), so a
 * learner sees, e.g., that a prism has no apex while a pyramid does.
 *
 * @type {{ id: string, name: string, blurb: string, appliesTo: (f: ShapeFacts) => boolean }[]}
 */
export const CONCEPTS = [
  {
    id: 'apex',
    name: 'Apex (O)',
    blurb: 'The single point where all the slanting faces meet, at the very top of a pyramid or cone. It is labelled O.',
    appliesTo: (f) => f.hasApex,
  },
  {
    id: 'axis',
    name: 'Axis OP',
    blurb: 'The straight central line from the top point or apex (O) down to the centre of the base (P) — the spine the solid is symmetric about.',
    appliesTo: () => true,
  },
  {
    id: 'generators',
    name: 'Generators',
    blurb: 'The straight lines that rule a curved surface, running from the base circle up to the top circle (cylinder) or to the apex (cone).',
    appliesTo: (f) => f.hasGenerators,
  },
  {
    id: 'vertices',
    name: 'Base & vertices',
    blurb: 'The polygon or circle the solid stands on, and its corners — lettered A, B, C… around the base, with A′, B′… on the top face where there is one.',
    appliesTo: () => true,
  },
];

/**
 * Annotation layers the panel can show/hide. Maps 1:1 onto vertexLabeler's
 * setLayerVisible(layer, on). The 'generators' toggle is only meaningful for curved
 * solids (gallery.js disables it via the shape's hasGenerators).
 *
 * @type {{ layer: 'axis'|'labels'|'generators', label: string, needsGenerators?: boolean }[]}
 */
export const LAYER_TOGGLES = [
  { layer: 'axis', label: 'Central axis (OP)' },
  { layer: 'labels', label: 'Vertex labels' },
  { layer: 'generators', label: 'Generators', needsGenerators: true },
];

/** Facts for a shape, falling back to the cube so the panel never renders blank. */
export function factsFor(shape) {
  return SHAPE_FACTS[shape] ?? SHAPE_FACTS[ShapeType.Cube];
}
