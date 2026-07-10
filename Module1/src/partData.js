// partData.js — the shared MACHINE PART for the Line-types and Dimensioning lessons.
//
// A small rectangular plate with a through-hole. Every kind of engineering line sits
// on one realistic object: continuous-thick visible edges, dashed hidden edges (the
// hole's far rim + bore), a chain centre line (the hole axis + face cross), and thin
// continuous dimension lines. Both lessons (linetypes.js, dimensioning.js) draw the
// SAME part through the helpers here, so the geometry can never drift between them.
//
// Sizes are in WORLD units (≈ the 9-unit stage the other lessons use); the dimension
// FIGURES carry their own millimetre values so the labels show real mm, not world
// units (CLAUDE.md). Edges are tagged visible / hidden / centre — a teaching
// classification, NOT real hidden-line removal (REBUILD-PLAN). No Three.js types are
// stored here; the draw helpers import the engine's primitives (one-directional —
// the engine never imports this module).
import * as THREE from 'three';
import { fatLine, asg, asgCentre, LW } from './engine.js';

// ── Part parameters (world units) ─────────────────────────────
const HW = 2.2, HH = 1.3, HD = 1.0;   // box half-extents (x, y, z)
const R  = 0.6, EXT = 0.6, SEG = 48;  // hole radius, centre-line overrun, circle facets

const corner = (sx, sy, sz) => [sx*HW, sy*HH, sz*HD];

// 12 box edges (all VISIBLE), built from the half-extents.
function boxEdges(){
  const e = [];
  // front face (z = +HD) and back face (z = −HD)
  for(const sz of [1, -1]){
    e.push([corner(-1,-1,sz), corner( 1,-1,sz)]);
    e.push([corner( 1,-1,sz), corner( 1, 1,sz)]);
    e.push([corner( 1, 1,sz), corner(-1, 1,sz)]);
    e.push([corner(-1, 1,sz), corner(-1,-1,sz)]);
  }
  // four connectors front→back
  for(const [sx, sy] of [[-1,-1],[1,-1],[1,1],[-1,1]])
    e.push([corner(sx, sy, 1), corner(sx, sy, -1)]);
  return e;
}

// Flat [x,y,z,…] point list for the hole rim circle in the plane z = cz (closed loop).
function circleFlat(cz){
  const f = [];
  for(let i = 0; i <= SEG; i++){
    const t = i / SEG * Math.PI * 2;
    f.push(R*Math.cos(t), R*Math.sin(t), cz);
  }
  return f;
}

/** Pure-data description of the part. Frozen so a lesson can't mutate the shared shape. */
export const MACHINE_PART = Object.freeze({
  box:  { hw: HW, hh: HH, hd: HD },
  hole: { r: R, ext: EXT, seg: SEG },
  // Dimension figures (millimetre values + world-unit anchors on the front face).
  dims: Object.freeze({
    width:  { a: [-HW, -HH, HD], b: [ HW, -HH, HD], dir: 'h', mm: 80, label: '80'  },
    height: { a: [-HW, -HH, HD], b: [-HW,  HH, HD], dir: 'v', mm: 50, label: '50'  },
    dia:    { a: [ -R,   0, HD], b: [  R,   0, HD], dir: 'h', mm: 30, label: 'Ø30' },
  }),
});

// ── drawPart — render the part body per the enabled line types ─
// Called only from inside a lesson draw3D (so the engine's curMats/curRes are set).
//   visible → continuous-thick ink edges + front rim
//   hidden  → dashed bench-grey back rim + bore lines (the token's hidden-edge role)
//   centre  → ink chain line: hole axis + the front-face centre cross
export function drawPart(g, COL, { visible = true, hidden = false, centre = false } = {}){
  if(visible){
    for(const [a, b] of boxEdges()) asg(g, a, b, COL.ink, 0, LW.edge);
    fatLine(g, circleFlat( HD), COL.ink, LW.edge, false);          // front rim (visible)
  }
  if(hidden){
    fatLine(g, circleFlat(-HD), COL.bench, LW.proj, true);         // back rim (hidden, dashed)
    asg(g, [0,  R,  HD], [0,  R, -HD], COL.bench, 1, LW.proj);     // bore silhouette (top)
    asg(g, [0, -R,  HD], [0, -R, -HD], COL.bench, 1, LW.proj);     // bore silhouette (bottom)
  }
  if(centre){
    asgCentre(g, [0, 0,  HD+EXT], [0, 0, -HD-EXT], COL.ink);       // hole axis
    asgCentre(g, [-R-0.3, 0, HD], [ R+0.3, 0, HD], COL.ink);       // face cross — horizontal
    asgCentre(g, [0, -R-0.3, HD], [0,  R+0.3, HD], COL.ink);       // face cross — vertical
  }
}

