// The Problem Library — every examination problem this topic can pose, as pure DATA.
//
// MIGRATED FROM TOPIC 3 (2026-08-12). `graphics_module_4_topic_3_isometric_projection_problem_library`
// is the reference implementation and stays that way; this is a migration, not a dependency. Nothing
// here imports anything from that topic at runtime, and that topic was not modified.
//
// THE CLAIM THIS FILE INHERITS (ADR-053, ADR-043 one level up). A problem is data; the engine
// interprets it. Adding a problem is appending ONE object — no renderer edit, no UI edit, no engine
// edit. The moment any file contains `if (problem.id === …)` the claim is false and the library has
// stopped scaling. There is no such branch anywhere in this topic.
//
// WHAT CHANGED IN THE SCHEMA, AND WHY EXACTLY ONE FIELD DID. Everything a problem says about itself —
// `question` (VERBATIM), `title`, `category`, `source`, `difficulty`, `learningObjective`,
// `projectionType`, `hints`, `tags`, `answerData` — is carried across unchanged. The single field
// that could not be is the solid itself.
//
// Topic 3 describes a solid as a list of PARTS whose parameters are keys into the problem's own
// dimension map, most of them DERIVED one way: `{ part:'prism', sides:6, r:'circum' }` where
// `circum = circumradius(side, 6)`. Topic 2 describes whole named SOLIDS that take the learner's own
// dimension directly (`side`). Inverting a derived value generically is not possible, so translating
// Topic 3's parts at runtime would mean re-implementing every part kind's parameter semantics inside
// this topic — a second geometry vocabulary and a second composer. Instead the translation was done
// ONCE, offline, and its result is what is written here:
//
//   parts: [{ solidId: <a solid in shapeData.js>, dims: { …that solid's own fields… }], bottom first
//
// Every problem's overall size was checked against Topic 3's own `answerData.bounds` after the
// translation, and all eighteen agree.
//
// A PROBLEM IS NOT A NEW KIND OF SUBJECT. One part resolves to a solid from `SOLIDS`; two or more
// resolve through `combinationBuilder.js` — the combination model this topic already shipped, with
// its existing `p{i}_` key namespacing, its per-component bounding boxes and its per-component
// sphere rule. `problemBuilder.js` is the whole of the join, and it is fifty lines.
//
// ANSWERS ARE NOT CHECKED HERE. `answerData` is carried because it is part of the schema and because
// it was the oracle the migration was verified against — not because anything reads it at runtime.
// This topic has no answer checking and no scoring (CLAUDE.md); Topic 3 owns that, and Topic 3's
// Step 6 differs from this topic's for exactly that reason (ADR-055 amendment 2).
//
// Layering (CLAUDE.md): leaf DATA module. Imports nothing. Knows nothing about THREE, the DOM, the
// scene or the UI.

/**
 * @typedef {Object} ProblemPart
 * @property {string} solidId  A solid in `shapeData.js`.
 * @property {Record<string, number>} dims  That solid's own dimension fields, at the sizes the
 *   question states. Namespaced `p0_`, `p1_` … by `problemBuilder.js` when there are two or more.
 */

/**
 * @typedef {Object} Problem
 * @property {string} id
 * @property {string} title
 * @property {string} question    VERBATIM — the textbook's own sentence, character for character.
 * @property {string} category    → CATEGORIES[].id
 * @property {{textbook:string, chapter:string, ref?:string, adapted:boolean}} source
 * @property {'beginner'|'intermediate'|'advanced'} difficulty
 * @property {string} learningObjective
 * @property {ProblemPart[]} parts        Ordered BOTTOM FIRST.
 * @property {'projection'|'view'|'either'} projectionType  Which form Step 5 opens in.
 * @property {string} [limitation]        Something the question asks for that this topic does not
 *   draw. Shown to the learner rather than hidden — there are exactly two, both about orientation.
 * @property {Object} [answerData]        Carried, inert. See the note above.
 * @property {string[]} [hints]           Ordered, revealed one at a time — scaffolded, never dumped.
 * @property {string[]} tags
 */