// ── Filled-triangle arrowhead in the plane z = const ──────────
function arrowTri(g, tipX, tipY, dirX, dirY, z, color){
  const h = 0.26, w = 0.10;
  const bx = tipX - dirX*h, by = tipY - dirY*h;     // base centre, behind the tip
  const px = -dirY*w, py = dirX*w;                   // perpendicular half-width
  const shape = new THREE.Shape();
  shape.moveTo(tipX, tipY); shape.lineTo(bx+px, by+py); shape.lineTo(bx-px, by-py); shape.closePath();
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, depthTest: false }));
  m.position.z = z; m.renderOrder = 2; g.add(m);
}

// ── Dimension figure → canvas sprite (optionally rotated 90° for the aligned system) ─
function bakeFigure(g, text, x, y, z, color, rot){
  const SS = 3, fs = 40*SS, fam = '"IBM Plex Mono",ui-monospace,monospace';
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `600 ${fs}px ${fam}`;
  const tw = meas.measureText(text).width, pad = 12*SS;
  const W = Math.ceil(tw + pad*2), H = Math.ceil(fs + pad*2);
  const cv = document.createElement('canvas');
  if(rot){ cv.width = H; cv.height = W; } else { cv.width = W; cv.height = H; }
  const ctx = cv.getContext('2d');
  ctx.font = `600 ${fs}px ${fam}`; ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if(rot){ ctx.translate(cv.width/2, cv.height/2); ctx.rotate(-Math.PI/2); ctx.fillText(text, 0, 0); }
  else   { ctx.fillText(text, W/2, H/2); }
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  const hgt = 0.46;
  sp.position.set(x, y, z); sp.scale.set(hgt*cv.width/cv.height, hgt, 1); sp.renderOrder = 4; g.add(sp);
}

// ── drawDim — one dimension: extension lines + dimension line + arrowheads + figure ─
// Thin Type-B linework in `color`. Shared by both lessons so the rendering matches.
//   a, b     measured endpoints (h dims share y; v dims share x)
//   dir      'h' | 'v'
//   linePos  perpendicular coordinate of the dimension line (y for h, x for v)
//   ext      draw extension lines (true = correct outside placement;
//            false = the dimension line runs through the body — the wrong case)
//   mode     'aligned' | 'uni' (only changes a vertical figure's orientation)
export function drawDim(g, { a, b, dir, linePos, ext = true, color, text, mode = 'uni' }){
  const z = a[2];
  if(dir === 'h'){
    if(ext){
      asg(g, [a[0], a[1], z], [a[0], linePos, z], color, 0, LW.dim);
      asg(g, [b[0], b[1], z], [b[0], linePos, z], color, 0, LW.dim);
    }
    asg(g, [a[0], linePos, z], [b[0], linePos, z], color, 0, LW.dim);
    arrowTri(g, a[0], linePos,  1, 0, z, color);
    arrowTri(g, b[0], linePos, -1, 0, z, color);
    bakeFigure(g, text, (a[0]+b[0])/2, linePos + 0.30, z, color, false);
  } else {
    if(ext){
      asg(g, [a[0], a[1], z], [linePos, a[1], z], color, 0, LW.dim);
      asg(g, [b[0], b[1], z], [linePos, b[1], z], color, 0, LW.dim);
    }
    asg(g, [linePos, a[1], z], [linePos, b[1], z], color, 0, LW.dim);
    arrowTri(g, linePos, a[1], 0,  1, z, color);
    arrowTri(g, linePos, b[1], 0, -1, z, color);
    bakeFigure(g, text, linePos - 0.32, (a[1]+b[1])/2, z, color, mode === 'aligned');
  }
}