export const CATEGORIES = Object.freeze([
  {
    id: 'standard-solids',
    label: 'Standard solids',
    blurb: 'Prisms, pyramids, cylinders and cones drawn straight from their stated sizes — where the isometric scale is met and mastered.',
  },
  {
    id: 'truncated-frustums',
    label: 'Truncated solids and frustums',
    blurb: 'A solid with its top cut off parallel to the base. Two outlines at two heights on one axis.',
  },
  {
    id: 'spherical',
    label: 'Spheres and hemispheres',
    blurb: 'The one family drawn at TRUE diameter in an isometric projection, while its centre still sits at isometric height.',
  },
  {
    id: 'combinations',
    label: 'Combinations of solids',
    blurb: 'One solid resting centrally on another. Shared axis, shared seating plane, one construction carried upward.',
  },
]);

export const PROBLEMS = Object.freeze([
  {
    id: 'ndb-17-12-cylinder',
    title: 'Cylinder — axis vertical and horizontal',
    question: 'Draw the isometric projection of a cylinder, base 50 mm diameter and axis 70 mm long, when its axis is (i) vertical and (ii) horizontal.',
    category: 'standard-solids',
    source: { textbook: 'N.D. Bhatt', chapter: 'Ch 17', ref: 'Problem 17-12', adapted: true },
    difficulty: 'beginner',
    learningObjective: 'Apply the isometric scale to a solid of revolution, and see that laying the axis down turns the box without changing the method.',
    parts: [
      { solidId: 'cylinder', dims: { diameter: 50, height: 70 } },
    ],
    projectionType: 'projection',
    // The question poses TWO placements. Topic 2 constructs a solid standing on its base and has
    // no orientation concept anywhere, so case (i) is what is drawn. Stated on the problem rather
    // than hidden from the learner.
    limitation: 'This topic draws case (i), the axis vertical. Laying the axis down turns the enclosing BOX, not the method — the same three axes, the same four phases, in the same order.',
    answerData: { scale: 0.816, bounds: { width: 50, depth: 50, height: 70 }, requiredStages: ['base', 'top', 'generators'] },
    hints: [
      'The question says PROJECTION, not view — so every length set off along an axis is reduced to about 0.816 of its true size.',
      'The base circle becomes an ellipse inscribed in a face of the box. The circle on the object has not changed; only the view foreshortens it.',
      'Turning the axis horizontal turns the BOX, not the method: the same three axes, the same box, the same two ellipses joined by their outermost points.',
    ],
    tags: ['cylinder', 'ellipse', 'isometric scale', 'axis horizontal', 'solid of revolution'],
  },
  {
    id: 'ndb-ex17-4-hex-prism',
    title: 'Hexagonal prism on its base',
    question: 'Draw the isometric view of a regular hexagonal prism, side of base 25 mm and axis 65 mm long, when its axis is perpendicular to the H.P.',
    category: 'standard-solids',
    source: { textbook: 'N.D. Bhatt', chapter: 'Ch 17', ref: 'Exercises 17, No. 4', adapted: true },
    difficulty: 'beginner',
    learningObjective: 'Construct a polygon that does not fill its own bounding box — the case the box exists for.',
    parts: [
      { solidId: 'hexagonal-prism', dims: { side: 25, height: 65 } },
    ],
    projectionType: 'view',
    answerData: { scale: 1, bounds: { width: 50, depth: 43.3, height: 65 }, requiredStages: ['base', 'top', 'join'] },
    hints: [
      'It asks for a VIEW, so every length is set off at its true size — 1:1, no reduction.',
      '"Axis perpendicular to the H.P." is the ordinary upright case: the solid stands on its base.',
      'A hexagon does not reach the corners of its box: the box edges are the overall length and breadth ACROSS the hexagon, not its side of 25 mm.',
    ],
    tags: ['hexagonal prism', 'polygon', 'isometric view', 'bounding box'],
  },
  {
    id: 'kcj-16-10-cone',
    title: 'Cone — axis vertical and horizontal',
    question: 'Draw the isometric view of a cone, base 40 mm diameter and axis 55 mm long, when its axis is (i) vertical and (ii) horizontal.',
    category: 'standard-solids',
    source: { textbook: 'K.C. John', chapter: 'Ch 16', ref: 'Example 16.10', adapted: true },
    difficulty: 'beginner',
    learningObjective: 'Locate an apex on the axis before drawing a single sloping line.',
    parts: [
      { solidId: 'cone', dims: { diameter: 40, height: 55 } },
    ],
    projectionType: 'view',
    // The question poses TWO placements. Topic 2 constructs a solid standing on its base and has
    // no orientation concept anywhere, so case (i) is what is drawn. Stated on the problem rather
    // than hidden from the learner.
    limitation: 'This topic draws case (i), the axis vertical. Laying the axis down turns the enclosing BOX, not the method — the same three axes, the same four phases, in the same order.',
    answerData: { scale: 1, bounds: { width: 40, depth: 40, height: 55 }, requiredStages: ['base', 'apex', 'slant'] },
    hints: [
      'A VIEW: true lengths throughout, so the 40 mm and the 55 mm are set off exactly as stated.',
      'Only the base needs constructing. The apex is one point, found on the axis at the full height.',
      'The two lines you keep are the ones that just touch the ellipse — they are the outline, not two of the twelve generators you drew to find them.',
    ],
    tags: ['cone', 'apex', 'ellipse', 'axis horizontal'],
  },
  {
    id: 'ndb-17-16-frustum-hex-pyramid',
    title: 'Frustum of a hexagonal pyramid',
    question: 'Draw the isometric view of the frustum of the hexagonal pyramid, base 50 mm side, top 25 mm side and height 75 mm, resting on its base on H.P.',
    category: 'truncated-frustums',
    source: { textbook: 'N.D. Bhatt', chapter: 'Ch 17', ref: 'Problem 17-16', adapted: false },
    difficulty: 'intermediate',
    learningObjective: 'Carry two polygons of different size on one axis, and join them corner to corner.',
    parts: [
      { solidId: 'frustum-hexagonal-pyramid', dims: { bottom: 50, top: 25, height: 75 } },
    ],
    projectionType: 'view',
    answerData: { scale: 1, bounds: { width: 100, depth: 86.6, height: 75 }, requiredStages: ['base', 'top', 'edges'] },
    hints: [
      'A frustum is a pyramid with its top cut off parallel to the base — so it is two polygons on one axis, not a new kind of solid.',
      'Both hexagons are turned exactly the same way. Construct the base in the bottom of the box and the top hexagon at the full height on the same axis.',
      'Join corresponding corners, base to top. Those sloping edges are what make it a frustum rather than a prism.',
    ],
    tags: ['frustum', 'hexagonal pyramid', 'truncated', 'non-isometric lines'],
  },
  {
    id: 'ndb-17-20-frustum-cone',
    title: 'Frustum of a cone',
    question: 'Draw the isometric view of a frustum of a cone, base diameter 50 mm, top diameter 25 mm and axis 65 mm long, resting on its base on H.P.',
    category: 'truncated-frustums',
    source: { textbook: 'N.D. Bhatt', chapter: 'Ch 17', ref: 'Problem 17-20', adapted: true },
    difficulty: 'intermediate',
    learningObjective: 'Join two ellipses of different size with straight generators.',
    parts: [
      { solidId: 'frustum-cone', dims: { bottom: 50, top: 25, height: 65 } },
    ],
    projectionType: 'view',
    answerData: { scale: 1, bounds: { width: 50, depth: 50, height: 65 }, requiredStages: ['base', 'top', 'generators'] },
    hints: [
      'Two circles of different size, at different heights, on the SAME vertical axis.',
      'The lower ellipse is inscribed in the bottom of the box; the upper one sits at the full height, and its size comes from the top view.',
      'The generators that touch both ellipses tangentially are the outline you keep.',
    ],
    tags: ['frustum', 'cone', 'generators', 'ellipse'],
  },
  {
    id: 'ndb-hemisphere-60',
    title: 'Hemisphere on its flat face',
    question: 'Draw the isometric projection of a hemisphere of 60 mm diameter, resting on the ground on its flat face.',
    category: 'spherical',
    source: { textbook: 'N.D. Bhatt', chapter: 'Ch 13/17', ref: 'spherical logic', adapted: true },
    difficulty: 'intermediate',
    learningObjective: 'Meet the one family drawn at TRUE size in an isometric projection.',
    parts: [
      { solidId: 'hemisphere', dims: { diameter: 60 } },
    ],
    projectionType: 'projection',
    answerData: { scale: 0.816, bounds: { width: 60, depth: 60, height: 30 }, parts: { p0: { scaled: false, centreHeightScaled: true } }, requiredStages: ['base', 'dome'] },
    hints: [
      'PROJECTION — so everything around a sphere is reduced. A sphere is the exception: it has no axial length to foreshorten.',
      'The flat circular face rests on the ground and, seen at an angle, reads as an ellipse.',
      'The curved outline is a true SEMICIRCLE, drawn at the real 60 mm diameter — never an ellipse, and never reduced.',
    ],
    tags: ['hemisphere', 'true diameter', 'isometric projection', 'sphere rule'],
  },
  {
    id: 'mqp-q8-sphere-on-hex-prism',
    title: 'Sphere on a hexagonal prism',
    question: 'A sphere of diameter 40 mm is placed centrally on top of a hexagonal prism, base side 35 mm and height 60 mm. Draw the isometric projection of the combination.',
    category: 'spherical',
    source: { textbook: 'Model QP', chapter: 'Module IV', ref: 'Question 8', adapted: false },
    difficulty: 'advanced',
    learningObjective: 'Hold both halves of the sphere rule at once: true diameter, isometric centre height.',
    parts: [
      { solidId: 'hexagonal-prism', dims: { side: 35, height: 60 } },
      { solidId: 'sphere', dims: { diameter: 40 } },
    ],
    projectionType: 'projection',
    answerData: { scale: 0.816, bounds: { width: 70, depth: 60.6, height: 100 }, parts: { p0: { scaled: true }, p1: { scaled: false, centreHeightScaled: true } } },
    hints: [
      'Build from the bottom up: the prism first, complete, then the sphere on its finished top face.',
      '"Centrally" means the two share one vertical axis — the sphere\'s centre is directly over the centre of the hexagon.',
      'The trap: in a PROJECTION the sphere keeps its true 40 mm diameter, but the height of its centre is still reduced along with the prism. Both must be true at once.',
    ],
    tags: ['sphere', 'hexagonal prism', 'combination', 'true diameter', 'sphere rule'],
  },
  {
    id: 'mqp-q7-frustum-on-slab',
    title: 'Frustum of a cone on a rectangular slab',
    question: 'A frustum of a cone, base diameter 50 mm, top diameter 40 mm and height 60 mm, is placed centrally on top of a rectangular slab of size 80x60 mm and thickness 20 mm. Draw the isometric view of the combination.',
    category: 'combinations',
    source: { textbook: 'Model QP', chapter: 'Module IV', ref: 'Question 7', adapted: false },
    difficulty: 'intermediate',
    learningObjective: 'Stand one box on another and construct each solid inside its own.',
    parts: [
      { solidId: 'cuboid', dims: { length: 80, breadth: 60, height: 20 } },
      { solidId: 'frustum-cone', dims: { bottom: 50, top: 40, height: 60 } },
    ],
    projectionType: 'view',
    answerData: { scale: 1, bounds: { width: 80, depth: 60, height: 80 } },
    hints: [
      'The overall height is the slab plus the frustum — 20 and 60 stacked, not 60.',
      'Block out the slab first and finish it. The frustum\'s own box then stands on the slab\'s top face.',
      '"Centrally" puts the frustum\'s axis through the centre of the slab, so its base ellipse is drawn about that point.',
    ],
    tags: ['frustum', 'slab', 'combination', 'stacking'],
  },
  {
    id: 'ndb-17-40-sphere-on-frustum',
    title: 'Sphere on a frustum of a cone',
    question: 'A sphere of 50 mm diameter is placed centrally on the top face of a frustum of a cone, base diameter 80 mm, top diameter 50 mm and axis height 65 mm. Draw the isometric projection of the solids.',
    category: 'combinations',
    source: { textbook: 'N.D. Bhatt', chapter: 'Ch 17', ref: 'Problem 17-40', adapted: true },
    difficulty: 'advanced',
    learningObjective: 'Apply the sphere rule on top of a reduced solid.',
    parts: [
      { solidId: 'frustum-cone', dims: { bottom: 80, top: 50, height: 65 } },
      { solidId: 'sphere', dims: { diameter: 50 } },
    ],
    projectionType: 'projection',
    answerData: { scale: 0.816, bounds: { width: 80, depth: 80, height: 115 }, parts: { p0: { scaled: true }, p1: { scaled: false, centreHeightScaled: true } } },
    hints: [
      'Two solids, one shared vertical axis. The frustum is built first, complete, before the sphere is placed.',
      'The sphere rests ON the top face: its lowest point touches the centre of that circle, so its centre is one radius above it.',
      'PROJECTION again — the frustum is reduced to 0.816 throughout, the sphere is drawn at its true 50 mm, and the height its centre sits at is reduced like every other height.',
    ],
    tags: ['sphere', 'frustum', 'combination', 'true diameter', 'sphere rule'],
  },
  {
    id: 'practice-sphere-on-square-prism',
    title: 'Sphere on a square prism',
    question: 'Draw the isometric view of a sphere of diameter 60 mm kept centrally on a square prism of base 50 mm and height 30 mm.',
    category: 'combinations',
    source: { textbook: 'Practice', chapter: 'Additional', adapted: false },
    difficulty: 'intermediate',
    learningObjective: 'See that in a VIEW there is no reduction at all — so the sphere rule has nothing to bite on.',
    parts: [
      { solidId: 'square-prism', dims: { side: 50, height: 30 } },
      { solidId: 'sphere', dims: { diameter: 60 } },
    ],
    projectionType: 'view',
    answerData: { scale: 1, bounds: { width: 60, depth: 60, height: 90 }, parts: { p0: { scaled: true }, p1: { scaled: false, centreHeightScaled: true } } },
    hints: [
      'A VIEW: every length is true, so nothing is reduced and the sphere is no different from the prism in that respect.',
      'The sphere is wider than the prism it stands on — that is fine, and it is what the question describes.',
      'Its lowest point still touches the centre of the top face, so the centre sits one radius above that face.',
    ],
    tags: ['sphere', 'square prism', 'combination', 'isometric view'],
  },
  {
    id: 'practice-sphere-on-cylinder',
    title: 'Cylinder surmounted by a sphere',
    question: 'A cylinder 80 mm base diameter and 120 mm high is resting on its base on H.P. It is surmounted centrally by a sphere of 50 mm diameter. Draw the isometric view of the solids.',
    category: 'combinations',
    source: { textbook: 'Practice', chapter: 'Additional', adapted: false },
    difficulty: 'intermediate',
    learningObjective: 'Carry a tall construction upward without losing the shared axis.',
    parts: [
      { solidId: 'cylinder', dims: { diameter: 80, height: 120 } },
      { solidId: 'sphere', dims: { diameter: 50 } },
    ],
    projectionType: 'view',
    answerData: { scale: 1, bounds: { width: 80, depth: 80, height: 170 } },
    hints: [
      '"Surmounted centrally" means seated on top, sharing the cylinder\'s vertical axis.',
      'Overall height is 120 + 50 — the sphere adds its full diameter above the cylinder\'s top face.',
      'The cylinder is finished before the sphere is placed: two ellipses joined, then the circle above them.',
    ],
    tags: ['cylinder', 'sphere', 'combination', 'surmounted'],
  },
  {
    id: 'practice-pent-pyramid-on-cylinder',
    title: 'Pentagonal pyramid on a cylinder',
    question: 'Draw the isometric view of a pentagonal pyramid of base side 30 mm and height 60 mm, resting with its base centrally on top of a cylinder of diameter 90 mm and height 50 mm, in such a way that one of the base edges of the pentagonal pyramid is perpendicular to the VP.',
    category: 'combinations',
    source: { textbook: 'Practice', chapter: 'Additional', adapted: false },
    difficulty: 'advanced',
    learningObjective: 'Honour a stated turn about the axis — an orientation clause is a real condition, not decoration.',
    parts: [
      { solidId: 'cylinder', dims: { diameter: 90, height: 50 } },
      { solidId: 'pentagonal-pyramid', dims: { side: 30, height: 60 } },
    ],
    projectionType: 'view',
    answerData: { scale: 1, bounds: { width: 90, depth: 90, height: 110 } },
    hints: [
      'Three conditions to satisfy: centrally placed, resting on the cylinder\'s top face, and turned so one base edge is perpendicular to the VP.',
      'The turn is the part students drop. It fixes where the pentagon\'s corners fall, and therefore where every sloping edge goes.',
      'Build upward: cylinder complete, then the pentagon on its top face, then the apex 60 mm above that face.',
    ],
    tags: ['pentagonal pyramid', 'cylinder', 'combination', 'orientation', 'edge perpendicular to VP'],
  },
  {
    id: 'practice-sphere-on-hex-slab',
    title: 'Sphere on a hexagonal slab',
    question: 'A sphere of 20 mm radius is placed centrally over a hexagonal slab of side length 30 mm and thickness 20 mm. Draw the isometric view of the combination.',
    category: 'combinations',
    source: { textbook: 'Practice', chapter: 'Additional', adapted: false },
    difficulty: 'beginner',
    learningObjective: 'Read a RADIUS where every other problem states a diameter.',
    parts: [
      { solidId: 'hexagonal-prism', dims: { side: 30, height: 20 } },
      { solidId: 'sphere', dims: { diameter: 40 } },
    ],
    projectionType: 'view',
    answerData: { scale: 1, bounds: { width: 60, depth: 52, height: 60 } },
    hints: [
      'The sphere is given by its RADIUS, not its diameter — 20 mm radius is a 40 mm sphere.',
      'The slab is a hexagonal prism that happens to be short; it is constructed exactly like any other.',
      'Overall height is the slab thickness plus the full sphere diameter.',
    ],
    tags: ['sphere', 'hexagonal slab', 'radius', 'combination'],
  },
  {
    id: 'eg-16-13-cone-on-square-slab',
    title: 'Cone on a square slab',
    question: 'A cone of diameter 32 mm base and 40 mm height is surmounted over a square slab of 40 mm side and 25 mm thickness on HP so that one edge of the square is parallel to VP. Draw isometric view of the combination.',
    category: 'combinations',
    source: { textbook: 'Engineering Graphics for Diploma', chapter: 'Ch 16', ref: 'Example 16.13', adapted: false },
    difficulty: 'beginner',
    learningObjective: 'Meet a combination for the first time: one solid seated centrally on another, drawn by exactly the procedure a single solid is drawn by.',
    parts: [
      { solidId: 'square-prism', dims: { side: 40, height: 25 } },
      { solidId: 'cone', dims: { diameter: 32, height: 40 } },
    ],
    projectionType: 'view',
    answerData: { scale: 1, bounds: { width: 40, depth: 40, height: 65 }, requiredStages: ['box-done', 'base', 'apex', 'slant'] },
    hints: [
      'A VIEW, so every length is set off at its true size — the 32, the 40 and the 25 are all drawn as stated.',
      'Build from the bottom up: block out the slab and finish it, then stand the cone\'s own box on the slab\'s finished top face.',
      '"Surmounted" and the square being parallel to the VP together fix the placement: the cone\'s axis passes through the centre of the slab, so its base ellipse is drawn about that point.',
      'The overall height is the slab plus the cone — 25 and 40 stacked, not 40.',
    ],
    tags: ['cone', 'square slab', 'combination', 'surmounted', 'isometric view'],
  },
  {
    id: 'eg-16-15-sphere-on-hex-slab',
    title: 'Sphere on a hexagonal slab',
    question: 'A sphere of 18 mm radius is placed centrally over a hexagonal slab of side length 24 mm and thickness 25 mm. Draw isometric view of the combination.',
    category: 'combinations',
    source: { textbook: 'Engineering Graphics for Diploma', chapter: 'Ch 16', ref: 'Example 16.15', adapted: false },
    difficulty: 'intermediate',
    learningObjective: 'Seat a sphere on a polygon that does not fill its own box — and read a RADIUS where most questions state a diameter.',
    parts: [
      { solidId: 'hexagonal-prism', dims: { side: 24, height: 25 } },
      { solidId: 'sphere', dims: { diameter: 36 } },
    ],
    projectionType: 'view',
    answerData: { scale: 1, bounds: { width: 48, depth: 41.6, height: 61 }, parts: { p1: { scaled: false, centreHeightScaled: true } }, requiredStages: ['base', 'top', 'join', 'centre', 'outline'] },
    hints: [
      'The sphere is given by its RADIUS, not its diameter — 18 mm radius is a 36 mm sphere.',
      'A hexagon does not reach the corners of its box: the box edges are the overall length across the corners and the breadth across the flats, neither of which is the 24 mm side.',
      'The sphere rests ON the top face, so its lowest point touches the centre of that face and its centre sits one radius above it.',
      'It asks for a VIEW, so nothing is reduced — the sphere rule has nothing to bite on here.',
    ],
    tags: ['sphere', 'hexagonal slab', 'combination', 'radius', 'isometric view'],
  },
  {
    id: 'eg-ex15-hex-pyramid-on-square-slab',
    title: 'Hexagonal pyramid on a square slab',
    question: 'A hexagonal pyramid of base edge 20 mm and height 50 mm is surmounted over a square slab of 50 mm side and 30 mm thickness on HP so that one side of the square is parallel to VP. Draw isometric view of the combination.',
    category: 'combinations',
    source: { textbook: 'Engineering Graphics for Diploma', chapter: 'Ch 16', ref: 'Exercises, Section A, 15', adapted: false },
    difficulty: 'intermediate',
    learningObjective: 'Construct a polygon inside the box it does not fill, on top of a solid that does.',
    parts: [
      { solidId: 'square-prism', dims: { side: 50, height: 30 } },
      { solidId: 'hexagonal-pyramid', dims: { side: 20, height: 50 } },
    ],
    projectionType: 'view',
    answerData: { scale: 1, bounds: { width: 50, depth: 50, height: 80 }, requiredStages: ['box-done', 'base', 'apex', 'edges'] },
    hints: [
      'Two solids, one shared vertical axis, and the slab is drawn complete before the pyramid is started.',
      'The hexagon is smaller than the slab it stands on, and it does not fill its own box either — every corner is placed from the top view.',
      'The apex is one point on the axis, 50 mm above the SLAB\'S TOP FACE, not 50 mm above the ground.',
      'Overall height is 30 + 50.',
    ],
    tags: ['hexagonal pyramid', 'square slab', 'combination', 'surmounted', 'polygon'],
  },
  {
    id: 'eg-ex17-sphere-on-pentagonal-slab',
    title: 'Sphere on a pentagonal slab',
    question: 'A sphere of 20 mm radius is placed centrally over a pentagonal slab of side length 30 mm and thickness 36 mm. Draw isometric view of the combination.',
    category: 'combinations',
    source: { textbook: 'Engineering Graphics for Diploma', chapter: 'Ch 16', ref: 'Exercises, Section A, 17', adapted: false },
    difficulty: 'intermediate',
    learningObjective: 'Apply the same seating to a polygon whose box is not symmetric about its own centre.',
    parts: [
      { solidId: 'pentagonal-prism', dims: { side: 30, height: 36 } },
      { solidId: 'sphere', dims: { diameter: 40 } },
    ],
    projectionType: 'view',
    answerData: { scale: 1, bounds: { width: 48.5, depth: 46.2, height: 76 }, parts: { p1: { scaled: false, centreHeightScaled: true } }, requiredStages: ['base', 'top', 'join', 'centre', 'outline'] },
    hints: [
      '20 mm RADIUS is a 40 mm sphere — the question states the radius, and the drawing needs the diameter.',
      'The pentagon is constructed inside the bottom face of its box, each corner placed from the top view.',
      'The sphere is wider than nothing here — but check it against the slab: whichever is wider sets the overall width of the drawing.',
      'Overall height is the slab thickness plus the full sphere diameter, 36 + 40.',
    ],
    tags: ['sphere', 'pentagonal slab', 'combination', 'radius', 'isometric view'],
  },
  {
    id: 'practice-sphere-on-square-frustum',
    title: 'Sphere on a frustum of a square pyramid',
    question: 'A sphere of 50 mm diameter is placed centrally on the top of the frustum of a square pyramid of 30 mm base side, 20 mm top side and the axis 50 mm long. Draw the isometric projection of the solids.',
    category: 'combinations',
    source: { textbook: 'Practice', chapter: 'Additional', adapted: false },
    difficulty: 'advanced',
    learningObjective: 'Seat a sphere wider than the face it stands on — and still apply the sphere rule.',
    parts: [
      { solidId: 'frustum-square-pyramid', dims: { bottom: 30, top: 20, height: 50 } },
      { solidId: 'sphere', dims: { diameter: 50 } },
    ],
    projectionType: 'projection',
    answerData: { scale: 0.816, bounds: { width: 50, depth: 50, height: 100 }, parts: { p0: { scaled: true }, p1: { scaled: false, centreHeightScaled: true } } },
    hints: [
      'The sphere is far wider than the 20 mm top face it stands on. It still touches that face at its own lowest point, so its centre is one radius above it.',
      'Build the frustum completely first: base square, top square at the full height, corners joined.',
      'PROJECTION — the frustum reduces to 0.816, the sphere is drawn at its true 50 mm, and its centre height reduces with everything else.',
    ],
    tags: ['sphere', 'square pyramid', 'frustum', 'combination', 'sphere rule'],
  },
]);

// ---------------------------------------------------------------------------
// The query layer. Topic 3 keeps this in its own `problemQuery.js` because it has TWO subject
// sources to join — its textbook problems and its free-practice solids. This topic's free-practice
// source is `SOLIDS`, which `shapeData.js` already resolves, so the join does not exist and neither
// does the file: three accessors over one list is all that is left of it.
// ---------------------------------------------------------------------------

/** Every problem, in library order — the order a textbook poses them. */
export function allProblems() {
  return PROBLEMS;
}

/** Lookup by id. Returns `null` for an unknown id — the caller decides what to do about it. */
export function getProblem(id) {
  return PROBLEMS.find((p) => p.id === id) ?? null;
}

/** The problem the library opens on. */
export const DEFAULT_PROBLEM_ID = PROBLEMS[0].id;

/**
 * The problems grouped by category, in category order, skipping any category nothing names.
 * The grouping IS the navigation (ADR-057 — eighteen problems do not earn a search box).
 *
 * @returns {{ category: typeof CATEGORIES[number], problems: Problem[] }[]}
 */
export function problemsByCategory() {
  return CATEGORIES
    .map((category) => ({ category, problems: PROBLEMS.filter((p) => p.category === category.id) }))
    .filter((g) => g.problems.length > 0);
}
